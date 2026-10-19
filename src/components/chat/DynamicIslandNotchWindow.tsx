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
  VolumeX,
  CheckCircle2,
  Sparkles,
  Lightbulb,
  Play,
  SkipBack,
  SkipForward,
  Eye,
  Activity,
  Cpu,
  Layers,
  Battery,
  BatteryCharging,
  AppWindow,
  Lock,
  Columns,
} from 'lucide-react';
import { globalVoiceEngine, VoiceState, matchAndExecuteFastAction, speakJARVISFeedback } from '../../lib/voice/voiceEngine';
import { globalProactiveCopilot, ProactiveNudge } from '../../lib/agent/proactiveCopilot';
import { globalProactiveHeartbeat } from '../../lib/agent/proactiveHeartbeat';
import { inspectActiveScreen } from '../../lib/vision/screenInspector';
import { useVoiceStore } from '../../stores/voiceStore';
import { useChatStore } from '../../stores/chatStore';
import {
  hideNotchWindow,
  resizeNotchWindow,
  playSystemEarcon,
  showMainWindow,
  getHardwareTelemetry,
  getPowerStatus,
  getActiveWindowContext,
  getSystemVolume,
  setSystemVolume,
  setSystemMute,
  mediaControl,
  lockScreen,
  manageActiveWindow,
  HardwareTelemetryInfo,
  PowerStatusInfo,
  WindowContextInfo,
  VolumeStatus,
} from '../../lib/ipc';

