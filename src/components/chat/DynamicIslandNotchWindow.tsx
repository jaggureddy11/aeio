import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Radio,
  Maximize2,
  Minimize2,
  X,
  ExternalLink,
  Volume2,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { globalVoiceEngine, VoiceState } from '../../lib/voice/voiceEngine';
import { useVoiceStore } from '../../stores/voiceStore';
import { useChatStore } from '../../stores/chatStore';
import {
  hideNotchWindow,
  resizeNotchWindow,
  playSystemEarcon,
} from '../../lib/ipc';

export const DynamicIslandNotchWindow: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [activeStepText, setActiveStepText] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const { wakeWordEnabled, toggleWakeWord } = useVoiceStore();
  const sendMessage = useChatStore((state) => state.sendMessage);

  const isListening = voiceState === 'listening';
  const isExpandedRef = useRef(isExpanded);
  isExpandedRef.current = isExpanded;

  // Toggle expand / collapse height in Tauri
  const handleToggleExpand = async () => {
    const next = !isExpanded;
    setIsExpanded(next);
    if (next) {
      await resizeNotchWindow(440, 160).catch(() => {});
    } else {
      await resizeNotchWindow(380, 48).catch(() => {});
    }
  };

  const handleClose = async () => {
    globalVoiceEngine.stopListening();
    await hideNotchWindow().catch(() => {});
  };

  const handleOpenMainWindow = () => {
    import('@tauri-apps/api/webviewWindow')
      .then(({ WebviewWindow }) => {
        WebviewWindow.getByLabel('main').then((win) => {
          if (win) {
            win.center();
            win.show();
            win.setFocus();
          }
        });
      })
      .catch(() => {});
  };

  const handleToggleMic = () => {
    if (isListening) {
      globalVoiceEngine.stopListening();
    } else {
      setFeedback(null);
      globalVoiceEngine.startListening();
    }
  };

  // Wire Voice Engine listeners
  useEffect(() => {
    const unsubState = globalVoiceEngine.onStateChange((state) => {
      setVoiceState(state);
    });

    const unsubTranscript = globalVoiceEngine.onTranscript(async (text, isFinal) => {
      setTranscript(text);

      if (isFinal && text.trim().length > 0) {
        setVoiceState('processing');
        playSystemEarcon('processing').catch(() => {});

        try {
          await sendMessage(text);
          setFeedback('Executed command');
          setVoiceState('speaking');
          playSystemEarcon('success').catch(() => {});

          setTimeout(() => {
            setFeedback(null);
            setVoiceState('idle');
            setTranscript('');
          }, 3500);
        } catch (err) {
          setFeedback('Failed to execute');
          setVoiceState('idle');
          playSystemEarcon('error').catch(() => {});
        }
      }
    });

    // Listen for cross-window step updates
    let unlistenStep: (() => void) | undefined;
    import('@tauri-apps/api/event')
      .then(({ listen }) => {
        listen<{ stepText: string }>('autonomous-step-update', (event) => {
          if (event.payload?.stepText) {
            setActiveStepText(event.payload.stepText);
          }
        }).then((unsub) => {
          unlistenStep = unsub;
        });
      })
      .catch(() => {});

    return () => {
      unsubState();
      unsubTranscript();
      if (unlistenStep) unlistenStep();
    };
  }, [sendMessage]);

  return (
    <div className="dynamic-island-screen-container">
      <div
        className={`dynamic-island-notch-capsule ${isExpanded ? 'expanded' : 'collapsed'} ${voiceState}`}
        role="region"
        aria-label="Aeio Ambient Dynamic Island"
      >
        {/* Main Notch Bar */}
        <div className="dynamic-island-notch-bar">
          {/* Left: Wake indicator & live waveform */}
          <div className="dynamic-island-left" onClick={handleToggleMic}>
            <button
              type="button"
              className={`dynamic-island-mic-btn ${isListening ? 'active' : ''}`}
              title={isListening ? 'Mute Mic' : 'Listen with Mic'}
              aria-label={isListening ? 'Mute Mic' : 'Listen with Mic'}
            >
              {isListening ? <Mic size={14} className="mic-active-pulse" /> : <MicOff size={14} />}
            </button>

            <div className="dynamic-island-waveform">
              <span className={`bar bar-1 ${isListening ? 'active' : ''}`} />
              <span className={`bar bar-2 ${isListening ? 'active' : ''}`} />
              <span className={`bar bar-3 ${isListening ? 'active' : ''}`} />
              <span className={`bar bar-4 ${isListening ? 'active' : ''}`} />
              <span className={`bar bar-5 ${isListening ? 'active' : ''}`} />
            </div>
          </div>

          {/* Center: Live label / transcript / autonomous step */}
          <div className="dynamic-island-center" onClick={handleToggleExpand}>
            {feedback ? (
              <span className="dynamic-island-status-text success">
                <CheckCircle2 size={12} /> {feedback}
              </span>
            ) : activeStepText ? (
              <span className="dynamic-island-status-text active-step">
                <Sparkles size={12} className="spin-slow" /> {activeStepText}
              </span>
            ) : transcript ? (
              <span className="dynamic-island-status-text transcript">"{transcript}"</span>
            ) : (
              <span className="dynamic-island-status-text idle">
                {isListening
                  ? 'Listening for command...'
                  : wakeWordEnabled
                  ? 'Hey Aeio active'
                  : 'Aeio Ambient Notch'}
              </span>
            )}
          </div>

          {/* Right: Actions */}
          <div className="dynamic-island-right">
            <button
              type="button"
              className={`dynamic-island-action-btn ${wakeWordEnabled ? 'active' : ''}`}
              onClick={toggleWakeWord}
              title={wakeWordEnabled ? 'Wake-word enabled ("Hey Aeio")' : 'Enable "Hey Aeio" wake-word'}
              aria-label="Toggle Wake Word"
            >
              <Radio size={13} className={wakeWordEnabled ? 'pulsing' : ''} />
            </button>

            <button
              type="button"
              className="dynamic-island-action-btn"
              onClick={handleToggleExpand}
              title={isExpanded ? 'Collapse Island' : 'Expand Island'}
              aria-label={isExpanded ? 'Collapse Island' : 'Expand Island'}
            >
              {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>

            <button
              type="button"
              className="dynamic-island-action-btn"
              onClick={handleOpenMainWindow}
              title="Open Full Aeio App"
              aria-label="Open Full Aeio App"
            >
              <ExternalLink size={13} />
            </button>

            <button
              type="button"
              className="dynamic-island-action-btn close"
              onClick={handleClose}
              title="Hide Notch"
              aria-label="Hide Notch"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Expanded Drawer Content */}
        {isExpanded && (
          <div className="dynamic-island-expanded-drawer">
            <div className="dynamic-island-expanded-content">
              {transcript ? (
                <div className="dynamic-island-expanded-transcript">
                  <span className="drawer-label">Spoken:</span>
                  <p className="drawer-text">"{transcript}"</p>
                </div>
              ) : (
                <div className="dynamic-island-expanded-hint">
                  <Volume2 size={14} />
                  <span>
                    Speak naturally or say <strong style={{ color: 'var(--claude-accent)' }}>"Hey Aeio"</strong> followed by your command.
                  </span>
                </div>
              )}

              {activeStepText && (
                <div className="dynamic-island-expanded-step">
                  <span className="step-badge">Autonomous Step</span>
                  <span className="step-name">{activeStepText}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
export default DynamicIslandNotchWindow;
