import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpClientManager, globalMcpManager } from '../lib/mcp/mcpClient';
import { McpServerConfig } from '../lib/mcp/types';
import { getAvailableAgentTools, executeAgentTool } from '../lib/agent/toolRegistry';

// Mock ipc runShellCommand for testing McpClientManager
vi.mock('../lib/ipc', () => ({
  runShellCommand: vi.fn(),
  searchWebPlatform: vi.fn(),
  fetchUrl: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  searchFiles: vi.fn(),
  openTarget: vi.fn(),
  playSpotify: vi.fn(),
  setSystemVolume: vi.fn(),
  mediaControl: vi.fn(),
  searchMemories: vi.fn(),
  addMemory: vi.fn(),
  lockScreen: vi.fn(),
  simulateKeyPress: vi.fn(),
  simulateScroll: vi.fn(),
  openApp: vi.fn(),
}));

import { runShellCommand } from '../lib/ipc';

describe('McpClientManager', () => {
  let manager: McpClientManager;
  const mockConfig: McpServerConfig = {
    id: 'test-postgres',
    name: 'PostgreSQL MCP',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    env: { DB_URL: 'postgres://localhost/mydb' },
    enabled: true,
  };

  beforeEach(() => {
    manager = new McpClientManager();
    vi.clearAllMocks();
  });

  it('performs initialization handshake and lists discovered tools', async () => {
    (runShellCommand as any)
      // Step 1: Handshake response
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'postgres-mcp', version: '1.0.0' },
          },
        }),
        stderr: '',
        exit_code: 0,
      })
      // Step 2: Tools list response
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          result: {
            tools: [
              {
                name: 'query',
                description: 'Runs a read-only SQL query on the database',
                inputSchema: {
                  type: 'object',
                  properties: {
                    sql: { type: 'string', description: 'SQL select statement' },
                  },
                  required: ['sql'],
                },
              },
            ],
          },
        }),
        stderr: '',
        exit_code: 0,
      });

    const info = await manager.connectServer(mockConfig);

    expect(info.status).toBe('connected');
    expect(info.tools.length).toBe(1);
    expect(info.tools[0].name).toBe('query');
    expect(info.tools[0].serverId).toBe('test-postgres');
    expect(info.tools[0].serverName).toBe('PostgreSQL MCP');

    // Verify command string contained env var and escaped json payload
    expect(runShellCommand).toHaveBeenCalledTimes(2);
    const firstCall = (runShellCommand as any).mock.calls[0][0];
    expect(firstCall).toContain("DB_URL='postgres://localhost/mydb'");
    expect(firstCall).toContain('initialize');
  });

  it('sets server status to error if command execution fails or throws', async () => {
    (runShellCommand as any).mockResolvedValueOnce({
      stdout: '',
      stderr: 'Command not found: npx',
      exit_code: 127,
    });

    const info = await manager.connectServer(mockConfig);

    expect(info.status).toBe('error');
    expect(info.error).toContain('MCP Server execution failed (exit 127)');
    expect(info.tools).toEqual([]);
  });

  it('executes a tool on a connected server and parses JSON text response', async () => {
    // Connect first
    (runShellCommand as any)
      .mockResolvedValueOnce({
        stdout: JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }),
        stderr: '',
        exit_code: 0,
      })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          result: {
            tools: [{ name: 'query', description: 'Run query' }],
          },
        }),
        stderr: '',
        exit_code: 0,
      });

    await manager.connectServer(mockConfig);

    // Call tool
    (runShellCommand as any).mockResolvedValueOnce({
      stdout: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify([{ id: 1, name: 'Alice', role: 'admin' }]),
            },
          ],
        },
      }),
      stderr: '',
      exit_code: 0,
    });

    const result = await manager.callTool('test-postgres', 'query', { sql: 'SELECT * FROM users' });
    expect(result).toEqual([{ id: 1, name: 'Alice', role: 'admin' }]);
  });

  it('handles tool execution error returned from MCP server', async () => {
    (runShellCommand as any)
      .mockResolvedValueOnce({
        stdout: JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }),
        stderr: '',
        exit_code: 0,
      })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          result: { tools: [{ name: 'query' }] },
        }),
        stderr: '',
        exit_code: 0,
      });

    await manager.connectServer(mockConfig);

    // Tool error response
    (runShellCommand as any).mockResolvedValueOnce({
      stdout: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        result: {
          isError: true,
          content: [{ type: 'text', text: 'relation "users" does not exist' }],
        },
      }),
      stderr: '',
      exit_code: 0,
    });

    await expect(
      manager.callTool('test-postgres', 'query', { sql: 'SELECT * FROM users' })
    ).rejects.toThrow('relation "users" does not exist');
  });

  it('allows disconnecting an active server', async () => {
    (runShellCommand as any)
      .mockResolvedValueOnce({
        stdout: JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }),
        stderr: '',
        exit_code: 0,
      })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          result: { tools: [{ name: 'query' }] },
        }),
        stderr: '',
        exit_code: 0,
      });

    await manager.connectServer(mockConfig);
    expect(manager.getAllTools().length).toBe(1);

    manager.disconnectServer('test-postgres');
    expect(manager.getServer('test-postgres')?.status).toBe('disconnected');
    expect(manager.getAllTools().length).toBe(0);
  });
});

describe('Dynamic Agent Tool Registry MCP Integration', () => {
  it('exposes connected MCP tools in getAvailableAgentTools() and dispatches execution', async () => {
    const config: McpServerConfig = {
      id: 'weather-server',
      name: 'Weather MCP',
      command: 'weather-tool',
      args: [],
      enabled: true,
    };

    (runShellCommand as any)
      .mockResolvedValueOnce({
        stdout: JSON.stringify({ jsonrpc: '2.0', id: 100, result: {} }),
        stderr: '',
        exit_code: 0,
      })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          jsonrpc: '2.0',
          id: 101,
          result: {
            tools: [
              {
                name: 'get_forecast',
                description: 'Get weather forecast for a location',
                inputSchema: {
                  type: 'object',
                  properties: { city: { type: 'string' } },
                },
              },
            ],
          },
        }),
        stderr: '',
        exit_code: 0,
      });

    await globalMcpManager.connectServer(config);

    const availableTools = getAvailableAgentTools();
    const weatherTool = availableTools.find((t) => t.name === 'mcp__weather-server__get_forecast');
    expect(weatherTool).toBeDefined();
    expect(weatherTool?.description).toContain('[MCP: Weather MCP]');

    // Test execution through executeAgentTool
    (runShellCommand as any).mockResolvedValueOnce({
      stdout: JSON.stringify({
        jsonrpc: '2.0',
        id: 102,
        result: {
          content: [{ type: 'text', text: 'Sunny, 24°C in Tokyo' }],
        },
      }),
      stderr: '',
      exit_code: 0,
    });

    const executionResult = await executeAgentTool('mcp__weather-server__get_forecast', {
      city: 'Tokyo',
    });
    expect(executionResult).toBe('Sunny, 24°C in Tokyo');
  });
});
