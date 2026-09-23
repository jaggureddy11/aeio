import React, { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { openTarget } from '../../lib/ipc';
import { ChatMessageItem } from './ChatMessage';
import { ChatInput } from './ChatInput';
import logo from '../../assets/logo.png';
import {
  Trash2,
  AlertTriangle,
  RotateCw,
  X,
  Sparkles,
  Brain,
  Layers,
  ArrowUpRight,
  FileSearch,
  Clipboard,
  AppWindow,
  ExternalLink,
  Settings as SettingsIcon,
  Terminal,
  Check,
} from 'lucide-react';

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
    switchToLocalAndRetry,
    clearMessages,
    initChatHistory,
  } = useChatStore();

  const { activeProvider, setActiveTab } = useSettingsStore();
  const [copiedOllamaCmd, setCopiedOllamaCmd] = useState(false);

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
            <div className="empty-brand-badge">
              <img src={logo} alt="Aeio logo" className="empty-logo-mark" />
              <span className="empty-brand-tag">aeio</span>
            </div>
            <h2 className="empty-headline">An assistant embedded in your computer that knows you and acts for you.</h2>
            <p className="empty-description">
              Local-first on your desktop. Persistent second-brain memory across conversations. Real OS actions executed on your machine with your permission.
            </p>

            <div className="quick-action-grid">
              <button
                type="button"
                className="quick-action-card"
                onClick={() => sendMessage('Find recent files or documents I saved on my machine')}
              >
                <div className="action-icon-frame">
                  <FileSearch size={14} />
                </div>
                <div className="action-text-content">
                  <div className="action-title">
                    <span>Find files on machine</span>
                    <ArrowUpRight size={12} className="action-arrow" />
                  </div>
                  <span className="action-desc">Search documents, PDFs, or folders</span>
                </div>
              </button>

              <button
                type="button"
                className="quick-action-card"
                onClick={() => sendMessage('Read my clipboard and summarize what is on it')}
              >
                <div className="action-icon-frame">
                  <Clipboard size={14} />
                </div>
                <div className="action-text-content">
                  <div className="action-title">
                    <span>Summarize clipboard</span>
                    <ArrowUpRight size={12} className="action-arrow" />
                  </div>
                  <span className="action-desc">Inspect and analyze copied clipboard text</span>
                </div>
              </button>

              <button
                type="button"
                className="quick-action-card"
                onClick={() => sendMessage('What memories do you have saved about me, my projects, or preferences?')}
              >
                <div className="action-icon-frame">
                  <Brain size={14} />
                </div>
                <div className="action-text-content">
                  <div className="action-title">
                    <span>Inspect second brain</span>
                    <ArrowUpRight size={12} className="action-arrow" />
                  </div>
                  <span className="action-desc">Query saved facts, preferences & context</span>
                </div>
              </button>

              <button
                type="button"
                className="quick-action-card"
                onClick={() => sendMessage('What is my frontmost active application and window title?')}
              >
                <div className="action-icon-frame">
                  <AppWindow size={14} />
                </div>
                <div className="action-text-content">
                  <div className="action-title">
                    <span>Inspect active workflow</span>
                    <ArrowUpRight size={12} className="action-arrow" />
                  </div>
                  <span className="action-desc">Read frontmost app and window context</span>
                </div>
              </button>
            </div>
          </div>
        ) : (
          <div className="messages-list">
            <div className="messages-header-actions">
              <div className="current-workspace-pill">
                <Layers size={11} className="ws-pill-icon" />
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

        {/* Actionable Error Banner (Tier 3: Graceful Degradation & Resilience) */}
        {error && (
          <div className="chat-error-banner animate-fadeIn">
            <div className="chat-error-icon">
              <AlertTriangle size={15} />
            </div>
            <div className="chat-error-body">
              <div className="chat-error-title">
                {error.includes('Ollama is offline')
                  ? 'Local Model Offline'
                  : error.toLowerCase().includes('api key')
                  ? 'Authentication Required'
                  : error.toLowerCase().includes('network') || error.toLowerCase().includes('offline')
                  ? 'Network Connection Offline'
                  : 'Connection Issue'}
              </div>
              <div className="chat-error-msg">{error}</div>

              {/* Actionable Resolution Links & Buttons */}
              <div className="chat-error-remediation-row">
                {/* 1. Ollama Offline: terminal cmd & download link */}
                {(error.includes('Ollama is offline') || error.includes('11434')) && (
                  <>
                    <button
                      type="button"
                      className="error-action-link-btn"
                      onClick={() => {
                        navigator.clipboard.writeText('ollama serve');
                        setCopiedOllamaCmd(true);
                        setTimeout(() => setCopiedOllamaCmd(false), 2000);
                      }}
                      title="Copy start command"
                    >
                      <Terminal size={11} />
                      <span>{copiedOllamaCmd ? 'Copied `ollama serve`' : 'Copy `ollama serve`'}</span>
                      {copiedOllamaCmd && <Check size={11} />}
                    </button>

                    <button
                      type="button"
                      className="error-action-link-btn"
                      onClick={() => openTarget('https://ollama.com')}
                      title="Open Ollama installation page"
                    >
                      <ExternalLink size={11} />
                      <span>Install / Docs</span>
                    </button>
                  </>
                )}

                {/* 2. Invalid or missing API key: button to open Settings */}
                {(error.toLowerCase().includes('api key') || error.includes('401') || error.includes('403')) && (
                  <button
                    type="button"
                    className="error-action-link-btn primary"
                    onClick={() => {
                      setError(null);
                      setActiveTab('settings');
                    }}
                  >
                    <SettingsIcon size={11} />
                    <span>Configure Key in Settings</span>
                  </button>
                )}

                {/* 3. Cloud Provider Network Offline: 1-click fallback to Local Ollama */}
                {activeProvider !== 'ollama' &&
                  (error.toLowerCase().includes('network') ||
                    error.toLowerCase().includes('offline') ||
                    error.toLowerCase().includes('failed to fetch')) && (
                    <button
                      type="button"
                      className="error-action-link-btn primary"
                      onClick={() => switchToLocalAndRetry()}
                      disabled={isLoading}
                    >
                      <Brain size={11} />
                      <span>Switch to Local Ollama & Retry</span>
                    </button>
                  )}

                {/* 4. Memory Persistence Issue */}
                {error.toLowerCase().includes('memory') && (
                  <button
                    type="button"
                    className="error-action-link-btn"
                    onClick={() => {
                      setError(null);
                      setActiveTab('memory');
                    }}
                  >
                    <Brain size={11} />
                    <span>Open Memory Panel</span>
                  </button>
                )}
              </div>
            </div>

            <div className="chat-error-actions">
              <button
                type="button"
                className="chat-error-retry-btn"
                onClick={() => retryLastMessage()}
                disabled={isLoading}
                title="Retry last prompt"
              >
                <RotateCw size={12} className={isLoading ? 'spinning' : ''} />
                <span>Retry</span>
              </button>
              <button
                type="button"
                className="chat-error-dismiss-btn"
                onClick={() => setError(null)}
                title="Dismiss error banner"
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

