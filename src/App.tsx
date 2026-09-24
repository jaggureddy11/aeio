import React, { useState } from 'react';
import logo from './assets/logo.png';
import { ChatView } from './components/chat';
import { MemoryPanel } from './components/memory';
import { SettingsPanel } from './components/settings';
import { WorkspaceSwitcher } from './components/workspace/WorkspaceSwitcher';
import { OnboardingModal } from './components/onboarding';
import { useSettingsStore } from './stores/settingsStore';
import { MessageSquare, Brain, Settings } from 'lucide-react';
import './App.css';

export const App: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    activeProvider,
    ollamaModel,
    ambientProactive,
    activeWindowAwareness,
    hasCompletedOnboarding,
    hotkey,
  } = useSettingsStore();

  const [showOnboarding, setShowOnboarding] = useState(!hasCompletedOnboarding);

  return (
    <div className="app-container">
      {/* Draggable Utility Header */}
      <header className="app-header" data-tauri-drag-region>
        <div className="brand-section">
          <div className="brand-logo-frame">
            <img src={logo} alt="Aeio logo" className="brand-logo-img" />
          </div>
          <span className="brand-title">aeio</span>
          <div className="header-divider" />
          <WorkspaceSwitcher />
          <div className="status-badge" title="Active model status">
            <span className="status-dot"></span>
            <span className="status-label">{activeProvider === 'ollama' ? ollamaModel : activeProvider}</span>
          </div>
          {ambientProactive && (
            <span className="ambient-active-badge" title="Ambient pattern noticing is enabled (Tier 5 opt-in)">
              <span className="ambient-pulse-dot" />
              ambient
            </span>
          )}
          {activeWindowAwareness && (
            <span className="host-aware-badge" title="Active window awareness enabled (Tier 2 opt-in)">
              window aware
            </span>
          )}
        </div>

        <nav className="header-nav">
          <button
            className={`nav-tab ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
            title="Chat view"
          >
            <MessageSquare size={12} />
            <span>Chat</span>
          </button>
          <button
            className={`nav-tab ${activeTab === 'memory' ? 'active' : ''}`}
            onClick={() => setActiveTab('memory')}
            title="Memory store"
          >
            <Brain size={12} />
            <span>Memory</span>
          </button>
          <button
            className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
            title="Settings"
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
