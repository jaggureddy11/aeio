export interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

export type McpServerStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface McpToolParameterSchema {
  type: string;
  properties?: Record<string, any>;
  required?: string[];
  [key: string]: any;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: McpToolParameterSchema;
  serverId: string;
  serverName: string;
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

export interface JsonRpcResponse<T = any> {
  jsonrpc: '2.0';
  id: string | number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface McpListToolsResult {
  tools: Array<{
    name: string;
    description?: string;
    inputSchema?: McpToolParameterSchema;
  }>;
}

export interface McpCallToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

export interface McpServerInfo {
  id: string;
  name: string;
  status: McpServerStatus;
  tools: McpTool[];
  error?: string;
}
