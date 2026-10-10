"use client";

import { Bell, CheckCheck } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import Link from "next/link";

export default function NotificationsPage() {
  const { notifications, unreadCount, isLoading, error, markRead, markAllRead } =
    useNotifications(50);

  return (
    <div style={{ maxWidth: "720px" }}>
      {/* Header */}
      <div className="page-header" style={{ padding: 0, marginBottom: "1.5rem" }}>
        <div>
          <h2 className="page-title">Notifications</h2>
          <p className="page-subtitle">
            {unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            id="mark-all-read-btn"
            className="btn btn-secondary"
            onClick={markAllRead}
          >
            <CheckCheck size={16} />
            Mark all as read
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="page-loading" style={{ minHeight: "30vh" }}>
          <span className="spinner" />
        </div>
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : notifications.length === 0 ? (
        <div className="empty-state">
          <Bell className="empty-state-icon" />
          <p className="empty-state-title">No notifications</p>
          <p className="empty-state-desc">You're all caught up! Check back later.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {notifications.map((n, idx) => (
            <div
              key={n.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.75rem",
                padding: "1rem 1.25rem",
                borderBottom:
                  idx < notifications.length - 1
                    ? "1px solid var(--gray-100)"
                    : "none",
                background: n.is_read ? "transparent" : "var(--brand-50)",
                transition: "background 0.15s",
              }}
            >
              {/* Unread dot */}
              <div style={{ paddingTop: "4px", flexShrink: 0 }}>
                {n.is_read ? (
                  <span style={{ display: "block", width: 8, height: 8 }} />
                ) : (
                  <span
                    style={{
                      display: "block",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "var(--color-primary)",
                    }}
                  />
                )}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.9375rem",
                    fontWeight: n.is_read ? 400 : 600,
                    color: "var(--color-text)",
                  }}
                >
                  {n.message}
                </p>

                <div
                  style={{
                    display: "flex",
                    gap: "0.75rem",
                    marginTop: "0.25rem",
                    fontSize: "0.75rem",
                    color: "var(--gray-400)",
                    flexWrap: "wrap",
                  }}
                >
                  <span>{new Date(n.created_at).toLocaleString()}</span>
                  <span>{n.event_type}</span>
                  {n.project_id && (
                    <Link
                      href={`/dashboard/projects/${n.project_id}`}
                      style={{ color: "var(--color-primary)", textDecoration: "none" }}
                    >
                      View Project →
                    </Link>
                  )}
                </div>
              </div>

              {/* Mark read */}
              {!n.is_read && (
                <button
                  id={`mark-read-${n.id}`}
                  className="btn btn-ghost btn-sm"
                  onClick={() => markRead(n.id)}
                  title="Mark as read"
                  style={{ flexShrink: 0, fontSize: "0.75rem" }}
                >
                  Mark read
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
