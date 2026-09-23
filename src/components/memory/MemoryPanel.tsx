import React, { useEffect, useState } from 'react';
import { useMemoryStore } from '../../stores/memoryStore';
import { MemoryItem } from './MemoryItem';
import { MemoryCategory } from '../../lib/ipc';
import { Brain, Plus, Search, X } from 'lucide-react';

const CATEGORIES: Array<{ id: MemoryCategory | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'fact', label: 'Facts' },
  { id: 'preference', label: 'Preferences' },
  { id: 'project', label: 'Projects' },
  { id: 'person', label: 'People' },
];

export const MemoryPanel: React.FC = () => {
  const {
    memories,
    isLoading,
    activeCategory,
    searchQuery,
    loadMemories,
    createMemory,
    setActiveCategory,
    setSearchQuery,
  } = useMemoryStore();

  const [isAdding, setIsAdding] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<MemoryCategory>('fact');

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  const handleCreate = async () => {
    if (!newContent.trim()) return;
    await createMemory(newContent, newCategory);
    setNewContent('');
    setIsAdding(false);
  };

  return (
    <div className="memory-panel-container">
      {/* Top Search & Filter Bar */}
      <div className="memory-toolbar">
        <div className="memory-search-wrapper">
          <Search size={13} className="search-icon" />
          <input
            type="text"
            className="memory-search-input"
            placeholder="Search memories (hybrid exact & semantic)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="clear-search-btn"
              onClick={() => setSearchQuery('')}
            >
              <X size={12} />
            </button>
          )}
        </div>

        <button
          className="add-memory-btn"
          onClick={() => setIsAdding(!isAdding)}
          title="Add a new memory"
        >
          <Plus size={13} />
          <span>New Memory</span>
        </button>
      </div>

      {/* Category Filter Pills */}
      <div className="category-pills">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            className={`category-pill ${activeCategory === cat.id ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Add Memory Card (if open) */}
      {isAdding && (
        <div className="add-memory-card">
          <div className="add-memory-header">
            <span className="add-title">Add Structured Memory</span>
            <select
              className="category-select"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as MemoryCategory)}
            >
              <option value="fact">Fact</option>
              <option value="preference">Preference</option>
              <option value="project">Project</option>
              <option value="person">Person</option>
            </select>
          </div>

          <textarea
            className="add-memory-textarea"
            placeholder="e.g. Prefers TypeScript over JavaScript, works at Acme Corp, likes concise answers..."
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            rows={2}
            autoFocus
          />

          <div className="add-memory-actions">
            <button
              className="btn-cancel"
              onClick={() => {
                setNewContent('');
                setIsAdding(false);
              }}
            >
              Cancel
            </button>
            <button
              className="btn-save"
              onClick={handleCreate}
              disabled={!newContent.trim()}
            >
              Save Memory
            </button>
          </div>
        </div>
      )}

      {/* Memory List Area */}
      <div className="memory-list-area">
        {isLoading && memories.length === 0 ? (
          <div className="memory-loading">Loading memory store...</div>
        ) : memories.length === 0 ? (
          <div className="memory-empty-state">
            <Brain size={36} className="empty-brain-icon" />
            <h4>No memories found</h4>
            <p>
              {searchQuery
                ? `No memories matched "${searchQuery}".`
                : 'Aeio learns facts, preferences, and projects as you chat, or you can add them manually above.'}
            </p>
            {!isAdding && !searchQuery && (
              <button
                className="starter-chip"
                onClick={() => setIsAdding(true)}
              >
                + Add your first memory
              </button>
            )}
          </div>
        ) : (
          <div className="memory-cards-grid">
            {memories.map((mem) => (
              <MemoryItem key={mem.id} memory={mem} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MemoryPanel;
