import {
  McpServerConfig,
  McpServerInfo,
  McpTool,
  JsonRpcRequest,
  JsonRpcResponse,
  McpListToolsResult,
  McpCallToolResult,
} from './types';
import { runShellCommand } from '../ipc';

export class McpClientManager {
  private servers: Map<string, McpServerInfo> = new Map();
  private configs: Map<string, McpServerConfig> = new Map();
  private nextRequestId = 1;

  public getServers(): McpServerInfo[] {
    return Array.from(this.servers.values());
  }

  public getServer(serverId: string): McpServerInfo | undefined {
    return this.servers.get(serverId);
  }

  public getAllTools(): McpTool[] {
    const tools: McpTool[] = [];
    for (const server of this.servers.values()) {
      if (server.status === 'connected') {
        tools.push(...server.tools);
      }
    }
    return tools;
  }

  /**
   * Dispatches a single JSON-RPC message to a stdio MCP server via shell piping.
   */
  private async dispatchStdioMessage<T>(
    config: McpServerConfig,
    method: string,
    params?: any
  ): Promise<T> {
    const requestId = this.nextRequestId++;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: requestId,
      method,
      params,
    };

    const escapedPayload = JSON.stringify(request).replace(/'/g, "'\\''");
    const argsStr = config.args.join(' ');
    let envPrefix = '';
    if (config.env && Object.keys(config.env).length > 0) {
      envPrefix =
        Object.entries(config.env)
          .map(([k, v]) => `${k}='${v.replace(/'/g, "'\\''")}'`)
          .join(' ') + ' ';
    }
    // Use printf into the target command with stdout capture
    const shellCmd = `printf '%s\\n' '${escapedPayload}' | ${envPrefix}${config.command} ${argsStr}`;

    const output = await runShellCommand(shellCmd);

    if (output.exit_code !== 0 && !output.stdout) {
      throw new Error(
        `MCP Server execution failed (exit ${output.exit_code}): ${output.stderr || 'Unknown error'}`
      );
    }

    // Locate the JSON-RPC response line in stdout
    const lines = output.stdout
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    let parsedResponse: JsonRpcResponse<T> | null = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const parsed = JSON.parse(lines[i]);
        if (parsed && parsed.jsonrpc === '2.0') {
          parsedResponse = parsed;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!parsedResponse) {
      throw new Error(`Invalid JSON-RPC output from MCP server: ${output.stdout.slice(0, 300)}`);
    }

    if (parsedResponse.error) {
      throw new Error(
        `MCP Server Error (${parsedResponse.error.code}): ${parsedResponse.error.message}`
      );
    }

    return parsedResponse.result as T;
  }

  /**
   * Connects to an MCP server, performs handshake, and queries its tools.
   */
  public async connectServer(config: McpServerConfig): Promise<McpServerInfo> {
    this.configs.set(config.id, config);
    const info: McpServerInfo = {
      id: config.id,
      name: config.name,
      status: 'connecting',
      tools: [],
    };
    this.servers.set(config.id, info);

    try {
      // 1. Initialize Handshake
      await this.dispatchStdioMessage(config, 'initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'Aeio-Desktop',
          version: '1.0.0',
        },
      });

      // 2. Discover Tools
      const listResult = await this.dispatchStdioMessage<McpListToolsResult>(
        config,
        'tools/list',
        {}
      );

      const tools: McpTool[] = (listResult?.tools || []).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        serverId: config.id,
        serverName: config.name,
      }));

      info.status = 'connected';
      info.tools = tools;
      info.error = undefined;
      return info;
    } catch (err: any) {
      info.status = 'error';
      info.error = err?.message || String(err);
      info.tools = [];
      return info;
    }
  }

  /**
   * Calls a tool on a connected MCP server.
   */
  public async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, any>
  ): Promise<any> {
    const config = this.configs.get(serverId);
    if (!config) {
      throw new Error(`MCP Server '${serverId}' is not configured.`);
    }

    const serverInfo = this.servers.get(serverId);
    if (!serverInfo || serverInfo.status !== 'connected') {
      throw new Error(`MCP Server '${serverId}' is not connected.`);
    }

    const result = await this.dispatchStdioMessage<McpCallToolResult>(config, 'tools/call', {
      name: toolName,
      arguments: args,
    });

    if (result.isError) {
      const errText = result.content
        .map((c) => c.text)
        .filter(Boolean)
        .join('\n');
      throw new Error(`MCP Tool Error: ${errText || 'Execution failed'}`);
    }

    // Extract text responses or return raw content
    const textOutputs = result.content
      .map((c) => c.text)
      .filter((t): t is string => typeof t === 'string');

    if (textOutputs.length === 1) {
      try {
        return JSON.parse(textOutputs[0]);
      } catch {
        return textOutputs[0];
      }
    }

    return result.content;
  }

  /**
   * Disconnects a server from the active pool.
   */
  public disconnectServer(serverId: string): void {
    const server = this.servers.get(serverId);
    if (server) {
      server.status = 'disconnected';
      server.tools = [];
    }
  }
}

export const globalMcpManager = new McpClientManager();
