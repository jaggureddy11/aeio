import React, { useState } from 'react';
import {
  Terminal,
  AlertTriangle,
  FileText,
  Search,
  Clipboard,
  Play,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
  ShieldAlert,
  ExternalLink,
} from 'lucide-react';
import { ToolExecution } from '../../stores/chatStore';

interface Props {
  execution: ToolExecution;
  messageId: string;
  index: number;
  onApprove: (messageId: string, index: number, alwaysAllow?: boolean) => void;
  onDeny: (messageId: string, index: number) => void;
}

export const ToolApprovalCard: React.FC<Props> = ({
  execution,
  messageId,
  index,
  onApprove,
  onDeny,
}) => {
  const hasExitError =
    execution.result?.exit_code !== undefined && execution.result.exit_code !== 0;
  const [alwaysAllow, setAlwaysAllow] = useState(false);
  const [isOutputExpanded, setIsOutputExpanded] = useState(hasExitError);

  const getToolIcon = () => {
    switch (execution.toolName) {
      case 'run_shell':
        return <Terminal size={13} />;
      case 'read_file':
        return <FileText size={13} />;
      case 'search_files':
        return <Search size={13} />;
      case 'read_clipboard':
      case 'write_clipboard':
        return <Clipboard size={13} />;
      case 'open_target':
        return <ExternalLink size={13} />;
      default:
        return <Play size={13} />;
    }
  };

  const getToolTitle = () => {
    switch (execution.toolName) {
      case 'run_shell':
        return 'Shell Command';
      case 'read_file':
        return 'Read Local File';
      case 'search_files':
        return 'Search Files';
      case 'read_clipboard':
        return 'Read Clipboard';
      case 'write_clipboard':
        return 'Write to Clipboard';
      case 'open_target':
        return 'Launch Application / File / URL';
      default:
        return execution.toolName;
    }
  };

  const isDestructive = execution.isDestructive;

  return (
    <div
      className={`tool-execution-card ${
        isDestructive ? 'destructive-tool-card' : ''
      } status-${execution.status}`}
    >
      {/* Header */}
      <div className="tool-card-header">
        <div className="tool-card-title">
          <span className={`tool-badge ${isDestructive ? 'hazard-badge' : ''}`}>
            {isDestructive ? <ShieldAlert size={12} /> : getToolIcon()}
            <span>{getToolTitle()}</span>
          </span>
          {isDestructive && (
            <span className="destructive-tag">
              <AlertTriangle size={11} />
              <span>Destructive Action</span>
            </span>
          )}
        </div>

        {execution.status === 'pending_approval' && (
          <button
            type="button"
            className="tool-deny-btn-mini"
            onClick={() => onDeny(messageId, index)}
            title="Deny execution (Esc)"
            aria-label="Deny tool execution"
          >
            <X size={12} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Prominent Destructive Warning Banner (Hard Constraint) */}
      {isDestructive && execution.status === 'pending_approval' && (
        <div className="destructive-warning-banner">
          <AlertTriangle size={15} className="hazard-icon" />
          <div className="warning-text">
            <strong>POTENTIALLY DESTRUCTIVE ACTION</strong>
            <p>
              This command contains patterns (such as <code>rm</code>, <code>del</code>, or filesystem modification) that may permanently overwrite or erase data on your device. Aeio requires your explicit authorization.
            </p>
          </div>
        </div>
      )}

      {/* Command or Target Display */}
      <div className="tool-details-block">
        {execution.toolName === 'run_shell' && (
          <div className="code-command-snippet">
            <code>{execution.args.command}</code>
            {execution.args.cwd && (
              <span className="cwd-hint">in {execution.args.cwd}</span>
            )}
          </div>
        )}

        {execution.toolName === 'read_file' && (
          <div className="code-command-snippet">
            <span className="arg-label">File:</span>
            <code>{execution.args.path}</code>
          </div>
        )}

        {execution.toolName === 'search_files' && (
          <div className="code-command-snippet">
            <span className="arg-label">Directory:</span>
            <code>{execution.args.dir || './'}</code>
            <span className="arg-label" style={{ marginLeft: 8 }}>Query:</span>
            <code>{execution.args.query}</code>
          </div>
        )}

        {execution.toolName === 'write_clipboard' && (
          <div className="code-command-snippet">
            <span className="arg-label">Copy content:</span>
            <div className="clipboard-preview">{execution.args.text}</div>
          </div>
        )}

        {execution.toolName === 'open_target' && (
          <div className="code-command-snippet">
            <span className="arg-label">Target:</span>
            <code>{execution.args.target || execution.args.path || execution.args.url}</code>
          </div>
        )}

        {execution.toolName === 'read_clipboard' && (
          <div className="code-command-snippet">
            <span>Read text content from active system clipboard</span>
          </div>
        )}
      </div>

      {/* Action / State Section */}
      {execution.status === 'pending_approval' && (
        <div className="tool-action-bar">
          {!isDestructive && (
            <label className="always-allow-checkbox">
              <input
                type="checkbox"
                checked={alwaysAllow}
                onChange={(e) => setAlwaysAllow(e.target.checked)}
              />
              <span>Always allow this command for this session</span>
            </label>
          )}

          <div className="tool-btn-group">
            <button
              type="button"
              className="tool-btn-deny"
              onClick={() => onDeny(messageId, index)}
              aria-label={`Deny execution of ${execution.toolName}`}
            >
              <X size={12} aria-hidden="true" />
              <span>Deny</span>
            </button>
            <button
              type="button"
              className={`tool-btn-approve ${isDestructive ? 'hazard-approve' : ''}`}
              onClick={() => onApprove(messageId, index, alwaysAllow)}
              aria-label={
                isDestructive
                  ? `Authorize destructive action and execute ${execution.toolName}`
                  : `Approve and execute ${execution.toolName}`
              }
            >
              <Check size={12} aria-hidden="true" />
              <span>{isDestructive ? 'Authorize & Execute' : 'Approve & Run'}</span>
            </button>
          </div>
        </div>
      )}

      {execution.status === 'running' && (
        <div className="tool-running-bar">
          <Loader2 size={13} className="spin-icon" />
          <span>Executing command on host system...</span>
        </div>
      )}

      {execution.status === 'denied' && (
        <div className="tool-status-pill denied">
          <X size={12} />
          <span>Execution denied by user</span>
        </div>
      )}

      {execution.status === 'completed' && (
        <div className="tool-completed-section">
          <div className="receipt-header">
            {execution.result?.exit_code !== undefined && execution.result.exit_code !== 0 ? (
              <span className="error-tag exit-error">
                <AlertTriangle size={11} />
                <span>Command returned exit code {execution.result.exit_code}</span>
              </span>
            ) : (
              <span className="success-tag">
                <Check size={11} />
                <span>
                  Executed successfully
                  {execution.result?.exit_code !== undefined &&
                    ` (exit ${execution.result.exit_code})`}
                </span>
              </span>
            )}
            <button
              type="button"
              className="output-toggle-btn"
              onClick={() => setIsOutputExpanded(!isOutputExpanded)}
              aria-expanded={isOutputExpanded}
              aria-label={isOutputExpanded ? 'Hide command output console' : 'View command output console'}
            >
              <span>{isOutputExpanded ? 'Hide output' : 'View output'}</span>
              {isOutputExpanded ? <ChevronUp size={11} aria-hidden="true" /> : <ChevronDown size={11} aria-hidden="true" />}
            </button>
          </div>

          {isOutputExpanded && (
            <div className="output-console-drawer">
              {execution.result?.stdout && (
                <div className="console-block stdout">
                  <span className="console-tag">stdout:</span>
                  <pre>{execution.result.stdout}</pre>
                </div>
              )}
              {execution.result?.stderr && (
                <div className="console-block stderr">
                  <span className="console-tag">stderr:</span>
                  <pre>{execution.result.stderr}</pre>
                </div>
              )}
              {typeof execution.result === 'string' && (
                <div className="console-block">
                  <pre>{execution.result}</pre>
                </div>
              )}
              {Array.isArray(execution.result) && (
                <div className="console-block file-list">
                  <span className="console-tag">
                    Found {execution.result.length} matches:
                  </span>
                  <ul>
                    {execution.result.map((m, i) => (
                      <li key={i}>
                        <code>{m.path}</code> ({m.is_dir ? 'folder' : `${m.size_bytes}B`})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {execution.status === 'error' && (
        <div className="tool-error-section">
          <div className="tool-status-pill error">
            <AlertTriangle size={12} />
            <span>Execution failed: {execution.error || 'System call error'}</span>
          </div>
          <p className="tool-error-hint">
            The requested tool operation could not be performed on your device. Check path spelling, disk permissions, or network connectivity.
          </p>
        </div>
      )}
    </div>
  );
};
