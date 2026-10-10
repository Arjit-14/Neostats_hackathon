"use client";

import { useState } from "react";
import { Plus, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { ApiCallError } from "@/lib/api";
import type { Task, ProjectMember, TaskStatus } from "@/types";
import { toast } from "sonner";
import { TaskDetailDialog } from "./TaskDetailDialog";

const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "done", "blocked"];
const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
  blocked: "Blocked",
};

interface Props {
  projectId: number;
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  members: ProjectMember[];
  isLoading: boolean;
  error: string | null;
  myProjectRole: string | null;
  currentUserId: number;
  canCreate: boolean;
  refetch: () => void;
}

export function TaskList({
  projectId,
  tasks,
  setTasks,
  members,
  isLoading,
  error,
  myProjectRole,
  currentUserId,
  canCreate,
  refetch,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [createError, setCreateError] = useState("");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) {
      setCreateError("Task title is required.");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      const res = await api.tasks.create(projectId, newTitle.trim());
      setTasks((prev) => [res.task, ...prev]);
      setNewTitle("");
      toast.success("Task created");
    } catch (err) {
      setCreateError(err instanceof ApiCallError ? err.message : "Failed to create task");
    } finally {
      setCreating(false);
    }
  }

  if (isLoading) {
    return (
      <div className="page-loading" style={{ minHeight: "20vh" }}>
        <span className="spinner" />
      </div>
    );
  }

  if (error) {
    return <div className="alert alert-error">{error}</div>;
  }

  const tasksByStatus = STATUS_ORDER.reduce<Record<TaskStatus, Task[]>>(
    (acc, s) => {
      acc[s] = tasks.filter((t) => t.status === s);
      return acc;
    },
    { todo: [], in_progress: [], done: [], blocked: [] }
  );

  return (
    <>
      {/* Create task form */}
      {canCreate && (
        <form
          id="create-task-form"
          onSubmit={handleCreate}
          style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem" }}
        >
          <input
            id="new-task-title"
            className="form-input"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Add a new task…"
            disabled={creating}
            style={{ flex: 1 }}
          />
          <button id="add-task-btn" type="submit" className="btn btn-primary" disabled={creating}>
            {creating ? <span className="spinner" style={{ width: "1rem", height: "1rem" }} /> : <Plus size={16} />}
            Add
          </button>
        </form>
      )}
      {createError && <div className="alert alert-error" style={{ marginBottom: "1rem" }}>{createError}</div>}

      {tasks.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon" style={{ fontSize: "2.5rem" }}>📋</div>
          <p className="empty-state-title">No tasks yet</p>
          <p className="empty-state-desc">
            {canCreate ? "Add your first task above." : "No tasks have been created for this project."}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {STATUS_ORDER.map((status) => {
            const group = tasksByStatus[status];
            if (group.length === 0 && status === "blocked") return null;
            return (
              <div key={status}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.625rem" }}>
                  <span className={`badge badge-${status}`}>{STATUS_LABELS[status]}</span>
                  <span style={{ fontSize: "0.8125rem", color: "var(--gray-400)" }}>{group.length}</span>
                </div>

                {group.length === 0 ? (
                  <p style={{ fontSize: "0.875rem", color: "var(--gray-300)", paddingLeft: "0.5rem" }}>—</p>
                ) : (
                  <div className="card" style={{ padding: "0.25rem 0.75rem" }}>
                    {group.map((task) => (
                      <div
                        key={task.id}
                        className="task-row"
                        onClick={() => setSelectedTask(task)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === "Enter" && setSelectedTask(task)}
                        aria-label={`Open task: ${task.title}`}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: "0.9375rem", fontWeight: 500, margin: 0 }} className="truncate">
                            {task.title}
                          </p>
                          <p style={{ fontSize: "0.75rem", color: "var(--gray-400)", marginTop: "0.125rem" }}>
                            #{task.id} · updated {new Date(task.updated_at).toLocaleDateString()}
                            {task.assigned_to && (
                              <> · assigned to {members.find((m) => m.id === task.assigned_to)?.name ?? `#${task.assigned_to}`}</>
                            )}
                          </p>
                        </div>
                        <span className={`badge badge-${task.status}`}>{STATUS_LABELS[task.status]}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedTask && (
        <TaskDetailDialog
          task={selectedTask}
          projectId={projectId}
          members={members}
          myProjectRole={myProjectRole}
          currentUserId={currentUserId}
          onClose={() => setSelectedTask(null)}
          onUpdated={(updated) => {
            setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
            setSelectedTask(updated);
          }}
        />
      )}
    </>
  );
}
