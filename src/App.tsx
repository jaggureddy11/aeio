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
import './App.css';

export const App: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    hasCompletedOnboarding,
  } = useSettingsStore();

  const { clearMessages } = useChatStore();

  const [showOnboarding, setShowOnboarding] = useState(!hasCompletedOnboarding);
  const [isInitializing, setIsInitializing] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
    const checkInit = async () => {
      try {
        await ping();
        if (mounted) setIsInitializing(false);
      } catch (err) {
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
    let unlisten: (() => void) | undefined;
    import('@tauri-apps/api/event')
      .then(({ listen }) => {
        listen('open-settings', () => {
          setActiveTab('settings');
        }).then((unsub) => {
          unlisten = unsub;
        });
      })
      .catch(() => {});

    return () => {
      if (unlisten) unlisten();
    };
  }, [setActiveTab]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showOnboarding) {
          setShowOnboarding(false);
          return;
        }
        hideWindow();
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
          clearMessages();
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [showOnboarding, setActiveTab, clearMessages]);

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

  return (
    <div className="claude-app-shell">
      {/* Left Collapsible Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        onOpenSettings={() => setActiveTab('settings')}
      />

      {/* Main Workspace Canvas */}
      <main className="claude-main-canvas">
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
    </div>
  );
};

export default App;
