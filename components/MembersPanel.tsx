"use client";

import { useState } from "react";
import { UserPlus, Trash2, ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import { ApiCallError } from "@/lib/api";
import type { ProjectMember, ProjectMemberRole } from "@/types";
import { toast } from "sonner";

const ROLES: ProjectMemberRole[] = ["project_manager", "team_member", "viewer"];
const ROLE_LABELS: Record<ProjectMemberRole, string> = {
  project_manager: "Project Manager",
  team_member: "Team Member",
  viewer: "Viewer",
};

interface Props {
  projectId: number;
  members: ProjectMember[];
  setMembers: React.Dispatch<React.SetStateAction<ProjectMember[]>>;
  canManage: boolean;
}

export function MembersPanel({ projectId, members, setMembers, canManage }: Props) {
  const [addUserId, setAddUserId] = useState("");
  const [addRole, setAddRole] = useState<ProjectMemberRole>("team_member");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const uid = Number(addUserId);
    if (!uid || uid < 1) {
      setAddError("Enter a valid user ID.");
      return;
    }
    setAdding(true);
    setAddError("");
    try {
      const res = await api.projects.addMember(projectId, uid, addRole);
      setMembers((prev) => [...prev, res.member]);
      setAddUserId("");
      toast.success("Member added");
    } catch (err) {
      setAddError(err instanceof ApiCallError ? err.message : "Failed to add member");
    } finally {
      setAdding(false);
    }
  }

  async function handleRoleChange(userId: number, role: ProjectMemberRole) {
    try {
      await api.projects.updateMemberRole(projectId, userId, role);
      setMembers((prev) =>
        prev.map((m) => (m.id === userId ? { ...m, role } : m))
      );
      toast.success("Role updated");
    } catch (err) {
      toast.error(err instanceof ApiCallError ? err.message : "Failed to update role");
    }
  }

  async function handleRemove(userId: number, name: string) {
    if (!confirm(`Remove ${name} from this project?`)) return;
    try {
      await api.projects.removeMember(projectId, userId);
      setMembers((prev) => prev.filter((m) => m.id !== userId));
      toast.success("Member removed");
    } catch (err) {
      toast.error(err instanceof ApiCallError ? err.message : "Failed to remove member");
    }
  }

  return (
    <div>
      {/* Add member form */}
      {canManage && (
        <div className="card" style={{ marginBottom: "1.25rem" }}>
          <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "1rem" }}>
            Add Member
          </h3>
          <form id="add-member-form" onSubmit={handleAdd}>
            {addError && <div className="alert alert-error" style={{ marginBottom: "0.75rem", fontSize: "0.8125rem" }}>{addError}</div>}
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <input
                id="add-member-userid"
                type="number"
                className="form-input"
                placeholder="User ID"
                value={addUserId}
                onChange={(e) => setAddUserId(e.target.value)}
                disabled={adding}
                min={1}
                style={{ width: "120px" }}
              />
              <select
                id="add-member-role"
                className="form-input form-select"
                value={addRole}
                onChange={(e) => setAddRole(e.target.value as ProjectMemberRole)}
                disabled={adding}
                style={{ width: "180px" }}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
              <button id="add-member-btn" type="submit" className="btn btn-primary" disabled={adding}>
                {adding ? <span className="spinner" style={{ width: "1rem", height: "1rem" }} /> : <UserPlus size={16} />}
                Add
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Members table */}
      {members.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No members yet</p>
          <p className="empty-state-desc">Add your first member above.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Joined</th>
                  {canManage && <th style={{ width: 80 }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 500 }}>{m.name}</td>
                    <td style={{ color: "var(--gray-500)" }}>{m.email}</td>
                    <td>
                      {canManage ? (
                        <select
                          aria-label={`Role for ${m.name}`}
                          className="form-input form-select"
                          value={m.role}
                          onChange={(e) => handleRoleChange(m.id, e.target.value as ProjectMemberRole)}
                          style={{ padding: "0.25rem 1.75rem 0.25rem 0.5rem", fontSize: "0.8125rem" }}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="badge badge-role">{ROLE_LABELS[m.role]}</span>
                      )}
                    </td>
                    <td style={{ color: "var(--gray-400)", fontSize: "0.8125rem" }}>
                      {new Date(m.joined_at).toLocaleDateString()}
                    </td>
                    {canManage && (
                      <td>
                        <button
                          aria-label={`Remove ${m.name}`}
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={() => handleRemove(m.id, m.name)}
                          title="Remove member"
                        >
                          <Trash2 size={15} style={{ color: "#dc2626" }} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
