import React, { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { ChatMessageItem } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { ClaudeTopBar } from '../layout/ClaudeTopBar';
import { AeLogo } from '../common/AeLogo';
import {
  AlertTriangle,
  RotateCw,
  X,
  FileSearch,
  Workflow,
  Cpu,
  Brain,
  ArrowRight,
  ArrowDown,
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

  const { setActiveTab, activeProvider } = useSettingsStore();
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const isUserNearBottom = useRef(true);
  const [composerHeight, setComposerHeight] = useState(170);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);

  useEffect(() => {
    initChatHistory(activeWorkspace?.id);
  }, [activeWorkspace?.id, initChatHistory]);

  // Dynamically observe the composer height (textarea expansion, privacy pill, disclaimer)
  useEffect(() => {
    if (!footerRef.current) return;
    const updateHeight = () => {
      if (footerRef.current) {
        const rect = footerRef.current.getBoundingClientRect();
        if (rect.height > 0) {
          setComposerHeight(Math.round(rect.height));
        }
      }
    };

    updateHeight();
    const observer = new ResizeObserver(() => {
      updateHeight();
    });
    observer.observe(footerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleScroll = () => {
    if (!scrollAreaRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollAreaRef.current;
    const distanceToBottom = scrollHeight - (scrollTop + clientHeight);
    isUserNearBottom.current = distanceToBottom < 75;
    setShowScrollBottomBtn(distanceToBottom > 140);
  };

  const scrollToBottom = (smooth = true) => {
    if (!scrollAreaRef.current) return;
    isUserNearBottom.current = true;
    scrollAreaRef.current.scrollTo({
      top: scrollAreaRef.current.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
  };

  const handleSend = (text: string) => {
    isUserNearBottom.current = true;
    sendMessage(text, { autoApproveSafeTools: true });
    requestAnimationFrame(() => {
      scrollToBottom(true);
    });
  };

  // Keep scroll pinned to bottom during message changes and streaming IF user is near bottom
  useEffect(() => {
    if (isUserNearBottom.current && scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Content resize observer for dynamic streaming markdown / code block expansion
  useEffect(() => {
    const scrollContainer = scrollAreaRef.current;
    if (!scrollContainer) return;

    const readingCol = scrollContainer.querySelector('.claude-reading-column');
    if (!readingCol) return;

    const resizeObserver = new ResizeObserver(() => {
      if (isUserNearBottom.current && scrollAreaRef.current) {
        scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
      }
    });

    resizeObserver.observe(readingCol);
    return () => resizeObserver.disconnect();
  }, []);

  const topBarTitle =
    messages.length === 0
      ? activeWorkspace?.name || 'General Workspace'
      : messages[0]?.content
      ? messages[0].content.length > 36
        ? `${messages[0].content.slice(0, 36)}...`
        : messages[0].content
      : activeWorkspace?.name || 'Aeio Assistant';

  return (
    <div className="claude-chat-layout">
      {/* Top Header Bar matching Claude Spotlight */}
      <ClaudeTopBar
        title={topBarTitle}
        hasMessages={messages.length > 0}
        onNewChat={clearMessages}
        onClearChat={clearMessages}
        onOpenSettings={onOpenSettings}
        onOpenMemory={() => setActiveTab('memory')}
        onActionClick={clearMessages}
      />

      {/* Messages Scroll Canvas with Dynamic Breathing Room */}
      <div
        className="claude-scroll-canvas"
        ref={scrollAreaRef}
        onScroll={handleScroll}
        style={{ paddingBottom: '32px' }}
      >
        <div className="claude-reading-column">
          {messages.length === 0 ? (
            <div className="claude-empty-welcome">
              <div className="welcome-avatar-mark">
                <AeLogo height={28} />
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
                    <Workflow size={16} />
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
          {/* Dedicated bottom spacer to guarantee messages are never hidden under the bottom composer */}
          <div
            className="claude-scroll-bottom-spacer"
            style={{
              height: `${Math.max(composerHeight + 52, 190)}px`,
              width: '100%',
              flexShrink: 0,
            }}
            aria-hidden="true"
          />
          {/* Scroll Sentinel Anchor for reliable full-height scrolling */}
          <div ref={messagesEndRef} className="claude-scroll-sentinel" aria-hidden="true" />
        </div>
      </div>

      {/* Floating Scroll to Bottom Button */}
      {showScrollBottomBtn && (
        <button
          type="button"
          className="claude-scroll-bottom-fab"
          onClick={() => scrollToBottom(true)}
          title="Scroll to latest messages"
          aria-label="Scroll to latest messages"
          style={{ bottom: `${composerHeight + 20}px` }}
        >
          <ArrowDown size={15} />
        </button>
      )}

      {/* Floating Bottom Composer */}
      <footer className="claude-bottom-section" ref={footerRef}>
        <ChatInput onSend={handleSend} isLoading={isLoading} onOpenSettings={onOpenSettings} />
      </footer>
    </div>
  );
};
