import React, { useState } from 'react';
import logo from './assets/logo.png';
import { ChatView } from './components/chat';
import { MemoryPanel } from './components/memory';
import { SettingsPanel } from './components/settings';
import { useSettingsStore } from './stores/settingsStore';
import { MessageSquare, Brain, Settings } from 'lucide-react';
import './App.css';

type ActiveTab = 'chat' | 'memory' | 'settings';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('chat');
  const { activeProvider, ollamaModel } = useSettingsStore();

  return (
    <div className="app-container">
      {/* Draggable Utility Header */}
      <header className="app-header" data-tauri-drag-region>
        <div className="brand-section">
          <img src={logo} alt="Aeio logo" className="brand-logo-img" />
          <span className="brand-title">aeio</span>
          <span className="status-badge">
            <span className="status-dot"></span>
            {activeProvider === 'ollama' ? ollamaModel : activeProvider}
          </span>
        </div>

        <nav className="header-nav">
          <button
            className={`nav-tab ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
            title="Chat view"
          >
            <MessageSquare size={13} />
            <span>Chat</span>
          </button>
          <button
            className={`nav-tab ${activeTab === 'memory' ? 'active' : ''}`}
            onClick={() => setActiveTab('memory')}
            title="Memory store"
          >
            <Brain size={13} />
            <span>Memory</span>
          </button>
          <button
            className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
            title="Settings"
          >
            <Settings size={13} />
            <span>Settings</span>
          </button>
        </nav>
      </header>

      {/* Main Panel Content */}
      <main className="app-content">
        {activeTab === 'chat' && <ChatView />}
        {activeTab === 'memory' && <MemoryPanel />}
        {activeTab === 'settings' && <SettingsPanel />}
      </main>

      {/* Utility Footer */}
      <footer className="app-footer">
        <span>Local-first AI assistant</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>Toggle:</span>
          <kbd className="hotkey-badge">⌘ ⇧ Space</kbd>
        </div>
      </footer>
    </div>
  );
};

export default App;
