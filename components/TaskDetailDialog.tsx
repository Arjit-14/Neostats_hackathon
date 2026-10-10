"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Send } from "lucide-react";
import { api } from "@/lib/api";
import { ApiCallError } from "@/lib/api";
import type { Task, Comment, ProjectMember, TaskStatus } from "@/types";
import { toast } from "sonner";
import { useSocket } from "@/lib/socket";

const VALID_STATUSES: TaskStatus[] = ["todo", "in_progress", "done", "blocked"];
const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
  blocked: "Blocked",
};

interface Props {
  task: Task;
  projectId: number;
  members: ProjectMember[];
  myProjectRole: string | null;
  currentUserId: number;
  onClose: () => void;
  onUpdated: (task: Task) => void;
}

export function TaskDetailDialog({
  task,
  projectId,
  members,
  myProjectRole,
  currentUserId,
  onClose,
  onUpdated,
}: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentBody, setCommentBody] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState("");

  // Edit fields
  const [editTitle, setEditTitle] = useState(task.title);
  const [editStatus, setEditStatus] = useState<TaskStatus>(task.status);
  const [editAssignedTo, setEditAssignedTo] = useState<number | null>(task.assigned_to);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [conflictTask, setConflictTask] = useState<Task | null>(null);

  const { socket } = useSocket();

  const isAdmin = myProjectRole === "admin";
  const isManager = myProjectRole === "project_manager";
  const isTeamMember = myProjectRole === "team_member";

  const canEditAll = isAdmin || isManager;
  const canChangeStatus = canEditAll || (isTeamMember && task.assigned_to === currentUserId);
  const canComment = isAdmin || isManager || isTeamMember;

  function withAuthorName(comment: Comment, fallback = "Unknown user"): Comment {
    return {
      ...comment,
      author_name: comment.author_name || fallback,
    };
  }

  const loadComments = useCallback(async () => {
    setCommentsLoading(true);
    try {
      const res = await api.comments.list(projectId, task.id);
      const receivedComments = Array.isArray(res.comments) ? res.comments : [];
      setComments(receivedComments.map((comment) => withAuthorName(comment)));
    } catch {
      // ignore – shown inline if critical
    } finally {
      setCommentsLoading(false);
    }
  }, [projectId, task.id]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  // Real-time: new comments from socket
  useEffect(() => {
    if (!socket) return;

    function handleNewComment(payload: {
      projectId: number;
      taskId: number;
      comment: Comment;
    }) {
      if (payload.taskId !== task.id) return;
      // Avoid duplicates (own comment already added optimistically)
      const comment = withAuthorName(payload.comment, "A teammate");
      setComments((prev) =>
        prev.some((c) => c.id === comment.id)
          ? prev
          : [...prev, comment]
      );
    }

    socket.on("comment.created", handleNewComment);
    return () => {
      socket.off("comment.created", handleNewComment);
    };
  }, [socket, task.id]);

  async function handleSave() {
    if (!canChangeStatus && !canEditAll) return;

    setSaving(true);
    setSaveError("");

    // Team members can only update status
    const payload: {
      version: number;
      title?: string;
      status?: TaskStatus;
      assignedTo?: number | null;
    } = { version: task.version };

    if (canEditAll) {
      if (editTitle.trim() !== task.title) payload.title = editTitle.trim();
      if (editStatus !== task.status) payload.status = editStatus;
      if (editAssignedTo !== task.assigned_to) payload.assignedTo = editAssignedTo;
    } else if (isTeamMember && canChangeStatus) {
      payload.status = editStatus;
    }

    if (!payload.title && !payload.status && payload.assignedTo === undefined) {
      setSaving(false);
      return;
    }

    try {
      const res = await api.tasks.update(projectId, task.id, payload);
      onUpdated(res.task);
      toast.success("Task updated");
    } catch (err) {
      if (err instanceof ApiCallError) {
        if (err.status === 409) {
          try {
            const latestTasks = await api.tasks.list(projectId);
            const latestTask = latestTasks.find((candidate) => candidate.id === task.id);

            if (latestTask) {
              setConflictTask(latestTask);
              onUpdated(latestTask);
              setSaveError("This task changed elsewhere. Review the latest version, then retry your changes.");
            } else {
              setSaveError("This task was changed elsewhere and is no longer available.");
            }
          } catch {
            setSaveError(`${err.message} Reload the task list and try again.`);
          }
        } else {
          setSaveError(err.message);
        }
      } else {
        setSaveError("Failed to update task");
      }
    } finally {
      setSaving(false);
    }
  }

  function loadLatestTask() {
    if (!conflictTask) return;

    setEditTitle(conflictTask.title);
    setEditStatus(conflictTask.status);
    setEditAssignedTo(conflictTask.assigned_to);
    setConflictTask(null);
    setSaveError("");
  }

  async function handleCommentSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!commentBody.trim()) {
      setCommentError("Comment cannot be empty.");
      return;
    }
    setSubmittingComment(true);
    setCommentError("");
    try {
      const res = await api.comments.create(projectId, task.id, commentBody.trim());
      // Optimistically add the comment (socket will deduplicate)
      setComments((prev) => [
        ...prev,
        withAuthorName(res.comment, "You"),
      ]);
      setCommentBody("");
    } catch (err) {
      setCommentError(err instanceof ApiCallError ? err.message : "Failed to post comment");
    } finally {
      setSubmittingComment(false);
    }
  }

  const teamMembers = members.filter((m) => m.role === "team_member");

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog"
        style={{ maxWidth: "580px", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", marginBottom: "1.25rem" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: "0.75rem", color: "var(--gray-400)", margin: "0 0 0.25rem" }}>
              Task #{task.id} · v{task.version}
            </p>
            {canEditAll ? (
              <input
                id="task-title-edit"
                className="form-input"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                style={{ fontWeight: 600, fontSize: "1rem" }}
                maxLength={255}
              />
            ) : (
              <h2 className="dialog-title" style={{ margin: 0 }}>{task.title}</h2>
            )}
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Editable fields */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
          <div>
            <label className="form-label">Status</label>
            {canChangeStatus ? (
              <select
                id="task-status-select"
                className="form-input form-select"
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as TaskStatus)}
              >
                {VALID_STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            ) : (
              <p><span className={`badge badge-${task.status}`}>{STATUS_LABELS[task.status]}</span></p>
            )}
          </div>

          {canEditAll && (
            <div>
              <label className="form-label">Assigned to</label>
              <select
                id="task-assignee-select"
                className="form-input form-select"
                value={editAssignedTo ?? ""}
                onChange={(e) => setEditAssignedTo(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Unassigned</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {saveError && (
          <div className="alert alert-error" style={{ marginBottom: "1rem", fontSize: "0.8125rem" }}>
            <div>{saveError}</div>
            {conflictTask && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={loadLatestTask} style={{ marginTop: "0.625rem" }}>
                Load latest version (v{conflictTask.version})
              </button>
            )}
          </div>
        )}

        {(canEditAll || (isTeamMember && canChangeStatus)) && (
          <button
            id="task-save-btn"
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={saving}
            style={{ alignSelf: "flex-start", marginBottom: "1rem" }}
          >
            {saving ? <><span className="spinner" style={{ width: "0.875rem", height: "0.875rem" }} />Saving…</> : "Save changes"}
          </button>
        )}

        <hr className="divider" />

        {/* Comments */}
        <div style={{ flex: 1, overflowY: "auto", marginBottom: "1rem" }}>
          <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.75rem", color: "var(--gray-600)" }}>
            Comments
          </h3>

          {commentsLoading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "1rem" }}>
              <span className="spinner" />
            </div>
          ) : comments.length === 0 ? (
            <p style={{ fontSize: "0.875rem", color: "var(--gray-400)", textAlign: "center", padding: "1rem 0" }}>
              No comments yet. Be the first to comment.
            </p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.875rem" }}>
              {comments.map((c) => (
                <li
                  key={c.id}
                  style={{
                    display: "flex",
                    gap: "0.625rem",
                    alignItems: "flex-start",
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: "var(--brand-100)",
                      color: "var(--brand-700)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {(c.author_name || "?")[0]?.toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "baseline" }}>
                      <strong style={{ fontSize: "0.8125rem" }}>{c.author_name}</strong>
                      <span style={{ fontSize: "0.75rem", color: "var(--gray-400)" }}>
                        {new Date(c.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p style={{ fontSize: "0.875rem", margin: "0.25rem 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {c.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* New comment */}
        {canComment ? (
          <form id="comment-form" onSubmit={handleCommentSubmit}>
            {commentError && (
              <div className="alert alert-error" style={{ marginBottom: "0.5rem", fontSize: "0.8125rem" }}>
                {commentError}
              </div>
            )}
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <textarea
                id="comment-body"
                className="form-input form-textarea"
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="Write a comment…"
                rows={2}
                style={{ flex: 1, resize: "none" }}
                disabled={submittingComment}
                maxLength={5000}
              />
              <button
                id="comment-submit"
                type="submit"
                className="btn btn-primary btn-icon"
                disabled={submittingComment || !commentBody.trim()}
                title="Post comment"
                style={{ alignSelf: "flex-end" }}
              >
                {submittingComment ? (
                  <span className="spinner" style={{ width: "1rem", height: "1rem" }} />
                ) : (
                  <Send size={16} />
                )}
              </button>
            </div>
          </form>
        ) : (
          <p style={{ fontSize: "0.8125rem", color: "var(--gray-400)", textAlign: "center" }}>
            You have read-only access to this project.
          </p>
        )}
      </div>
    </div>
  );
}
