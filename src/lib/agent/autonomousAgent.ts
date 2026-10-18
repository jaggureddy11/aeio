import { getAvailableAgentTools, executeAgentTool } from './toolRegistry';
import { orchestrateChat, ProviderMessage } from '../providers';
import { speakJARVISFeedback, earcons } from '../voice/voiceEngine';
import { ExecutionPlan, PlanStep, isDestructiveCommandClient, normalizeToolName } from './plan';
import { useSettingsStore } from '../../stores/settingsStore';

export type TaskStatus =
  | 'planning'
  | 'running'
  | 'waiting_for_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface AutonomousStep {
  stepNumber: number;
  thought: string;
  toolName: string;
  toolArgs: Record<string, any>;
  result?: any;
  error?: string;
  timestamp: number;
}

export interface AutonomousTask {
  id: string;
  goal: string;
  status: TaskStatus;
  maxSteps: number;
  currentStep: number;
  steps: AutonomousStep[];
  plan?: ExecutionPlan;
  finalReport?: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export interface TaskCallbacks {
  onPlanCreated?: (plan: ExecutionPlan) => void;
  onStepStart?: (stepNumber: number, thought: string, tool: string) => void;
  onStepComplete?: (step: AutonomousStep) => void;
  onStatusChange?: (status: TaskStatus, message?: string) => void;
  onFinished?: (report: string) => void;
  onError?: (error: string) => void;
}

export function getSystemAutonomousPrompt(): string {
  const tools = getAvailableAgentTools();
  return `You are Aeio (JAGGU), a world-class autonomous AI desktop agent.
Your mission is to accomplish the user's desktop goal completely, step-by-step, until fully done.

You have access to the following tools:
${JSON.stringify(tools, null, 2)}

OPERATING RULES:
1. Break down the goal logically. Decide on the single NEXT action to make real progress.
2. Output your decision as a single valid JSON block enclosed in \`\`\`json code fences:
\`\`\`json
{
  "thought": "Brief explanation of why you are taking this step",
  "tool": "name_of_tool",
  "args": { ...parameters... }
}
\`\`\`
3. Inspect previous tool outputs carefully. Verify data before moving to subsequent steps.
4. When the overall goal is completely achieved, call the "finish" tool with a concise, spoken-friendly summary.
5. NEVER hallucinate tool results. Always wait for the real observation from the system.`;
}

/**
 * Autonomous Task Runner: Executes multi-step desktop tasks through
 * the observation-decision-execution loop until goal completion.
 */
export class AutonomousTaskRunner {
  private activeTask: AutonomousTask | null = null;
  private isCancelled: boolean = false;
  private taskListeners: Set<(task: AutonomousTask | null) => void> = new Set();

  public getActiveTask(): AutonomousTask | null {
    return this.activeTask;
  }

