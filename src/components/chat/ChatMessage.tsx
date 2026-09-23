import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChatMessage as MessageType, useChatStore } from '../../stores/chatStore';
import logo from '../../assets/logo.png';
import { User, Brain, Check, Plus, X, ChevronDown, ChevronUp } from 'lucide-react';
import { ToolApprovalCard } from './ToolApproval';

interface Props {
  message: MessageType;
}

export const ChatMessageItem: React.FC<Props> = ({ message }) => {
  const isUser = message.role === 'user';
  const {
    confirmMemoryProposal,
    dismissMemoryProposal,
    approveToolExecution,
    denyToolExecution,
  } = useChatStore();
  const [showRecalled, setShowRecalled] = useState(false);

  const hasRecalled = !isUser && message.recalledMemories && message.recalledMemories.length > 0;
  const hasProposed = !isUser && message.proposedMemories && message.proposedMemories.length > 0;
  const hasTools = !isUser && message.toolExecutions && message.toolExecutions.length > 0;

  return (
    <div className={`message-row ${isUser ? 'user-row' : 'assistant-row'}`}>
      <div className="message-avatar">
        {isUser ? (
          <div className="avatar-user">
            <User size={13} />
          </div>
        ) : (
          <img src={logo} alt="Aeio" className="avatar-ai" />
        )}
      </div>

      <div className="message-content-column">
        {/* Recalled Memories Citation (Tier 1: Transparent Recall) */}
        {hasRecalled && (
          <div className="recalled-memories-badge-container">
            <button
              className="recalled-toggle-btn"
              onClick={() => setShowRecalled(!showRecalled)}
            >
              <Brain size={11} className="recalled-icon" />
              <span>
                Recalled {message.recalledMemories!.length} memor
                {message.recalledMemories!.length === 1 ? 'y' : 'ies'}
              </span>
              {showRecalled ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
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
          <div className="markdown-content">
            <ReactMarkdown>{message.content}</ReactMarkdown>
            {message.isStreaming && <span className="streaming-cursor">▋</span>}
          </div>
        </div>

        {/* Tool Execution Cards (Tier 2: Tool Execution with Gatekeeper) */}
        {hasTools && (
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
                    <Plus size={10} />
                    <span>Proposed Memory ({prop.category})</span>
                  </span>
                  {!prop.isSaved && (
                    <button
                      className="dismiss-proposal-btn"
                      onClick={() => dismissMemoryProposal(message.id, idx)}
                      title="Dismiss"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>

                <p className="proposed-content">"{prop.content}"</p>

                <div className="proposed-actions">
                  {prop.isSaved ? (
                    <span className="saved-indicator">
                      <Check size={12} />
                      <span>Saved to memory store</span>
                    </span>
                  ) : (
                    <button
                      className="save-proposal-btn"
                      onClick={() => confirmMemoryProposal(message.id, idx)}
                    >
                      <Check size={11} />
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
};
