import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChatMessage as MessageType, useChatStore } from '../../stores/chatStore';
import { AeLogo } from '../common/AeLogo';
import {
  Brain,
  Check,
  ChevronDown,
  ChevronUp,
  Cpu,
  Copy,
  Bot,
} from 'lucide-react';
import { ToolApprovalCard } from './ToolApproval';
import { PlanExecutionCard } from './PlanExecutionCard';

interface Props {
  message: MessageType;
}

const CodeBlock: React.FC<any> = ({ node, inline, className, children, ...props }) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const codeContent = String(children).replace(/\n$/, '');

  if (inline || (!match && !codeContent.includes('\n'))) {
    return (
      <code className="inline-code" {...props}>
        {children}
      </code>
    );
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(codeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="claude-code-block">
      <div className="code-header">
        <span className="code-lang">{language || 'code'}</span>
        <button
          type="button"
          className="code-copy-btn"
          onClick={handleCopy}
          title="Copy code"
        >
          {copied ? (
            <>
              <Check size={12} className="copy-check" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="code-pre">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
};

export const ChatMessageItem: React.FC<Props> = React.memo(({ message }) => {
  const isUser = message.role === 'user';
  const {
    confirmMemoryProposal,
    dismissMemoryProposal,
    approveToolExecution,
    denyToolExecution,
    approvePlan,
    cancelPlan,
  } = useChatStore();

  const [showRecalled, setShowRecalled] = useState(false);
  const [showReasoning, setShowReasoning] = useState(false);

  const hasRecalled = !isUser && message.recalledMemories && message.recalledMemories.length > 0;
  const hasProposed = !isUser && message.proposedMemories && message.proposedMemories.length > 0;
  const hasTools = !isUser && message.toolExecutions && message.toolExecutions.length > 0;

  const formattedTime = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isUser) {
    return (
      <div className="claude-message-row user-row">
        <div className="claude-user-bubble">
          <div className="user-message-text">{message.content}</div>
          <div className="user-message-meta">{formattedTime}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="claude-message-row assistant-row">
      {/* Claude-style Assistant Avatar */}
      <div className="claude-avatar-column">
        <div className="claude-avatar-frame">
          <AeLogo height={14} />
        </div>
      </div>

      <div className="claude-body-column">
        {/* Assistant Header: Name, Model Chip, Time */}
        <div className="claude-message-header">
          <span className="claude-sender-name">Aeio</span>

          {message.providerInfo && (
            <span
              className={`claude-model-chip ${message.providerInfo.isLocal ? 'local' : 'cloud'}`}
              title={message.providerInfo.modelName}
            >
              {message.providerInfo.isLocal ? (
                <Cpu size={10} className="chip-icon" />
              ) : (
                <Bot size={10} className="chip-icon" />
              )}
              <span>{message.providerInfo.modelName}</span>
            </span>
          )}

          <span className="claude-time">{formattedTime}</span>
        </div>

        {/* Recalled Memories Pill (Transparent Recall) */}
        {hasRecalled && (
          <div className="claude-recalled-wrapper">
            <button
              type="button"
              className="claude-recalled-toggle"
              onClick={() => setShowRecalled(!showRecalled)}
              aria-expanded={showRecalled}
            >
              <Brain size={12} className="recalled-icon" />
              <span>
                Recalled {message.recalledMemories!.length} memor
                {message.recalledMemories!.length === 1 ? 'y' : 'ies'}
              </span>
              {showRecalled ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>

            {showRecalled && (
              <div className="claude-recalled-drawer">
                {message.recalledMemories!.map((mem) => (
                  <div key={mem.id} className="recalled-item-card">
                    <span className="recalled-category">{mem.category}</span>
                    <span className="recalled-content">{mem.content}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Claude-style Collapsible Reasoning / Thinking Block */}
        {message.reasoning && (
          <div className="claude-thought-wrapper">
            <button
              type="button"
              className="claude-thought-toggle"
              onClick={() => setShowReasoning(!showReasoning)}
              aria-expanded={showReasoning}
            >
              <span className="thought-pulse-dot" />
              <span className="thought-label">
                {message.isStreaming ? 'Thinking...' : 'Reasoning process'}
              </span>
              {showReasoning ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>

            {showReasoning && (
              <div className="claude-thought-drawer">
                <ReactMarkdown
                  components={{
                    code: CodeBlock,
                  }}
                >
                  {message.reasoning}
                </ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {/* Main Response Markdown */}
        <div className="claude-markdown-body">
          <ReactMarkdown
            components={{
              code: CodeBlock,
            }}
          >
            {message.content}
          </ReactMarkdown>

          {message.isStreaming && (
            <span className="claude-typing-cursor" aria-hidden="true" />
          )}
        </div>

        {/* Autonomous Multi-Step Execution Plan Card */}
        {message.plan && (
          <div className="claude-plan-container">
            <PlanExecutionCard
              plan={message.plan}
              messageId={message.id}
              onApprove={() => approvePlan(message.id)}
              onCancel={() => cancelPlan(message.id)}
            />
          </div>
        )}

        {/* Tool Approval & Execution Cards */}
        {hasTools && (
          <div className="claude-tools-container">
            {message.toolExecutions!.map((tool, idx) => (
              <ToolApprovalCard
                key={tool.id || idx}
                execution={tool}
                messageId={message.id}
                index={idx}
                onApprove={approveToolExecution}
                onDeny={denyToolExecution}
              />
            ))}
          </div>
        )}

        {/* Memory Proposals (Tier 1: Explicit Confirmation) */}
        {hasProposed && (
          <div className="claude-proposals-container">
            <div className="proposals-header">
              <Brain size={13} className="proposals-icon" />
              <span>Save to Persistent Memory?</span>
            </div>
            <div className="proposals-list">
              {message.proposedMemories!.map((prop, idx) => (
                <div key={idx} className="proposal-card">
                  <div className="proposal-body">
                    <span className="proposal-category">{prop.category}</span>
                    <p className="proposal-content">{prop.content}</p>
                  </div>
                  <div className="proposal-actions">
                    <button
                      type="button"
                      className="proposal-btn accept"
                      onClick={() => confirmMemoryProposal(message.id, idx)}
                    >
                      <Check size={12} />
                      <span>Remember</span>
                    </button>
                    <button
                      type="button"
                      className="proposal-btn dismiss"
                      onClick={() => dismissMemoryProposal(message.id, idx)}
                    >
                      <span>Skip</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
