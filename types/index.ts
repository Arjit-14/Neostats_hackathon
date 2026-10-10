// ─── Auth ────────────────────────────────────────────────────────────────────

export type UserRole = "admin" | "project_manager" | "team_member" | "viewer";

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
}

export interface AdminUser extends User {
  is_active: boolean;
  email_verified_at: string | null;
  two_factor_enabled: boolean;
  created_at: string;
  updated_at?: string;
}

export interface LoginResponse {
  message: string;
  token: string;
  expiresIn: number; // seconds
  user: User;
}

// ─── Projects ────────────────────────────────────────────────────────────────

export interface Project {
  id: number;
  name: string;
  description: string | null;
  manager_id: number | null;
  created_by: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectMember {
  id: number;
  name: string;
  email: string;
  role: ProjectMemberRole;
  joined_at: string;
}

export type ProjectMemberRole = "project_manager" | "team_member" | "viewer";

// ─── Tasks ───────────────────────────────────────────────────────────────────

export type TaskStatus = "todo" | "in_progress" | "done" | "blocked";

export interface Task {
  id: number;
  title: string;
  status: TaskStatus;
  completed: boolean;
  project_id: number;
  assigned_to: number | null;
  version: number;
  created_at: string;
  updated_at: string;
}

// ─── Comments ────────────────────────────────────────────────────────────────

export interface Comment {
  id: number;
  task_id: number;
  user_id: number;
  body: string;
  created_at: string;
  updated_at: string;
  author_name: string;
}

// ─── Notifications ───────────────────────────────────────────────────────────

export interface Notification {
  id: number;
  actor_id: number | null;
  project_id: number | null;
  event_type: string;
  message: string;
  entity_type: string | null;
  entity_id: number | null;
  is_read: boolean;
  created_at: string;
}

export interface Activity {
  id: number;
  user_id: number | null;
  project_id: number;
  action: string;
  entity_type: string;
  entity_id: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor_name: string | null;
}

export interface NotificationsResponse {
  notifications: Notification[];
  pagination: { limit: number; offset: number };
  unreadCount: number;
}

// ─── API error shape ─────────────────────────────────────────────────────────

export interface ApiError {
  message: string;
  currentVersion?: number;
}
