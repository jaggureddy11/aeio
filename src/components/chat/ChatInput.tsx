import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Loader2 } from 'lucide-react';

interface Props {
  onSend: (text: string) => void;
  isLoading: boolean;
}

export const ChatInput: React.FC<Props> = ({ onSend, isLoading }) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isLoading && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isLoading]);

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
  };

  return (
    <div className="chat-input-wrapper">
      <textarea
        ref={textareaRef}
        className="chat-textarea"
        placeholder="Ask anything or run tools... (Shift+Enter for newline)"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
        disabled={isLoading}
      />
      <div className="chat-input-actions">
        <button
          className={`send-button ${input.trim() ? 'has-text' : ''}`}
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          title="Send message (Enter)"
        >
          {isLoading ? (
            <Loader2 size={13} className="spinner" />
          ) : (
            <ArrowUp size={13} strokeWidth={2.5} />
          )}
        </button>
      </div>
    </div>
  );
};
