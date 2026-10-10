"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FolderKanban, CheckCircle2, Clock, AlertCircle, Bell } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import type { Project, Notification } from "@/types";

export default function DashboardPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [projs, notifs] = await Promise.all([
          api.projects.list(),
          api.notifications.list(5, 0),
        ]);
        setProjects(projs);
        setNotifications(notifs.notifications);
        setUnreadCount(notifs.unreadCount);
      } catch {
        // errors shown inline
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  if (isLoading) {
    return (
      <div className="page-loading">
        <span className="spinner" />
      </div>
    );
  }

  const roleLabel: Record<string, string> = {
    admin: "Platform Admin",
    project_manager: "Project Manager",
    team_member: "Team Member",
    viewer: "Viewer",
  };

  return (
    <div style={{ maxWidth: "900px" }}>
      {/* Welcome */}
      <div style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
          Welcome back, {user?.name.split(" ")[0]} 👋
        </h2>
        <p style={{ color: "var(--gray-500)", marginTop: "0.25rem" }}>
          {roleLabel[user?.role ?? ""] ?? user?.role}
        </p>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: "2rem" }}>
        <div className="stat-card">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <FolderKanban size={18} style={{ color: "var(--color-primary)" }} />
            <span style={{ fontSize: "0.8125rem", color: "var(--gray-500)", fontWeight: 500 }}>
              Projects
            </span>
          </div>
          <div className="stat-value">{projects.length}</div>
          <div className="stat-label">accessible</div>
        </div>

        <div className="stat-card">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <Bell size={18} style={{ color: "#f59e0b" }} />
            <span style={{ fontSize: "0.8125rem", color: "var(--gray-500)", fontWeight: 500 }}>
              Notifications
            </span>
          </div>
          <div className="stat-value">{unreadCount}</div>
          <div className="stat-label">unread</div>
        </div>
      </div>

      <div style={{ display: "grid", gap: "1.5rem", gridTemplateColumns: "1fr 1fr" }}>
        {/* Recent projects */}
        <div className="card">
          <div className="card-header">
            <h3 style={{ fontSize: "1rem", fontWeight: 600 }}>Recent Projects</h3>
            <Link
              href="/dashboard/projects"
              style={{ fontSize: "0.8125rem", color: "var(--color-primary)", textDecoration: "none" }}
            >
              View all →
            </Link>
          </div>

          {projects.length === 0 ? (
            <div className="empty-state" style={{ padding: "1.5rem" }}>
              <FolderKanban className="empty-state-icon" />
              <p className="empty-state-title">No projects yet</p>
              <p className="empty-state-desc">
                {user?.role === "admin" || user?.role === "project_manager"
                  ? "Create your first project."
                  : "Ask a manager to add you to a project."}
              </p>
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {projects.slice(0, 5).map((p) => (
                <li key={p.id} style={{ borderBottom: "1px solid var(--gray-100)", padding: "0.75rem 0" }}>
                  <Link
                    href={`/dashboard/projects/${p.id}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      textDecoration: "none",
                      color: "var(--color-text)",
                      fontSize: "0.9375rem",
                      fontWeight: 500,
                    }}
                  >
                    <FolderKanban size={16} style={{ color: "var(--color-primary)", flexShrink: 0 }} />
                    <span className="truncate">{p.name}</span>
                  </Link>
                  {p.description && (
                    <p
                      className="truncate"
                      style={{ fontSize: "0.8125rem", color: "var(--gray-400)", marginTop: "0.25rem", paddingLeft: "1.5rem" }}
                    >
                      {p.description}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent notifications */}
        <div className="card">
          <div className="card-header">
            <h3 style={{ fontSize: "1rem", fontWeight: 600 }}>Recent Notifications</h3>
            <Link
              href="/dashboard/notifications"
              style={{ fontSize: "0.8125rem", color: "var(--color-primary)", textDecoration: "none" }}
            >
              View all →
            </Link>
          </div>

          {notifications.length === 0 ? (
            <div className="empty-state" style={{ padding: "1.5rem" }}>
              <Bell className="empty-state-icon" />
              <p className="empty-state-title">No notifications</p>
              <p className="empty-state-desc">You're all caught up!</p>
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {notifications.slice(0, 5).map((n) => (
                <li
                  key={n.id}
                  style={{
                    borderBottom: "1px solid var(--gray-100)",
                    padding: "0.75rem 0",
                    opacity: n.is_read ? 0.65 : 1,
                  }}
                >
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                    {!n.is_read && (
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: "var(--color-primary)",
                          flexShrink: 0,
                          marginTop: "5px",
                        }}
                      />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: "0.875rem", fontWeight: n.is_read ? 400 : 500, margin: 0 }} className="truncate">
                        {n.message}
                      </p>
                      <p style={{ fontSize: "0.75rem", color: "var(--gray-400)", marginTop: "0.125rem" }}>
                        {new Date(n.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Activity note */}
      <div className="alert alert-info" style={{ marginTop: "1.5rem", fontSize: "0.8125rem" }}>
        <strong>Activity History:</strong> The backend records activity in the{" "}
        <code>activity_logs</code> table but does not yet expose a read endpoint.
        Once a <code>GET /api/projects/:id/activity</code> route is added, a
        real-time project timeline can be displayed here.
      </div>
    </div>
  );
}
