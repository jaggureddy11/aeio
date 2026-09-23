import React from 'react';
import ReactMarkdown from 'react-markdown';
import { ChatMessage as MessageType } from '../../stores/chatStore';
import logo from '../../assets/logo.png';
import { User } from 'lucide-react';

interface Props {
  message: MessageType;
}

export const ChatMessageItem: React.FC<Props> = ({ message }) => {
  const isUser = message.role === 'user';

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

      <div className={`message-bubble ${isUser ? 'user-bubble' : 'assistant-bubble'}`}>
        <div className="markdown-content">
          <ReactMarkdown>{message.content}</ReactMarkdown>
          {message.isStreaming && <span className="streaming-cursor">▋</span>}
        </div>
      </div>
    </div>
  );
};
