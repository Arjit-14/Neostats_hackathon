/**
 * Centralized API client.
 *
 * – Uses NEXT_PUBLIC_API_URL (falls back to http://localhost:5000).
 * – Reads the JWT from sessionStorage on every call so components never
 *   hold a stale reference.
 * – Throws a typed ApiCallError with { status, message } on HTTP errors.
 * – On 401 it fires a custom "auth:expired" event so the auth provider can
 *   redirect to login without a hard import cycle.
 */

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
  "http://localhost:5000";

export class ApiCallError extends Error {
  status: number;
  currentVersion?: number;

  constructor(status: number, message: string, currentVersion?: number) {
    super(message);
    this.name = "ApiCallError";
    this.status = status;
    this.currentVersion = currentVersion;
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("ns_token");
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  // Parse body if present
  const contentType = res.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await res.json()
    : null;

  if (!res.ok) {
    const message: string =
      body?.message ?? `Request failed with status ${res.status}`;
    const currentVersion: number | undefined = body?.currentVersion;

    if (res.status === 401) {
      // Notify the auth provider so it can clear state & redirect.
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("auth:expired"));
      }
    }

    throw new ApiCallError(res.status, message, currentVersion);
  }

  return body as T;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<{ message: string; token: string; expiresIn: number; user: import("@/types").User }>(
        "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify({ email, password }),
        }
      ),

    me: () =>
      request<{ user: import("@/types").User }>("/api/auth/me"),

    logout: () =>
      request<{ message: string }>("/api/auth/logout", { method: "POST" }),
    register: (payload: { name: string; email: string; password: string }) =>
      request<{ message: string; user: import("@/types").User }>("/api/auth/register", {
        method: "POST", body: JSON.stringify(payload),
      }),
    requestPasswordReset: (email: string) =>
      request<{ message: string }>("/api/auth/password-reset/request", {
        method: "POST", body: JSON.stringify({ email }),
      }),
    resetPassword: (token: string, password: string) =>
      request<{ message: string }>("/api/auth/password-reset/confirm", {
        method: "POST", body: JSON.stringify({ token, password }),
      }),
    beginTwoFactor: () =>
      request<{ secret: string; otpauth: string }>("/api/auth/2fa/begin", { method: "POST" }),
    confirmTwoFactor: (code: string) =>
      request<{ message: string; recoveryCodes: string[] }>("/api/auth/2fa/confirm", {
        method: "POST", body: JSON.stringify({ code }),
      }),
    disableTwoFactor: (password: string) =>
      request<{ message: string }>("/api/auth/2fa/disable", {
        method: "POST", body: JSON.stringify({ password }),
      }),
  },

  // ─── Projects ──────────────────────────────────────────────────────────────

  projects: {
    list: () =>
      request<import("@/types").Project[]>("/api/projects"),

    get: (projectId: number) =>
      request<{ project: import("@/types").Project }>(`/api/projects/${projectId}`),
    activity: (projectId: number, limit = 50, offset = 0) =>
      request<{ activities: import("@/types").Activity[]; pagination: { limit: number; offset: number } }>(
        `/api/projects/${projectId}/activity?limit=${limit}&offset=${offset}`
      ),

    create: (payload: { name: string; description?: string; managerId?: number }) =>
      request<{ message: string; project: import("@/types").Project }>("/api/projects", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    update: (projectId: number, payload: { name?: string; description?: string }) =>
      request<{ message: string; project: import("@/types").Project }>(
        `/api/projects/${projectId}`,
        { method: "PATCH", body: JSON.stringify(payload) }
      ),

    archive: (projectId: number) =>
      request<{ message: string; project: import("@/types").Project }>(
        `/api/projects/${projectId}/archive`,
        { method: "PATCH" }
      ),

    // Members
    listMembers: (projectId: number) =>
      request<import("@/types").ProjectMember[]>(`/api/projects/${projectId}/members`),

    addMember: (projectId: number, userId: number, role: import("@/types").ProjectMemberRole) =>
      request<{ message: string; member: import("@/types").ProjectMember }>(
        `/api/projects/${projectId}/members`,
        { method: "POST", body: JSON.stringify({ userId, role }) }
      ),

    updateMemberRole: (projectId: number, userId: number, role: import("@/types").ProjectMemberRole) =>
      request<{ message: string; member: import("@/types").ProjectMember }>(
        `/api/projects/${projectId}/members/${userId}`,
        { method: "PATCH", body: JSON.stringify({ role }) }
      ),

    removeMember: (projectId: number, userId: number) =>
      request<{ message: string }>(
        `/api/projects/${projectId}/members/${userId}`,
        { method: "DELETE" }
      ),
  },

  // ─── Tasks ─────────────────────────────────────────────────────────────────

  tasks: {
    list: (projectId: number) =>
      request<import("@/types").Task[]>(`/api/projects/${projectId}/tasks`),
    get: (projectId: number, taskId: number) =>
      request<{ task: import("@/types").Task }>(`/api/projects/${projectId}/tasks/${taskId}`),
    remove: (projectId: number, taskId: number) =>
      request<{ message: string }>(`/api/projects/${projectId}/tasks/${taskId}`, { method: "DELETE" }),

    create: (projectId: number, title: string) =>
      request<{ message: string; task: import("@/types").Task }>(
        `/api/projects/${projectId}/tasks`,
        { method: "POST", body: JSON.stringify({ title }) }
      ),

    update: (
      projectId: number,
      taskId: number,
      payload: {
        version: number;
        title?: string;
        status?: import("@/types").TaskStatus;
        assignedTo?: number | null;
      }
    ) =>
      request<{ message: string; task: import("@/types").Task }>(
        `/api/projects/${projectId}/tasks/${taskId}`,
        { method: "PATCH", body: JSON.stringify(payload) }
      ),
  },

  // ─── Comments ──────────────────────────────────────────────────────────────

  comments: {
    list: (projectId: number, taskId: number) =>
      request<{ comments: import("@/types").Comment[] }>(
        `/api/projects/${projectId}/tasks/${taskId}/comments`
      ),

    create: (projectId: number, taskId: number, body: string) =>
      request<{ message: string; comment: import("@/types").Comment }>(
        `/api/projects/${projectId}/tasks/${taskId}/comments`,
        { method: "POST", body: JSON.stringify({ body }) }
      ),
    update: (projectId: number, taskId: number, commentId: number, body: string) =>
      request<{ message: string; comment: import("@/types").Comment }>(
        `/api/projects/${projectId}/tasks/${taskId}/comments/${commentId}`,
        { method: "PATCH", body: JSON.stringify({ body }) }
      ),
    remove: (projectId: number, taskId: number, commentId: number) =>
      request<{ message: string }>(
        `/api/projects/${projectId}/tasks/${taskId}/comments/${commentId}`,
        { method: "DELETE" }
      ),
  },

  // ─── Notifications ─────────────────────────────────────────────────────────

  notifications: {
    list: (limit = 20, offset = 0) =>
      request<import("@/types").NotificationsResponse>(
        `/api/notifications?limit=${limit}&offset=${offset}`
      ),

    markRead: (notificationId: number) =>
      request<{ message: string; notification: { id: number; is_read: boolean } }>(
        `/api/notifications/${notificationId}/read`,
        { method: "PATCH" }
      ),

    markAllRead: () =>
      request<{ message: string; updatedCount: number }>(
        "/api/notifications/read-all",
        { method: "PATCH" }
      ),
  },

  users: {
    list: () => request<{ users: import("@/types").AdminUser[] }>("/api/users"),
    create: (payload: { name: string; email: string; password: string; role: import("@/types").UserRole }) =>
      request<{ user: import("@/types").AdminUser }>("/api/users", { method: "POST", body: JSON.stringify(payload) }),
    update: (userId: number, payload: { name?: string; role?: import("@/types").UserRole; isActive?: boolean }) =>
      request<{ user: import("@/types").AdminUser }>(`/api/users/${userId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  },
};
