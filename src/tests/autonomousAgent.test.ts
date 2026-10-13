import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeAgentTool, AVAILABLE_AGENT_TOOLS } from '../lib/agent/toolRegistry';
import { AutonomousTaskRunner } from '../lib/agent/autonomousAgent';
import * as ipc from '../lib/ipc';
import * as providers from '../lib/providers';

vi.mock('../lib/ipc', () => ({
  searchWebPlatform: vi.fn().mockResolvedValue({ success: true, message: 'Searched web' }),
  fetchUrl: vi.fn().mockResolvedValue('<html><body>Sample content</body></html>'),
  readFile: vi.fn().mockResolvedValue('file content data'),
  writeFile: vi.fn().mockResolvedValue('Wrote 100 bytes'),
  searchFiles: vi.fn().mockResolvedValue([{ name: 'test.csv', path: '/test.csv' }]),
  runShellCommand: vi.fn().mockResolvedValue({ stdout: 'ok', stderr: '', exit_code: 0 }),
  openTarget: vi.fn().mockResolvedValue('Opened app'),
  playSpotify: vi.fn().mockResolvedValue({ success: true, message: 'Playing track' }),
  setSystemVolume: vi.fn().mockResolvedValue({ success: true, message: 'Volume set' }),
  mediaControl: vi.fn().mockResolvedValue({ success: true, message: 'Media control' }),
  searchMemories: vi.fn().mockResolvedValue([]),
  addMemory: vi.fn().mockResolvedValue('mem-1'),
  lockScreen: vi.fn().mockResolvedValue({ success: true, message: 'Locked' }),
  playSystemEarcon: vi.fn().mockResolvedValue(undefined),
  speakText: vi.fn().mockResolvedValue({ success: true, message: 'Spoken' }),
  stopSpeaking: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/voice/voiceEngine', () => ({
  speakJARVISFeedback: vi.fn(),
  earcons: { playSuccessTone: vi.fn(), playWakeTone: vi.fn(), playErrorTone: vi.fn() },
}));

describe('Tool Registry for Autonomous Agent', () => {
  it('exposes tool definitions with valid schemas', () => {
    expect(AVAILABLE_AGENT_TOOLS.length).toBeGreaterThan(10);
    const finishTool = AVAILABLE_AGENT_TOOLS.find((t) => t.name === 'finish');
    expect(finishTool).toBeDefined();
    expect(finishTool?.parameters.properties.summary).toBeDefined();
  });

  it('executes write_file tool properly', async () => {
    const res = await executeAgentTool('write_file', { path: '/tmp/test.csv', content: 'a,b,c' });
    expect(ipc.writeFile).toHaveBeenCalledWith('/tmp/test.csv', 'a,b,c');
    expect(res).toBe('Wrote 100 bytes');
  });

  it('rejects destructive commands in run_shell', async () => {
    await expect(
      executeAgentTool('run_shell', { command: 'rm -rf /' })
    ).rejects.toThrow(/Destructive command detected/);
  });

  it('executes finish tool cleanly', async () => {
    const res = await executeAgentTool('finish', { summary: 'Completed research' });
    expect(res).toEqual({ status: 'completed', summary: 'Completed research' });
  });
});

describe('AutonomousTaskRunner Loop', () => {
  let runner: AutonomousTaskRunner;

  beforeEach(() => {
    runner = new AutonomousTaskRunner();
    vi.clearAllMocks();
  });

  it('completes task when model outputs finish tool call', async () => {
    vi.spyOn(providers, 'orchestrateChat').mockResolvedValueOnce({
      content: '```json\n{\n  "thought": "All information gathered, task finished.",\n  "tool": "finish",\n  "args": { "summary": "Found 5 companies and created spreadsheet." }\n}\n```',
      providerId: 'ollama',
      modelName: 'qwen2.5:7b',
      isLocal: true,
      taskType: 'planning',
    });

    const task = await runner.runTask('Find companies hiring AI developers');
    expect(task.status).toBe('completed');
    expect(task.finalReport).toContain('Found 5 companies');
    expect(task.currentStep).toBe(1);
  });

  it('executes multi-step loop: tool execution followed by finish', async () => {
    // Step 1: Model calls search_web
    vi.spyOn(providers, 'orchestrateChat')
      .mockResolvedValueOnce({
        content: '```json\n{\n  "thought": "First, search web for companies",\n  "tool": "search_web",\n  "args": { "query": "AI companies hiring" }\n}\n```',
        providerId: 'ollama',
        modelName: 'qwen2.5:7b',
        isLocal: true,
        taskType: 'planning',
      })
      // Step 2: Model calls finish
      .mockResolvedValueOnce({
        content: '```json\n{\n  "thought": "Research complete.",\n  "tool": "finish",\n  "args": { "summary": "Identified 5 companies." }\n}\n```',
        providerId: 'ollama',
        modelName: 'qwen2.5:7b',
        isLocal: true,
        taskType: 'planning',
      });

    const stepCompleteSpy = vi.fn();
    const task = await runner.runTask('Find companies hiring', {
      onStepComplete: stepCompleteSpy,
    });

    expect(ipc.searchWebPlatform).toHaveBeenCalledWith('AI companies hiring', 'google');
    expect(task.status).toBe('completed');
    expect(task.steps.length).toBe(1);
    expect(task.steps[0].toolName).toBe('search_web');
    expect(stepCompleteSpy).toHaveBeenCalledTimes(1);
  });

  it('handles cancellation gracefully', async () => {
    vi.spyOn(providers, 'orchestrateChat').mockImplementation(async () => {
      runner.cancel();
      return {
        content: '```json\n{\n  "thought": "Searching",\n  "tool": "search_web",\n  "args": { "query": "test" }\n}\n```',
        providerId: 'ollama',
        modelName: 'qwen2.5:7b',
        isLocal: true,
        taskType: 'planning',
      };
    });

    const task = await runner.runTask('Test goal');
    expect(task.status).toBe('cancelled');
    expect(task.plan?.status).toBe('cancelled');
  });

  it('populates and updates ExecutionPlan throughout the task lifecycle', async () => {
    vi.spyOn(providers, 'orchestrateChat')
      .mockResolvedValueOnce({
        content: '```json\n{\n  "thought": "Write a test file to disk",\n  "tool": "write_file",\n  "args": { "path": "/tmp/test.txt", "content": "hello" }\n}\n```',
        providerId: 'ollama',
        modelName: 'qwen2.5:7b',
        isLocal: true,
        taskType: 'planning',
      })
      .mockResolvedValueOnce({
        content: '```json\n{\n  "thought": "Finished writing",\n  "tool": "finish",\n  "args": { "summary": "File written." }\n}\n```',
        providerId: 'ollama',
        modelName: 'qwen2.5:7b',
        isLocal: true,
        taskType: 'planning',
      });

    const planCreatedSpy = vi.fn();
    const task = await runner.runTask('Write files', {
      onPlanCreated: planCreatedSpy,
    });

    expect(planCreatedSpy).toHaveBeenCalledTimes(1);
    expect(task.plan).toBeDefined();
    expect(task.plan?.status).toBe('completed');
    expect(task.plan?.steps.length).toBe(1);
    expect(task.plan?.steps[0].toolName).toBe('write_file');
    expect(task.plan?.steps[0].status).toBe('completed');
    expect(task.plan?.steps[0].isDestructive).toBe(false);
    expect(task.plan?.summary).toBe('File written.');
  });
});
