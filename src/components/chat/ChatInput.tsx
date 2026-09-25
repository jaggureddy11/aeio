import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { searchMemories } from '../../lib/ipc';

interface Props {
  onSend: (text: string) => void;
  isLoading: boolean;
}

export const ChatInput: React.FC<Props> = ({ onSend, isLoading }) => {
  const [input, setInput] = useState('');
  const [matchedMemoriesCount, setMatchedMemoriesCount] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { activeProvider, neverSendMemoriesToCloud } = useSettingsStore();
  const activeWs = useWorkspaceStore((state) => state.activeWorkspace);
  const wsId = activeWs?.id || 'default';

  const isCloudProvider = activeProvider === 'claude' || activeProvider === 'openai' || activeProvider === 'aeio-free';
  const cloudProviderName = activeProvider === 'claude' ? 'Claude' : activeProvider === 'openai' ? 'OpenAI' : 'Aeio Free';

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
      textareaRef.current.style.height = `${Math.min(Math.max(scrollH, 36), 140)}px`;
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
      textareaRef.current.style.height = '36px';
    }
  };

  return (
    <div className="chat-input-container">
      {/* Pre-Send Informed Consent Notice for Cloud Providers */}
      {isCloudProvider && matchedMemoriesCount > 0 && (
        <div
          className={`cloud-memory-consent-banner ${neverSendMemoriesToCloud ? 'privacy-safe' : 'cloud-warning'}`}
          role={neverSendMemoriesToCloud ? 'status' : 'alert'}
          aria-live="polite"
        >
          {neverSendMemoriesToCloud ? (
            <>
              <ShieldCheck size={12} className="consent-icon" aria-hidden="true" />
              <span>
                <strong>Privacy Lock Active:</strong> {matchedMemoriesCount} matching {matchedMemoriesCount === 1 ? 'memory' : 'memories'} will be <strong>withheld</strong> from {cloudProviderName}.
              </span>
            </>
          ) : (
            <>
              <AlertTriangle size={12} className="consent-icon" aria-hidden="true" />
              <span>
                <strong>Notice:</strong> This message includes {matchedMemoriesCount} recalled {matchedMemoriesCount === 1 ? 'memory' : 'memories'} that will be sent to <strong>{cloudProviderName}</strong>.
              </span>
            </>
          )}
        </div>
      )}

      <div className="chat-input-wrapper">
        <textarea
          ref={textareaRef}
          className="chat-textarea"
          aria-label="Message prompt input"
          placeholder="Ask anything or run tools... (Shift+Enter for newline)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={isLoading}
        />
        <div className="chat-input-actions">
          <button
            type="button"
            className={`send-button ${input.trim() ? 'has-text' : ''}`}
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            title="Send message (Enter)"
            aria-label="Send message"
          >
            {isLoading ? (
              <Loader2 size={13} className="spinner" aria-hidden="true" />
            ) : (
              <ArrowUp size={13} strokeWidth={2.5} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

