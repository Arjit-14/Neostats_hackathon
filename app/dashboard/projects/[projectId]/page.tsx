"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { ApiCallError } from "@/lib/api";
import { useTasks } from "@/hooks/useTasks";
import { TaskList } from "@/components/TaskList";
import { MembersPanel } from "@/components/MembersPanel";
import { EditProjectDialog } from "@/components/EditProjectDialog";
import type { Project, ProjectMember } from "@/types";
import { ArrowLeft, Edit2, Users, CheckSquare } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

type Tab = "tasks" | "members";

export default function ProjectDetailPage({ params }: PageProps<"/dashboard/projects/[projectId]">) {
  const { projectId } = use(params);
  const pid = Number(projectId);
  const { user } = useAuth();
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loadingProject, setLoadingProject] = useState(true);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("tasks");
  const [showEdit, setShowEdit] = useState(false);

  const { tasks, setTasks, isLoading: tasksLoading, error: tasksError, refetch: refetchTasks } = useTasks(pid);

  const loadProject = useCallback(async () => {
    setLoadingProject(true);
    setProjectError(null);
    try {
      const [projRes, membersRes] = await Promise.all([
        api.projects.get(pid),
        api.projects.listMembers(pid),
      ]);
      setProject(projRes.project);
      setMembers(membersRes);
    } catch (err) {
      if (err instanceof ApiCallError && err.status === 403) {
        router.replace("/dashboard/projects");
        return;
      }
      setProjectError(err instanceof ApiCallError ? err.message : "Failed to load project");
    } finally {
      setLoadingProject(false);
    }
  }, [pid, router]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  // Determine the current user's project role
  const myMembership = members.find((m) => m.id === user?.id);
  const myProjectRole = user?.role === "admin" ? "admin" : myMembership?.role ?? null;
  const canManage = myProjectRole === "admin" || myProjectRole === "project_manager";
  const canComment = myProjectRole === "admin" || myProjectRole === "project_manager" || myProjectRole === "team_member";

  if (loadingProject) {
    return (
      <div className="page-loading">
        <span className="spinner" />
      </div>
    );
  }

  if (projectError) {
    return (
      <div>
        <div className="alert alert-error" style={{ maxWidth: 480 }}>{projectError}</div>
        <Link href="/dashboard/projects" className="btn btn-secondary" style={{ marginTop: "1rem" }}>
          <ArrowLeft size={16} /> Back to Projects
        </Link>
      </div>
    );
  }

  if (!project) return null;

  return (
    <>
      {/* Back */}
      <Link
        href="/dashboard/projects"
        style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", fontSize: "0.875rem", color: "var(--gray-500)", textDecoration: "none", marginBottom: "1.25rem" }}
      >
        <ArrowLeft size={15} /> Projects
      </Link>

      {/* Project header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", marginBottom: "1.5rem" }}>
        <div>
          <h2 className="page-title">{project.name}</h2>
          {project.description && (
            <p style={{ color: "var(--gray-500)", fontSize: "0.9375rem", marginTop: "0.375rem", maxWidth: "600px" }}>
              {project.description}
            </p>
          )}
        </div>
        {canManage && (
          <button id="edit-project-btn" className="btn btn-secondary" onClick={() => setShowEdit(true)}>
            <Edit2 size={15} /> Edit
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "2px solid var(--color-border)", marginBottom: "1.5rem", gap: "0" }}>
        {(["tasks", "members"] as Tab[]).map((t) => (
          <button
            key={t}
            id={`tab-${t}`}
            className="btn btn-ghost"
            onClick={() => setTab(t)}
            style={{
              borderRadius: 0,
              paddingBottom: "0.75rem",
              borderBottom: tab === t ? "2px solid var(--color-primary)" : "2px solid transparent",
              marginBottom: "-2px",
              color: tab === t ? "var(--color-primary)" : "var(--gray-500)",
              fontWeight: tab === t ? 600 : 500,
              gap: "0.375rem",
            }}
          >
            {t === "tasks" ? <><CheckSquare size={15} /> Tasks ({tasks.length})</> : <><Users size={15} /> Members ({members.length})</>}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "tasks" ? (
        <TaskList
          projectId={pid}
          tasks={tasks}
          setTasks={setTasks}
          members={members}
          isLoading={tasksLoading}
          error={tasksError}
          myProjectRole={myProjectRole}
          currentUserId={user?.id ?? 0}
          canCreate={canManage}
          refetch={refetchTasks}
        />
      ) : (
        <MembersPanel
          projectId={pid}
          members={members}
          setMembers={setMembers}
          canManage={canManage}
        />
      )}

      {showEdit && project && (
        <EditProjectDialog
          project={project}
          onClose={() => setShowEdit(false)}
          onUpdated={(updated) => {
            setProject(updated);
            toast.success("Project updated");
          }}
        />
      )}
    </>
  );
}
