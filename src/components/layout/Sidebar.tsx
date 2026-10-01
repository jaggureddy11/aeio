import React from 'react';
import { AeLogo } from '../common/AeLogo';
import { useSettingsStore } from '../../stores/settingsStore';
import { useChatStore } from '../../stores/chatStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import {
  MessageSquare,
  Brain,
  Settings,
  Plus,
  PanelLeftClose,
  ShieldCheck,
  Layers,
  Trash2,
} from 'lucide-react';

interface Props {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenSettings: () => void;
}

export const Sidebar: React.FC<Props> = ({
  collapsed,
  onToggleCollapse,
  onOpenSettings,
}) => {
  const {
    activeTab,
    setActiveTab,
    activeProvider,
    ollamaModel,
    hotkey,
  } = useSettingsStore();

  const { messages, clearMessages } = useChatStore();
  const { activeWorkspace } = useWorkspaceStore();

  const handleStartNewChat = () => {
    setActiveTab('chat');
    clearMessages();
  };

  if (collapsed) {
    return (
      <aside className="app-sidebar collapsed">
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={onToggleCollapse}
          title="Expand sidebar (⌘B)"
          aria-label="Expand sidebar"
        >
          <AeLogo height={16} />
        </button>

        <div className="sidebar-mini-nav">
          <button
            type="button"
            className="sidebar-mini-action primary"
            onClick={handleStartNewChat}
            title="Start new chat"
          >
            <Plus size={16} />
          </button>

          <button
            type="button"
            className={`sidebar-mini-action ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
            title="Chat view"
          >
            <MessageSquare size={16} />
          </button>

          <button
            type="button"
            className={`sidebar-mini-action ${activeTab === 'memory' ? 'active' : ''}`}
            onClick={() => setActiveTab('memory')}
            title="Memory store"
          >
            <Brain size={16} />
          </button>

          <button
            type="button"
            className={`sidebar-mini-action ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
            title="Settings"
          >
            <Settings size={16} />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="app-sidebar" role="navigation" aria-label="Main sidebar">
      {/* Sidebar Header */}
      <div className="sidebar-header" data-tauri-drag-region>
        <div className="sidebar-brand-group">
          <div className="brand-badge-frame">
            <AeLogo height={14} />
          </div>
          <div className="brand-text-col">
            <span className="sidebar-brand-name">aeio</span>
            <span className="sidebar-brand-sub">local-first assistant</span>
          </div>
        </div>

        <button
          type="button"
          className="sidebar-toggle-btn"
          onClick={onToggleCollapse}
          title="Collapse sidebar (⌘B)"
          aria-label="Collapse sidebar"
        >
          <PanelLeftClose size={15} />
        </button>
      </div>

      {/* Primary Action: New Chat */}
      <div className="sidebar-primary-action-wrap">
        <button
          type="button"
          className="sidebar-new-chat-btn"
          onClick={handleStartNewChat}
        >
          <div className="new-chat-btn-left">
            <Plus size={15} />
            <span>Start new chat</span>
          </div>
          <kbd className="new-chat-shortcut">⌘K</kbd>
        </button>
      </div>

      {/* Main Navigation Section */}
      <div className="sidebar-nav-section">
        <div className="sidebar-section-label">VIEWS</div>
        <button
          type="button"
          className={`sidebar-nav-item ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          <MessageSquare size={14} className="nav-item-icon" />
          <span className="nav-item-label">Conversation</span>
          {messages.length > 0 && (
            <span className="nav-item-badge">{messages.length}</span>
          )}
        </button>

        <button
          type="button"
          className={`sidebar-nav-item ${activeTab === 'memory' ? 'active' : ''}`}
          onClick={() => setActiveTab('memory')}
        >
          <Brain size={14} className="nav-item-icon" />
          <span className="nav-item-label">Memory Vault</span>
        </button>

        <button
          type="button"
          className={`sidebar-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <Settings size={14} className="nav-item-icon" />
          <span className="nav-item-label">Settings & Keys</span>
        </button>
      </div>

      {/* Current Workspace Pill */}
      <div className="sidebar-nav-section">
        <div className="sidebar-section-label">WORKSPACE</div>
        <div className="sidebar-workspace-chip">
          <Layers size={13} className="ws-chip-icon" />
          <span className="ws-chip-name">{activeWorkspace?.name || 'General Workspace'}</span>
        </div>
      </div>

      {/* Recent Conversation Quick Actions */}
      {messages.length > 0 && (
        <div className="sidebar-nav-section">
          <div className="sidebar-section-label">ACTIVE CHAT</div>
          <div className="sidebar-recent-card">
            <div className="recent-card-text">
              <span className="recent-title">
                {messages[0]?.content?.slice(0, 28) || 'Current conversation'}
                {messages[0]?.content && messages[0].content.length > 28 ? '...' : ''}
              </span>
              <span className="recent-time">
                {messages.length} message{messages.length === 1 ? '' : 's'}
              </span>
            </div>
            <button
              type="button"
              className="recent-clear-btn"
              onClick={clearMessages}
              title="Clear conversation"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Sidebar Footer with Engine & Privacy Badge */}
      <div className="sidebar-footer">
        <button
          type="button"
          className="sidebar-engine-badge"
          onClick={onOpenSettings}
          title="Configure model engine and API keys in settings"
        >
          <div className="engine-left">
            <span className="engine-status-indicator" />
            <span className="engine-name">
              {activeProvider === 'qwen-coder' && 'Qwen 2.5 Coder'}
              {activeProvider === 'claude' && 'Claude 3.5 Sonnet'}
              {activeProvider === 'gemini' && 'Gemini 2.5 Flash'}
              {activeProvider === 'openai' && 'GPT-4o'}
              {activeProvider === 'aeio-free' && 'Claude 3.5 Haiku'}
              {activeProvider === 'ollama' && (ollamaModel || 'Local Ollama')}
              {!['qwen-coder', 'claude', 'gemini', 'openai', 'aeio-free', 'ollama'].includes(activeProvider) && 'Active Engine'}
            </span>
          </div>
          <span className="engine-manage-link">Settings</span>
        </button>

        <div className="sidebar-privacy-note">
          <ShieldCheck size={11} className="privacy-icon" />
          <span>Local memory encrypted</span>
          <span className="privacy-hotkey">{hotkey === 'CommandOrControl+Shift+Space' ? '⌘⇧Space' : hotkey}</span>
        </div>
      </div>
    </aside>
  );
};
