import React, { useState, useEffect } from 'react';
import logo from './assets/logo.png';
import { ChatView } from './components/chat';
import { MemoryPanel } from './components/memory';
import { SettingsPanel } from './components/settings';
import { WorkspaceSwitcher } from './components/workspace/WorkspaceSwitcher';
import { OnboardingModal } from './components/onboarding';
import { useSettingsStore } from './stores/settingsStore';
import { hideWindow, ping, recordError } from './lib/ipc';
import { MessageSquare, Brain, Settings } from 'lucide-react';
import './App.css';

export const App: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    activeProvider,
    ollamaModel,
    activeWindowAwareness,
    hasCompletedOnboarding,
    hotkey,
  } = useSettingsStore();

  const [showOnboarding, setShowOnboarding] = useState(!hasCompletedOnboarding);
  const [isInitializing, setIsInitializing] = useState(true);

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
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [showOnboarding, setActiveTab]);

  if (isInitializing) {
    return (
      <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#090a0c' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
          <img src={logo} alt="Aeio logo" style={{ width: '40px', height: '40px', opacity: 0.8, animation: 'pulse 1.8s infinite ease-in-out' }} />
          <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.45)', fontFamily: 'Inter, monospace', letterSpacing: '0.04em' }}>
            Initializing local memory vault...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Draggable Utility Header */}
      <header className="app-header" data-tauri-drag-region role="banner">
        <div className="brand-section">
          <div className="brand-logo-frame">
            <img src={logo} alt="Aeio logo" className="brand-logo-img" />
          </div>
          <span className="brand-title">aeio</span>
          <div className="header-divider" />
          <WorkspaceSwitcher />
          <div className="status-badge" title="Active model status" aria-label={`Active model: ${activeProvider === 'ollama' ? ollamaModel : activeProvider}`}>
            <span className="status-dot"></span>
            <span className="status-label">{activeProvider === 'ollama' ? ollamaModel : activeProvider}</span>
          </div>
          {activeWindowAwareness && (
            <span className="host-aware-badge" title="Active window awareness enabled (Tier 2 opt-in)" aria-label="Active window awareness enabled">
              window aware
            </span>
          )}
        </div>

        <nav className="header-nav" role="tablist" aria-label="Main Navigation">
          <button
            role="tab"
            aria-selected={activeTab === 'chat'}
            aria-label="Chat view (⌘1)"
            className={`nav-tab ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
            title="Chat view (⌘1)"
          >
            <MessageSquare size={12} />
            <span>Chat</span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'memory'}
            aria-label="Memory store (⌘2)"
            className={`nav-tab ${activeTab === 'memory' ? 'active' : ''}`}
            onClick={() => setActiveTab('memory')}
            title="Memory store (⌘2)"
          >
            <Brain size={12} />
            <span>Memory</span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'settings'}
            aria-label="Settings panel (⌘3)"
            className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
            title="Settings (⌘3)"
          >
            <Settings size={12} />
            <span>Settings</span>
          </button>
        </nav>
      </header>

      {/* Main Panel Content */}
      <main className="app-content">
        {activeTab === 'chat' && <ChatView />}
        {activeTab === 'memory' && <MemoryPanel />}
        {activeTab === 'settings' && (
          <SettingsPanel onOpenOnboarding={() => setShowOnboarding(true)} />
        )}
      </main>

      {/* Precision Utility Footer */}
      <footer className="app-footer">
        <div className="footer-left">
          <span className="footer-tag">local-first</span>
          <span className="footer-dot">·</span>
          <span className="footer-model">{activeProvider === 'ollama' ? 'offline' : 'cloud'}</span>
        </div>
        <div className="footer-shortcuts">
          <span className="shortcut-item">
            <kbd className="hotkey-badge">{hotkey === 'CommandOrControl+Shift+Space' ? '⌘ ⇧ Space' : hotkey}</kbd>
            <span className="shortcut-label">toggle</span>
          </span>
          <span className="shortcut-item">
            <kbd className="hotkey-badge">Esc</kbd>
            <span className="shortcut-label">hide</span>
          </span>
        </div>
      </footer>

      {/* First-Run Onboarding Modal (Shown once, skippable, no account needed) */}
      <OnboardingModal
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
      />
    </div>
  );
};

export default App;
