import React, { useEffect, useRef } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { ChatMessageItem } from './ChatMessage';
import { ChatInput } from './ChatInput';
import logo from '../../assets/logo.png';
import { Trash2 } from 'lucide-react';

export const ChatView: React.FC = () => {
  const { messages, isLoading, sendMessage, clearMessages, initChatHistory } = useChatStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initChatHistory();
  }, [initChatHistory]);

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
              Your local-first assistant with transparent memory and native OS tools.
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
            </div>
          </div>
        ) : (
          <div className="messages-list">
            <div className="messages-header-actions">
              <button
                className="clear-chat-btn"
                onClick={clearMessages}
                title="Clear current conversation"
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
      </div>

      {/* Input Bar */}
      <div className="chat-input-bar">
        <ChatInput onSend={sendMessage} isLoading={isLoading} />
      </div>
    </div>
  );
};

export default ChatView;
