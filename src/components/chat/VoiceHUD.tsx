import React, { useState, useEffect, useRef } from 'react';
import {
  MicOff,
  Volume2,
  Sparkles,
  X,
  CheckCircle2,
  Minimize2,
  Maximize2,
  Bot,
  PenTool,
  Send,
  FileEdit,
  AlertTriangle,
  Radio,
} from 'lucide-react';
import {
  globalVoiceEngine,
  VoiceState,
  matchAndExecuteFastAction,
  speakJARVISFeedback,
} from '../../lib/voice/voiceEngine';
import { executeDictation, DictationTone } from '../../lib/voice/dictationEngine';
import { executeInPlaceRewrite } from '../../lib/voice/editSelectionEngine';
import { globalAutonomousRunner } from '../../lib/agent/autonomousAgent';
import { useChatStore } from '../../stores/chatStore';
import { useVoiceStore } from '../../stores/voiceStore';

export type VoiceHUDMode = 'agent' | 'dictation' | 'rewrite';

export interface PendingActionApproval {
  title: string;
  description: string;
  targetApp?: string;
  previewContent: string;
  onApprove: () => Promise<void> | void;
  onCancel: () => void;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const VoiceHUD: React.FC<Props> = ({ isOpen, onClose }) => {
  const [mode, setMode] = useState<VoiceHUDMode>('agent');
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [activeStepText, setActiveStepText] = useState<string | null>(null);
  const [isDocked, setIsDocked] = useState(false);
  const [dictationTone, setDictationTone] = useState<DictationTone>('standard');
  const [pendingApproval, setPendingApproval] = useState<PendingActionApproval | null>(null);

  const sendMessage = useChatStore((state) => state.sendMessage);
  const { wakeWordEnabled, toggleWakeWord } = useVoiceStore();
  const currentModeRef = useRef<VoiceHUDMode>(mode);
  currentModeRef.current = mode;

  useEffect(() => {
    if (!isOpen) {
      globalVoiceEngine.stopListening();
      globalAutonomousRunner.cancel();
      setTranscript('');
      setFeedback(null);
      setActiveStepText(null);
      setPendingApproval(null);
      return;
    }

    const processCommand = async (text: string) => {
      setVoiceState('processing');
      const activeMode = currentModeRef.current;

      try {
        // MODE 1: VoiceOS System-Wide Dictation
        if (activeMode === 'dictation') {
          setFeedback('Polishing spoken transcript...');
          const dictationResult = await executeDictation(text, {
            polishWithAI: true,
            tone: dictationTone,
            autoInject: true,
          });

          if (dictationResult.success) {
            setFeedback(`Injected into active window: "${dictationResult.polishedText}"`);
            setVoiceState('speaking');
            speakJARVISFeedback('Text injected.', () => {
              setVoiceState('idle');
              setTimeout(() => {
                if (isOpen) {
                  setFeedback(null);
                  setTranscript('');
                  globalVoiceEngine.startListening();
                }
              }, 1200);
            });
          } else {
            setFeedback(dictationResult.error || 'Dictation injection failed.');
            setVoiceState('idle');
          }
          return;
        }

        // MODE 2: VoiceOS In-Place Selection Rewrite
        if (activeMode === 'rewrite') {
          setFeedback(`Capturing selection and applying "${text}"...`);
          const rewriteResult = await executeInPlaceRewrite(text);

          if (rewriteResult.success) {
            setFeedback(`Selection updated in active app!`);
            setVoiceState('speaking');
            speakJARVISFeedback('Selection updated.', () => {
              setVoiceState('idle');
              setTimeout(() => {
                if (isOpen) {
                  setFeedback(null);
                  setTranscript('');
                  globalVoiceEngine.startListening();
                }
              }, 1200);
            });
          } else {
            setFeedback(rewriteResult.error || 'Selection rewrite failed.');
            setVoiceState('idle');
          }
          return;
        }

        // MODE 3: JARVIS Autonomous Agent Mode
        // 1. Attempt sub-millisecond fast-path intent match (<1ms)
        const fastResult = await matchAndExecuteFastAction(text);

        if (fastResult && fastResult.handledDeterministically) {
          setFeedback(fastResult.feedbackText);
          setVoiceState('speaking');

          if (fastResult.actionType === 'inspect_screen' && fastResult.details) {
            const res = fastResult.details;
            useChatStore.getState().addMessage({
              role: 'user',
              content: text,
              activeWindowContext: res.activeWindow || undefined,
              screenSnapshot: res.screenData
                ? {
                    base64: res.screenData.base64,
                    width: res.screenData.width,
                    height: res.screenData.height,
                    filePath: res.screenData.filePath,
                  }
                : undefined,
            });
            useChatStore.getState().addMessage({
              role: 'assistant',
              content: res.analysis || fastResult.feedbackText,
              activeWindowContext: res.activeWindow || undefined,
            });
          }

          speakJARVISFeedback(fastResult.feedbackText, async () => {
            if (fastResult.followUp) {
              setFeedback('JARVIS: Continuing with follow-up task...');
              setActiveStepText('Formulating plan for follow-up...');
              speakJARVISFeedback('Proceeding with the follow-up step.', () => {});

              const followUpTask = await globalAutonomousRunner.runTask(fastResult.followUp, {
                onStepStart: (stepNum, thought, tool) => {
                  setActiveStepText(`Step ${stepNum}: [${tool}] ${thought}`);
                },
                onStepComplete: (step) => {
                  setActiveStepText(`Completed step ${step.stepNumber} (${step.toolName})`);
                },
                onFinished: (report) => {
                  setFeedback(report);
                  setActiveStepText(null);
                  setVoiceState('speaking');
                },
                onError: (err) => {
                  setFeedback(`Error: ${err}`);
                  setActiveStepText(null);
                  setVoiceState('idle');
                },
              });

              if (followUpTask.status === 'completed' && followUpTask.finalReport) {
                setFeedback(followUpTask.finalReport);
              }
            } else {
              setVoiceState('idle');
              setTimeout(() => {
                if (isOpen) {
                  setFeedback(null);
                  setTranscript('');
                  globalVoiceEngine.startListening();
                }
              }, 1200);
            }
          });
        } else {
          // 2. Autonomous Multi-Step ReAct Loop
          setFeedback('JARVIS: Planning & executing task...');
          setActiveStepText('Formulating plan...');
          speakJARVISFeedback('On it. Working on your task.', () => {});

          const task = await globalAutonomousRunner.runTask(text, {
            onStepStart: (stepNum, thought, tool) => {
              setActiveStepText(`Step ${stepNum}: [${tool}] ${thought}`);
            },
            onStepComplete: (step) => {
              setActiveStepText(`Completed step ${step.stepNumber} (${step.toolName})`);
            },
            onFinished: (report) => {
              setFeedback(report);
              setActiveStepText(null);
              setVoiceState('speaking');
            },
            onError: (err) => {
              setFeedback(`Error: ${err}`);
              setActiveStepText(null);
              setVoiceState('idle');
            },
          });

          if (task.status === 'completed' && task.finalReport) {
            setFeedback(task.finalReport);
            setVoiceState('speaking');
          } else if (task.status === 'failed') {
            setFeedback(task.error || 'Task could not be completed.');
          }

          // Sync with workspace chat
          await sendMessage(text);
        }
      } catch (err: any) {
        setFeedback(`Error: ${err?.message || 'Execution failed'}`);
        setVoiceState('idle');
      }
    };

    const unsubState = globalVoiceEngine.onStateChange((state) => {
      setVoiceState(state);
    });

    const unsubTranscript = globalVoiceEngine.onTranscript(async (text, isFinal) => {
      setTranscript(text);

      if (isFinal && text.trim().length > 0) {
        await processCommand(text);
      }
    });

    // Automatically execute pending hands-free voice command if triggered by wake-word
    const pendingCmd = useVoiceStore.getState().consumePendingCommand();
    if (pendingCmd && pendingCmd.trim().length > 0) {
      setTranscript(pendingCmd);
      processCommand(pendingCmd);
    } else {
      globalVoiceEngine.startListening();
    }

    return () => {
      unsubState();
      unsubTranscript();
      globalVoiceEngine.stopListening();
    };
  }, [isOpen, sendMessage, onClose, dictationTone]);

  if (!isOpen) return null;

  const isListening = voiceState === 'listening';

  // Floating Mini Notch (Ambient Top Pill Mode)
  if (isDocked) {
    return (
      <aside
        className="voice-hud-mini-notch"
        role="region"
        aria-label="JARVIS Ambient Voice Notch"
        onClick={() => setIsDocked(false)}
      >
        <div className="mini-notch-indicator">
          <span className={`voice-hud-dot ${isListening ? 'pulsing' : ''}`} />
          <span className="mini-notch-title">
            {mode === 'dictation'
              ? 'VoiceOS Dictation'
              : mode === 'rewrite'
              ? 'VoiceOS Rewriter'
              : 'JARVIS Agent'}
          </span>
        </div>

        <div className="mini-notch-center">
          {activeStepText ? (
            <span className="mini-notch-status">{activeStepText}</span>
          ) : transcript ? (
            <span className="mini-notch-status">"{transcript}"</span>
          ) : (
            <div className="mini-notch-waveform">
              <span className="bar bar-1" />
              <span className="bar bar-2" />
              <span className="bar bar-3" />
              <span className="bar bar-4" />
              <span className="bar bar-5" />
            </div>
          )}
        </div>

        <div className="mini-notch-actions" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="mini-notch-btn"
            onClick={() => setIsDocked(false)}
            title="Expand to Full HUD"
            aria-label="Expand to Full HUD"
          >
            <Maximize2 size={13} />
          </button>
          <button
            type="button"
            className="mini-notch-btn"
            onClick={onClose}
            title="Close"
            aria-label="Close"
          >
            <X size={13} />
          </button>
        </div>
      </aside>
    );
  }

  // Expanded Liquid Glass HUD Modal
  return (
    <div className="voice-hud-backdrop" onClick={onClose}>
      <div
        className={`voice-hud-card ${voiceState}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Voice Automation HUD"
      >
        {/* Top Header */}
        <div className="voice-hud-header">
          <div className="voice-hud-badge">
            <span className={`voice-hud-dot ${isListening ? 'pulsing' : ''}`} />
            <span>JARVIS VoiceOS Automation</span>
          </div>

          <div className="voice-hud-header-actions">
            <button
              type="button"
              className={`voice-hud-action-btn ${wakeWordEnabled ? 'active' : ''}`}
              onClick={toggleWakeWord}
              title={wakeWordEnabled ? 'Wake-Word Active ("Hey Aeio" enabled)' : 'Turn On Wake-Word ("Hey Aeio")'}
              aria-label="Toggle Wake Word"
            >
              <Radio size={14} className={wakeWordEnabled ? 'pulsing' : ''} />
              <span className="wake-word-label">{wakeWordEnabled ? 'Hey Aeio' : 'Wake-Word'}</span>
            </button>
            <button
              type="button"
              className="voice-hud-action-btn"
              onClick={() => setIsDocked(true)}
              title="Dock to Floating Ambient Notch"
              aria-label="Dock to Floating Notch"
            >
              <Minimize2 size={14} />
            </button>
            <button
              type="button"
              className="voice-hud-close"
              onClick={onClose}
              aria-label="Close voice HUD"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Mode Selector Pill Bar */}
        <div className="voice-hud-mode-bar" role="tablist" aria-label="Operating Mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'agent'}
            className={`voice-mode-tab ${mode === 'agent' ? 'active' : ''}`}
            onClick={() => {
              setMode('agent');
              setFeedback(null);
            }}
          >
            <Bot size={13} />
            <span>JARVIS Agent</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'dictation'}
            className={`voice-mode-tab ${mode === 'dictation' ? 'active' : ''}`}
            onClick={() => {
              setMode('dictation');
              setFeedback(null);
            }}
          >
            <PenTool size={13} />
            <span>System Dictation</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'rewrite'}
            className={`voice-mode-tab ${mode === 'rewrite' ? 'active' : ''}`}
            onClick={() => {
              setMode('rewrite');
              setFeedback(null);
            }}
          >
            <FileEdit size={13} />
            <span>Edit Selection</span>
          </button>
        </div>

        {/* Tone Selector for Dictation Mode */}
        {mode === 'dictation' && (
          <div className="voice-hud-tone-bar">
            {(['standard', 'formal', 'casual', 'bullet_points'] as DictationTone[]).map((t) => (
              <button
                key={t}
                type="button"
                className={`voice-tone-pill ${dictationTone === t ? 'active' : ''}`}
                onClick={() => setDictationTone(t)}
              >
                {t.replace('_', ' ')}
              </button>
            ))}
          </div>
        )}

        {/* Dynamic Waveform Orb */}
        <div className="voice-hud-orb-container">
          <button
            type="button"
            className={`voice-hud-orb ${voiceState}`}
            onClick={() => {
              if (isListening) {
                globalVoiceEngine.stopListening();
              } else {
                setFeedback(null);
                globalVoiceEngine.startListening();
              }
            }}
            title={isListening ? 'Click to pause listening' : 'Click to start listening'}
          >
            {isListening ? (
              <div className="voice-waveform">
                <span className="bar bar-1" />
                <span className="bar bar-2" />
                <span className="bar bar-3" />
                <span className="bar bar-4" />
                <span className="bar bar-5" />
              </div>
            ) : voiceState === 'speaking' ? (
              <Volume2 size={26} className="orb-icon speaking-pulse" />
            ) : voiceState === 'processing' ? (
              <Sparkles size={26} className="orb-icon spin" />
            ) : (
              <MicOff size={26} className="orb-icon muted" />
            )}
          </button>
        </div>

        {/* "Before It Sends" Action Approval Card */}
        {pendingApproval && (
          <div className="voice-approval-card" role="alert">
            <div className="voice-approval-header">
              <AlertTriangle size={15} className="voice-approval-warning-icon" />
              <span className="voice-approval-title">{pendingApproval.title}</span>
            </div>
            <p className="voice-approval-desc">{pendingApproval.description}</p>
            <div className="voice-approval-preview">
              <code>{pendingApproval.previewContent}</code>
            </div>
            <div className="voice-approval-actions">
              <button
                type="button"
                className="voice-approval-btn cancel"
                onClick={pendingApproval.onCancel}
              >
                Discard
              </button>
              <button
                type="button"
                className="voice-approval-btn approve"
                onClick={() => pendingApproval.onApprove()}
              >
                <Send size={12} />
                Approve & Execute
              </button>
            </div>
          </div>
        )}

        {/* Live Transcript / Status */}
        <div className="voice-hud-body">
          {feedback ? (
            <div className="voice-hud-feedback">
              <CheckCircle2 size={16} className="feedback-check" />
              <span>{feedback}</span>
            </div>
          ) : activeStepText ? (
            <div className="voice-hud-active-step">
              <span className="step-pulsing-dot" />
              <span>{activeStepText}</span>
            </div>
          ) : transcript ? (
            <p className="voice-hud-transcript">"{transcript}"</p>
          ) : (
            <p className="voice-hud-placeholder">
              {mode === 'dictation'
                ? isListening
                  ? 'Speak naturally... speech will be polished and typed into your focused app.'
                  : 'Dictation paused. Click the mic to speak.'
                : mode === 'rewrite'
                ? isListening
                  ? 'Speak an instruction for your selected text (e.g. "make it concise", "translate to Spanish")'
                  : 'Highlight text in any app, then click mic to rewrite.'
                : isListening
                ? 'Speak a command... "Play Back in Black on Spotify", "Volume 100%", "Lock screen"'
                : 'Microphone paused. Click to listen.'}
            </p>
          )}
        </div>

        {/* Quick Suggestion Chips */}
        <div className="voice-hud-chips">
          {mode === 'agent' ? (
            <>
              <span className="voice-chip">"Play AC/DC on Spotify"</span>
              <span className="voice-chip">"Set volume to 50%"</span>
              <span className="voice-chip">"Search YouTube for ChatGPT"</span>
              <span className="voice-chip">"Lock screen"</span>
            </>
          ) : mode === 'dictation' ? (
            <>
              <span className="voice-chip">"Hey team let's sync tomorrow at 3pm..."</span>
              <span className="voice-chip">"Here is the summary of today's release..."</span>
            </>
          ) : (
            <>
              <span className="voice-chip">"Make it concise and professional"</span>
              <span className="voice-chip">"Translate this to Spanish"</span>
              <span className="voice-chip">"Turn into bullet points"</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
