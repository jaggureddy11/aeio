import React, { useState, useEffect } from 'react';
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  Maximize2,
  StopCircle,
} from 'lucide-react';
import {
  globalAutonomousRunner,
  AutonomousTask,
} from '../../lib/agent/autonomousAgent';
import { sendSystemNotification } from '../../lib/ipc';

interface Props {
  onOpenHUD?: () => void;
}

export const BackgroundDock: React.FC<Props> = ({ onOpenHUD }) => {
  const [task, setTask] = useState<AutonomousTask | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    let lastNotifiedTaskId: string | null = null;
    const unsubscribe = globalAutonomousRunner.onTaskUpdate((updatedTask) => {
      setTask(updatedTask);
      if (updatedTask && (updatedTask.status === 'running' || updatedTask.status === 'planning')) {
        setIsDismissed(false);
      }
      if (
        updatedTask &&
        updatedTask.status === 'completed' &&
        lastNotifiedTaskId !== `${updatedTask.id}_completed`
      ) {
        lastNotifiedTaskId = `${updatedTask.id}_completed`;
        sendSystemNotification(
          'Aeio JARVIS — Goal Completed',
          updatedTask.finalReport || updatedTask.goal
        ).catch(() => {});
      }
    });
    return () => unsubscribe();
  }, []);

  if (!task || isDismissed) return null;

  const isRunning = task.status === 'running' || task.status === 'planning';
  const isCompleted = task.status === 'completed';

  const lastStep = task.steps.length > 0 ? task.steps[task.steps.length - 1] : null;

  return (
    <div
      className={`ambient-background-dock ${task.status}`}
      role="status"
      aria-live="polite"
    >
      <div className="dock-status-indicator">
        {isRunning ? (
          <Loader2 className="dock-spinner" size={15} />
        ) : isCompleted ? (
          <CheckCircle2 className="dock-success-icon" size={15} />
        ) : (
          <AlertCircle className="dock-error-icon" size={15} />
        )}
      </div>

      <div className="dock-content-area" onClick={onOpenHUD}>
        <div className="dock-title-row">
          <span className="dock-task-badge">JARVIS Task</span>
          <span className="dock-goal-text">{task.goal}</span>
        </div>

        <div className="dock-step-row">
          {isRunning ? (
            <>
              <span className="dock-step-count">
                Step {task.currentStep}/{task.maxSteps}
              </span>
              {lastStep && (
                <span className="dock-step-detail">
                  <span className="dock-tool-tag">[{lastStep.toolName}]</span>{' '}
                  {lastStep.thought}
                </span>
              )}
            </>
          ) : isCompleted ? (
            <span className="dock-completion-text">
              {task.finalReport || 'Goal completed successfully.'}
            </span>
          ) : (
            <span className="dock-error-text">
              {task.error || 'Task stopped.'}
            </span>
          )}
        </div>
      </div>

      <div className="dock-action-buttons">
        {isRunning && (
          <button
            type="button"
            className="dock-action-btn cancel"
            onClick={() => globalAutonomousRunner.cancel()}
            title="Cancel background task"
            aria-label="Cancel task"
          >
            <StopCircle size={14} />
          </button>
        )}

        {onOpenHUD && (
          <button
            type="button"
            className="dock-action-btn expand"
            onClick={onOpenHUD}
            title="Expand into Voice HUD"
            aria-label="Open Voice HUD"
          >
            <Maximize2 size={13} />
          </button>
        )}

        {!isRunning && (
          <button
            type="button"
            className="dock-action-btn dismiss"
            onClick={() => setIsDismissed(true)}
            title="Dismiss"
            aria-label="Dismiss task notification"
          >
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  );
};
