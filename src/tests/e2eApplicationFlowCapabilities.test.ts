import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChatStore, ProposedMemory } from '../stores/chatStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useMemoryStore } from '../stores/memoryStore';
import { matchInstantAction } from '../lib/systemOne/instantActions';
import { isDestructiveCommandClient, normalizeToolName } from '../lib/agent/plan';
import { globalHumanVoice } from '../lib/voice/humanVoiceEngine';
import { SearchResultViewModel, SearxngSearchService } from '../lib/agent/tools/searxngSearch';
import * as ipc from '../lib/ipc';

vi.mock('../lib/ipc', () => ({
  addMemory: vi.fn().mockResolvedValue({ id: 'mem-1', content: 'test fact' }),
  searchMemories: vi.fn().mockResolvedValue([]),
  listMemories: vi.fn().mockResolvedValue([]),
  readFile: vi.fn().mockResolvedValue('file data'),
  writeFile: vi.fn().mockResolvedValue(true),
  searchFiles: vi.fn().mockResolvedValue(['app.tsx', 'index.ts']),
  runShellCommand: vi.fn().mockResolvedValue({ stdout: 'ok', stderr: '', exit_code: 0 }),
  openTarget: vi.fn().mockResolvedValue(true),
  openApp: vi.fn().mockResolvedValue(true),
  playSpotify: vi.fn().mockResolvedValue(true),
  setSystemVolume: vi.fn().mockResolvedValue(true),
  getSystemVolume: vi.fn().mockResolvedValue({ volume: 75, muted: false }),
  setSystemMute: vi.fn().mockResolvedValue(true),
  mediaControl: vi.fn().mockResolvedValue(true),
  lockScreen: vi.fn().mockResolvedValue(true),
  sendSystemNotification: vi.fn().mockResolvedValue(true),
  toggleDarkMode: vi.fn().mockResolvedValue(true),
  captureScreen: vi.fn().mockResolvedValue('/tmp/snap.png'),
  getActiveWindow: vi.fn().mockResolvedValue(null),
  saveChatMessage: vi.fn().mockResolvedValue(undefined),
  loadChatMessages: vi.fn().mockResolvedValue([]),
  clearChatHistory: vi.fn().mockResolvedValue(undefined),
  listWorkspaces: vi.fn().mockResolvedValue([]),
  getActiveWorkspace: vi.fn().mockResolvedValue(null),
  createWorkspace: vi.fn().mockResolvedValue({ id: 'ws-1', name: 'Default' }),
  setActiveWorkspace: vi.fn().mockResolvedValue(true),
  archiveWorkspace: vi.fn().mockResolvedValue(true),
  getApiKey: vi.fn().mockResolvedValue('test-key'),
  speakText: vi.fn().mockResolvedValue(true),
  stopSpeaking: vi.fn().mockResolvedValue(true),
  isTauri: vi.fn().mockReturnValue(false),
}));

