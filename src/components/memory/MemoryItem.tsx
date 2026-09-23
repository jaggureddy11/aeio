import React, { useState } from 'react';
import { MemoryCategory, MemoryRecord } from '../../lib/ipc';
import { useMemoryStore } from '../../stores/memoryStore';
import { Edit2, Trash2, Check, X } from 'lucide-react';

interface Props {
  memory: MemoryRecord;
}

const CATEGORY_COLORS: Record<MemoryCategory, { bg: string; text: string; border: string }> = {
  fact: { bg: 'rgba(59, 130, 246, 0.12)', text: '#60a5fa', border: 'rgba(59, 130, 246, 0.3)' },
  preference: { bg: 'rgba(245, 158, 11, 0.12)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' },
  project: { bg: 'rgba(16, 185, 129, 0.12)', text: '#34d399', border: 'rgba(16, 185, 129, 0.3)' },
  person: { bg: 'rgba(168, 85, 247, 0.12)', text: '#c084fc', border: 'rgba(168, 85, 247, 0.3)' },
};

export const MemoryItem: React.FC<Props> = ({ memory }) => {
  const { editMemory, removeMemory } = useMemoryStore();
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(memory.content);
  const [category, setCategory] = useState<MemoryCategory>(memory.category);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const handleSave = async () => {
    if (!content.trim()) return;
    await editMemory(memory.id, content, category);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    await removeMemory(memory.id);
  };

  const style = CATEGORY_COLORS[memory.category] || CATEGORY_COLORS.fact;

  if (isEditing) {
    return (
      <div className="memory-card editing">
        <div className="memory-edit-header">
          <select
            className="category-select"
            value={category}
            onChange={(e) => setCategory(e.target.value as MemoryCategory)}
          >
            <option value="fact">Fact</option>
            <option value="preference">Preference</option>
            <option value="project">Project</option>
            <option value="person">Person</option>
          </select>

          <div className="edit-actions">
            <button className="icon-btn save" onClick={handleSave} title="Save changes">
              <Check size={13} />
            </button>
            <button
              className="icon-btn cancel"
              onClick={() => {
                setContent(memory.content);
                setCategory(memory.category);
                setIsEditing(false);
              }}
              title="Cancel"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        <textarea
          className="memory-edit-textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          autoFocus
        />
      </div>
    );
  }

  return (
    <div className="memory-card">
      <div className="memory-card-header">
        <span
          className="memory-category-tag"
          style={{
            backgroundColor: style.bg,
            color: style.text,
            borderColor: style.border,
          }}
        >
          {memory.category}
        </span>

        <div className="memory-card-actions">
          <button
            className="icon-btn edit"
            onClick={() => setIsEditing(true)}
            title="Edit memory"
          >
            <Edit2 size={12} />
          </button>

          {isConfirmingDelete ? (
            <div className="delete-confirm-group">
              <span className="confirm-text">Delete?</span>
              <button className="confirm-yes" onClick={handleDelete}>
                Yes
              </button>
              <button
                className="confirm-no"
                onClick={() => setIsConfirmingDelete(false)}
              >
                No
              </button>
            </div>
          ) : (
            <button
              className="icon-btn delete"
              onClick={() => setIsConfirmingDelete(true)}
              title="Delete memory"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      <p className="memory-card-content">{memory.content}</p>

      <div className="memory-card-footer">
        <span>Updated {new Date(memory.updated_at).toLocaleDateString()}</span>
      </div>
    </div>
  );
};
