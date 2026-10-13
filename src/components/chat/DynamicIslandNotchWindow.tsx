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
  Lightbulb,
  Play,
  Eye,
  Activity,
} from 'lucide-react';
import { globalVoiceEngine, VoiceState } from '../../lib/voice/voiceEngine';
import { globalProactiveCopilot, ProactiveNudge } from '../../lib/agent/proactiveCopilot';
import { globalProactiveHeartbeat } from '../../lib/agent/proactiveHeartbeat';
import { inspectActiveScreen } from '../../lib/vision/screenInspector';
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
  const [nudge, setNudge] = useState<ProactiveNudge | null>(null);

  const { wakeWordEnabled, toggleWakeWord, vadSpeaking } = useVoiceStore();
  const sendMessage = useChatStore((state) => state.sendMessage);

  const isListening = voiceState === 'listening';
  const isExpandedRef = useRef(isExpanded);
  isExpandedRef.current = isExpanded;

  // Run proactive copilot suggestion
  const handleRunNudge = async (targetNudge: ProactiveNudge) => {
    globalProactiveCopilot.dismissNudge();
    setNudge(null);
    setFeedback(`Running: ${targetNudge.title}`);
    playSystemEarcon('processing').catch(() => {});
    try {
      await sendMessage(targetNudge.suggestedPrompt);
      playSystemEarcon('success').catch(() => {});
      setTimeout(() => {
        setFeedback(null);
      }, 3500);
    } catch {
      setFeedback('Failed to run suggestion');
      playSystemEarcon('error').catch(() => {});
    }
  };

  // Run Visual Screen Inspection ("What am I looking at?")
  const handleInspectScreen = async () => {
    setFeedback('Inspecting screen...');
    playSystemEarcon('processing').catch(() => {});
    try {
      const res = await inspectActiveScreen();
      setFeedback(res.summary);
      playSystemEarcon('success').catch(() => {});
      setTimeout(() => {
        setFeedback(null);
      }, 5000);
    } catch {
      setFeedback('Screen inspection failed');
      playSystemEarcon('error').catch(() => {});
    }
  };

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

  // Wire Voice Engine & Proactive Copilot listeners
  useEffect(() => {
    const unsubNudge = globalProactiveCopilot.subscribe((n) => {
      setNudge(n);
    });

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

    // Listen for cross-window step updates & system health checks
    let unlistenStep: (() => void) | undefined;
    let unlistenHealth: (() => void) | undefined;
    import('@tauri-apps/api/event')
      .then(({ listen }) => {
        listen<{ stepText: string }>('autonomous-step-update', (event) => {
          if (event.payload?.stepText) {
            setActiveStepText(event.payload.stepText);
          }
        }).then((unsub) => {
          unlistenStep = unsub;
        });

        listen('run-system-health-check', async () => {
          setFeedback('Running system health check...');
          playSystemEarcon('processing').catch(() => {});
          try {
            const st = await globalProactiveHeartbeat.checkNow(true);
            if (st) {
              const bat =
                st.battery_level !== undefined && st.battery_level !== null
                  ? `${st.battery_level}% bat`
                  : 'AC power';
              const disk =
                st.disk_available_gb !== undefined && st.disk_available_gb !== null
                  ? `${st.disk_available_gb}GB free`
                  : 'disk ok';
              setFeedback(`Health: ${bat}, ${disk}`);
              playSystemEarcon('success').catch(() => {});
            } else {
              setFeedback('Health check completed');
            }
          } catch {
            setFeedback('Health check complete');
          }
          setTimeout(() => setFeedback(null), 4000);
        }).then((unsub) => {
          unlistenHealth = unsub;
        });
      })
      .catch(() => {});

    return () => {
      unsubNudge();
      unsubState();
      unsubTranscript();
      if (unlistenStep) unlistenStep();
      if (unlistenHealth) unlistenHealth();
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
              <span className={`bar bar-1 ${isListening || vadSpeaking ? 'active' : ''}`} />
              <span className={`bar bar-2 ${isListening || vadSpeaking ? 'active' : ''}`} />
              <span className={`bar bar-3 ${isListening || vadSpeaking ? 'active' : ''}`} />
              <span className={`bar bar-4 ${isListening || vadSpeaking ? 'active' : ''}`} />
              <span className={`bar bar-5 ${isListening || vadSpeaking ? 'active' : ''}`} />
            </div>
          </div>

          {/* Center: Live label / transcript / autonomous step / proactive nudge */}
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
            ) : nudge ? (
              <span className="dynamic-island-status-text proactive-nudge" title={nudge.detail}>
                {nudge.category === 'system' ? (
                  <Activity size={12} className="nudge-icon system-alert-icon" />
                ) : (
                  <Lightbulb size={12} className="nudge-icon" />
                )}
                {' '}{nudge.title}
              </span>
            ) : (
              <span className="dynamic-island-status-text idle">
                {isListening
                  ? 'Listening for command...'
                  : vadSpeaking
                  ? 'Voice detected...'
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
              onClick={handleInspectScreen}
              title="Inspect Active Screen (What am I looking at?)"
              aria-label="Inspect Active Screen"
            >
              <Eye size={13} />
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
              {nudge && (
                <div className={`dynamic-island-expanded-nudge ${nudge.category === 'system' ? 'system-alert' : ''}`}>
                  <div className="nudge-header">
                    <span className={`nudge-tag ${nudge.category === 'system' ? 'system-tag' : ''}`}>{nudge.category}</span>
                    <span className="nudge-app">{nudge.appName}</span>
                  </div>
                  <p className="nudge-detail">{nudge.detail}</p>
                  <div className="nudge-actions">
                    <button
                      type="button"
                      className="nudge-run-btn"
                      onClick={() => handleRunNudge(nudge)}
                    >
                      <Play size={10} /> Run Suggestion
                    </button>
                    <button
                      type="button"
                      className="nudge-dismiss-btn"
                      onClick={() => {
                        globalProactiveCopilot.dismissNudge();
                        setNudge(null);
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {transcript ? (
                <div className="dynamic-island-expanded-transcript">
                  <span className="drawer-label">Spoken:</span>
                  <p className="drawer-text">"{transcript}"</p>
                </div>
              ) : !nudge ? (
                <div className="dynamic-island-expanded-hint">
                  <Volume2 size={14} />
                  <span>
                    Speak naturally or say <strong style={{ color: 'var(--claude-accent)' }}>"Hey Aeio"</strong> followed by your command.
                  </span>
                </div>
              ) : null}

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
