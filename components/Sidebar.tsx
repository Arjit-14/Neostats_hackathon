"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  Bell,
  LogOut,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useNotificationCount } from "@/hooks/useNotifications";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/projects", label: "Projects", icon: FolderKanban, exact: false },
  { href: "/dashboard/notifications", label: "Notifications", icon: Bell, exact: false },
];

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    admin: "Admin",
    project_manager: "Project Manager",
    team_member: "Team Member",
    viewer: "Viewer",
  };
  return map[role] ?? role;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { unreadCount } = useNotificationCount();

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <aside className={`sidebar${open ? " open" : ""}`} aria-label="Main navigation">
      {/* Logo */}
      <div className="nav-logo">
        <div className="nav-logo-icon">⚡</div>
        <span>NeoStats</span>
        {/* Mobile close button */}
        <button
          className="btn btn-ghost btn-icon"
          style={{ marginLeft: "auto", display: "none" }}
          onClick={onClose}
          aria-label="Close navigation"
          id="sidebar-close-btn"
        >
          <X size={18} />
        </button>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, paddingTop: "0.5rem" }}>
        <p className="nav-section-title">Navigation</p>
        {navItems.map(({ href, label, icon: Icon, exact }) => (
          <Link
            key={href}
            href={href}
            className={`nav-item${isActive(href, exact) ? " active" : ""}`}
            aria-current={isActive(href, exact) ? "page" : undefined}
          >
            <Icon size={18} />
            <span style={{ flex: 1 }}>{label}</span>
            {label === "Notifications" && unreadCount > 0 && (
              <span
                style={{
                  background: "#ef4444",
                  color: "#fff",
                  borderRadius: "999px",
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  padding: "0 6px",
                  lineHeight: "1.5",
                  minWidth: "18px",
                  textAlign: "center",
                }}
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {/* User section */}
      {user && (
        <div className="nav-user">
          <div className="nav-user-info" style={{ marginBottom: "0.75rem" }}>
            <div className="nav-avatar">{initials(user.name)}</div>
            <div style={{ minWidth: 0 }}>
              <p
                style={{
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: "var(--color-text)",
                }}
                className="truncate"
              >
                {user.name}
              </p>
              <p
                style={{ fontSize: "0.75rem", color: "var(--gray-500)" }}
                className="truncate"
              >
                {roleLabel(user.role)}
              </p>
            </div>
          </div>
          <button
            id="logout-btn"
            className="nav-item btn"
            style={{ width: "100%", color: "#dc2626" }}
            onClick={() => logout()}
          >
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          #sidebar-close-btn { display: flex !important; }
        }
      `}</style>
    </aside>
  );
}
