
require("dotenv").config();

const http = require("http");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const app = require("./app");
const pool = require("./db");

const PORT = process.env.PORT || 5000;

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

// Authenticate every socket connection using the existing JWT rules.
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;

    if (typeof token !== "string" || !token.trim()) {
      return next(new Error("Authentication required"));
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "neostats-api",
      audience: "neostats-client",
    });

    if (!payload.sub || !Number.isInteger(payload.tokenVersion)) {
      return next(new Error("Invalid token"));
    }

    const result = await pool.query(
      `SELECT id, name, email, role, is_active, token_version
       FROM users
       WHERE id = $1`,
      [payload.sub]
    );

    const user = result.rows[0];

    if (
      !user ||
      !user.is_active ||
      user.token_version !== payload.tokenVersion
    ) {
      return next(new Error("Token invalid or revoked"));
    }

    socket.data.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    next();
  } catch (error) {
    if (
      error.name !== "JsonWebTokenError" &&
      error.name !== "TokenExpiredError" &&
      error.name !== "NotBeforeError"
    ) {
      console.error("Socket authentication error:", error.message);
    }

    next(new Error("Invalid or expired token"));
  }
});

io.on("connection", (socket) => {
  const user = socket.data.user;

  // Each user receives their own notification events.
  socket.join(`user:${user.id}`);

  console.log(`Socket connected for user ${user.id}`);

  socket.on("join-project", async (projectId) => {
    try {
      // Accept only positive integer project IDs.
      if (
        !(
          (typeof projectId === "number" ||
            (typeof projectId === "string" &&
              /^[1-9]\d*$/.test(projectId))) &&
          Number.isSafeInteger(Number(projectId)) &&
          Number(projectId) > 0
        )
      ) {
        socket.emit("socket-error", {
          message: "Invalid project ID",
        });
        return;
      }

      const id = Number(projectId);

      // Check authorization against the database on every join request.
      let authorized = user.role === "admin";

      if (!authorized) {
        const membership = await pool.query(
          `SELECT 1
           FROM project_members pm
           JOIN projects p ON p.id = pm.project_id
           WHERE pm.project_id = $1
             AND pm.user_id = $2
             AND p.is_archived = FALSE
           LIMIT 1`,
          [id, user.id]
        );

        authorized = membership.rowCount > 0;
      } else {
        const project = await pool.query(
          `SELECT 1
           FROM projects
           WHERE id = $1 AND is_archived = FALSE`,
          [id]
        );

        authorized = project.rowCount > 0;
      }

      if (!authorized) {
        socket.emit("socket-error", {
          message: "You are not authorized to join this project",
        });
        return;
      }

      socket.join(`project:${id}`);

      socket.emit("project-joined", {
        projectId: id,
      });
    } catch (error) {
      console.error("Project room authorization failed:", error.message);

      socket.emit("socket-error", {
        message: "Unable to join project",
      });
    }
  });

  socket.on("leave-project", (projectId) => {
    if (
      (typeof projectId === "number" ||
        (typeof projectId === "string" &&
          /^[1-9]\d*$/.test(projectId))) &&
      Number.isSafeInteger(Number(projectId)) &&
      Number(projectId) > 0
    ) {
      socket.leave(`project:${Number(projectId)}`);
    }
  });

  socket.on("disconnect", () => {
    console.log(`Socket disconnected for user ${user.id}`);
  });
});

// Allow REST routes to publish events through this Socket.IO instance.
app.set("io", io);

httpServer.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
  console.log("Socket.IO server is ready");
});
