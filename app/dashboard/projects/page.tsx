"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { FolderKanban, Plus, Search, Archive } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { ApiCallError } from "@/lib/api";
import { CreateProjectDialog } from "@/components/CreateProjectDialog";
import type { Project } from "@/types";
import { toast } from "sonner";

export default function ProjectsPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const canCreate =
    user?.role === "admin" || user?.role === "project_manager";

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.projects.list();
      setProjects(data);
    } catch (err) {
      setError(err instanceof ApiCallError ? err.message : "Failed to load projects");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.description ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div style={{ maxWidth: "900px" }}>
        {/* Header */}
        <div className="page-header" style={{ padding: 0, marginBottom: "1.5rem" }}>
          <div>
            <h2 className="page-title">Projects</h2>
            <p className="page-subtitle">{projects.length} project{projects.length !== 1 ? "s" : ""} accessible</p>
          </div>
          {canCreate && (
            <button
              id="create-project-btn"
              className="btn btn-primary"
              onClick={() => setShowCreate(true)}
            >
              <Plus size={16} />
              New Project
            </button>
          )}
        </div>

        {/* Search */}
        <div style={{ position: "relative", marginBottom: "1.25rem" }}>
          <Search
            size={16}
            style={{
              position: "absolute",
              left: "0.75rem",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--gray-400)",
              pointerEvents: "none",
            }}
          />
          <input
            id="project-search"
            type="search"
            className="form-input"
            placeholder="Search projects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: "2.25rem" }}
          />
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="page-loading" style={{ minHeight: "30vh" }}>
            <span className="spinner" />
          </div>
        ) : error ? (
          <div className="alert alert-error">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <FolderKanban className="empty-state-icon" />
            <p className="empty-state-title">
              {search ? "No matching projects" : "No projects yet"}
            </p>
            <p className="empty-state-desc">
              {search
                ? "Try a different search term."
                : canCreate
                ? "Create your first project to get started."
                : "Ask a project manager to add you to a project."}
            </p>
            {canCreate && !search && (
              <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                <Plus size={16} />
                New Project
              </button>
            )}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "1rem",
            }}
          >
            {filtered.map((project) => (
              <ProjectCard key={project.id} project={project} onArchived={load} canManage={canCreate} />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateProjectDialog
          onClose={() => setShowCreate(false)}
          onCreated={(p) => {
            setProjects((prev) => [p, ...prev]);
            toast.success("Project created successfully");
          }}
        />
      )}
    </>
  );
}

function ProjectCard({
  project,
  onArchived,
  canManage,
}: {
  project: Project;
  onArchived: () => void;
  canManage: boolean;
}) {
  const [archiving, setArchiving] = useState(false);

  async function handleArchive(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Archive "${project.name}"? This will hide it from all users.`)) return;
    setArchiving(true);
    try {
      await api.projects.archive(project.id);
      toast.success("Project archived");
      onArchived();
    } catch (err) {
      toast.error(err instanceof ApiCallError ? err.message : "Failed to archive project");
    } finally {
      setArchiving(false);
    }
  }

  return (
    <Link
      href={`/dashboard/projects/${project.id}`}
      style={{ textDecoration: "none" }}
    >
      <div
        className="card"
        style={{
          cursor: "pointer",
          transition: "box-shadow 0.15s, transform 0.1s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--shadow-md)";
          (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--shadow-sm)";
          (e.currentTarget as HTMLDivElement).style.transform = "none";
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "var(--brand-50)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <FolderKanban size={18} style={{ color: "var(--color-primary)" }} />
            </div>
            <h3
              style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--color-text)" }}
              className="truncate"
            >
              {project.name}
            </h3>
          </div>
          {canManage && (
            <button
              title="Archive project"
              className="btn btn-ghost btn-icon"
              style={{ flexShrink: 0, padding: "0.25rem" }}
              onClick={handleArchive}
              disabled={archiving}
            >
              <Archive size={14} style={{ color: "var(--gray-400)" }} />
            </button>
          )}
        </div>

        {project.description && (
          <p
            style={{
              fontSize: "0.8125rem",
              color: "var(--gray-500)",
              marginTop: "0.75rem",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {project.description}
          </p>
        )}

        <p style={{ fontSize: "0.75rem", color: "var(--gray-400)", marginTop: "0.75rem" }}>
          Created {new Date(project.created_at).toLocaleDateString()}
        </p>
      </div>
    </Link>
  );
}
