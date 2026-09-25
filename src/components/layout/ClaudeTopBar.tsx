import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, ArrowUp, Sun, Moon, Laptop, Plus, Trash2, Brain, Settings } from 'lucide-react';
import { AeLogo } from '../common/AeLogo';
import { useSettingsStore, ThemeMode } from '../../stores/settingsStore';

interface Props {
  title?: string;
  hasMessages: boolean;
  onNewChat: () => void;
  onClearChat: () => void;
  onOpenSettings?: () => void;
  onOpenMemory?: () => void;
  onActionClick?: () => void;
}

export const ClaudeTopBar: React.FC<Props> = ({
  title = 'What can I help you with today?',
  hasMessages,
  onNewChat,
  onClearChat,
  onOpenSettings,
  onOpenMemory,
  onActionClick,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useSettingsStore();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);

  const handleSelectTheme = (mode: ThemeMode) => {
    setTheme(mode);
    setMenuOpen(false);
  };

  return (
    <header className="claude-top-bar" data-tauri-drag-region>
      {/* Left: Brand mark & Title prompt */}
      <div className="top-bar-left">
        <div className="top-bar-brand">
          <AeLogo height={16} />
          <span className="top-bar-title">{title}</span>
        </div>
      </div>

      {/* Middle: Native draggable region */}
      <div className="top-bar-center" data-tauri-drag-region />

      {/* Right: Dropdown menu & Terracotta Action Button */}
      <div className="top-bar-right">
        {/* New Chat Dropdown Button */}
        <div className="top-bar-menu-wrapper" ref={menuRef}>
          <button
            type="button"
            className={`top-bar-capsule-btn ${menuOpen ? 'active' : ''}`}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-expanded={menuOpen}
            aria-label="New chat and options menu"
          >
            <span>New Chat</span>
            <ChevronDown size={13} className={`chevron-icon ${menuOpen ? 'open' : ''}`} />
          </button>

          {menuOpen && (
            <div className="top-bar-dropdown" role="menu">
              <button
                type="button"
                className="dropdown-item"
                onClick={() => {
                  onNewChat();
                  setMenuOpen(false);
                }}
              >
                <Plus size={14} className="dropdown-item-icon" />
                <span className="dropdown-item-label">New Chat</span>
                <kbd className="dropdown-shortcut">⌘K</kbd>
              </button>

              {hasMessages && (
                <button
                  type="button"
                  className="dropdown-item danger"
                  onClick={() => {
                    onClearChat();
                    setMenuOpen(false);
                  }}
                >
                  <Trash2 size={14} className="dropdown-item-icon" />
                  <span className="dropdown-item-label">Clear Conversation</span>
                </button>
              )}

              {onOpenMemory && (
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    onOpenMemory();
                    setMenuOpen(false);
                  }}
                >
                  <Brain size={14} className="dropdown-item-icon" />
                  <span className="dropdown-item-label">Memory Vault</span>
                  <kbd className="dropdown-shortcut">⌘2</kbd>
                </button>
              )}

              {onOpenSettings && (
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    onOpenSettings();
                    setMenuOpen(false);
                  }}
                >
                  <Settings size={14} className="dropdown-item-icon" />
                  <span className="dropdown-item-label">Settings</span>
                  <kbd className="dropdown-shortcut">⌘3</kbd>
                </button>
              )}

              <div className="dropdown-divider" />

              <div className="dropdown-section-title">Theme</div>

              <button
                type="button"
                className={`dropdown-item ${theme === 'system' ? 'selected' : ''}`}
                onClick={() => handleSelectTheme('system')}
              >
                <Laptop size={14} className="dropdown-item-icon" />
                <span className="dropdown-item-label">System Default</span>
                {theme === 'system' && <Check size={13} className="dropdown-check-icon" />}
              </button>

              <button
                type="button"
                className={`dropdown-item ${theme === 'light' ? 'selected' : ''}`}
                onClick={() => handleSelectTheme('light')}
              >
                <Sun size={14} className="dropdown-item-icon" />
                <span className="dropdown-item-label">Light Theme</span>
                {theme === 'light' && <Check size={13} className="dropdown-check-icon" />}
              </button>

              <button
                type="button"
                className={`dropdown-item ${theme === 'dark' ? 'selected' : ''}`}
                onClick={() => handleSelectTheme('dark')}
              >
                <Moon size={14} className="dropdown-item-icon" />
                <span className="dropdown-item-label">Dark Theme</span>
                {theme === 'dark' && <Check size={13} className="dropdown-check-icon" />}
              </button>
            </div>
          )}
        </div>

        {/* Emerald Brand Action Button (Rounded Square with Upward Arrow) */}
        <button
          type="button"
          className="top-bar-brand-btn"
          onClick={onActionClick || onNewChat}
          title="New Chat or Submit (Return)"
          aria-label="New chat or action"
        >
          <ArrowUp size={16} />
        </button>
      </div>
    </header>
  );
};