  public onTaskUpdate(listener: (task: AutonomousTask | null) => void): () => void {
    this.taskListeners.add(listener);
    listener(this.activeTask);
    return () => {
      this.taskListeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const copy = this.activeTask ? { ...this.activeTask, steps: [...this.activeTask.steps] } : null;
    this.taskListeners.forEach((l) => {
      try {
        l(copy);
      } catch (err) {
        console.error('Task listener error:', err);
      }
    });
  }

  public cancel(): void {
    this.isCancelled = true;
    if (this.activeTask) {
      this.activeTask.status = 'cancelled';
      if (this.activeTask.plan) {
        this.activeTask.plan.status = 'cancelled';
      }
      this.notifyListeners();
    }
  }

  public async runTask(goal: string, callbacks?: TaskCallbacks, maxSteps: number = 12): Promise<AutonomousTask> {
    this.isCancelled = false;

    const initialPlan: ExecutionPlan = {
      id: crypto.randomUUID(),
      title: goal,
      steps: [],
      status: 'running',
      hasDestructiveSteps: false,
      currentStepIndex: 0,
    };

    const task: AutonomousTask = {
      id: crypto.randomUUID(),
      goal,
      status: 'running',
      maxSteps,
      currentStep: 0,
      steps: [],
      plan: initialPlan,
      createdAt: Date.now(),
    };
    this.activeTask = task;
    this.notifyListeners();

    callbacks?.onPlanCreated?.(initialPlan);
    callbacks?.onStatusChange?.('running', `Starting goal: "${goal}"`);

    // Conversation history maintains goal, decisions, and tool observations
    const messages: ProviderMessage[] = [
      { role: 'user', content: `Goal: ${goal}\nPlease begin.` },
    ];

    for (let stepIndex = 1; stepIndex <= maxSteps; stepIndex++) {
      if (this.isCancelled) {
        task.status = 'cancelled';
        if (task.plan) {
          task.plan.status = 'cancelled';
        }
        this.notifyListeners();
        callbacks?.onStatusChange?.('cancelled', 'Task cancelled by user.');
        return task;
      }

      task.currentStep = stepIndex;
      this.notifyListeners();

      // 1. Model Request — Decide next action
      // Attempts hosted Bedrock agent endpoint (/v1/agent/step) first if in auto / aeio-free / bedrock mode,
      // falling back seamlessly to local multi-provider orchestrator.
      let decision: { thought: string; tool: string; args: any } | null = null;
      let responseText = '';

      const settings = useSettingsStore.getState();
      const proxyUrl = settings.hostedProxyUrl?.trim();
      const isCloudAgentEligible =
        (settings.activeProvider === 'auto' ||
          settings.activeProvider === 'aeio-free' ||
          settings.activeProvider === 'bedrock') &&
        !settings.neverSendMemoriesToCloud &&
        !!proxyUrl;

      if (isCloudAgentEligible) {
        try {
          const stepHistoryPayload = task.steps.map((s) => ({
            stepNumber: s.stepNumber,
            thought: s.thought,
            toolName: s.toolName,
            toolArgs: s.toolArgs,
            result: s.result,
            error: s.error,
          }));

          const res = await fetch(`${proxyUrl}/v1/agent/step`, {
            method: 'POST',
            signal: AbortSignal.timeout(2500),
            headers: {
              'Content-Type': 'application/json',
              'X-Installation-Id': settings.installationId,
            },
            body: JSON.stringify({
              goal,
              stepsHistory: stepHistoryPayload,
              availableTools: getAvailableAgentTools().map((t) => ({
                name: t.name,
                description: t.description,
                parameters: t.parameters,
              })),
              systemContext: 'macOS Desktop Autonomous Task',
            }),
          });

          if (res.ok) {
            const data = await res.json();
            if (data?.decision) {
              const d = data.decision;
              if (d.isTerminal || d.toolName === 'none' || d.toolName === 'finish') {
                decision = {
                  thought: d.thought || 'Goal finished',
                  tool: 'finish',
                  args: { summary: d.finalReport || d.thought || 'Goal completed.' },
                };
              } else if (d.toolName) {
                decision = {
                  thought: d.thought || 'Executing next step',
                  tool: d.toolName,
                  args: d.toolArgs || {},
                };
              }
            }
          }
        } catch (backendErr) {
          console.warn('[AutonomousAgent] Hosted Bedrock step failed, falling back to local orchestrator:', backendErr);
        }
      }

      // If hosted backend step didn't succeed, use orchestrateChat
      if (!decision) {
        try {
          const result = await orchestrateChat(messages, {
            systemPrompt: getSystemAutonomousPrompt(),
            temperature: 0.1, // Calibrated for deterministic tool selection
          });
          responseText = result.content;
          decision = this.parseDecisionJson(responseText);
        } catch (err: any) {
          task.status = 'failed';
          task.error = `Model error: ${err.message || String(err)}`;
          if (task.plan) {
            task.plan.status = 'failed';
            task.plan.stoppedReason = task.error;
          }
          callbacks?.onError?.(task.error);
          return task;
        }
      }

      // 2. Validate Decision
      if (!decision) {
        // Retry prompt if model output failed schema
        messages.push({
          role: 'assistant',
          content: responseText,
        });
        messages.push({
          role: 'user',
          content: 'Error: Please respond strictly with a valid JSON block containing "thought", "tool", and "args".',
        });
        continue;
      }

      callbacks?.onStepStart?.(stepIndex, decision.thought, decision.tool);

      // Check if finished
      if (decision.tool === 'finish') {
        const report = decision.args?.summary || 'Goal achieved successfully.';
        task.status = 'completed';
        task.finalReport = report;
        task.completedAt = Date.now();
        if (task.plan) {
          task.plan.status = 'completed';
          task.plan.summary = report;
        }
        this.notifyListeners();

        earcons.playSuccessTone();
        callbacks?.onFinished?.(report);
        speakJARVISFeedback(report);
        return task;
      }

      // Classify safety / destructiveness of step
      const normalizedTool = normalizeToolName(decision.tool);
      const isDestructive = isDestructiveCommandClient(
        normalizedTool === 'run_shell'
          ? (decision.args?.command || decision.args?.cmd || '')
          : ''
      );

      const planStep: PlanStep = {
        id: crypto.randomUUID(),
        stepNumber: stepIndex,
        description: decision.thought,
        toolName: normalizedTool,
        args: decision.args || {},
        isDestructive,
        status: 'running',
      };

      if (task.plan) {
        task.plan.steps.push(planStep);
        task.plan.currentStepIndex = task.plan.steps.length - 1;
        if (isDestructive) {
          task.plan.hasDestructiveSteps = true;
        }
      }

      // 3. Execute Tool
      let stepResult: any = null;
      let stepError: string | undefined = undefined;

      try {
        stepResult = await executeAgentTool(normalizedTool, decision.args || {});
        planStep.status = 'completed';
        planStep.result = stepResult;
      } catch (err: any) {
        stepError = err?.message || String(err);
        planStep.status = 'failed';
        planStep.error = stepError;
      }

      const stepRecord: AutonomousStep = {
        stepNumber: stepIndex,
        thought: decision.thought,
        toolName: normalizedTool,
        toolArgs: decision.args || {},
        result: stepResult,
        error: stepError,
        timestamp: Date.now(),
      };
      task.steps.push(stepRecord);
      this.notifyListeners();
      callbacks?.onStepComplete?.(stepRecord);

      // 4. Feed Observation back into context
      messages.push({
        role: 'assistant',
        content: `\`\`\`json\n${JSON.stringify(decision, null, 2)}\n\`\`\``,
      });

      const observationContent = stepError
        ? `Tool Error (${decision.tool}): ${stepError}`
        : `Tool Observation (${decision.tool}): ${typeof stepResult === 'object' ? JSON.stringify(stepResult) : String(stepResult)}`;

      messages.push({
        role: 'user',
        content: observationContent,
      });
    }

    // Budget exhausted
    task.status = 'failed';
    task.error = `Step budget reached (${maxSteps} steps) without completing goal.`;
    if (task.plan) {
      task.plan.status = 'failed';
      task.plan.stoppedReason = task.error;
    }
    this.notifyListeners();
    callbacks?.onError?.(task.error);
    return task;
  }

  private parseDecisionJson(rawText: string): { thought: string; tool: string; args: any } | null {
    // 1. Try code block
    const codeBlockMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(rawText);
    const textToParse = codeBlockMatch ? codeBlockMatch[1].trim() : rawText.trim();

    try {
      const parsed = JSON.parse(textToParse);
      const toolField = parsed.tool || parsed.name || parsed.action;
      if (parsed && typeof toolField === 'string') {
        return {
          thought: parsed.thought || parsed.reasoning || parsed.description || 'Executing next step',
          tool: normalizeToolName(toolField.trim()),
          args: parsed.args || parsed.arguments || parsed.parameters || {},
        };
      }
    } catch {
      // 2. Try XML <tool_call> tags: <tool_call name="..." args='...'>
      const xmlMatch = /(?:```(?:xml|json)?\s*)?<tool_call(?:\s+name=["']?([^"'\s>]+)["']?)?(?:\s+args=(?:'([^']*)'|"([^"]*)"))?\s*(?:\/>|>([\s\S]*?)<\/tool_call>|>|$)(?:\s*```)?/i.exec(rawText);
      if (xmlMatch) {
        const rawTool = xmlMatch[1];
        const argsStr = xmlMatch[2] || xmlMatch[3] || xmlMatch[4] || '{}';
        let args = {};
        try { args = JSON.parse(argsStr.trim()); } catch { args = { raw: argsStr.trim() }; }
        return {
          thought: 'Executing tool call',
          tool: normalizeToolName(rawTool),
          args,
        };
      }

      // 3. Try <tool_call>{"name": ..., "arguments": ...}</tool_call>
      const jsonTagMatch = /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/i.exec(rawText);
      if (jsonTagMatch) {
        try {
          const parsed = JSON.parse(jsonTagMatch[1].trim());
          const name = parsed.name || parsed.tool || parsed.action;
          if (name) {
            return {
              thought: parsed.thought || 'Executing tool',
              tool: normalizeToolName(String(name)),
              args: parsed.arguments || parsed.args || parsed.parameters || {},
            };
          }
        } catch {}
      }

      // 4. Try regex extraction of JSON object
      const objectMatch = /\{[\s\S]*"(?:tool|name|action)"\s*:\s*"([^"]+)"[\s\S]*\}/.exec(rawText);
      if (objectMatch) {
        try {
          const parsed = JSON.parse(objectMatch[0]);
          const name = parsed.tool || parsed.name || parsed.action;
          if (name) {
            return {
              thought: parsed.thought || parsed.reasoning || 'Executing next step',
              tool: normalizeToolName(String(name).trim()),
              args: parsed.args || parsed.arguments || parsed.parameters || {},
            };
          }
        } catch {}
      }
    }
    return null;
  }
}

export const globalAutonomousRunner = new AutonomousTaskRunner();
