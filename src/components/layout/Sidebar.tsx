import React, { useState, useRef, useEffect } from 'react';
import { AeLogo } from '../common/AeLogo';
import { useSettingsStore } from '../../stores/settingsStore';
import { useChatStore, ChatSession } from '../../stores/chatStore';
import { useMemoryStore } from '../../stores/memoryStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { WorkspaceSwitcher } from '../workspace/WorkspaceSwitcher';
import {
  MessageSquare,
  Brain,
  Settings,
  Plus,
  PanelLeftClose,
  ShieldCheck,
  Trash2,
  Pencil,
  Check,
  X,
  Search,
  User,
  ChevronsUpDown,
} from 'lucide-react';

interface Props {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenSettings: () => void;
}

export type DateGroupLabel = 'Today' | 'Yesterday' | 'Previous 7 Days' | 'Previous 30 Days' | 'Older';

export interface DateGroupedSessions {
  label: DateGroupLabel;
  sessions: ChatSession[];
}

export function groupSessionsByDate(sessions: ChatSession[]): DateGroupedSessions[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const startOfSevenDays = startOfToday - 6 * 86400000;
  const startOfThirtyDays = startOfToday - 29 * 86400000;

  const groups: Record<DateGroupLabel, ChatSession[]> = {
    'Today': [],
    'Yesterday': [],
    'Previous 7 Days': [],
    'Previous 30 Days': [],
    'Older': [],
  };

  for (const session of sessions) {
    const ts = session.updatedAt || session.createdAt || 0;
    if (ts >= startOfToday) {
      groups['Today'].push(session);
    } else if (ts >= startOfYesterday) {
      groups['Yesterday'].push(session);
    } else if (ts >= startOfSevenDays) {
      groups['Previous 7 Days'].push(session);
    } else if (ts >= startOfThirtyDays) {
      groups['Previous 30 Days'].push(session);
    } else {
      groups['Older'].push(session);
    }
  }

  const order: DateGroupLabel[] = ['Today', 'Yesterday', 'Previous 7 Days', 'Previous 30 Days', 'Older'];
  return order
    .filter((label) => groups[label].length > 0)
    .map((label) => ({ label, sessions: groups[label] }));
}

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return '';
  const now = Date.now();
  const diffSec = Math.floor((now - timestamp) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getProviderDisplayName(provider: string, ollamaModel?: string): string {
  switch (provider) {
    case 'qwen-coder': return 'Qwen 2.5 Coder';
    case 'claude': return 'Claude 3.5 Sonnet';
    case 'gemini': return 'Gemini 2.5 Flash';
    case 'openai': return 'GPT-4o';
    case 'bedrock': return 'AWS Bedrock';
    case 'aeio-free': return 'Claude 3.5 Haiku';
    case 'ollama': return ollamaModel || 'Local Ollama';
    default: return 'Active Engine';
  }
}

function getProviderShortName(provider: string): string {
  switch (provider) {
    case 'bedrock': return 'Bedrock';
    case 'claude': return 'Claude';
    case 'gemini': return 'Gemini';
    case 'openai': return 'GPT-4o';
    case 'qwen-coder': return 'Qwen';
    case 'ollama': return 'Ollama';
    case 'aeio-free': return 'Haiku';
    default: return 'Engine';
  }
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

  const {
    sessions,
    activeSessionId,
    createNewSession,
    switchSession,
    deleteSession,
    renameSession,
  } = useChatStore();

  const { memories } = useMemoryStore();
  const { activeWorkspace } = useWorkspaceStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const editInputRef = useRef<HTMLInputElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editingSessionId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingSessionId]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsProfileOpen(false);
      }
    }
    if (isProfileOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isProfileOpen]);

  const handleStartNewChat = () => {
    setActiveTab('chat');
    createNewSession();
  };

  const handleStartRename = (e: React.MouseEvent, session: ChatSession) => {
    e.stopPropagation();
    setEditingSessionId(session.id);
    setEditingTitle(session.title || 'Untitled chat');
  };

  const handleSaveRename = (sessionId: string) => {
    if (editingTitle.trim()) {
      renameSession(sessionId, editingTitle.trim());
    }
    setEditingSessionId(null);
    setEditingTitle('');
  };

  const handleCancelRename = () => {
    setEditingSessionId(null);
    setEditingTitle('');
  };

  // Filter sessions based on search query
  const filteredSessions = sessions.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    if (s.title && s.title.toLowerCase().includes(q)) return true;
    return s.messages.some((m) => m.content && m.content.toLowerCase().includes(q));
  });

  const grouped = groupSessionsByDate(filteredSessions);

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
            title="Start new chat (⌘K)"
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
        </div>

        {/* Collapsed Profile Icon at bottom */}
        <div className="sidebar-mini-footer" ref={profileMenuRef}>
          {isProfileOpen && (
            <div className="sidebar-profile-menu mini animate-fadeIn">
              <div className="profile-menu-header">
                <div className="profile-menu-avatar">
                  <User size={15} />
                </div>
                <div className="profile-menu-user-text">
                  <span className="profile-menu-username">User Profile</span>
                  <span className="profile-menu-status">{activeWorkspace?.name || 'Default'}</span>
                </div>
              </div>
              <div className="profile-menu-divider" />
              <div className="profile-menu-section">
                <div className="profile-menu-section-label">WORKSPACE</div>
                <WorkspaceSwitcher />
              </div>
              <div className="profile-menu-divider" />
              <div className="profile-menu-actions">
                <button
                  type="button"
                  className={`profile-menu-item ${activeTab === 'memory' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('memory');
                    setIsProfileOpen(false);
                  }}
                >
                  <Brain size={14} className="profile-item-icon" />
                  <span className="profile-item-text">Memory Vault</span>
                  {memories.length > 0 && (
                    <span className="profile-item-badge">{memories.length}</span>
                  )}
                </button>
                <button
                  type="button"
                  className={`profile-menu-item ${activeTab === 'settings' ? 'active' : ''}`}
                  onClick={() => {
                    onOpenSettings();
                    setIsProfileOpen(false);
                  }}
                >
                  <Settings size={14} className="profile-item-icon" />
                  <span className="profile-item-text">Settings & Keys</span>
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            className={`sidebar-mini-profile-btn ${isProfileOpen ? 'active' : ''}`}
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            title="User Profile & Settings"
            aria-label="User profile"
          >
            <User size={15} />
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
            <span className="sidebar-brand-sub">Local Assistant</span>
          </div>
        </div>

        <button
          type="button"
          className="sidebar-toggle-btn"
          onClick={onToggleCollapse}
          title="Collapse sidebar (⌘B)"
          aria-label="Collapse sidebar"
        >
          <PanelLeftClose size={15} strokeWidth={1.8} />
        </button>
      </div>

      {/* Top Action Bar: Start New Chat + Search */}
      <div className="sidebar-top-section">
        <button
          type="button"
          className="sidebar-new-chat-btn"
          onClick={handleStartNewChat}
          title="Start new chat (⌘K)"
        >
          <div className="new-chat-btn-left">
            <Plus size={14} strokeWidth={2.2} />
            <span>Start new chat</span>
          </div>
          <kbd className="new-chat-shortcut">⌘K</kbd>
        </button>

        {/* Compact Search Box */}
        <div className="sidebar-search-box">
          <Search size={12} className="sidebar-search-icon" />
          <input
            type="text"
            className="sidebar-search-input"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search recent chats"
          />
          {searchQuery && (
            <button
              type="button"
              className="sidebar-search-clear"
              onClick={() => setSearchQuery('')}
              title="Clear search"
              aria-label="Clear search"
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Recent Chats Section - Dominant Scrollable Explorer (flex: 1) */}
      <div className="sidebar-history-section">
        <div className="sidebar-section-header">
          <span className="sidebar-section-label">RECENT CHATS</span>
          {sessions.length > 0 && (
            <span className="sidebar-section-count">
              {searchQuery ? `${filteredSessions.length} of ${sessions.length}` : sessions.length}
            </span>
          )}
        </div>

        <div className="sidebar-recent-chats-list">
          {sessions.length === 0 ? (
            <div className="sidebar-chats-empty">
              <MessageSquare size={13} className="empty-icon" />
              <span>No chat history</span>
              <button
                type="button"
                className="sidebar-empty-action-btn"
                onClick={handleStartNewChat}
              >
                Start your first chat
              </button>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="sidebar-chats-empty">
              <Search size={13} className="empty-icon" />
              <span>No chats matching "{searchQuery}"</span>
              <button
                type="button"
                className="sidebar-empty-clear-btn"
                onClick={() => setSearchQuery('')}
              >
                Clear filter
              </button>
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.label} className="sidebar-date-group">
                <div className="sidebar-date-group-header">{group.label}</div>
                {group.sessions.map((session) => {
                  const isActive = activeTab === 'chat' && session.id === activeSessionId;
                  const isEditing = editingSessionId === session.id;
                  const msgCount = session.messages.length;
                  const timeStr = formatRelativeTime(session.updatedAt);

                  return (
                    <div
                      key={session.id}
                      className={`sidebar-chat-item ${isActive ? 'active' : ''}`}
                      onClick={() => {
                        if (!isEditing) {
                          setActiveTab('chat');
                          switchSession(session.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      {isEditing ? (
                        <div
                          className="chat-item-edit-row"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            ref={editInputRef}
                            type="text"
                            className="chat-item-edit-input"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveRename(session.id);
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                handleCancelRename();
                              }
                            }}
                            aria-label="Edit chat title"
                          />
                          <button
                            type="button"
                            className="chat-item-action-btn check"
                            onClick={() => handleSaveRename(session.id)}
                            title="Save title"
                          >
                            <Check size={12} />
                          </button>
                          <button
                            type="button"
                            className="chat-item-action-btn cancel"
                            onClick={handleCancelRename}
                            title="Cancel"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <MessageSquare size={13} strokeWidth={1.8} className="chat-item-icon" />
                          <div className="chat-item-text">
                            <span className="chat-item-title" title={session.title}>
                              {session.title || 'New chat'}
                            </span>
                            <span className="chat-item-meta">
                              {msgCount === 0 ? 'Empty chat' : `${msgCount} msg${msgCount === 1 ? '' : 's'}`}
                              {timeStr ? ` • ${timeStr}` : ''}
                            </span>
                          </div>
                          <div className="chat-item-actions">
                            <button
                              type="button"
                              className="chat-item-action-btn"
                              onClick={(e) => handleStartRename(e, session)}
                              title="Rename chat"
                              aria-label="Rename chat"
                            >
                              <Pencil size={11} />
                            </button>
                            <button
                              type="button"
                              className="chat-item-action-btn delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteSession(session.id);
                              }}
                              title="Delete chat"
                              aria-label="Delete chat"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Bundled User Profile Trigger & Menu at Bottom (Replaces separate clutter) */}
      <div className="sidebar-profile-wrap" ref={profileMenuRef}>
        {isProfileOpen && (
          <div className="sidebar-profile-menu animate-fadeIn" role="menu">
            {/* Header: User & Workspace Identity */}
            <div className="profile-menu-header">
              <div className="profile-menu-avatar">
                <User size={15} />
              </div>
              <div className="profile-menu-user-text">
                <span className="profile-menu-username">Aeio User</span>
                <span className="profile-menu-status">Personal Workspace</span>
              </div>
              <span className="profile-menu-badge">Local</span>
            </div>

            <div className="profile-menu-divider" />

            {/* Bundled Workspace Switcher */}
            <div className="profile-menu-section">
              <div className="profile-menu-section-label">WORKSPACE</div>
              <WorkspaceSwitcher />
            </div>

            <div className="profile-menu-divider" />

            {/* Bundled Nav Options */}
            <div className="profile-menu-actions">
              <button
                type="button"
                className={`profile-menu-item ${activeTab === 'memory' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('memory');
                  setIsProfileOpen(false);
                }}
              >
                <Brain size={14} className="profile-item-icon" />
                <span className="profile-item-text">Memory Vault</span>
                {memories.length > 0 && (
                  <span className="profile-item-badge">{memories.length}</span>
                )}
              </button>

              <button
                type="button"
                className={`profile-menu-item ${activeTab === 'settings' ? 'active' : ''}`}
                onClick={() => {
                  onOpenSettings();
                  setIsProfileOpen(false);
                }}
              >
                <Settings size={14} className="profile-item-icon" />
                <span className="profile-item-text">Settings & Keys</span>
              </button>
            </div>

            <div className="profile-menu-divider" />

            {/* Bundled Engine & Encryption Footer */}
            <div className="profile-menu-footer">
              <button
                type="button"
                className="profile-engine-row"
                onClick={() => {
                  onOpenSettings();
                  setIsProfileOpen(false);
                }}
                title="Configure model engine"
              >
                <div className="profile-engine-left">
                  <span className="engine-status-indicator" />
                  <span className="profile-engine-name">{getProviderDisplayName(activeProvider, ollamaModel)}</span>
                </div>
                <span className="profile-engine-action">Configure</span>
              </button>

              <div className="profile-security-row">
                <div className="profile-security-left">
                  <ShieldCheck size={11} className="privacy-icon" />
                  <span>Memory encrypted</span>
                </div>
                <kbd className="profile-hotkey">{hotkey === 'CommandOrControl+Shift+Space' ? '⌘⇧Space' : hotkey}</kbd>
              </div>
            </div>
          </div>
        )}

        {/* User Profile Card Button */}
        <button
          type="button"
          className={`sidebar-profile-card ${isProfileOpen ? 'active' : ''}`}
          onClick={() => setIsProfileOpen(!isProfileOpen)}
          title="User Profile & Settings"
          aria-expanded={isProfileOpen}
          aria-haspopup="true"
        >
          <div className="profile-card-avatar">
            <User size={14} />
            <span className="profile-card-status-dot" />
          </div>
          <div className="profile-card-text">
            <span className="profile-card-name">User</span>
            <span className="profile-card-sub">
              {activeWorkspace?.name || 'Default'} • {getProviderShortName(activeProvider)}
            </span>
          </div>
          <ChevronsUpDown size={13} className="profile-card-chevron" />
        </button>
      </div>
    </aside>
  );
};
