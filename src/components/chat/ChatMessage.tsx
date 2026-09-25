import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChatMessage as MessageType, useChatStore } from '../../stores/chatStore';
import { useSettingsStore } from '../../stores/settingsStore';
import logo from '../../assets/logo.png';
import { User, Brain, Check, Plus, X, ChevronDown, ChevronUp, Lock, Monitor, Cpu, Copy, ShieldCheck, Key } from 'lucide-react';
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
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span className="code-block-lang">{language || 'code'}</span>
        <button
          type="button"
          className="code-copy-btn"
          onClick={handleCopy}
          title="Copy code"
        >
          {copied ? (
            <>
              <Check size={11} className="copy-icon-success" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy size={11} />
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
  const { setActiveTab } = useSettingsStore();
  const [showRecalled, setShowRecalled] = useState(false);
  const [showReasoning, setShowReasoning] = useState(false);

  const hasRecalled = !isUser && message.recalledMemories && message.recalledMemories.length > 0;
  const hasProposed = !isUser && message.proposedMemories && message.proposedMemories.length > 0;
  const hasTools = !isUser && message.toolExecutions && message.toolExecutions.length > 0;

  return (
    <div className={`message-row ${isUser ? 'user-row' : 'assistant-row'}`}>
      <div className="message-avatar">
        {isUser ? (
          <div className="avatar-user">
            <User size={12} />
          </div>
        ) : (
          <div className="avatar-ai-frame">
            <img src={logo} alt="Aeio" className="avatar-ai" />
          </div>
        )}
      </div>

      <div className="message-content-column">
        {/* Recalled Memories Citation (Tier 1: Transparent Recall) */}
        {hasRecalled && (
          <div className="recalled-memories-badge-container">
            <button
              type="button"
              className="recalled-toggle-btn"
              onClick={() => setShowRecalled(!showRecalled)}
              aria-expanded={showRecalled}
              aria-label={`Toggle transparent recalled memories (${message.recalledMemories!.length} memories)`}
            >
              <Brain size={11} className="recalled-icon" aria-hidden="true" />
              <span>
                Recalled {message.recalledMemories!.length} memor
                {message.recalledMemories!.length === 1 ? 'y' : 'ies'}
              </span>
              {showRecalled ? <ChevronUp size={11} aria-hidden="true" /> : <ChevronDown size={11} aria-hidden="true" />}
            </button>

            {showRecalled && (
              <div className="recalled-drawer">
                {message.recalledMemories!.map((mem) => (
                  <div key={mem.id} className="recalled-item">
                    <span className="recalled-category">[{mem.category}]</span>
                    <span className="recalled-text">{mem.content}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Message Bubble */}
        <div className={`message-bubble ${isUser ? 'user-bubble' : 'assistant-bubble'}`}>
          {!isUser && message.providerInfo && (
            <div className="message-provider-meta">
              <span className={`provider-dot ${message.providerInfo.isLocal ? 'local' : 'cloud'}`} />
              <span className="provider-name">
                {message.providerInfo.modelName}
              </span>
              <span className="provider-kind">
                {message.providerInfo.isLocal ? 'Offline Local' : 'Cloud BYOK'}
              </span>
              {message.providerInfo.isPrivacyProtected && (
                <span className="privacy-tag" title="Processed strictly on-device without outbound leakage">
                  <Lock size={9} className="tag-micro-icon" />
                  <span>Zero-leak</span>
                </span>
              )}
              {message.activeWindowContext && (
                <span
                  className="window-context-tag"
                  title={`Frontmost app when queried: ${message.activeWindowContext.app_name} (${message.activeWindowContext.title})`}
                >
                  <Monitor size={9} className="tag-micro-icon" />
                  <span>{message.activeWindowContext.app_name}</span>
                </span>
              )}
            </div>
          )}

          {/* Privacy Protection: Recalled Context Withheld Notice */}
          {!isUser && message.providerInfo?.memoriesWithheld && (
            <div className="privacy-withheld-notice" role="status">
              <ShieldCheck size={11} className="withheld-icon" aria-hidden="true" />
              <span>
                <strong>Privacy Protected:</strong> {message.providerInfo.memoriesWithheld} recalled {message.providerInfo.memoriesWithheld === 1 ? 'memory was' : 'memories were'} withheld from {message.providerInfo.providerId === 'claude' ? 'Claude' : 'OpenAI'} because "Never send memory context to cloud providers" is enabled.
              </span>
            </div>
          )}

          {/* Qwen3-Coder Internal Thought Process / Reasoning */}
          {!isUser && message.reasoning && (
            <div className="reasoning-disclosure">
              <button
                type="button"
                className="reasoning-toggle-btn"
                onClick={() => setShowReasoning(!showReasoning)}
                title="Toggle internal reasoning chain"
                aria-expanded={showReasoning}
                aria-label="Toggle internal model reasoning process"
              >
                <Cpu size={10} className="reasoning-icon" aria-hidden="true" />
                <span>Thought process</span>
                <span className="reasoning-wordcount">
                  ({message.reasoning.split(/\s+/).filter(Boolean).length} words)
                </span>
                {showReasoning ? <ChevronUp size={10} aria-hidden="true" /> : <ChevronDown size={10} aria-hidden="true" />}
              </button>

              {showReasoning && (
                <div className="reasoning-drawer">
                  <pre className="reasoning-content">{message.reasoning}</pre>
                </div>
              )}
            </div>
          )}

          <div className="markdown-content">
            <ReactMarkdown components={{ code: CodeBlock }}>{message.content}</ReactMarkdown>
            {message.isStreaming && <span className="streaming-cursor" aria-hidden="true" />}
          </div>

          {message.content.includes('Daily Free Quota Reached') && (
            <div style={{ marginTop: '0.75rem' }}>
              <button
                type="button"
                className="btn-byok-redirect"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.45rem 0.85rem',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  backgroundColor: 'var(--aeio-accent, #2563eb)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer'
                }}
                onClick={() => setActiveTab('settings')}
              >
                <Key size={13} />
                <span>Add Your Own API Key (BYOK)</span>
              </button>
            </div>
          )}
        </div>


        {/* Agentic Multi-Step Execution Plan Card */}
        {message.plan && (
          <PlanExecutionCard
            plan={message.plan}
            messageId={message.id}
            onApprove={approvePlan}
            onCancel={cancelPlan}
          />
        )}

        {/* Tool Execution Cards (Tier 2: Tool Execution with Gatekeeper) */}
        {hasTools && !message.plan && (
          <div className="tool-executions-container">
            {message.toolExecutions!.map((exec, idx) => (
              <ToolApprovalCard
                key={exec.id || idx}
                execution={exec}
                messageId={message.id}
                index={idx}
                onApprove={approveToolExecution}
                onDeny={denyToolExecution}
              />
            ))}
          </div>
        )}

        {/* Proposed Memories (Tier 1: Auto-capture with approval) */}
        {hasProposed && (
          <div className="proposed-memories-container">
            {message.proposedMemories!.map((prop, idx) => (
              <div key={idx} className={`proposed-memory-card ${prop.isSaved ? 'saved' : ''}`}>
                <div className="proposed-header">
                  <span className="proposed-tag">
                    <Plus size={10} aria-hidden="true" />
                    <span>Proposed Memory ({prop.category})</span>
                  </span>
                  {!prop.isSaved && (
                    <button
                      type="button"
                      className="dismiss-proposal-btn"
                      onClick={() => dismissMemoryProposal(message.id, idx)}
                      title="Dismiss"
                      aria-label="Dismiss memory proposal"
                    >
                      <X size={11} aria-hidden="true" />
                    </button>
                  )}
                </div>

                <p className="proposed-content">"{prop.content}"</p>

                <div className="proposed-actions">
                  {prop.isSaved ? (
                    <span className="saved-indicator">
                      <Check size={12} aria-hidden="true" />
                      <span>Saved to memory store</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="save-proposal-btn"
                      onClick={() => confirmMemoryProposal(message.id, idx)}
                      aria-label={`Approve and save memory: ${prop.content}`}
                    >
                      <Check size={11} aria-hidden="true" />
                      <span>Approve & Save</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}, (prev, next) => {
  return (
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.message.isStreaming === next.message.isStreaming &&
    prev.message.reasoning === next.message.reasoning &&
    prev.message.toolExecutions === next.message.toolExecutions &&
    prev.message.proposedMemories === next.message.proposedMemories &&
    prev.message.plan === next.message.plan
  );
});
