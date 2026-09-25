export interface PlanStep {
  id: string;
  stepNumber: number;
  description: string;
  toolName: string;
  args: Record<string, any>;
  isDestructive: boolean;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  result?: any;
  error?: string;
}

export interface ExecutionPlan {
  id: string;
  title: string;
  steps: PlanStep[];
  status: 'pending_approval' | 'running' | 'completed' | 'failed' | 'cancelled';
  hasDestructiveSteps: boolean;
  currentStepIndex: number;
  stoppedReason?: string;
  summary?: string;
}

const DESTRUCTIVE_PATTERNS = [
  'rm ', 'rm\t', 'rmdir', 'del ', 'del\t', 'erase ', 'unlink ', 'shred ',
  'format ', 'dd ', 'mkfs', 'fdisk', 'parted', 'wipefs', 'srm ',
  'chmod -r', 'chmod 777', 'chown -r', '> /dev/', '> /etc/', '> /system/',
  ':(){ :|:& };:', 'drop database', 'drop table', 'drop schema', 'truncate table',
  'git reset --hard', 'git clean', 'killall', 'shutdown', 'reboot', 'halt'
];

export function isDestructiveCommandClient(command: string): boolean {
  const lower = command.trim().toLowerCase();
  return DESTRUCTIVE_PATTERNS.some((p) => lower.includes(p));
}

const PLAN_BLOCK_REGEX = /<plan(?:\s+title=["']([^"']*)["'])?>([\s\S]*?)<\/plan>/i;

export function normalizeToolName(name: string): string {
  const lower = name.toLowerCase().trim();
  if (lower === 'run_shell_command' || lower === 'shell' || lower === 'bash' || lower === 'sh') return 'run_shell';
  if (lower === 'open_url' || lower === 'open_file' || lower === 'open') return 'open_target';
  return lower;
}

export function parsePlanFromResponse(rawText: string): { plan: ExecutionPlan | null; cleanedText: string } {
  const planMatch = PLAN_BLOCK_REGEX.exec(rawText);
  if (!planMatch) {
    return { plan: null, cleanedText: rawText };
  }

  const title = planMatch[1]?.trim() || 'Execution Plan';
  const innerContent = planMatch[2]?.trim() || '';

  const steps: PlanStep[] = [];

  // Try JSON inside <plan>
  let parsedJson: any = null;
  try {
    parsedJson = JSON.parse(innerContent);
  } catch {
    // Check if inner content has a JSON block inside markdown codeblock
    const codeBlockMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(innerContent);
    if (codeBlockMatch) {
      try {
        parsedJson = JSON.parse(codeBlockMatch[1].trim());
      } catch {
        parsedJson = null;
      }
    }
  }

  if (parsedJson && Array.isArray(parsedJson.steps)) {
    const jsonTitle = parsedJson.title || title;
    parsedJson.steps.forEach((s: any, idx: number) => {
      const rawTool = s.tool || s.toolName || s.name || 'run_shell';
      const toolName = normalizeToolName(rawTool);
      const args = s.args || s.arguments || s.parameters || {};
      const command = args.command || (typeof args === 'string' ? args : '');
      // Independent evaluation: NEVER trust model's declared destructive field
      const isDestructive =
        toolName === 'run_shell' && command
          ? isDestructiveCommandClient(command)
          : toolName.includes('delete') || toolName.includes('remove');

      steps.push({
        id: crypto.randomUUID(),
        stepNumber: s.step || s.stepNumber || idx + 1,
        description: s.description || `Execute ${toolName}`,
        toolName,
        args: typeof args === 'string' ? { command: args } : args,
        isDestructive,
        status: 'pending',
      });
    });

    const cleanedText = rawText.replace(PLAN_BLOCK_REGEX, '').trim();
    const hasDestructiveSteps = steps.some((s) => s.isDestructive);

    return {
      plan: {
        id: crypto.randomUUID(),
        title: jsonTitle,
        steps,
        status: hasDestructiveSteps ? 'pending_approval' : 'running',
        hasDestructiveSteps,
        currentStepIndex: 0,
      },
      cleanedText,
    };
  }

  // Parse XML <step> format
  let stepMatch: RegExpExecArray | null;
  const stepRegex = /<step\b([^>]*)>([\s\S]*?)<\/step>/gi;
  let stepIndex = 1;

  while ((stepMatch = stepRegex.exec(innerContent)) !== null) {
    const attrString = stepMatch[1] || '';
    const payload = stepMatch[2]?.trim() || '{}';

    const numMatch = /number=["']?(\d+)["']?/i.exec(attrString);
    const toolMatch = /tool=["']([^"']*)["']/i.exec(attrString);
    const descMatch = /description=["']([^"']*)["']/i.exec(attrString);

    const stepNum = numMatch ? parseInt(numMatch[1], 10) : stepIndex;
    const rawTool = toolMatch ? toolMatch[1].trim() : 'run_shell';
    const toolName = normalizeToolName(rawTool);
    const description = descMatch ? descMatch[1].trim() : `Step ${stepNum}: Execute ${toolName}`;

    let args: Record<string, any> = {};
    try {
      args = JSON.parse(payload);
    } catch {
      args = { command: payload };
    }

    const command = args.command || '';
    // Independent evaluation: NEVER trust model's declared destructive field
    const isDestructive =
      toolName === 'run_shell' && command
        ? isDestructiveCommandClient(command)
        : toolName.includes('delete') || toolName.includes('remove');

    steps.push({
      id: crypto.randomUUID(),
      stepNumber: stepNum,
      description,
      toolName,
      args,
      isDestructive,
      status: 'pending',
    });

    stepIndex++;
  }

  if (steps.length === 0) {
    return { plan: null, cleanedText: rawText };
  }

  const cleanedText = rawText.replace(PLAN_BLOCK_REGEX, '').trim();
  const hasDestructiveSteps = steps.some((s) => s.isDestructive);

  return {
    plan: {
      id: crypto.randomUUID(),
      title,
      steps,
      status: hasDestructiveSteps ? 'pending_approval' : 'running',
      hasDestructiveSteps,
      currentStepIndex: 0,
    },
    cleanedText,
  };
}

export async function classifyPlanSafety(
  plan: ExecutionPlan,
  checkDestructiveIpc?: (cmd: string) => Promise<boolean>
): Promise<ExecutionPlan> {
  const updatedSteps: PlanStep[] = [];

  for (const step of plan.steps) {
    const normalizedTool = normalizeToolName(step.toolName);
    let isDestructive = false;

    if (normalizedTool === 'run_shell' && step.args?.command) {
      if (checkDestructiveIpc) {
        try {
          isDestructive = await checkDestructiveIpc(step.args.command);
        } catch {
          isDestructive = isDestructiveCommandClient(step.args.command);
        }
      } else {
        isDestructive = isDestructiveCommandClient(step.args.command);
      }
    } else if (
      normalizedTool.includes('delete') ||
      normalizedTool.includes('remove') ||
      normalizedTool.includes('drop') ||
      normalizedTool.includes('truncate')
    ) {
      isDestructive = true;
    }

    updatedSteps.push({
      ...step,
      toolName: normalizedTool,
      isDestructive,
    });
  }

  const hasDestructiveSteps = updatedSteps.some((s) => s.isDestructive);

  return {
    ...plan,
    steps: updatedSteps,
    hasDestructiveSteps,
    status: hasDestructiveSteps ? 'pending_approval' : 'running',
  };
}
