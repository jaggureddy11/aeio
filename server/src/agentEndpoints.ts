/**
 * Dedicated Agentic Workflow Endpoints for Aeio Backend.
 * Powers autonomous planning, next-step reasoning, and workflow execution via AWS Bedrock.
 */

import { invokeBedrockConverse, BedrockCredentials } from './bedrock';

export interface AgentToolMeta {
  name: string;
  description: string;
  parameters?: any;
}

export interface AgentPlanPayload {
  goal: string;
  availableTools?: AgentToolMeta[];
  systemContext?: string;
  model?: string;
}

export interface AgentStepPayload {
  goal: string;
  stepsHistory?: Array<{
    stepNumber: number;
    thought?: string;
    toolName: string;
    toolArgs: any;
    result?: any;
    error?: string;
  }>;
  availableTools?: AgentToolMeta[];
  systemContext?: string;
  model?: string;
}

export async function generateAgentPlan(
  payload: AgentPlanPayload,
  creds: BedrockCredentials,
  defaultModel: string = 'amazon.nova-pro-v1:0'
): Promise<any> {
  const modelId = payload.model || defaultModel;
  const toolsPrompt = payload.availableTools && payload.availableTools.length > 0
    ? `Available Tools:\n${JSON.stringify(payload.availableTools, null, 2)}`
    : 'No explicit tools passed. Use standard desktop tool actions (browse_page, run_shell_command, read_file, write_file, open_app).';

  const systemPrompt = `You are Aeio (JAGGU), the world-class autonomous AI desktop orchestrator.
Your objective is to generate an optimal, safe, step-by-step Execution Plan to accomplish the user's desktop goal completely.

${toolsPrompt}

OPERATING RULES:
1. Deconstruct the user goal into 1-4 clear logical phases.
2. For each step, specify the tool to invoke and the required parameters.
3. Identify if any step is destructive (deleting files, overwriting code) and flag requiresApproval: true.
4. Always respond with pure valid JSON matching this schema, inside code fences:
\`\`\`json
{
  "goal": "Restated user goal",
  "summary": "Brief explanation of how Aeio will achieve it",
  "estimatedSteps": 3,
  "steps": [
    {
      "stepNumber": 1,
      "description": "Clear action description",
      "toolName": "tool_name",
      "toolArgs": {},
      "requiresApproval": false
    }
  ]
}
\`\`\``;

  const userMessage = `User Goal: "${payload.goal}"\nSystem Context: ${payload.systemContext || 'macOS Desktop'}\nPlease produce the JSON execution plan.`;

  const result = await invokeBedrockConverse(
    {
      modelId,
      messages: [{ role: 'user', content: userMessage }],
      systemPrompt,
      temperature: 0.2,
      maxTokens: 3000,
    },
    creds
  );

  // Parse JSON from code fence or raw output
  const rawText = result.text.trim();
  const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, rawText];
  const jsonStr = jsonMatch[1] || rawText;

  try {
    const plan = JSON.parse(jsonStr);
    return {
      success: true,
      plan,
      modelUsed: modelId,
      usage: result.usage,
    };
  } catch {
    return {
      success: true,
      rawOutput: rawText,
      plan: {
        goal: payload.goal,
        summary: rawText,
        estimatedSteps: 1,
        steps: [
          {
            stepNumber: 1,
            description: 'Execute primary goal',
            toolName: 'run_shell_command',
            toolArgs: {},
            requiresApproval: false,
          },
        ],
      },
      modelUsed: modelId,
    };
  }
}

export async function generateAgentStep(
  payload: AgentStepPayload,
  creds: BedrockCredentials,
  defaultModel: string = 'amazon.nova-pro-v1:0'
): Promise<any> {
  const modelId = payload.model || defaultModel;
  const toolsPrompt = payload.availableTools && payload.availableTools.length > 0
    ? `Available Tools:\n${JSON.stringify(payload.availableTools, null, 2)}`
    : 'Available tools: search_web, fetch_url, browse_page, read_file, write_file, run_shell_command, open_app, play_spotify, set_system_volume.';

  const historyStr = payload.stepsHistory && payload.stepsHistory.length > 0
    ? `Execution History so far:\n${JSON.stringify(payload.stepsHistory, null, 2)}`
    : 'No steps taken yet. This is step 1.';

  const systemPrompt = `You are Aeio (JAGGU), an autonomous AI agent executing a user desktop goal.
Decide on the SINGLE NEXT ACTION to make real progress toward completing the goal.

${toolsPrompt}

${historyStr}

OPERATING RULES:
1. Examine what has already succeeded or failed in the history.
2. If the goal is ALREADY complete, set isTerminal: true, toolName: "none", and provide finalReport.
3. If more work is required, choose the appropriate tool and fill out toolArgs.
4. Output your decision as a single valid JSON block enclosed in code fences:
\`\`\`json
{
  "thought": "Reasoning for taking this step",
  "toolName": "name_of_tool_or_none",
  "toolArgs": {},
  "isTerminal": false,
  "finalReport": ""
}
\`\`\``;

  const userMessage = `Current Goal: "${payload.goal}"\nSystem Context: ${payload.systemContext || 'macOS Desktop'}\nWhat is the next action?`;

  const result = await invokeBedrockConverse(
    {
      modelId,
      messages: [{ role: 'user', content: userMessage }],
      systemPrompt,
      temperature: 0.2,
      maxTokens: 2000,
    },
    creds
  );

  const rawText = result.text.trim();
  const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, rawText];
  const jsonStr = jsonMatch[1] || rawText;

  try {
    const stepDecision = JSON.parse(jsonStr);
    return {
      success: true,
      decision: stepDecision,
      modelUsed: modelId,
      usage: result.usage,
    };
  } catch {
    return {
      success: true,
      decision: {
        thought: rawText,
        toolName: 'none',
        toolArgs: {},
        isTerminal: true,
        finalReport: rawText,
      },
      modelUsed: modelId,
    };
  }
}
