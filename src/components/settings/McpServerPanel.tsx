import React, { useState } from 'react';
import {
  Server,
  Plus,
  Trash2,
  RefreshCw,
  Power,
  Wrench,
  AlertCircle,
} from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import { globalMcpManager } from '../../lib/mcp/mcpClient';
import { McpServerConfig } from '../../lib/mcp/types';

export const McpServerPanel: React.FC = () => {
  const { mcpServers, addMcpServer, removeMcpServer, toggleMcpServer } = useSettingsStore();

  const [name, setName] = useState('');
  const [command, setCommand] = useState('npx');
  const [argsStr, setArgsStr] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [expandedServerId, setExpandedServerId] = useState<string | null>(null);

  const handleAddServer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !command.trim()) return;

    const parsedArgs = argsStr
      .split(/\s+/)
      .map((a) => a.trim())
      .filter(Boolean);

    addMcpServer({
      name: name.trim(),
      command: command.trim(),
      args: parsedArgs,
      enabled: true,
    });

    setName('');
    setArgsStr('');
    setIsAdding(false);
  };

  const handleReconnect = async (server: McpServerConfig) => {
    setConnectingId(server.id);
    try {
      await globalMcpManager.connectServer(server);
    } finally {
      setConnectingId(null);
    }
  };

  const addPresetTemplate = (preset: { name: string; command: string; args: string[] }) => {
    addMcpServer({
      name: preset.name,
      command: preset.command,
      args: preset.args,
      enabled: true,
    });
  };

  const connectedServers = globalMcpManager.getServers();

  return (
    <div className="mcp-server-panel">
      <div className="mcp-header">
        <div className="mcp-title-group">
          <Server size={18} className="mcp-header-icon" />
          <div>
            <h3 className="mcp-title">Model Context Protocol (MCP) Ecosystem</h3>
            <p className="mcp-subtitle">
              Connect external tools, databases, and APIs. Discovered tools are directly callable by Aeio's autonomous agent.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="mcp-add-btn"
          onClick={() => setIsAdding(!isAdding)}
        >
          <Plus size={14} />
          <span>Add Server</span>
        </button>
      </div>

      {/* Preset Quick Starters */}
      {mcpServers.length === 0 && !isAdding && (
        <div className="mcp-presets-container">
          <span className="mcp-presets-label">Popular Starters:</span>
          <button
            type="button"
            className="mcp-preset-pill"
            onClick={() =>
              addPresetTemplate({
                name: 'Local SQLite MCP',
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-sqlite', '--db', 'local.db'],
              })
            }
          >
            SQLite MCP
          </button>
          <button
            type="button"
            className="mcp-preset-pill"
            onClick={() =>
              addPresetTemplate({
                name: 'Filesystem MCP',
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
              })
            }
          >
            Filesystem MCP
          </button>
        </div>
      )}

      {/* Add Server Form */}
      {isAdding && (
        <form onSubmit={handleAddServer} className="mcp-form-card">
          <h4 className="mcp-form-title">Register Local MCP Server</h4>
          <div className="mcp-form-grid">
            <div className="mcp-field">
              <label>Server Name</label>
              <input
                type="text"
                placeholder="e.g. GitHub MCP"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="mcp-field">
              <label>Command</label>
              <input
                type="text"
                placeholder="e.g. npx, uvx, python"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                required
              />
            </div>
            <div className="mcp-field full">
              <label>Arguments (space-separated)</label>
              <input
                type="text"
                placeholder="e.g. -y @modelcontextprotocol/server-github"
                value={argsStr}
                onChange={(e) => setArgsStr(e.target.value)}
              />
            </div>
          </div>

          <div className="mcp-form-actions">
            <button
              type="button"
              className="mcp-btn secondary"
              onClick={() => setIsAdding(false)}
            >
              Cancel
            </button>
            <button type="submit" className="mcp-btn primary">
              Save & Connect
            </button>
          </div>
        </form>
      )}

      {/* Server List */}
      <div className="mcp-server-list">
        {mcpServers.map((server) => {
          const liveInfo = connectedServers.find((s) => s.id === server.id);
          const isConnecting = connectingId === server.id;
          const status = liveInfo?.status || (server.enabled ? 'connected' : 'disconnected');
          const tools = liveInfo?.tools || [];
          const isExpanded = expandedServerId === server.id;

          return (
            <div key={server.id} className={`mcp-server-card ${status}`}>
              <div className="mcp-card-main">
                <div className="mcp-card-info">
                  <div className="mcp-card-title-row">
                    <span className={`mcp-status-dot ${status}`} />
                    <span className="mcp-server-name">{server.name}</span>
                    <span className="mcp-cmd-badge">
                      {server.command} {server.args.slice(0, 2).join(' ')}
                    </span>
                  </div>

                  <div className="mcp-card-meta">
                    <span className="mcp-tools-count">
                      <Wrench size={11} />
                      {tools.length} tool{tools.length === 1 ? '' : 's'} available
                    </span>
                    {liveInfo?.error && (
                      <span className="mcp-error-msg">
                        <AlertCircle size={11} /> {liveInfo.error}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mcp-card-actions">
                  <button
                    type="button"
                    className={`mcp-icon-btn ${server.enabled ? 'active' : ''}`}
                    onClick={() => toggleMcpServer(server.id)}
                    title={server.enabled ? 'Disable server' : 'Enable server'}
                  >
                    <Power size={13} />
                  </button>

                  <button
                    type="button"
                    className="mcp-icon-btn"
                    onClick={() => handleReconnect(server)}
                    disabled={isConnecting}
                    title="Reconnect & sync tools"
                  >
                    <RefreshCw size={13} className={isConnecting ? 'spin' : ''} />
                  </button>

                  {tools.length > 0 && (
                    <button
                      type="button"
                      className="mcp-tools-toggle"
                      onClick={() => setExpandedServerId(isExpanded ? null : server.id)}
                    >
                      {isExpanded ? 'Hide Tools' : 'Inspect Tools'}
                    </button>
                  )}

                  <button
                    type="button"
                    className="mcp-icon-btn delete"
                    onClick={() => removeMcpServer(server.id)}
                    title="Remove server"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Tools Inspector Drawer */}
              {isExpanded && tools.length > 0 && (
                <div className="mcp-tools-drawer">
                  <span className="mcp-tools-drawer-title">Exposed Server Tools:</span>
                  <div className="mcp-tools-grid">
                    {tools.map((tool) => (
                      <div key={tool.name} className="mcp-tool-pill">
                        <span className="mcp-tool-name">{tool.name}</span>
                        {tool.description && (
                          <span className="mcp-tool-desc">{tool.description}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