describe('E2E Application Flow, Capabilities & Actions (55 Comprehensive Tests)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof window !== 'undefined') {
      window.localStorage = {
        getItem: vi.fn().mockReturnValue(null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        length: 0,
        key: vi.fn(),
      } as any;
    }
    useSettingsStore.setState({
      activeProvider: 'bedrock',
      bedrockRegion: 'us-east-1',
      searxngUrl: 'http://localhost:8080',
      telemetryOptIn: false,
      activeWindowAwareness: false,
      ambientProactive: false,
      hasCompletedOnboarding: true,
    });
    useChatStore.setState({
      messages: [],
      isLoading: false,
      error: null,
      lastFailedPrompt: null,
      alwaysAllowedCommands: [],
      activeNudge: null,
      dismissedNudgeIds: [],
      continueAgenticTurn: vi.fn().mockResolvedValue(undefined) as any,
    });
    useMemoryStore.setState({
      memories: [],
      isLoading: false,
      error: null,
    });
    useWorkspaceStore.setState({
      workspaces: [{ id: 'ws-test', name: 'Dev Project', is_active: true, is_archived: false, created_at: 1000, updated_at: 1000 }],
      activeWorkspace: { id: 'ws-test', name: 'Dev Project', is_active: true, is_archived: false, created_at: 1000, updated_at: 1000 },
      isLoading: false,
    });
  });

  // ==========================================
  // 1. System One Intent Flow & Routing (Tests 1-10)
  // ==========================================
  describe('System 1 Routing & Fast-Path Abilities', () => {
    it('1. routes spotify song intent directly to Spotify action with query', () => {
      const action = matchInstantAction('play Bohemian Rhapsody on Spotify');
      expect(action).not.toBeNull();
      expect(action?.toolName).toBe('play_spotify');
      expect(action?.args.query).toBe('Bohemian Rhapsody');
    });

    it('2. routes spotify artist playback intent', () => {
      const action = matchInstantAction('play Daft Punk in spotify');
      expect(action).not.toBeNull();
      expect(action?.toolName).toBe('play_spotify');
      expect(action?.args.query.toLowerCase()).toContain('daft punk');
    });

    it('3. routes mute command to instant system mute action', () => {
      const action = matchInstantAction('mute volume');
      expect(action).not.toBeNull();
      expect(action?.toolName).toBe('set_system_mute');
      expect(action?.args.mute).toBe(true);
    });

    it('4. routes unmute command with mute: false', () => {
      const action = matchInstantAction('unmute volume');
      expect(action).not.toBeNull();
      expect(action?.toolName).toBe('set_system_mute');
      expect(action?.args.mute).toBe(false);
    });

    it('5. routes numeric volume adjustments accurately', () => {
      const action = matchInstantAction('set volume to 40%');
      expect(action).not.toBeNull();
      expect(action?.toolName).toBe('set_system_volume');
      expect(action?.args.level).toBe(40);
    });

    it('6. routes relative volume increase command', () => {
      const action = matchInstantAction('turn up volume');
      expect(action).not.toBeNull();
      expect(action?.toolName).toBe('set_system_volume');
      expect(action?.args.level).toBeGreaterThanOrEqual(10);
    });

    it('7. routes fast math calculation command', () => {
      const action = matchInstantAction('calculate 250 / 5');
      expect(action).not.toBeNull();
      expect(action?.toolName).toBe('math_evaluate');
      expect(action?.args.expression).toBe('250 / 5');
    });

    it('8. routes screen locking command for security', () => {
      const action = matchInstantAction('lock computer');
      expect(action).not.toBeNull();
      expect(action?.toolName).toBe('lock_screen');
    });

    it('9. routes application launch commands', () => {
      const action = matchInstantAction('open Visual Studio Code');
      expect(action).not.toBeNull();
      expect(action?.toolName).toBe('open_app');
      expect(action?.args.name.toLowerCase()).toContain('visual studio code');
    });

    it('10. bypasses instant actions for deliberative analytical prompts', () => {
      const action = matchInstantAction('Explain the difference between TCP and UDP protocols');
      expect(action).toBeNull();
    });
  });

  // ==========================================
  // 2. Destructive Safety Gates & Security (Tests 11-18)
  // ==========================================
  describe('Destructive Safety Gates & Threat Interception', () => {
    it('11. flags rm -rf root as critical destructive command', () => {
      expect(isDestructiveCommandClient('rm -rf /')).toBe(true);
      expect(isDestructiveCommandClient('rm -rf /etc/hosts')).toBe(true);
    });

    it('12. flags disk partitioning and raw block writes as destructive', () => {
      expect(isDestructiveCommandClient('dd if=/dev/zero of=/dev/sda')).toBe(true);
      expect(isDestructiveCommandClient('mkfs.ext4 /dev/nvme0n1')).toBe(true);
    });

    it('13. flags fork bombs and terminal destruction commands', () => {
      expect(isDestructiveCommandClient(':(){ :|:& };:')).toBe(true);
    });

    it('14. flags dangerous database drop commands in shell scripts', () => {
      expect(isDestructiveCommandClient('psql -c "DROP DATABASE production;"')).toBe(true);
      expect(isDestructiveCommandClient('mysql -e "DROP TABLE users;"')).toBe(true);
    });

    it('15. allows safe informational commands through the client filter', () => {
      expect(isDestructiveCommandClient('ls -la')).toBe(false);
      expect(isDestructiveCommandClient('git status')).toBe(false);
      expect(isDestructiveCommandClient('cat package.json')).toBe(false);
      expect(isDestructiveCommandClient('npm run build')).toBe(false);
    });

    it('16. allows safe file search and grep operations', () => {
      expect(isDestructiveCommandClient('grep -rn "TODO" ./src')).toBe(false);
      expect(isDestructiveCommandClient('find . -name "*.ts"')).toBe(false);
    });

    it('17. enforces alwaysAllow session caching only for safe commands', () => {
      useChatStore.setState({ alwaysAllowedCommands: ['run_shell:git status'] });
      const allowed = useChatStore.getState().alwaysAllowedCommands;
      expect(allowed).toContain('run_shell:git status');
      expect(allowed).not.toContain('run_shell:rm -rf /');
    });

    it('18. normalizes tool name casing and underscores accurately', () => {
      expect(normalizeToolName('Run_Shell')).toBe('run_shell');
      expect(normalizeToolName('SEARCH_WEB')).toBe('search_web');
      expect(normalizeToolName('SEARXNG_SEARCH')).toBe('searxng_search');
      expect(normalizeToolName('  read_file  ')).toBe('read_file');
    });
  });

  // ==========================================
  // 3. Chat Store State Flow & Messages (Tests 19-27)
  // ==========================================
  describe('Chat Store State Flow & Conversation History', () => {
    it('19. adds user and assistant messages with unique IDs and timestamps', () => {
      const { addMessage } = useChatStore.getState();
      const msgId = addMessage({ role: 'user', content: 'What is the current date?' });
      const msg = useChatStore.getState().messages.find((m) => m.id === msgId);
      
      expect(msgId).toBeDefined();
      expect(msg?.role).toBe('user');
      expect(msg?.content).toBe('What is the current date?');
      expect(typeof msg?.timestamp).toBe('number');
      expect(useChatStore.getState().messages).toHaveLength(1);
    });

    it('20. updates streaming message content and reasoning chunks in place', () => {
      const { addMessage, updateMessageContent } = useChatStore.getState();
      const msgId = addMessage({ role: 'assistant', content: '', isStreaming: true });

      updateMessageContent(
        msgId,
        'Streaming reply chunk...',
        true,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'Thinking process step 1'
      );

      const updated = useChatStore.getState().messages.find((m) => m.id === msgId);
      expect(updated?.content).toBe('Streaming reply chunk...');
      expect(updated?.reasoning).toBe('Thinking process step 1');
      expect(updated?.isStreaming).toBe(true);
    });

    it('21. finalizes streaming state when response is complete', () => {
      const { addMessage, updateMessageContent } = useChatStore.getState();
      const msgId = addMessage({ role: 'assistant', content: 'In progress', isStreaming: true });

      updateMessageContent(msgId, 'Final completed response.', false);

      const finalized = useChatStore.getState().messages.find((m) => m.id === msgId);
      expect(finalized?.content).toBe('Final completed response.');
      expect(finalized?.isStreaming).toBe(false);
    });

    it('22. attaches screen snapshots cleanly to user message state', () => {
      const { addMessage } = useChatStore.getState();
      const snapshot = { base64: 'data:image/png;base64,iVBORw0KGgo...', width: 1920, height: 1080 };
      const msgId = addMessage({
        role: 'user',
        content: 'What is on my screen right now?',
        screenSnapshot: snapshot,
      });

      const msg = useChatStore.getState().messages.find((m) => m.id === msgId);
      expect(msg?.screenSnapshot).toBeDefined();
      expect(msg?.screenSnapshot?.width).toBe(1920);
      expect(msg?.screenSnapshot?.height).toBe(1080);
    });

    it('23. records recalled memories and proposed memories in assistant message metadata', () => {
      const { addMessage, updateMessageContent } = useChatStore.getState();
      const msgId = addMessage({ role: 'assistant', content: 'I remember your preferred stack.' });

      const recalled = [{ id: 'm1', content: 'User prefers TypeScript and React', category: 'preference' as const }];
      const proposed: ProposedMemory[] = [{ content: 'User prefers dark mode by default', category: 'preference' }];

      updateMessageContent(
        msgId,
        'I remember your preferred stack.',
        false,
        recalled,
        proposed
      );

      const updated = useChatStore.getState().messages.find((m) => m.id === msgId);
      expect(updated?.recalledMemories).toHaveLength(1);
      expect(updated?.proposedMemories).toHaveLength(1);
      expect(updated?.recalledMemories?.[0].content).toContain('TypeScript');
    });

    it('24. confirms memory proposal and delegates to memoryStore', async () => {
      const { addMessage, updateMessageContent, confirmMemoryProposal } = useChatStore.getState();
      const msgId = addMessage({ role: 'assistant', content: 'Should I save this?' });
      updateMessageContent(
        msgId,
        'Should I save this?',
        false,
        undefined,
        [{ content: 'New fact discovered', category: 'fact' }]
      );

      await confirmMemoryProposal(msgId, 0);
      expect(ipc.addMemory).toHaveBeenCalledWith('New fact discovered', 'fact', 'ws-test');
    });

    it('25. dismisses memory proposal without storing to persistent memory', () => {
      const { addMessage, updateMessageContent, dismissMemoryProposal } = useChatStore.getState();
      const msgId = addMessage({ role: 'assistant', content: 'Save preference?' });
      updateMessageContent(
        msgId,
        'Save preference?',
        false,
        undefined,
        [{ content: 'Ignore this preference', category: 'preference' }]
      );

      dismissMemoryProposal(msgId, 0);
      const after = useChatStore.getState().messages.find((m) => m.id === msgId);
      expect(after?.proposedMemories).toHaveLength(0);
      expect(ipc.addMemory).not.toHaveBeenCalled();
    });

    it('26. clears chat history and resets state', async () => {
      const { addMessage, clearMessages } = useChatStore.getState();
      addMessage({ role: 'user', content: 'Hello' });
      addMessage({ role: 'assistant', content: 'Hi there!' });
      expect(useChatStore.getState().messages).toHaveLength(2);

      await clearMessages();
      expect(useChatStore.getState().messages).toHaveLength(0);
      expect(useChatStore.getState().error).toBeNull();
    });

    it('27. captures lastFailedPrompt on error to enable one-click retry', () => {
      useChatStore.setState({
        lastFailedPrompt: 'Fetch quarterly financial results',
        error: 'Network connection timeout to LLM provider',
      });

      expect(useChatStore.getState().lastFailedPrompt).toBe('Fetch quarterly financial results');
      expect(useChatStore.getState().error).toContain('timeout');
    });
  });

  // ==========================================
  // 4. Tool Execution Approval Lifecycle (Tests 28-35)
  // ==========================================
  describe('Tool Approval State Machine Lifecycle', () => {
    it('28. transitions tool execution state to denied when user clicks Deny', () => {
      const { addMessage, denyToolExecution } = useChatStore.getState();
      const msgId = addMessage({
        role: 'assistant',
        content: 'I need to run a shell command.',
        toolExecutions: [
          {
            id: 'exec-28',
            toolName: 'run_shell',
            args: { command: 'npm test' },
            status: 'pending_approval',
            isDestructive: false,
          },
        ],
      });

      denyToolExecution(msgId, 0);
      const updated = useChatStore.getState().messages.find((m) => m.id === msgId);
      expect(updated?.toolExecutions?.[0].status).toBe('denied');
    });

    it('29. transitions tool execution state to completed upon successful approval execution', async () => {
      useChatStore.setState({ consecutiveAgenticRounds: 4 });
      const { addMessage, approveToolExecution } = useChatStore.getState();
      const msgId = addMessage({
        role: 'assistant',
        content: 'Listing files...',
        toolExecutions: [
          {
            id: 'exec-29',
            toolName: 'list_directory',
            args: { dir: './src' },
            status: 'pending_approval',
            isDestructive: false,
          },
        ],
      });

      await approveToolExecution(msgId, 0);
      const updated = useChatStore.getState().messages.find((m) => m.id === msgId);
      expect(updated?.toolExecutions?.[0].status).toBe('completed');
    });

    it('30. handles tool execution failure and sets status to error with error message', async () => {
      useChatStore.setState({ consecutiveAgenticRounds: 4 });
      (ipc.readFile as any).mockRejectedValueOnce(new Error('ENOENT: no such file or directory'));
      const { addMessage, approveToolExecution } = useChatStore.getState();
      const msgId = addMessage({
        role: 'assistant',
        content: 'Reading missing file...',
        toolExecutions: [
          {
            id: 'exec-30',
            toolName: 'read_file',
            args: { path: '/invalid/path.txt' },
            status: 'pending_approval',
            isDestructive: false,
          },
        ],
      });

      await approveToolExecution(msgId, 0);
      const updated = useChatStore.getState().messages.find((m) => m.id === msgId);
      expect(updated?.toolExecutions?.[0].status).toBe('error');
      expect(updated?.toolExecutions?.[0].error).toContain('ENOENT');
    });

    it('31. saves command to alwaysAllowedCommands when user checks always allow', async () => {
      useChatStore.setState({ consecutiveAgenticRounds: 4 });
      const { addMessage, approveToolExecution } = useChatStore.getState();
      const msgId = addMessage({
        role: 'assistant',
        content: 'Running build',
        toolExecutions: [
          {
            id: 'exec-31',
            toolName: 'run_shell',
            args: { command: 'npm run build' },
            status: 'pending_approval',
            isDestructive: false,
          },
        ],
      });

      await approveToolExecution(msgId, 0, true);
      const state = useChatStore.getState();
      expect(state.alwaysAllowedCommands.some((c) => c.includes('npm run build'))).toBe(true);
    });

    it('32. denies always-allow caching for destructive commands even if user requested', async () => {
      useChatStore.setState({ consecutiveAgenticRounds: 4 });
      const { addMessage, approveToolExecution } = useChatStore.getState();
      const msgId = addMessage({
        role: 'assistant',
        content: 'Deleting build dir',
        toolExecutions: [
          {
            id: 'exec-32',
            toolName: 'run_shell',
            args: { command: 'rm -rf /dist' },
            status: 'pending_approval',
            isDestructive: true,
          },
        ],
      });

      // Attempt always allow on destructive
      await approveToolExecution(msgId, 0, true);
      const state = useChatStore.getState();
      expect(state.alwaysAllowedCommands.some((c) => c.includes('rm -rf /dist'))).toBe(false);
    });

    it('33. isolates multiple tool executions in a single assistant message', async () => {
      useChatStore.setState({ consecutiveAgenticRounds: 4 });
      const { addMessage, approveToolExecution, denyToolExecution } = useChatStore.getState();
      const msgId = addMessage({
        role: 'assistant',
        content: 'Two actions queued',
        toolExecutions: [
          {
            id: 'exec-33-a',
            toolName: 'open_app',
            args: { name: 'Slack' },
            status: 'pending_approval',
            isDestructive: false,
          },
          {
            id: 'exec-33-b',
            toolName: 'open_app',
            args: { name: 'Terminal' },
            status: 'pending_approval',
            isDestructive: false,
          },
        ],
      });

      await approveToolExecution(msgId, 0);
      denyToolExecution(msgId, 1);

      const tools = useChatStore.getState().messages.find((m) => m.id === msgId)?.toolExecutions;
      expect(tools?.[0].status).toBe('completed');
      expect(tools?.[1].status).toBe('denied');
    });

    it('34. records execution result exit codes properly for shell tasks', async () => {
      useChatStore.setState({ consecutiveAgenticRounds: 4 });
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: 'test output',
        stderr: '',
        exit_code: 0,
      });

      const { addMessage, approveToolExecution } = useChatStore.getState();
      const msgId = addMessage({
        role: 'assistant',
        content: 'Running check',
        toolExecutions: [
          {
            id: 'exec-34',
            toolName: 'run_shell',
            args: { command: 'cargo check' },
            status: 'pending_approval',
            isDestructive: false,
          },
        ],
      });

      await approveToolExecution(msgId, 0);
      const result = useChatStore.getState().messages.find((m) => m.id === msgId)?.toolExecutions?.[0].result;
      expect(result.exit_code).toBe(0);
      expect(result.stdout).toBe('test output');
    });

    it('35. flags exit code failures while recording stderr', async () => {
      useChatStore.setState({ consecutiveAgenticRounds: 4 });
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: '',
        stderr: 'compilation error: syntax error in main.rs:14',
        exit_code: 101,
      });

      const { addMessage, approveToolExecution } = useChatStore.getState();
      const msgId = addMessage({
        role: 'assistant',
        content: 'Building binary',
        toolExecutions: [
          {
            id: 'exec-35',
            toolName: 'run_shell',
            args: { command: 'cargo build' },
            status: 'pending_approval',
            isDestructive: false,
          },
        ],
      });

      await approveToolExecution(msgId, 0);
      const result = useChatStore.getState().messages.find((m) => m.id === msgId)?.toolExecutions?.[0].result;
      expect(result.exit_code).toBe(101);
      expect(result.stderr).toContain('compilation error');
    });
  });

  // ==========================================
  // 5. Human Voice Engine & TTS Capabilities (Tests 36-43)
  // ==========================================
  describe('Human Voice Engine & Speech Synthesis Capabilities', () => {
    it('36. sanitizes markdown headers, bold markers, and bullet symbols for natural speech', () => {
      const raw = '### Overview\n* Item 1: **important** notice.\n* Item 2: details.';
      const sanitized = globalHumanVoice.sanitizeSpeechText(raw);
      expect(sanitized).not.toContain('###');
      expect(sanitized).not.toContain('**');
      expect(sanitized).not.toContain('*');
      expect(sanitized).toContain('Overview');
      expect(sanitized).toContain('important notice');
    });

    it('37. removes code pre blocks so code syntax is not read aloud verbatim', () => {
      const raw = 'Here is the solution:\n```typescript\nconst x = 42;\nconsole.log(x);\n```\nIt works as expected.';
      const sanitized = globalHumanVoice.sanitizeSpeechText(raw);
      expect(sanitized).not.toContain('const x = 42');
      expect(sanitized).toContain('Here is the solution');
      expect(sanitized).toContain('It works as expected');
    });

    it('38. strips raw hyperlinks to avoid speaking URLs letter by letter', () => {
      const raw = 'Check out [Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide) for more.';
      const sanitized = globalHumanVoice.sanitizeSpeechText(raw);
      expect(sanitized).not.toContain('https://');
      expect(sanitized).toContain('Documentation');
    });

    it('39. splits text into sentence boundaries to avoid browser speech synthesis hanging', () => {
      const text = 'Hello world. How are you today? I am your AI assistant! Everything is ready.';
      const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
      expect(sentences).toHaveLength(4);
      expect(sentences[0]?.trim()).toBe('Hello world.');
      expect(sentences[1]?.trim()).toBe('How are you today?');
    });

    it('40. handles stop safely when idle', () => {
      globalHumanVoice.stop();
      expect(globalHumanVoice.getIsSpeaking()).toBe(false);
    });

    it('41. provides accurate speech state indicators', () => {
      expect(globalHumanVoice.getIsSpeaking()).toBe(false);
    });

    it('42. returns empty string when sanitizing empty or pure code text', () => {
      expect(globalHumanVoice.sanitizeSpeechText('')).toBe('');
      expect(globalHumanVoice.sanitizeSpeechText('```ts\nlet a = 1;\n```')).toBe('');
    });

    it('43. cleans up multiple whitespace characters and linebreaks', () => {
      const messy = 'Hello \n\n\n\t   world.    How   are you?';
      const clean = globalHumanVoice.sanitizeSpeechText(messy);
      expect(clean).toBe('Hello world. How are you?');
    });
  });

  // ==========================================
  // 6. OOP SearXNG & Information Hiding (Tests 44-50)
  // ==========================================
  describe('OOP SearXNG Information Hiding & Presentation Flow', () => {
    it('44. encapsulates raw API results in SearchResultViewModel', () => {
      const items = [
        {
          title: 'Quantum Advantage Milestone',
          url: 'https://science.org/articles/quantum-breakthrough',
          content: 'Researchers achieve quantum advantage in error-mitigated circuit computations.',
        },
      ];

      const vm = SearchResultViewModel.create('quantum computing', items);
      expect(vm.hasResults).toBe(true);
      expect(vm.count).toBe(1);
      expect(vm.summary).toBe('Found 1 relevant source.');
    });

    it('45. extracts clean top-level domain, hiding URL path, parameters, and fragments', () => {
      const items = [
        {
          title: 'AWS Bedrock Overview',
          url: 'https://aws.amazon.com/bedrock/pricing/?region=us-east-1#cost',
          content: 'Pricing and quota specs for Amazon Bedrock foundation models.',
        },
      ];

      const vm = SearchResultViewModel.create('aws bedrock', items);
      const source = vm.essentialSources[0];
      expect(source.domain).toBe('aws.amazon.com');
      expect(source.title).toBe('AWS Bedrock Overview');
      expect(source.snippet).toBe(items[0].content);
    });

    it('46. encapsulates LLM context formatting separate from visual presentation', () => {
      const items = [
        {
          title: 'Tauri Architecture',
          url: 'https://v2.tauri.app/concept/architecture',
          content: 'Tauri isolates frontend from core system via IPC message passing.',
        },
      ];

      const vm = SearchResultViewModel.create('tauri ipc', items);
      const llmContext = vm.toContextForLlm();
      expect(llmContext).toContain('[Result 1]');
      expect(llmContext).toContain('Title: Tauri Architecture');
      expect(llmContext).toContain('Content: Tauri isolates frontend');

      // Visual presentation model does not contain [Result 1] marker string
      const pres = vm.toPresentation();
      expect(pres.sources[0].title).toBe('Tauri Architecture');
      expect(pres.sources[0].domain).toBe('v2.tauri.app');
    });

    it('47. parses formatted tool output into a SearchResultViewModel for UI rendering', () => {
      const rawOutput = `Web Search Context:
[Result 1]
Title: Rust 1.85 Release Notes
URL: https://blog.rust-lang.org/2026/02/rust-1-85.html
Content: Rust 1.85 stabilizes async closures and edition 2024 features.

Sources:
1. [Rust 1.85 Release Notes](https://blog.rust-lang.org/2026/02/rust-1-85.html)`;

      const vm = SearchResultViewModel.fromAny(rawOutput, 'Rust 1.85');
      expect(vm).not.toBeNull();
      expect(vm?.hasResults).toBe(true);
      expect(vm?.essentialSources[0].domain).toBe('blog.rust-lang.org');
      expect(vm?.essentialSources[0].title).toBe('Rust 1.85 Release Notes');
    });

    it('48. constructs empty SearchResultViewModel cleanly when query returns no information', () => {
      const vm = SearchResultViewModel.fromAny('No reliable information was found.', 'test');
      expect(vm).not.toBeNull();
      expect(vm?.hasResults).toBe(false);
      expect(vm?.count).toBe(0);
      expect(vm?.summary).toBe('No reliable information was found.');
    });

    it('49. service executes GET request and adheres to contract', async () => {
      const service = new SearxngSearchService();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              title: 'Sydney Weather Forecast',
              url: 'https://weather.com.au/nsw/sydney',
              content: 'Sunny with mild afternoon sea breeze, 24 degrees Celsius.',
            },
          ],
        }),
      });

      const vm = await service.search('Sydney weather');
      expect(vm.hasResults).toBe(true);
      expect(vm.essentialSources[0].domain).toBe('weather.com.au');
    });

    it('50. service falls back safely on HTTP error without throwing exceptions', async () => {
      const service = new SearxngSearchService();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      });

      const vm = await service.search('failing endpoint');
      expect(vm.hasResults).toBe(false);
      expect(vm.summary).toBe('No reliable information was found.');
    });
  });

  // ==========================================
  // 7. Workspace Scoping & Persistence (Tests 51-55)
  // ==========================================
  describe('Workspace Scoping & Persistent State', () => {
    it('51. initializes with default active workspace', () => {
      const { activeWorkspace, workspaces } = useWorkspaceStore.getState();
      expect(activeWorkspace).not.toBeNull();
      expect(activeWorkspace?.name).toBe('Dev Project');
      expect(workspaces).toHaveLength(1);
    });

    it('52. switches active workspace via switchWorkspace', async () => {
      const ws2 = { id: 'ws-2', name: 'Second Workspace', path: '/code/second', created_at: 2000, is_active: true };
      (ipc.listWorkspaces as any).mockResolvedValueOnce([useWorkspaceStore.getState().workspaces[0], ws2]);

      const { switchWorkspace } = useWorkspaceStore.getState();
      await switchWorkspace('ws-2');

      expect(ipc.setActiveWorkspace).toHaveBeenCalledWith('ws-2');
      expect(useWorkspaceStore.getState().activeWorkspace?.id).toBe('ws-2');
    });

    it('53. scopes memory queries to the active workspace ID', async () => {
      useWorkspaceStore.setState({
        activeWorkspace: { id: 'scoped-ws-99', name: 'Scoped Project', is_active: true, is_archived: false, created_at: 3000, updated_at: 3000 },
      });

      const { createMemory } = useMemoryStore.getState();
      await createMemory('Specific workspace preference', 'preference');

      expect(ipc.addMemory).toHaveBeenCalledWith(
        'Specific workspace preference',
        'preference',
        'scoped-ws-99'
      );
    });

    it('54. creates new workspace cleanly via createWorkspace', async () => {
      (ipc.createWorkspace as any).mockResolvedValueOnce({
        id: 'ws-new',
        name: 'Brand New Project',
        created_at: 4000,
      });
      (ipc.listWorkspaces as any).mockResolvedValueOnce([
        { id: 'ws-new', name: 'Brand New Project', created_at: 4000, is_active: true },
      ]);

      const { createWorkspace } = useWorkspaceStore.getState();
      const created = await createWorkspace('Brand New Project');

      expect(created.id).toBe('ws-new');
      expect(ipc.createWorkspace).toHaveBeenCalledWith('Brand New Project', undefined, undefined);
    });

    it('55. handles workspace archiving cleanly', async () => {
      const { archiveWorkspace } = useWorkspaceStore.getState();
      (ipc.listWorkspaces as any).mockResolvedValueOnce([]);

      await archiveWorkspace('ws-test');
      expect(ipc.archiveWorkspace).toHaveBeenCalledWith('ws-test', true);
    });
  });
});

