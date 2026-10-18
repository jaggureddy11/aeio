import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChatMessage as MessageType, useChatStore } from '../../stores/chatStore';
import {
  Brain,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { isTauri, speakText, stopSpeaking } from '../../lib/ipc';
import { globalHumanVoice } from '../../lib/voice/humanVoiceEngine';
import { ToolApprovalCard } from './ToolApproval';
import { PlanExecutionCard } from './PlanExecutionCard';

interface Props {
  message: MessageType;
}

const CodeBlock: React.FC<any> = ({ node, inline, className, children, ...props }) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const codeContent = String(children).replace(/\n$/, '');

  if (inline || (!match && !codeContent.includes('\n'))) {
    return (
      <code className="inline-code" {...props}>
        {children}
      </code>
    );
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(codeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="claude-code-block">
      <div className="code-header">
        <span className="code-lang">{language || 'code'}</span>
        <button
          type="button"
          className="code-copy-btn"
          onClick={handleCopy}
          title="Copy code"
        >
          {copied ? (
            <>
              <Check size={12} className="copy-check" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="code-pre">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
};

export const ChatMessageItem: React.FC<Props> = React.memo(({ message }) => {
  const isUser = message.role === 'user';
  const {
    confirmMemoryProposal,
    dismissMemoryProposal,
    approveToolExecution,
    denyToolExecution,
    approvePlan,
    cancelPlan,
  } = useChatStore();

  const [showRecalled, setShowRecalled] = useState(false);
  const [showReasoning, setShowReasoning] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(message.content);
    setCopiedMessage(true);
    setTimeout(() => setCopiedMessage(false), 2000);
  };

  useEffect(() => {
    return () => {
      if (isSpeaking) {
        if (typeof (window as any)?.__aeioCancelSpeechQueue === 'function') {
          (window as any).__aeioCancelSpeechQueue();
        }
        stopSpeaking().catch(() => {});
        globalHumanVoice.stop();
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          (window as any).__aeioActiveUtterance = null;
        }
      }
    };
  }, [isSpeaking]);

  const handleToggleSpeech = async () => {
    if (isSpeaking) {
      if (typeof (window as any)?.__aeioCancelSpeechQueue === 'function') {
        (window as any).__aeioCancelSpeechQueue();
      }
      stopSpeaking().catch(() => {});
      globalHumanVoice.stop();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        (window as any).__aeioActiveUtterance = null;
      }
      setIsSpeaking(false);
      return;
    }

    const cleanText = globalHumanVoice.sanitizeSpeechText(message.content);
    if (!cleanText) return;

    setIsSpeaking(true);

    // 1. If running inside Tauri, use native OS speech (/usr/bin/say on macOS, SAPI on Windows)
    if (isTauri()) {
      try {
        await speakText(cleanText, 'Samantha');
        // Estimate speech duration based on word count (~160 wpm) to auto-reset speaking state
        const words = cleanText.split(/\s+/).filter(Boolean).length;
        const durationMs = Math.max(2000, Math.round((words / 160) * 60 * 1000));
        setTimeout(() => {
          setIsSpeaking(false);
        }, durationMs);
        return;
      } catch (err) {
        console.warn('[ChatMessage] Native TTS failed, falling back to Web Speech:', err);
      }
    }

    // 2. Web Speech API with sentence queue & Google US English priority (solves Chrome 15s hang and silent macOS voice bugs)
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
          await new Promise((r) => setTimeout(r, 50));
        }
        window.speechSynthesis.resume();

        let voices = window.speechSynthesis.getVoices();
        if (!voices || voices.length === 0) {
          await new Promise<void>((resolve) => {
            const handler = () => {
              window.speechSynthesis.removeEventListener('voiceschanged', handler);
              resolve();
            };
            window.speechSynthesis.addEventListener('voiceschanged', handler);
            setTimeout(resolve, 250);
          });
          voices = window.speechSynthesis.getVoices();
        }

        // Prioritize Chrome's built-in Google voices or Samantha (avoid silent Rishi)
        const chosenVoice =
          voices.find((v) => v.name.includes('Google US English')) ||
          voices.find((v) => v.name.includes('Google UK English Female')) ||
          voices.find((v) => v.name.includes('Google') && v.lang.startsWith('en')) ||
          voices.find((v) => v.name === 'Samantha') ||
          voices.find((v) => v.name.includes('Samantha')) ||
          voices.find((v) => v.name.includes('Alex')) ||
          voices.find((v) => v.lang.startsWith('en') && !v.name.includes('Rishi')) ||
          voices[0];

        // Break text into sentences so Chrome never exceeds buffer limits or freezes
        const sentences = cleanText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleanText];
        const queue = sentences.map((s) => s.trim()).filter(Boolean);

        if (queue.length === 0) {
          setIsSpeaking(false);
          return;
        }

        let queueIndex = 0;
        let isCancelled = false;

        (window as any).__aeioCancelSpeechQueue = () => {
          isCancelled = true;
          window.speechSynthesis.cancel();
          (window as any).__aeioActiveUtterance = null;
        };

        const speakNextChunk = () => {
          if (isCancelled || queueIndex >= queue.length) {
            (window as any).__aeioActiveUtterance = null;
            setIsSpeaking(false);
            return;
          }

          const sentence = queue[queueIndex++];
          const utterance = new SpeechSynthesisUtterance(sentence);
          (window as any).__aeioActiveUtterance = utterance;

          if (chosenVoice) {
            utterance.voice = chosenVoice;
          }
          utterance.volume = 1.0;
          utterance.rate = 1.0;

          utterance.onend = () => {
            speakNextChunk();
          };

          utterance.onerror = (e) => {
            if (e.error !== 'interrupted' && e.error !== 'canceled') {
              console.warn('[ChatMessage] Sentence TTS warning:', e);
            }
            speakNextChunk();
          };

          window.speechSynthesis.speak(utterance);
          window.speechSynthesis.resume();
        };

        speakNextChunk();
        return;
      } catch (err) {
        console.error('[ChatMessage] Speech error:', err);
        setIsSpeaking(false);
      }
    } else {
      setIsSpeaking(false);
    }
  };

  const hasRecalled = !isUser && message.recalledMemories && message.recalledMemories.length > 0;
  const hasProposed = !isUser && message.proposedMemories && message.proposedMemories.length > 0;
  const hasTools = !isUser && message.toolExecutions && message.toolExecutions.length > 0;

  const formattedTime = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isUser) {
    if (
      message.content.startsWith('[Tool Result:') ||
      message.content.startsWith('[Tool Error:')
    ) {
      return null;
    }

    return (
      <div className="claude-message-row claude-user-row user-row">
        <div className="claude-user-bubble">
          {message.screenSnapshot && (
            <div className="claude-screen-snapshot-card">
              <div className="snapshot-header">
                <div className="snapshot-title-group">
                  <Eye size={12} className="snapshot-badge-icon" />
                  <span className="snapshot-label">Screen Capture</span>
                  <span className="snapshot-dims">
                    {message.screenSnapshot.width} × {message.screenSnapshot.height}
                  </span>
                </div>
                <button
                  type="button"
                  className="snapshot-zoom-btn"
                  onClick={() => setZoomOpen(!zoomOpen)}
                  title={zoomOpen ? 'Collapse screenshot' : 'Expand screenshot'}
                >
                  {zoomOpen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                  <span>{zoomOpen ? 'Collapse' : 'Expand'}</span>
                </button>
              </div>
              <div className={`snapshot-image-container ${zoomOpen ? 'expanded' : ''}`}>
                <img
                  src={
                    message.screenSnapshot.base64.startsWith('data:')
                      ? message.screenSnapshot.base64
                      : `data:image/png;base64,${message.screenSnapshot.base64}`
                  }
                  alt="Captured active screen"
                  className="snapshot-image-preview"
                  onClick={() => setZoomOpen(!zoomOpen)}
                />
              </div>
            </div>
          )}
          <div className="user-message-text">{message.content}</div>
          <div className="user-message-meta">{formattedTime}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="claude-message-row assistant-row">
      <div className="claude-body-column">

        {/* Recalled Memories Pill (Transparent Recall) */}
        {hasRecalled && (
          <div className="claude-recalled-wrapper">
            <button
              type="button"
              className="claude-recalled-toggle"
              onClick={() => setShowRecalled(!showRecalled)}
              aria-expanded={showRecalled}
            >
              <Brain size={12} className="recalled-icon" />
              <span>
                Recalled {message.recalledMemories!.length} memor
                {message.recalledMemories!.length === 1 ? 'y' : 'ies'}
              </span>
              {showRecalled ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>

            {showRecalled && (
              <div className="claude-recalled-drawer">
                {message.recalledMemories!.map((mem) => (
                  <div key={mem.id} className="recalled-item-card">
                    <span className="recalled-category">{mem.category}</span>
                    <span className="recalled-content">{mem.content}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Claude-style Collapsible Reasoning / Thinking Block */}
        {message.reasoning && (
          <div className="claude-thought-wrapper">
            <button
              type="button"
              className="claude-thought-toggle"
              onClick={() => setShowReasoning(!showReasoning)}
              aria-expanded={showReasoning}
            >
              <span className="thought-pulse-dot" />
              <span className="thought-label">
                {message.isStreaming ? 'Thinking...' : 'Reasoning process'}
              </span>
              {showReasoning ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>

            {showReasoning && (
              <div className="claude-thought-drawer">
                <ReactMarkdown
                  components={{
                    code: CodeBlock,
                  }}
                >
                  {message.reasoning}
                </ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {/* Main Response Markdown */}
        <div className="claude-markdown-body">
          <ReactMarkdown
            components={{
              code: CodeBlock,
            }}
          >
            {message.content}
          </ReactMarkdown>

          {message.isStreaming && (
            <span className="claude-typing-cursor" aria-hidden="true" />
          )}
        </div>

        {/* Claude Assistant Message Action Row */}
        {!message.isStreaming && message.content && (
          <div className="claude-message-actions-row">
            <button
              type="button"
              className="claude-action-icon-btn"
              onClick={handleCopyMessage}
              title={copiedMessage ? 'Copied to clipboard' : 'Copy'}
              aria-label="Copy response"
            >
              {copiedMessage ? <Check size={14} className="action-success" /> : <Copy size={14} />}
            </button>

            <button
              type="button"
              className={`claude-action-icon-btn ${isSpeaking ? 'active-speaking' : ''}`}
              onClick={handleToggleSpeech}
              title={isSpeaking ? 'Stop reading' : 'Read aloud'}
              aria-label={isSpeaking ? 'Stop reading aloud' : 'Read aloud'}
            >
              {isSpeaking ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
          </div>
        )}

        {/* Autonomous Multi-Step Execution Plan Card */}
        {message.plan && (
          <div className="claude-plan-container">
            <PlanExecutionCard
              plan={message.plan}
              messageId={message.id}
              onApprove={() => approvePlan(message.id)}
              onCancel={() => cancelPlan(message.id)}
            />
          </div>
        )}

        {/* Tool Approval & Execution Cards (shown when not wrapped in a multi-step plan) */}
        {hasTools && !message.plan && (
          <div className="claude-tools-container">
            {message.toolExecutions!.map((tool, idx) => (
              <ToolApprovalCard
                key={tool.id || idx}
                execution={tool}
                messageId={message.id}
                index={idx}
                onApprove={approveToolExecution}
                onDeny={denyToolExecution}
              />
            ))}
          </div>
        )}

        {/* Memory Proposals (Tier 1: Explicit Confirmation) */}
        {hasProposed && (
          <div className="claude-proposals-container">
            <div className="proposals-header">
              <Brain size={13} className="proposals-icon" />
              <span>Save to Persistent Memory?</span>
            </div>
            <div className="proposals-list">
              {message.proposedMemories!.map((prop, idx) => (
                <div key={idx} className="proposal-card">
                  <div className="proposal-body">
                    <span className="proposal-category">{prop.category}</span>
                    <p className="proposal-content">{prop.content}</p>
                  </div>
                  <div className="proposal-actions">
                    <button
                      type="button"
                      className="proposal-btn accept"
                      onClick={() => confirmMemoryProposal(message.id, idx)}
                    >
                      <Check size={12} />
                      <span>Remember</span>
                    </button>
                    <button
                      type="button"
                      className="proposal-btn dismiss"
                      onClick={() => dismissMemoryProposal(message.id, idx)}
                    >
                      <span>Skip</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
