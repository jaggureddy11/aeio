import React, { useState, useEffect, useRef } from 'react';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useChatStore } from '../../stores/chatStore';
import { useMemoryStore } from '../../stores/memoryStore';
import {
  Layers,
  Folder,
  Terminal,
  Code,
  Cpu,
  Box,
  Hash,
  Database,
  Compass,
  Activity,
  Archive,
  ChevronDown,
  ChevronRight,
  Plus,
} from 'lucide-react';

export const WORKSPACE_ICONS = [
  { id: 'layers', icon: Layers },
  { id: 'folder', icon: Folder },
  { id: 'terminal', icon: Terminal },
  { id: 'code', icon: Code },
  { id: 'cpu', icon: Cpu },
  { id: 'box', icon: Box },
  { id: 'hash', icon: Hash },
  { id: 'database', icon: Database },
  { id: 'compass', icon: Compass },
  { id: 'activity', icon: Activity },
];

export const renderWorkspaceIcon = (iconKey?: string | null, size = 12) => {
  switch (iconKey) {
    case 'folder':
      return <Folder size={size} />;
    case 'terminal':
      return <Terminal size={size} />;
    case 'code':
      return <Code size={size} />;
    case 'cpu':
      return <Cpu size={size} />;
    case 'box':
      return <Box size={size} />;
    case 'hash':
      return <Hash size={size} />;
    case 'database':
      return <Database size={size} />;
    case 'compass':
      return <Compass size={size} />;
    case 'activity':
      return <Activity size={size} />;
    case 'layers':
    default:
      return <Layers size={size} />;
  }
};

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
  const [newIcon, setNewIcon] = useState('layers');
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
        title="Switch workspace"
        aria-label={`Current workspace: ${activeWorkspace?.name || 'General'}. Click to switch workspace.`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <span className="workspace-badge-icon">
          {renderWorkspaceIcon(activeWorkspace?.icon, 11)}
        </span>
        <span className="workspace-badge-name">{activeWorkspace?.name || 'General'}</span>
        <ChevronDown
          size={11}
          className={`workspace-chevron ${isOpen ? 'open' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="workspace-dropdown-panel animate-fadeIn" role="dialog" aria-label="Workspace Manager">
          <div className="workspace-dropdown-header">
            <span className="workspace-dropdown-title">Workspaces</span>
            {!isCreating && (
              <button
                type="button"
                className="workspace-add-btn"
                onClick={() => setIsCreating(true)}
                aria-label="Create new workspace"
              >
                <Plus size={10} />
                <span>New</span>
              </button>
            )}
          </div>

          {isCreating ? (
            <form onSubmit={handleCreate} className="workspace-create-form" aria-label="Create workspace form">
              <div className="workspace-create-field">
                <label htmlFor="ws-name-input">Name</label>
                <input
                  id="ws-name-input"
                  type="text"
                  autoFocus
                  placeholder="e.g. Engine, Client Alpha"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="workspace-input"
                  aria-label="New workspace name"
                />
              </div>

              <div className="workspace-create-field">
                <label>Icon</label>
                <div className="workspace-icon-picker" role="radiogroup" aria-label="Choose workspace icon">
                  {WORKSPACE_ICONS.map((item) => {
                    const IconComp = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`workspace-icon-btn ${newIcon === item.id ? 'selected' : ''}`}
                        onClick={() => setNewIcon(item.id)}
                        title={item.id}
                        aria-label={`Icon ${item.id}`}
                        aria-pressed={newIcon === item.id}
                      >
                        <IconComp size={12} />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="workspace-create-field">
                <label htmlFor="ws-desc-input">Description (optional)</label>
                <input
                  id="ws-desc-input"
                  type="text"
                  placeholder="Scope or goal..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="workspace-input"
                  aria-label="New workspace description"
                />
              </div>

              <div className="workspace-create-actions">
                <button
                  type="button"
                  className="workspace-btn-cancel"
                  onClick={() => setIsCreating(false)}
                  aria-label="Cancel workspace creation"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newName.trim()}
                  className="workspace-btn-submit"
                  aria-label="Create workspace"
                >
                  Create
                </button>
              </div>
            </form>
          ) : (
            <div className="workspace-list" role="list" aria-label="Workspaces list">
              {activeList.map((ws) => {
                const isActive = ws.id === activeWorkspace?.id;
                return (
                  <div
                    key={ws.id}
                    role="button"
                    tabIndex={0}
                    className={`workspace-list-item ${isActive ? 'active' : ''}`}
                    onClick={() => handleSelectWorkspace(ws.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelectWorkspace(ws.id);
                      }
                    }}
                    aria-label={`Switch to workspace ${ws.name}${isActive ? ' (active)' : ''}`}
                  >
                    <span className="ws-item-icon">{renderWorkspaceIcon(ws.icon, 12)}</span>
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
                          aria-label={`Archive workspace ${ws.name}`}
                          onClick={(e) => handleArchive(e, ws.id)}
                        >
                          <Archive size={11} />
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
                    aria-expanded={showArchived}
                    aria-label={`Toggle archived workspaces (${archivedList.length})`}
                  >
                    <ChevronRight
                      size={11}
                      className={`archive-chevron ${showArchived ? 'open' : ''}`}
                    />
                    <span>Archived ({archivedList.length})</span>
                  </button>

                  {showArchived && (
                    <div className="ws-archived-list">
                      {archivedList.map((ws) => (
                        <div key={ws.id} className="workspace-list-item archived">
                          <span className="ws-item-icon">{renderWorkspaceIcon(ws.icon, 12)}</span>
                          <div className="ws-item-info">
                            <div className="ws-item-name">{ws.name}</div>
                          </div>
                          <button
                            type="button"
                            className="ws-restore-btn"
                            title="Restore workspace"
                            aria-label={`Restore workspace ${ws.name}`}
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

