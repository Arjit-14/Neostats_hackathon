"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useSocket } from "@/lib/socket";

interface TopBarProps {
  onMenuClick: () => void;
}

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/projects": "Projects",
  "/dashboard/notifications": "Notifications",
};

export function TopBar({ onMenuClick }: TopBarProps) {
  const pathname = usePathname();
  const { isConnected } = useSocket();

  // Match the most specific route prefix
  const title =
    Object.entries(pageTitles)
      .filter(([k]) => pathname.startsWith(k))
      .sort((a, b) => b[0].length - a[0].length)[0]?.[1] ?? "NeoStats";

  return (
    <header className="top-bar">
      {/* Mobile menu button */}
      <button
        id="mobile-menu-btn"
        className="btn btn-ghost btn-icon"
        onClick={onMenuClick}
        aria-label="Open navigation"
        style={{ display: "none" }}
      >
        <Menu size={20} />
      </button>

      <h1
        style={{
          fontSize: "1.0625rem",
          fontWeight: 600,
          color: "var(--color-text)",
          margin: 0,
          flex: 1,
        }}
      >
        {title}
      </h1>

      {/* Socket status indicator */}
      <div
        title={isConnected ? "Real-time connected" : "Real-time disconnected"}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.375rem",
          fontSize: "0.75rem",
          color: "var(--gray-400)",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: isConnected ? "#22c55e" : "#d1d5db",
            display: "inline-block",
          }}
        />
        <span className="sr-only">{isConnected ? "Connected" : "Disconnected"}</span>
      </div>

      <style>{`
        @media (max-width: 768px) {
          #mobile-menu-btn { display: flex !important; }
        }
      `}</style>
    </header>
  );
}
