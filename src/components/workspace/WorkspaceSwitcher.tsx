import React, { useState, useEffect, useRef } from 'react';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useChatStore } from '../../stores/chatStore';
import { useMemoryStore } from '../../stores/memoryStore';

const ICONS = ['🌐', '💼', '🚀', '🔬', '📚', '🎨', '💡', '🏠', '⚡', '🛠️'];

export const WorkspaceSwitcher: React.FC = () => {
  const {
    workspaces,
    activeWorkspace,
    loadWorkspaces,
    switchWorkspace,
    createWorkspace,
    archiveWorkspace,
  } = useWorkspaceStore();

  const { initChatHistory } = useChatStore();
  const { loadMemories } = useMemoryStore();

  const [isOpen, setIsOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('💼');
  const [newDesc, setNewDesc] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadWorkspaces(showArchived);
  }, [loadWorkspaces, showArchived]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsCreating(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelectWorkspace = async (id: string) => {
    if (id === activeWorkspace?.id) {
      setIsOpen(false);
      return;
    }
    await switchWorkspace(id);
    await initChatHistory(id);
    await loadMemories();
    setIsOpen(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const created = await createWorkspace(newName.trim(), newIcon, newDesc.trim() || undefined);
      await initChatHistory(created.id);
      await loadMemories();
      setNewName('');
      setNewDesc('');
      setIsCreating(false);
      setIsOpen(false);
    } catch (err) {
      console.error('Failed to create workspace:', err);
    }
  };

  const handleArchive = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (id === 'default') return;
    if (confirm('Archive this workspace? Messages and memories will be safely preserved.')) {
      await archiveWorkspace(id);
      const active = useWorkspaceStore.getState().activeWorkspace;
      if (active) {
        await initChatHistory(active.id);
        await loadMemories();
      }
    }
  };

  const activeList = workspaces.filter((w) => !w.is_archived);
  const archivedList = workspaces.filter((w) => w.is_archived);

  return (
    <div className="workspace-switcher-container" ref={dropdownRef}>
      <button
        type="button"
        className="workspace-badge-btn"
        onClick={() => setIsOpen(!isOpen)}
        title="Switch or manage project workspaces"
      >
        <span className="workspace-badge-icon">{activeWorkspace?.icon || '🌐'}</span>
        <span className="workspace-badge-name">{activeWorkspace?.name || 'General'}</span>
        <svg
          className={`workspace-chevron ${isOpen ? 'open' : ''}`}
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div className="workspace-dropdown-panel animate-fadeIn">
          <div className="workspace-dropdown-header">
            <span className="workspace-dropdown-title">Workspaces</span>
            {!isCreating && (
              <button
                type="button"
                className="workspace-add-btn"
                onClick={() => setIsCreating(true)}
              >
                + New
              </button>
            )}
          </div>

          {isCreating ? (
            <form onSubmit={handleCreate} className="workspace-create-form">
              <div className="workspace-create-field">
                <label>Name</label>
                <input
                  type="text"
                  autoFocus
                  placeholder="e.g. Aeio v2, Client Alpha"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="workspace-input"
                />
              </div>

              <div className="workspace-create-field">
                <label>Icon</label>
                <div className="workspace-icon-picker">
                  {ICONS.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      className={`workspace-icon-btn ${newIcon === icon ? 'selected' : ''}`}
                      onClick={() => setNewIcon(icon)}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              <div className="workspace-create-field">
                <label>Description (optional)</label>
                <input
                  type="text"
                  placeholder="Scope or goal..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="workspace-input"
                />
              </div>

              <div className="workspace-create-actions">
                <button
                  type="button"
                  className="workspace-btn-cancel"
                  onClick={() => setIsCreating(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newName.trim()}
                  className="workspace-btn-submit"
                >
                  Create
                </button>
              </div>
            </form>
          ) : (
            <div className="workspace-list">
              {activeList.map((ws) => {
                const isActive = ws.id === activeWorkspace?.id;
                return (
                  <div
                    key={ws.id}
                    className={`workspace-list-item ${isActive ? 'active' : ''}`}
                    onClick={() => handleSelectWorkspace(ws.id)}
                  >
                    <span className="ws-item-icon">{ws.icon || '📁'}</span>
                    <div className="ws-item-info">
                      <div className="ws-item-name">{ws.name}</div>
                      {ws.description && (
                        <div className="ws-item-desc">{ws.description}</div>
                      )}
                    </div>

                    <div className="ws-item-actions">
                      {isActive && <span className="ws-active-tag">Active</span>}
                      {ws.id !== 'default' && (
                        <button
                          type="button"
                          className="ws-archive-btn"
                          title="Archive workspace"
                          onClick={(e) => handleArchive(e, ws.id)}
                        >
                          📦
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {archivedList.length > 0 && (
                <div className="workspace-archived-section">
                  <button
                    type="button"
                    className="ws-archived-toggle"
                    onClick={() => setShowArchived(!showArchived)}
                  >
                    <span>{showArchived ? '▾' : '▸'} Archived ({archivedList.length})</span>
                  </button>

                  {showArchived && (
                    <div className="ws-archived-list">
                      {archivedList.map((ws) => (
                        <div key={ws.id} className="workspace-list-item archived">
                          <span className="ws-item-icon">{ws.icon || '📁'}</span>
                          <div className="ws-item-info">
                            <div className="ws-item-name">{ws.name}</div>
                          </div>
                          <button
                            type="button"
                            className="ws-restore-btn"
                            title="Restore workspace"
                            onClick={async () => {
                              await archiveWorkspace(ws.id);
                              await loadWorkspaces(true);
                            }}
                          >
                            Restore
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
