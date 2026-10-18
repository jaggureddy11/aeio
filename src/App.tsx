import React, { useState, useEffect } from 'react';
import logo from './assets/logo.png';
import { ChatView } from './components/chat';
import { MemoryPanel } from './components/memory';
import { SettingsPanel } from './components/settings';
import { Sidebar } from './components/layout/Sidebar';
import { OnboardingModal } from './components/onboarding';
import { useSettingsStore } from './stores/settingsStore';
import { useChatStore } from './stores/chatStore';
import { hideWindow, ping, recordError } from './lib/ipc';
import { getKillSwitchState, listenToKillSwitch } from './lib/safety/killSwitch';
import { getControlOverlayState, listenToOverlayState } from './lib/safety/overlay';
import { ActiveControlHud } from './components/safety/ActiveControlHud';
import { GuiActionApprovalModal } from './components/safety/GuiActionApprovalModal';
import { VoiceHUD } from './components/chat/VoiceHUD';
import { BackgroundDock } from './components/chat/BackgroundDock';
import { DynamicIslandNotchWindow } from './components/chat/DynamicIslandNotchWindow';
import { useVoiceStore } from './stores/voiceStore';
import { globalProactiveCopilot } from './lib/agent/proactiveCopilot';
import { globalProactiveHeartbeat } from './lib/agent/proactiveHeartbeat';
import './App.css';

