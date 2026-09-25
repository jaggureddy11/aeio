import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { searchMemories } from '../../lib/ipc';

interface Props {
  onSend: (text: string) => void;
  isLoading: boolean;
  onOpenSettings?: () => void;
}

export const ChatInput: React.FC<Props> = ({ onSend, isLoading }) => {
  const [input, setInput] = useState('');
  const [matchedMemoriesCount, setMatchedMemoriesCount] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { activeProvider, neverSendMemoriesToCloud } = useSettingsStore();
  const activeWs = useWorkspaceStore((state) => state.activeWorkspace);
  const wsId = activeWs?.id || 'default';

  const isCloudProvider = activeProvider === 'claude' || activeProvider === 'openai' || activeProvider === 'aeio-free' || activeProvider === 'gemini';
  const cloudProviderName =
    activeProvider === 'claude'
      ? 'Claude'
      : activeProvider === 'openai'
      ? 'OpenAI'
      : activeProvider === 'gemini'
      ? 'Gemini'
      : 'Aeio Free';

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isLoading && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isLoading]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollH = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(Math.max(scrollH, 44), 160)}px`;
    }
  }, [input]);

  // Real-time pre-send check for recalled memory content when cloud provider is active
  useEffect(() => {
    const trimmed = input.trim();
    if (!trimmed || !isCloudProvider || trimmed.length < 3) {
      setMatchedMemoriesCount(0);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const results = await searchMemories(trimmed, wsId, false, 4);
        const relevant = results.filter((r) => r.score >= 1.0);
        setMatchedMemoriesCount(relevant.length);
      } catch {
        setMatchedMemoriesCount(0);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [input, isCloudProvider, wsId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setInput('');
    setMatchedMemoriesCount(0);
    if (textareaRef.current) {
      textareaRef.current.style.height = '44px';
    }
  };

  const hasContent = input.trim().length > 0;

  return (
    <div className="claude-composer-wrapper">
      {/* Pre-Send Privacy Banner for Cloud Providers */}
      {isCloudProvider && matchedMemoriesCount > 0 && (
        <div
          className={`claude-consent-pill ${neverSendMemoriesToCloud ? 'privacy-locked' : 'cloud-warning'}`}
          role={neverSendMemoriesToCloud ? 'status' : 'alert'}
          aria-live="polite"
        >
          {neverSendMemoriesToCloud ? (
            <>
              <ShieldCheck size={13} className="consent-icon" aria-hidden="true" />
              <span>
                <strong>Privacy lock:</strong> {matchedMemoriesCount} {matchedMemoriesCount === 1 ? 'memory' : 'memories'} withheld from {cloudProviderName}.
              </span>
            </>
          ) : (
            <>
              <AlertTriangle size={13} className="consent-icon" aria-hidden="true" />
              <span>
                {matchedMemoriesCount} relevant {matchedMemoriesCount === 1 ? 'memory' : 'memories'} will be included as context for {cloudProviderName}.
              </span>
            </>
          )}
        </div>
      )}

      {/* Claude-style Floating Input Card */}
      <div className={`claude-composer-box ${hasContent ? 'has-text' : ''} ${isLoading ? 'is-loading' : ''}`}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Aeio anything, run tools, or plan tasks..."
          className="claude-composer-textarea"
          rows={1}
          disabled={isLoading}
        />

        {/* Bottom Toolbar inside the Composer */}
        <div className="claude-composer-toolbar">
          <div className="composer-toolbar-left">
            <span className="composer-agent-badge">
              <span className="agent-status-dot" />
              <span>Aeio Agent</span>
            </span>
            <span className="composer-workspace-indicator">{activeWs?.name || 'Workspace'}</span>
          </div>

          <div className="composer-toolbar-right">
            <button
              type="button"
              className={`claude-send-btn ${hasContent && !isLoading ? 'active' : ''}`}
              onClick={handleSend}
              disabled={!hasContent || isLoading}
              aria-label="Send message"
            >
              {isLoading ? (
                <Loader2 size={16} className="send-spinner" />
              ) : (
                <ArrowUp size={16} className="send-arrow" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="claude-composer-subtext">
        <span>Aeio runs locally with persistent long-term memory. Return to send · Shift+Return for new line</span>
      </div>
    </div>
  );
};