export const DynamicIslandNotchWindow: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [activeStepText, setActiveStepText] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [nudge, setNudge] = useState<ProactiveNudge | null>(null);

  // Live System Telemetry & Media State
  const [telemetry, setTelemetry] = useState<HardwareTelemetryInfo | null>(null);
  const [power, setPower] = useState<PowerStatusInfo | null>(null);
  const [activeWindow, setActiveWindow] = useState<WindowContextInfo | null>(null);
  const [volumeStatus, setVolumeStatus] = useState<VolumeStatus | null>(null);

  const { wakeWordEnabled, toggleWakeWord, vadSpeaking } = useVoiceStore();
  const sendMessage = useChatStore((state) => state.sendMessage);

  const isListening = voiceState === 'listening';
  const isExpandedRef = useRef(isExpanded);
  isExpandedRef.current = isExpanded;

  // Poll hardware telemetry & active window context
  useEffect(() => {
    let isMounted = true;
    const fetchStats = async () => {
      try {
        const [t, p, w, v] = await Promise.all([
          getHardwareTelemetry().catch(() => null),
          getPowerStatus().catch(() => null),
          getActiveWindowContext().catch(() => null),
          getSystemVolume().catch(() => null),
        ]);
        if (isMounted) {
          if (t) setTelemetry(t);
          if (p) setPower(p);
          if (w) setActiveWindow(w);
          if (v) setVolumeStatus(v);
        }
      } catch {}
    };

    fetchStats();
    // Poll every 3 seconds when expanded, or every 10 seconds when collapsed
    const interval = setInterval(fetchStats, isExpanded ? 3000 : 10000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isExpanded]);

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
      await resizeNotchWindow(460, 220).catch(() => {});
    } else {
      await resizeNotchWindow(380, 48).catch(() => {});
    }
  };

  const handleClose = async () => {
    globalVoiceEngine.stopListening();
    await hideNotchWindow().catch(() => {});
  };

  const handleOpenMainWindow = async () => {
    try {
      await showMainWindow();
    } catch {
      // Fallback
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const win = await WebviewWindow.getByLabel('main');
        if (win) {
          await win.unminimize();
          await win.center();
          await win.show();
          await win.setFocus();
        }
      }
    }
  };

  const handleToggleMic = () => {
    if (isListening) {
      globalVoiceEngine.stopListening();
    } else {
      setFeedback(null);
      globalVoiceEngine.startListening();
    }
  };

  // Quick Media Actions
  const handleMediaControl = async (action: 'play_pause' | 'next' | 'previous') => {
    playSystemEarcon('processing').catch(() => {});
    try {
      const res = await mediaControl(action);
      setFeedback(res.message);
      playSystemEarcon('success').catch(() => {});
      setTimeout(() => setFeedback(null), 2500);
    } catch {
      playSystemEarcon('error').catch(() => {});
    }
  };

  const handleToggleMute = async () => {
    const nextMute = !volumeStatus?.is_muted;
    try {
      await setSystemMute(nextMute);
      setVolumeStatus((prev) => (prev ? { ...prev, is_muted: nextMute } : null));
      setFeedback(nextMute ? 'Volume Muted' : 'Volume Unmuted');
      playSystemEarcon('success').catch(() => {});
      setTimeout(() => setFeedback(null), 2000);
    } catch {
      playSystemEarcon('error').catch(() => {});
    }
  };

  const handleVolumeStep = async (delta: number) => {
    const current = volumeStatus?.volume ?? 50;
    const next = Math.max(0, Math.min(100, current + delta));
    try {
      await setSystemVolume(next);
      setVolumeStatus((prev) => (prev ? { ...prev, volume: next, is_muted: false } : null));
      setFeedback(`Volume ${next}%`);
      setTimeout(() => setFeedback(null), 2000);
    } catch {}
  };

  // Quick Lock Screen
  const handleLockScreen = async () => {
    playSystemEarcon('processing').catch(() => {});
    try {
      await lockScreen();
      setFeedback('Screen Locked');
      playSystemEarcon('success').catch(() => {});
    } catch {}
  };

  // Quick Window Tiling
  const handleTileWindow = async (dir: 'left' | 'right') => {
    try {
      await manageActiveWindow(dir === 'left' ? 'tile_left' : 'tile_right');
      setFeedback(`Tiled ${dir}`);
      playSystemEarcon('success').catch(() => {});
      setTimeout(() => setFeedback(null), 2000);
    } catch {}
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
          // 1. Fast-path deterministic directive check
          const fastResult = await matchAndExecuteFastAction(text);
          if (fastResult?.handledDeterministically) {
            setFeedback(fastResult.feedbackText);
            setVoiceState('speaking');
            playSystemEarcon('success').catch(() => {});
            setTimeout(() => {
              setFeedback(null);
              setVoiceState('idle');
              setTranscript('');
            }, 3500);
            return;
          }

          // 2. Complex or Agentic Task: open main window to show live progress & thoughts
          showMainWindow().catch(() => {});

          await sendMessage(text, { autoApproveSafeTools: true });

          const msgs = useChatStore.getState().messages;
          const lastAssistant = [...msgs].reverse().find((m) => m.role === 'assistant');
          const report = lastAssistant?.content || 'Task completed successfully, sir.';

          setFeedback(report);
          setVoiceState('speaking');
          playSystemEarcon('success').catch(() => {});
          speakJARVISFeedback(report, () => {
            setVoiceState('idle');
          });

          setTimeout(() => {
            setFeedback(null);
            setVoiceState('idle');
            setTranscript('');
          }, 4000);
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

  // Compute color tier for progress bars
  const getProgressColor = (percent: number) => {
    if (percent > 80) return 'red';
    if (percent > 50) return 'orange';
    return 'green';
  };

  return (
    <div className="dynamic-island-screen-container">
      <div
        className={`dynamic-island-notch-capsule ${isExpanded ? 'expanded' : 'collapsed'} ${voiceState}`}
        role="region"
        aria-label="Aeio Ambient Dynamic Island"
        onDoubleClick={handleOpenMainWindow}
        title="Double-click to open full Aeio app"
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

          {/* Center: Live label / transcript / autonomous step / compact telemetry */}
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
            ) : !isListening && !vadSpeaking && (telemetry || activeWindow || power) ? (
              /* Ambient Compact Telemetry Pill View */
              <div className="dynamic-island-compact-badges">
                {activeWindow?.app_name && (
                  <span className="compact-app-badge" title={activeWindow.window_title}>
                    {activeWindow.app_name}
                  </span>
                )}
                {telemetry && (
                  <span
                    className={`compact-telemetry-pill ${telemetry.cpu_usage_percent > 75 ? 'warn' : ''}`}
                    title={`CPU: ${telemetry.cpu_usage_percent}% | RAM: ${telemetry.memory_used_percent}%`}
                  >
                    <Cpu size={10} /> {Math.round(telemetry.cpu_usage_percent)}%
                  </span>
                )}
                {power && (
                  <span className="compact-telemetry-pill" title={power.power_source}>
                    {power.is_charging ? <BatteryCharging size={10} /> : <Battery size={10} />}
                    {power.percentage}%
                  </span>
                )}
              </div>
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

        {/* Expanded Drawer Content: Rich Native HUD */}
        {isExpanded && (
          <div className="dynamic-island-expanded-drawer">
            <div className="dynamic-island-expanded-content">
              {/* 1. Real-Time Hardware Telemetry Grid */}
              <div className="dynamic-island-telemetry-grid">
                {/* CPU Card */}
                <div className="telemetry-metric-card">
                  <div className="metric-header">
                    <span className="metric-icon-group">
                      <Cpu size={11} /> CPU
                    </span>
                    <span className="metric-value">
                      {telemetry ? `${Math.round(telemetry.cpu_usage_percent)}%` : '--'}
                    </span>
                  </div>
                  <div className="metric-progress-track">
                    <div
                      className={`metric-progress-fill ${getProgressColor(telemetry?.cpu_usage_percent ?? 0)}`}
                      style={{ width: `${Math.min(100, telemetry?.cpu_usage_percent ?? 0)}%` }}
                    />
                  </div>
                </div>

                {/* RAM Card */}
                <div className="telemetry-metric-card">
                  <div className="metric-header">
                    <span className="metric-icon-group">
                      <Layers size={11} /> RAM
                    </span>
                    <span className="metric-value">
                      {telemetry ? `${Math.round(telemetry.memory_used_percent)}%` : '--'}
                    </span>
                  </div>
                  <div className="metric-progress-track">
                    <div
                      className={`metric-progress-fill ${getProgressColor(telemetry?.memory_used_percent ?? 0)}`}
                      style={{ width: `${Math.min(100, telemetry?.memory_used_percent ?? 0)}%` }}
                    />
                  </div>
                </div>

                {/* Battery / Power Card */}
                <div className="telemetry-metric-card">
                  <div className="metric-header">
                    <span className="metric-icon-group">
                      {power?.is_charging ? <BatteryCharging size={11} /> : <Battery size={11} />}
                      {power?.is_charging ? 'Charging' : 'Battery'}
                    </span>
                    <span className="metric-value">
                      {power ? `${power.percentage}%` : '--'}
                    </span>
                  </div>
                  <div className="metric-progress-track">
                    <div
                      className={`metric-progress-fill ${getProgressColor(100 - (power?.percentage ?? 100))}`}
                      style={{ width: `${Math.min(100, power?.percentage ?? 0)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* 2. Native System Media & Audio Controls */}
              <div className="dynamic-island-media-bar">
                <div className="media-left-info" title={activeWindow?.window_title || 'Active Window'}>
                  <AppWindow size={13} style={{ flexShrink: 0, color: '#38bdf8' }} />
                  <span>{activeWindow?.app_name || 'Aeio Native'}</span>
                </div>

                <div className="media-controls-group">
                  <button
                    type="button"
                    className="media-btn"
                    onClick={() => handleMediaControl('previous')}
                    title="Previous Track"
                    aria-label="Previous Track"
                  >
                    <SkipBack size={12} />
                  </button>

                  <button
                    type="button"
                    className="media-btn play-primary"
                    onClick={() => handleMediaControl('play_pause')}
                    title="Play / Pause"
                    aria-label="Play or Pause Media"
                  >
                    <Play size={12} />
                  </button>

                  <button
                    type="button"
                    className="media-btn"
                    onClick={() => handleMediaControl('next')}
                    title="Next Track"
                    aria-label="Next Track"
                  >
                    <SkipForward size={12} />
                  </button>
                </div>

                <div className="volume-controls-group">
                  <button
                    type="button"
                    className="media-btn"
                    onClick={handleToggleMute}
                    title={volumeStatus?.is_muted ? 'Unmute' : 'Mute'}
                    aria-label="Mute or Unmute"
                  >
                    {volumeStatus?.is_muted ? <VolumeX size={12} style={{ color: '#ef4444' }} /> : <Volume2 size={12} />}
                  </button>

                  <button
                    type="button"
                    className="vol-step-btn"
                    onClick={() => handleVolumeStep(-10)}
                    title="Lower Volume (-10%)"
                  >
                    -10%
                  </button>
                  <button
                    type="button"
                    className="vol-step-btn"
                    onClick={() => handleVolumeStep(10)}
                    title="Raise Volume (+10%)"
                  >
                    +10%
                  </button>
                </div>
              </div>

              {/* 3. Quick Action Launchers */}
              <div className="dynamic-island-quick-pills">
                <button
                  type="button"
                  className="quick-pill-btn"
                  onClick={handleLockScreen}
                  title="Lock Desktop Immediately"
                >
                  <Lock size={11} /> Lock Screen
                </button>

                <button
                  type="button"
                  className="quick-pill-btn"
                  onClick={() => handleTileWindow('left')}
                  title="Tile Active Window to Left Half"
                >
                  <Columns size={11} /> Tile Left
                </button>

                <button
                  type="button"
                  className="quick-pill-btn"
                  onClick={() => handleTileWindow('right')}
                  title="Tile Active Window to Right Half"
                >
                  <Columns size={11} /> Tile Right
                </button>

                <button
                  type="button"
                  className="quick-pill-btn"
                  onClick={handleInspectScreen}
                  title="Take Screen Snapshot and Inspect"
                >
                  <Eye size={11} /> Inspect Screen
                </button>
              </div>

              {/* 4. Active Proactive Nudge (if any) */}
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

              {/* 5. Spoken Transcript Display */}
              {transcript && (
                <div className="dynamic-island-expanded-transcript">
                  <span className="drawer-label">Spoken:</span>
                  <p className="drawer-text">"{transcript}"</p>
                </div>
              )}

              {/* 6. Active Step Badge */}
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
