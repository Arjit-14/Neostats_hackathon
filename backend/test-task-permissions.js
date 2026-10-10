
require("dotenv").config();

const { execFileSync } = require("node:child_process");
const BASE_URL = "http://localhost:5000";

async function request(path, token, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  return {
    status: response.status,
    data: await response.json().catch(() => ({})),
  };
}

async function login(email, password) {
  const result = await request("/api/auth/login", "", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  if (result.status !== 200 || !result.data.token) {
    throw new Error(`Login failed: ${JSON.stringify(result.data)}`);
  }

  return result.data.token;
}

async function main() {
  // Find a notification owned by viewer user ID 4.
  const notificationId = execFileSync(
    "docker",
    [
      "exec",
      "neostats-postgres",
      "psql",
      "-U", "postgres",
      "-d", "neostats",
      "-t",
      "-A",
      "-c",
      "SELECT id FROM notifications WHERE user_id = 4 ORDER BY id DESC LIMIT 1;",
    ],
    { encoding: "utf8" }
  ).trim();

  if (!notificationId) {
    throw new Error("No notification exists for viewer user 4.");
  }

  // Authenticate as team member user ID 3, NOT the viewer.
  const token = await login(
    process.env.TEST_MEMBER_EMAIL || "member@neostats.local",
    process.env.TEST_MEMBER_PASSWORD
  );

  console.log("Team member login successful.");
  console.log("Target notification belongs to viewer user 4.");
  console.log("Target notification ID:", notificationId);

  // Attempt to modify another user's notification.
  const result = await request(
    `/api/notifications/${notificationId}/read`,
    token,
    { method: "PATCH" }
  );

  console.log("Cross-user read attempt:", result.status, result.data);

  if (result.status !== 404) {
    throw new Error(
      "FAIL: Expected 404 when updating another user's notification."
    );
  }

  console.log(
    "PASS: A team member cannot mark a viewer's notification as read."
  );
}

main().catch((error) => {
  console.error("Test failed:", error.message);
  process.exitCode = 1;
});
