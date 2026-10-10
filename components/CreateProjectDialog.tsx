"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { ApiCallError } from "@/lib/api";
import type { Project } from "@/types";
import { useAuth } from "@/lib/auth";
import { X } from "lucide-react";

interface Props {
  onClose: () => void;
  onCreated: (project: Project) => void;
}

export function CreateProjectDialog({ onClose, onCreated }: Props) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Project name is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await api.projects.create({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      onCreated(res.project);
      onClose();
    } catch (err) {
      setError(err instanceof ApiCallError ? err.message : "Failed to create project");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
          <h2 className="dialog-title" style={{ margin: 0 }}>New Project</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form id="create-project-form" onSubmit={handleSubmit}>
          {error && <div className="alert alert-error" style={{ marginBottom: "1rem" }}>{error}</div>}

          <div className="form-group">
            <label htmlFor="proj-name" className="form-label">Project name *</label>
            <input
              id="proj-name"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Q4 Marketing Campaign"
              maxLength={180}
              disabled={saving}
            />
          </div>

          <div className="form-group">
            <label htmlFor="proj-desc" className="form-label">Description</label>
            <textarea
              id="proj-desc"
              className="form-input form-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional project description…"
              maxLength={10000}
              disabled={saving}
            />
          </div>

          <div className="dialog-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button id="create-project-submit" type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <><span className="spinner" style={{ width: "1rem", height: "1rem" }} />Creating…</> : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