export const App: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    hasCompletedOnboarding,
    theme,
    killSwitchTripped,
    setKillSwitchTripped,
    overlayState,
    setOverlayState,
  } = useSettingsStore();

  const { clearMessages } = useChatStore();
  const { isVoiceHUDOpen, closeVoiceHUD, toggleVoiceHUD } = useVoiceStore();

  const [showOnboarding, setShowOnboarding] = useState(!hasCompletedOnboarding);
  const [isInitializing, setIsInitializing] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const isOverlayWindow =
    typeof window !== 'undefined' && window.location.search.includes('overlay=true');

  const isNotchWindow =
    typeof window !== 'undefined' && window.location.search.includes('notch=true');

  // Synchronize System / Light / Dark Theme Mode
  useEffect(() => {
    const applyTheme = (mode: string) => {
      let resolved = mode;
      if (mode === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        resolved = prefersDark ? 'dark' : 'light';
      }
      document.documentElement.setAttribute('data-theme', resolved);
      document.body.setAttribute('data-theme', resolved);
    };

    applyTheme(theme);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMediaChange = () => {
      const currentTheme = useSettingsStore.getState().theme;
      if (currentTheme === 'system') {
        applyTheme('system');
      }
    };

    mediaQuery.addEventListener('change', handleMediaChange);
    return () => mediaQuery.removeEventListener('change', handleMediaChange);
  }, [theme]);

  // Global error & unhandled rejection listener for privacy-safe local logging and opt-in telemetry
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const state = useSettingsStore.getState();
      const optIn = state.telemetryOptIn;
      const modelName = state.ollamaModel || undefined;
      recordError(
        event.error?.name || 'UncaughtError',
        event.message || 'Unknown window error',
        event.error?.stack,
        optIn,
        modelName
      ).then((payload) => {
        if (payload) {
          console.info('[Aeio Telemetry] Outbound payload recorded:', payload);
        }
      }).catch(() => {});
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const state = useSettingsStore.getState();
      const optIn = state.telemetryOptIn;
      const modelName = state.ollamaModel || undefined;
      const reason = event.reason;
      const message = typeof reason === 'string' ? reason : reason?.message || JSON.stringify(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;
      recordError('UnhandledPromiseRejection', message, stack, optIn, modelName).then((payload) => {
        if (payload) {
          console.info('[Aeio Telemetry] Outbound payload recorded:', payload);
        }
      }).catch(() => {});
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let attempts = 0;
    const checkInit = async () => {
      try {
        await ping();
        if (mounted) setIsInitializing(false);
      } catch (err) {
        attempts++;
        if (attempts >= 2 && typeof window !== 'undefined' && !(window as any).__TAURI_INTERNALS__) {
          if (mounted) setIsInitializing(false);
          return;
        }
        if (mounted) {
          setTimeout(checkInit, 150);
        }
      }
    };
    checkInit();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const isTauriEnv = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    if (!isTauriEnv) return;

    let unlistenSettings: (() => void) | undefined;
    let unlistenVoice: (() => void) | undefined;
    let unlistenInspect: (() => void) | undefined;

    import('@tauri-apps/api/event')
      .then(({ listen }) => {
        listen('open-settings', () => {
          setActiveTab('settings');
        }).then((unsub) => {
          unlistenSettings = unsub;
        });

        listen('open-voice-hud', () => {
          toggleVoiceHUD();
        }).then((unsub) => {
          unlistenVoice = unsub;
        });

        listen('inspect-screen', () => {
          setActiveTab('chat');
          useChatStore.getState().inspectCurrentScreen();
        }).then((unsub) => {
          unlistenInspect = unsub;
        });
      })
      .catch(() => {});

    return () => {
      if (unlistenSettings) unlistenSettings();
      if (unlistenVoice) unlistenVoice();
      if (unlistenInspect) unlistenInspect();
    };
  }, [setActiveTab, toggleVoiceHUD]);

  // Synchronize Kill Switch state with Rust native background thread
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getKillSwitchState()
      .then((halted) => {
        if (halted) setKillSwitchTripped(true, 'Escape held for >= 300ms');
      })
      .catch(() => {});

    listenToKillSwitch((event) => {
      setKillSwitchTripped(event.halted, event.reason);
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});

    return () => {
      if (unlisten) unlisten();
    };
  }, [setKillSwitchTripped]);

  // Synchronize Active Control Overlay state
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getControlOverlayState()
      .then((state) => {
        if (state) setOverlayState(state);
      })
      .catch(() => {});

    listenToOverlayState((state) => {
      setOverlayState(state);
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});

    return () => {
      if (unlisten) unlisten();
    };
  }, [setOverlayState]);

  // Start Contextual Desktop Proactive Copilot & Background Heartbeat Daemon
  useEffect(() => {
    globalProactiveCopilot.start(4000);
    globalProactiveHeartbeat.start(20000);

    let unlistenHealth: (() => void) | undefined;
    const isTauriEnv = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    if (isTauriEnv) {
      import('@tauri-apps/api/event')
        .then(({ listen }) => {
          listen('run-system-health-check', () => {
            globalProactiveHeartbeat.checkNow(true).catch(() => {});
          }).then((unsub) => {
            unlistenHealth = unsub;
          });
        })
        .catch(() => {});
    }

    return () => {
      globalProactiveCopilot.stop();
      globalProactiveHeartbeat.stop();
      if (unlistenHealth) unlistenHealth();
    };
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showOnboarding) {
          setShowOnboarding(false);
          return;
        }
        hideWindow();
      }

      // Global Voice HUD hotkey: Cmd/Ctrl + Shift + V or Cmd/Ctrl + J (Agent mode)
      if (
        ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'v') ||
        ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j')
      ) {
        e.preventDefault();
        toggleVoiceHUD('agent');
        return;
      }

      // Voice Dictation hotkey: Cmd/Ctrl + Shift + D
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        toggleVoiceHUD('dictation');
        return;
      }

      // Voice In-Place Desktop Rewrite hotkey: Cmd/Ctrl + Shift + E
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        toggleVoiceHUD('rewrite');
        return;
      }

      // Visual Screen Inspector hotkey: Cmd/Ctrl + Shift + O
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        setActiveTab('chat');
        useChatStore.getState().inspectCurrentScreen();
        return;
      }

      // Keyboard navigation: Cmd/Ctrl + 1 / 2 / 3 for immediate mouse-free tab switching
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        if (e.key === '1') {
          e.preventDefault();
          setActiveTab('chat');
        } else if (e.key === '2') {
          e.preventDefault();
          setActiveTab('memory');
        } else if (e.key === '3') {
          e.preventDefault();
          setActiveTab('settings');
        } else if (e.key.toLowerCase() === 'b') {
          e.preventDefault();
          setSidebarCollapsed((prev) => !prev);
        } else if (e.key.toLowerCase() === 'k') {
          e.preventDefault();
          setActiveTab('chat');
          useChatStore.getState().createNewSession();
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [showOnboarding, setActiveTab, clearMessages, toggleVoiceHUD]);

  if (isOverlayWindow) {
    return (
      <div style={{ background: 'transparent', width: '100vw', height: '100vh', overflow: 'hidden' }}>
        <ActiveControlHud isStandalone={true} />
      </div>
    );
  }

  if (isNotchWindow) {
    return (
      <div style={{ background: 'transparent', width: '100vw', height: '100vh', overflow: 'hidden' }}>
        <DynamicIslandNotchWindow />
      </div>
    );
  }

  if (isInitializing) {
    return (
      <div className="claude-init-container">
        <div className="claude-init-content">
          <img src={logo} alt="Aeio logo" className="claude-init-logo" />
          <span className="claude-init-text">
            Initializing local memory vault...
          </span>
        </div>
      </div>
    );
  }

  const isHudVisible = killSwitchTripped || overlayState?.isActive;

  return (
    <div className="claude-app-shell">
      {/* Active Screen Control HUD & Emergency Stop Banner */}
      <ActiveControlHud />

      {/* Left Collapsible Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        onOpenSettings={() => setActiveTab('settings')}
      />

      {/* Main Workspace Canvas */}
      <main className="claude-main-canvas" style={{ paddingTop: isHudVisible ? '42px' : 0 }}>
        {activeTab === 'chat' && (
          <ChatView onOpenSettings={() => setActiveTab('settings')} />
        )}
        {activeTab === 'memory' && <MemoryPanel />}
        {activeTab === 'settings' && (
          <SettingsPanel onOpenOnboarding={() => setShowOnboarding(true)} />
        )}
      </main>

      {/* First-Run Onboarding Modal (Shown once, skippable, no account needed) */}
      <OnboardingModal
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
      />

      {/* GUI Action Approval Modal (Pillar 1 Human-In-The-Loop Gate) */}
      <GuiActionApprovalModal />

      {/* Floating System Voice HUD / Ambient Notch (VoiceOS + JARVIS) */}
      <VoiceHUD isOpen={isVoiceHUDOpen} onClose={closeVoiceHUD} />

      {/* Ambient Background Task Dock */}
      <BackgroundDock onOpenHUD={toggleVoiceHUD} />
    </div>
  );
};

export default App;
