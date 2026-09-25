import React, { useEffect, useRef } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { ChatMessageItem } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { ModelSelector } from './ModelSelector';
import logo from '../../assets/logo.png';
import {
  Trash2,
  AlertTriangle,
  RotateCw,
  X,
  FileSearch,
  Sparkles,
  Cpu,
  Brain,
  ArrowRight,
} from 'lucide-react';

interface Props {
  onOpenSettings?: () => void;
}

export const ChatView: React.FC<Props> = ({ onOpenSettings }) => {
  const {
    messages,
    isLoading,
    error,
    setError,
    sendMessage,
    retryLastMessage,
    switchToLocalAndRetry,
    clearMessages,
    initChatHistory,
  } = useChatStore();

  const { activeProvider, setActiveTab } = useSettingsStore();
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const isUserNearBottom = useRef(true);

  useEffect(() => {
    initChatHistory(activeWorkspace?.id);
  }, [activeWorkspace?.id, initChatHistory]);

  const handleScroll = () => {
    if (!scrollAreaRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollAreaRef.current;
    isUserNearBottom.current = scrollHeight - (scrollTop + clientHeight) < 100;
  };

  const handleSend = (text: string) => {
    isUserNearBottom.current = true;
    sendMessage(text);
  };

  useEffect(() => {
    if (isUserNearBottom.current && scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  return (
    <div className="claude-chat-layout">
      {/* Top Header Bar */}
      <header className="claude-top-bar" data-tauri-drag-region>
        <div className="top-bar-left">
          <ModelSelector onOpenSettings={onOpenSettings} />
        </div>

        <div className="top-bar-right">
          {messages.length > 0 && (
            <button
              type="button"
              className="top-bar-action-btn"
              onClick={clearMessages}
              title="Clear conversation"
              aria-label="Clear conversation"
            >
              <Trash2 size={14} />
              <span>Clear</span>
            </button>
          )}

          <button
            type="button"
            className="top-bar-action-btn"
            onClick={() => setActiveTab('memory')}
            title="Open memory vault"
            aria-label="Open memory vault"
          >
            <Brain size={14} />
            <span>Memories</span>
          </button>
        </div>
      </header>

      {/* Messages Scroll Canvas */}
      <div className="claude-scroll-canvas" ref={scrollAreaRef} onScroll={handleScroll}>
        <div className="claude-reading-column">
          {messages.length === 0 ? (
            <div className="claude-empty-welcome">
              <div className="welcome-avatar-mark">
                <img src={logo} alt="Aeio logo" className="welcome-logo-img" />
              </div>

              <h1 className="welcome-heading">What can I help with today?</h1>
              <p className="welcome-subheading">
                Aeio is your desktop assistant with persistent local memory, multi-step agent planning, and private OS-level tools.
              </p>

              <div className="claude-prompt-grid">
                <button
                  type="button"
                  className="claude-prompt-card"
                  onClick={() => handleSend('Search local documents and summarize key files in this directory')}
                >
                  <div className="prompt-card-icon">
                    <FileSearch size={16} />
                  </div>
                  <div className="prompt-card-content">
                    <span className="prompt-card-title">Search & Summarize Files</span>
                    <span className="prompt-card-desc">Find local files and extract key insights</span>
                  </div>
                  <ArrowRight size={14} className="prompt-card-arrow" />
                </button>

                <button
                  type="button"
                  className="claude-prompt-card"
                  onClick={() => handleSend('What memories and preferences do you remember about me so far?')}
                >
                  <div className="prompt-card-icon">
                    <Brain size={16} />
                  </div>
                  <div className="prompt-card-content">
                    <span className="prompt-card-title">Inspect Second Brain</span>
                    <span className="prompt-card-desc">Review persistent facts and active context</span>
                  </div>
                  <ArrowRight size={14} className="prompt-card-arrow" />
                </button>

                <button
                  type="button"
                  className="claude-prompt-card"
                  onClick={() => handleSend('Create a multi-step plan to organize my project workflows')}
                >
                  <div className="prompt-card-icon">
                    <Sparkles size={16} />
                  </div>
                  <div className="prompt-card-content">
                    <span className="prompt-card-title">Autonomous Agent Plan</span>
                    <span className="prompt-card-desc">Break down complex goals with approval gates</span>
                  </div>
                  <ArrowRight size={14} className="prompt-card-arrow" />
                </button>

                <button
                  type="button"
                  className="claude-prompt-card"
                  onClick={() => handleSend('Check my model provider health and diagnostic status')}
                >
                  <div className="prompt-card-icon">
                    <Cpu size={16} />
                  </div>
                  <div className="prompt-card-content">
                    <span className="prompt-card-title">Provider & System Status</span>
                    <span className="prompt-card-desc">Verify local Ollama and cloud BYOK keys</span>
                  </div>
                  <ArrowRight size={14} className="prompt-card-arrow" />
                </button>
              </div>
            </div>
          ) : (
            <div className="claude-messages-list">
              {messages.map((message) => (
                <ChatMessageItem key={message.id} message={message} />
              ))}
            </div>
          )}

          {/* Graceful Error Notification */}
          {error && (
            <div className="claude-error-banner" role="alert">
              <div className="error-banner-top">
                <div className="error-banner-label">
                  <AlertTriangle size={15} className="error-icon" />
                  <span>Connection Issue</span>
                </div>
                <button
                  type="button"
                  className="error-dismiss-btn"
                  onClick={() => setError(null)}
                  aria-label="Dismiss error"
                >
                  <X size={14} />
                </button>
              </div>

              <p className="error-message-text">{error}</p>

              <div className="error-actions-row">
                <button
                  type="button"
                  className="error-btn retry"
                  onClick={retryLastMessage}
                >
                  <RotateCw size={13} />
                  <span>Retry</span>
                </button>

                {activeProvider !== 'qwen-coder' && activeProvider !== 'ollama' && (
                  <button
                    type="button"
                    className="error-btn fallback"
                    onClick={switchToLocalAndRetry}
                  >
                    <Cpu size={13} />
                    <span>Switch to Local Qwen</span>
                  </button>
                )}

                <button
                  type="button"
                  className="error-btn settings"
                  onClick={() => {
                    setError(null);
                    if (onOpenSettings) onOpenSettings();
                  }}
                >
                  <span>Configure Keys</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating Bottom Composer */}
      <footer className="claude-bottom-section">
        <ChatInput onSend={handleSend} isLoading={isLoading} onOpenSettings={onOpenSettings} />
      </footer>
    </div>
  );
};
