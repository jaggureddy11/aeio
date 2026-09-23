import React, { useEffect, useRef } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { ChatMessageItem } from './ChatMessage';
import { ChatInput } from './ChatInput';
import logo from '../../assets/logo.png';
import { Trash2, AlertTriangle, RotateCw, X, Sparkles } from 'lucide-react';

export const ChatView: React.FC = () => {
  const {
    messages,
    isLoading,
    error,
    activeNudge,
    dismissNudge,
    applyNudge,
    setError,
    sendMessage,
    retryLastMessage,
    clearMessages,
    initChatHistory,
  } = useChatStore();

  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initChatHistory(activeWorkspace?.id);
  }, [activeWorkspace?.id, initChatHistory]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="chat-container">
      {/* Messages Scroll Area */}
      <div className="messages-area">
        {messages.length === 0 ? (
          <div className="chat-empty-state">
            <img src={logo} alt="Aeio logo" className="empty-logo" />
            <h3>Aeio Assistant</h3>
            <p className="empty-subtitle">
              Your local-first assistant with transparent memory, workspace scoping, and native OS tools.
            </p>
            <div className="starter-chips">
              <button
                className="starter-chip"
                onClick={() => sendMessage('What can you do?')}
              >
                What can you do?
              </button>
              <button
                className="starter-chip"
                onClick={() => sendMessage('Tell me about your memory system')}
              >
                Tell me about your memory system
              </button>
              <button
                className="starter-chip"
                onClick={() => sendMessage('What is the frontmost window or my current directory?')}
              >
                Inspect my environment
              </button>
            </div>
          </div>
        ) : (
          <div className="messages-list">
            <div className="messages-header-actions">
              <div className="current-workspace-pill">
                <span>{activeWorkspace?.icon || '🌐'}</span>
                <span>{activeWorkspace?.name || 'General'}</span>
              </div>
              <button
                className="clear-chat-btn"
                onClick={clearMessages}
                title="Clear current workspace conversation"
              >
                <Trash2 size={12} />
                <span>Clear chat</span>
              </button>
            </div>
            {messages.map((msg) => (
              <ChatMessageItem key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Actionable Error Banner (Tier 3: Graceful Degradation) */}
        {error && (
          <div className="chat-error-banner animate-fadeIn">
            <div className="chat-error-icon">
              <AlertTriangle size={15} />
            </div>
            <div className="chat-error-body">
              <div className="chat-error-title">Provider Connection Issue</div>
              <div className="chat-error-msg">{error}</div>
            </div>
            <div className="chat-error-actions">
              <button
                type="button"
                className="chat-error-retry-btn"
                onClick={() => retryLastMessage()}
                disabled={isLoading}
              >
                <RotateCw size={12} className={isLoading ? 'spinning' : ''} />
                <span>Retry</span>
              </button>
              <button
                type="button"
                className="chat-error-dismiss-btn"
                onClick={() => setError(null)}
                title="Dismiss error"
              >
                <X size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tier 5 Proactive Ambient Nudge (1-click dismiss, non-blocking) */}
      {activeNudge && (
        <div className="proactive-nudge-card animate-fadeIn">
          <div className="nudge-icon">
            <Sparkles size={13} />
          </div>
          <div className="nudge-content">
            <span className="nudge-badge">Aeio Suggestion</span>
            <p className="nudge-text">{activeNudge.suggestion}</p>
          </div>
          <div className="nudge-actions">
            {activeNudge.actionPrompt && (
              <button
                type="button"
                className="nudge-apply-btn"
                onClick={() => applyNudge(activeNudge)}
                disabled={isLoading}
              >
                Apply
              </button>
            )}
            <button
              type="button"
              className="nudge-dismiss-btn"
              onClick={() => dismissNudge(activeNudge.id)}
              title="Dismiss suggestion"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Input Bar */}
      <div className="chat-input-bar">
        <ChatInput onSend={sendMessage} isLoading={isLoading} />
      </div>
    </div>
  );
};

export default ChatView;

