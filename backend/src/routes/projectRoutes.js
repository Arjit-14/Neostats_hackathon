const express = require("express");
const router = express.Router();

const pool = require("../db");
const { requireAuth } = require("../middleware/authMiddleware");
const { requireProjectAccess } = require("../middleware/projectAccess");

const {
  recordActivity,
  notifyProjectMembers,
} = require("../services/activityService");

router.use(requireAuth);

const validMemberRoles = ["project_manager", "team_member", "viewer"];

// List members of an accessible project.
router.get("/:projectId/members", requireProjectAccess(), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, pm.role, pm.joined_at
         FROM project_members pm
         JOIN users u ON u.id = pm.user_id
         WHERE pm.project_id = $1
         ORDER BY pm.joined_at`,
      [req.params.projectId],
    );

    res.json(result.rows);
  } catch (error) {
    console.error("List members error:", error.message);
    res.status(500).json({ message: "Failed to fetch project members" });
  }
});

// Add a member to a project.
router.post(
  "/:projectId/members",
  requireProjectAccess(["project_manager"]),
  async (req, res) => {
    const { userId, role } = req.body || {};

    if (
      !/^[1-9]\d*$/.test(String(userId ?? "")) ||
      !validMemberRoles.includes(role)
    ) {
      return res.status(400).json({
        message: "A valid userId and project role are required",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const userResult = await client.query(
        `SELECT id, name, email, role
         FROM users
         WHERE id = $1 AND is_active = TRUE`,
        [userId],
      );

      if (userResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          message: "Active user not found",
        });
      }

      if (userResult.rows[0].role === "admin") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Admins already have platform-wide project access",
        });
      }

      const existing = await client.query(
        `SELECT 1 FROM project_members
         WHERE project_id = $1 AND user_id = $2`,
        [req.params.projectId, userId],
      );

      if (existing.rowCount > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: "User is already a member of this project",
        });
      }

      const inserted = await client.query(
        `INSERT INTO project_members (project_id, user_id, role)
         VALUES ($1, $2, $3)
         RETURNING project_id, user_id, role, joined_at`,
        [req.params.projectId, userId, role],
      );

      if (role === "project_manager") {
        await client.query(
          `UPDATE projects
           SET manager_id = $1, updated_at = NOW()
           WHERE id = $2 AND manager_id IS NULL`,
          [userId, req.params.projectId],
        );
      }

      await client.query("COMMIT");

      res.status(201).json({
        message: "Project member added successfully",
        member: {
          ...inserted.rows[0],
          name: userResult.rows[0].name,
          email: userResult.rows[0].email,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Add member error:", error.message);
      res.status(500).json({ message: "Failed to add project member" });
    } finally {
      client.release();
    }
  },
);

// Update a comment by its author, or by a project manager/admin.
router.get(
  "/:projectId/tasks/:taskId",
  requireProjectAccess(),
  async (req, res) => {
    const result = await pool.query(
      "SELECT * FROM tasks WHERE id = $1 AND project_id = $2",
      [req.params.taskId, req.params.projectId]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: "Task not found in this project" });
    res.json({ task: result.rows[0] });
  }
);

router.delete(
  "/:projectId/tasks/:taskId",
  requireProjectAccess(["project_manager"]),
  async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        "DELETE FROM tasks WHERE id = $1 AND project_id = $2 RETURNING id",
        [req.params.taskId, req.params.projectId]
      );
      if (result.rowCount === 0) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Task not found in this project" }); }
      await recordActivity(client, { userId: req.user.id, projectId: Number(req.params.projectId), action: "task.deleted", entityType: "task", entityId: result.rows[0].id });
      await client.query("COMMIT");
      const io = req.app.get("io");
      if (io) io.to(`project:${Number(req.params.projectId)}`).emit("task.deleted", { projectId: Number(req.params.projectId), taskId: Number(req.params.taskId) });
      res.json({ message: "Task deleted successfully" });
    } catch (error) { await client.query("ROLLBACK"); console.error("Delete task error:", error.message); res.status(500).json({ message: "Failed to delete task" }); } finally { client.release(); }
  }
);

router.patch(
  "/:projectId/tasks/:taskId/comments/:commentId",
  requireProjectAccess(),
  async (req, res) => {
    const { body } = req.body || {};
    if (typeof body !== "string" || !body.trim() || body.trim().length > 5000) {
      return res.status(400).json({ message: "Comment body must contain 1-5000 characters" });
    }
    const result = await pool.query(
      `UPDATE comments c
          SET body = $1, updated_at = NOW()
         FROM tasks t
        WHERE c.id = $2 AND c.task_id = t.id AND t.project_id = $3
          AND (c.user_id = $4 OR $5 IN ('admin', 'project_manager'))
        RETURNING c.id, c.task_id, c.user_id, c.body, c.created_at, c.updated_at`,
      [body.trim(), req.params.commentId, req.params.projectId, req.user.id, req.projectRole]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: "Comment not found or not editable" });
    res.json({ message: "Comment updated successfully", comment: result.rows[0] });
  }
);

router.delete(
  "/:projectId/tasks/:taskId/comments/:commentId",
  requireProjectAccess(),
  async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `DELETE FROM comments c
          USING tasks t
         WHERE c.id = $1 AND c.task_id = t.id AND t.project_id = $2
           AND (c.user_id = $3 OR $4 IN ('admin', 'project_manager'))
         RETURNING c.id, c.task_id`,
        [req.params.commentId, req.params.projectId, req.user.id, req.projectRole]
      );
      if (result.rowCount === 0) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Comment not found or not deletable" }); }
      await client.query(
        `INSERT INTO activity_logs (user_id, project_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'comment.deleted', 'comment', $3, $4::jsonb)`,
        [req.user.id, req.params.projectId, result.rows[0].id, JSON.stringify({ taskId: result.rows[0].task_id })]
      );
      await client.query("COMMIT");
      res.json({ message: "Comment deleted successfully" });
    } catch (error) { await client.query("ROLLBACK"); console.error("Delete comment error:", error.message); res.status(500).json({ message: "Failed to delete comment" }); } finally { client.release(); }
  }
);

// Change a member's project-level role.
router.patch(
  "/:projectId/members/:userId",
  requireProjectAccess(["project_manager"]),
  async (req, res) => {
    const { role } = req.body || {};
    const { projectId, userId } = req.params;

    if (!validMemberRoles.includes(role)) {
      return res.status(400).json({
        message: "A valid project role is required",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const updated = await client.query(
        `UPDATE project_members pm
         SET role = $1
         FROM users u
         WHERE pm.project_id = $2
           AND pm.user_id = $3
           AND u.id = pm.user_id
           AND u.is_active = TRUE
           AND u.role <> 'admin'
         RETURNING pm.project_id, pm.user_id, pm.role, pm.joined_at`,
        [role, projectId, userId],
      );

      if (updated.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          message: "Project member not found",
        });
      }

      if (role === "project_manager") {
        await client.query(
          `UPDATE projects
           SET manager_id = $1, updated_at = NOW()
           WHERE id = $2`,
          [userId, projectId],
        );
      } else {
        await client.query(
          `UPDATE projects
           SET manager_id = NULL, updated_at = NOW()
           WHERE id = $1 AND manager_id = $2`,
          [projectId, userId],
        );
      }

      await client.query("COMMIT");

      res.json({
        message: "Project member role updated successfully",
        member: updated.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Update member role error:", error.message);
      res.status(500).json({ message: "Failed to update member role" });
    } finally {
      client.release();
    }
  },
);

// Remove a member from a project.
router.delete(
  "/:projectId/members/:userId",
  requireProjectAccess(["project_manager"]),
  async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const removed = await client.query(
        `DELETE FROM project_members
         WHERE project_id = $1 AND user_id = $2
         RETURNING user_id`,
        [req.params.projectId, req.params.userId],
      );

      if (removed.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          message: "Project member not found",
        });
      }

      await client.query(
        `UPDATE projects
         SET manager_id = NULL, updated_at = NOW()
         WHERE id = $1 AND manager_id = $2`,
        [req.params.projectId, req.params.userId],
      );

      await client.query("COMMIT");

      res.json({ message: "Project member removed successfully" });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Remove member error:", error.message);
      res.status(500).json({ message: "Failed to remove project member" });
    } finally {
      client.release();
    }
  },
);

// List projects visible to the current user.
router.get("/", async (req, res) => {
  try {
    const result =
      req.user.role === "admin"
        ? await pool.query(
            `SELECT * FROM projects
           WHERE is_archived = FALSE
           ORDER BY created_at DESC`,
          )
        : await pool.query(
            `SELECT p.*
           FROM projects p
           JOIN project_members pm ON pm.project_id = p.id
           WHERE pm.user_id = $1 AND p.is_archived = FALSE
           ORDER BY p.created_at DESC`,
            [req.user.id],
          );

    res.json(result.rows);
  } catch (error) {
    console.error("List projects error:", error.message);
    res.status(500).json({ message: "Failed to fetch projects" });
  }
});

// Create a project.
// Admins can optionally assign a project manager.
// Project managers automatically become manager of their own project.
router.post("/", async (req, res) => {
  const { name, description, managerId } = req.body || {};

  if (typeof name !== "string" || !name.trim() || name.trim().length > 180) {
    return res.status(400).json({
      message: "Project name must contain 1–180 characters",
    });
  }

  if (
    description !== undefined &&
    description !== null &&
    typeof description !== "string"
  ) {
    return res.status(400).json({
      message: "Description must be a string",
    });
  }

  if (description && description.length > 10000) {
    return res.status(400).json({
      message: "Description cannot exceed 10000 characters",
    });
  }

  if (
    managerId !== undefined &&
    managerId !== null &&
    (!/^\d+$/.test(String(managerId)) || Number(managerId) < 1)
  ) {
    return res.status(400).json({
      message: "managerId must be a valid user ID",
    });
  }

  if (req.user.role !== "admin" && req.user.role !== "project_manager") {
    return res.status(403).json({
      message: "Only admins and project managers can create projects",
    });
  }

  if (req.user.role !== "admin" && managerId != null) {
    return res.status(403).json({
      message: "Only admins can assign a project manager",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let assignedManagerId =
      req.user.role === "project_manager" ? req.user.id : null;

    if (req.user.role === "admin" && managerId != null) {
      const manager = await client.query(
        `SELECT id FROM users
         WHERE id = $1
           AND role = 'project_manager'
           AND is_active = TRUE`,
        [managerId],
      );

      if (manager.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "The selected manager is not an active project manager",
        });
      }

      assignedManagerId = manager.rows[0].id;
    }

    const created = await client.query(
      `INSERT INTO projects (name, description, manager_id, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        name.trim(),
        description?.trim() || null,
        assignedManagerId,
        req.user.id,
      ],
    );

    const project = created.rows[0];

    if (assignedManagerId != null) {
      await client.query(
        `INSERT INTO project_members (project_id, user_id, role)
         VALUES ($1, $2, 'project_manager')
         ON CONFLICT (project_id, user_id)
         DO UPDATE SET role = 'project_manager'`,
        [project.id, assignedManagerId],
      );
    }

    await client.query("COMMIT");

    res.status(201).json({
      message: "Project created successfully",
      project,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Create project error:", error.message);
    res.status(500).json({ message: "Failed to create project" });
  } finally {
    client.release();
  }
});

// Read project details.
router.get("/:projectId", requireProjectAccess(), async (req, res) => {
  res.json({ project: req.project });
});

// Update project details.
// Only admins and project managers of this project can update it.
router.patch(
  "/:projectId",
  requireProjectAccess(["project_manager"]),
  async (req, res) => {
    const { name, description } = req.body || {};

    if (name === undefined && description === undefined) {
      return res.status(400).json({
        message: "Provide a name or description to update",
      });
    }

    if (
      name !== undefined &&
      (typeof name !== "string" || !name.trim() || name.trim().length > 180)
    ) {
      return res.status(400).json({
        message: "Project name must contain 1–180 characters",
      });
    }

    if (
      description !== undefined &&
      description !== null &&
      (typeof description !== "string" || description.length > 10000)
    ) {
      return res.status(400).json({
        message: "Description must be a string of at most 10000 characters",
      });
    }

    try {
      const result = await pool.query(
        `UPDATE projects
         SET name = COALESCE($1, name),
             description = CASE
               WHEN $2::boolean THEN $3::text
               ELSE description
             END,
             updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [
          name === undefined ? null : name.trim(),
          description !== undefined,
          description === undefined ? null : description?.trim() || null,
          req.params.projectId,
        ],
      );

      res.json({
        message: "Project updated successfully",
        project: result.rows[0],
      });
    } catch (error) {
      console.error("Update project error:", error.message);
      res.status(500).json({ message: "Failed to update project" });
    }
  },
);

// Archive a project instead of deleting it permanently.
router.patch(
  "/:projectId/archive",
  requireProjectAccess(["project_manager"]),
  async (req, res) => {
    try {
      const result = await pool.query(
        `UPDATE projects
         SET is_archived = TRUE,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [req.params.projectId],
      );

      res.json({
        message: "Project archived successfully",
        project: result.rows[0],
      });
    } catch (error) {
      console.error("Archive project error:", error.message);
      res.status(500).json({ message: "Failed to archive project" });
    }
  },
);

// List tasks belonging to an accessible project.
router.get("/:projectId/tasks", requireProjectAccess(), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT *
         FROM tasks
         WHERE project_id = $1
         ORDER BY id DESC`,
      [req.params.projectId],
    );

    res.json(result.rows);
  } catch (error) {
    console.error("List project tasks error:", error.message);
    res.status(500).json({ message: "Failed to fetch project tasks" });
  }
});

router.get(
  "/:projectId/tasks/:taskId/comments",
  requireProjectAccess(),
  async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const taskId = Number(req.params.taskId);

      if (!Number.isInteger(taskId) || taskId <= 0) {
        return res.status(400).json({ message: "Invalid task ID" });
      }

      // Verify that the task belongs to this project.
      const taskResult = await pool.query(
        "SELECT id FROM tasks WHERE id = $1 AND project_id = $2",
        [taskId, projectId],
      );

      if (taskResult.rowCount === 0) {
        return res.status(404).json({
          message: "Task not found in this project",
        });
      }

      const result = await pool.query(
        `SELECT
           c.id,
           c.task_id,
           c.user_id,
           c.body,
           c.created_at,
           c.updated_at,
           u.name AS author_name
         FROM comments c
         JOIN users u ON u.id = c.user_id
         WHERE c.task_id = $1
         ORDER BY c.created_at ASC, c.id ASC`,
        [taskId],
      );

      return res.status(200).json({ comments: result.rows });
    } catch (error) {
      console.error("Get comments error:", error.message);
      return res.status(500).json({
        message: "Failed to retrieve comments",
      });
    }
  },
);

// Create tasks: admins and project managers only.
router.post(
  "/:projectId/tasks",
  requireProjectAccess(["project_manager"]),
  async (req, res) => {
    try {
      const { title } = req.body || {};

      if (
        typeof title !== "string" ||
        !title.trim() ||
        title.trim().length > 255
      ) {
        return res.status(400).json({
          message: "Task title must contain 1–255 characters",
        });
      }

      const result = await pool.query(
        `INSERT INTO tasks (title, project_id)
         VALUES ($1, $2)
         RETURNING *`,
        [title.trim(), req.params.projectId],
      );

      res.status(201).json({
        message: "Task created successfully",
        task: result.rows[0],
      });
    } catch (error) {
      console.error("Create project task error:", error.message);
      res.status(500).json({ message: "Failed to create task" });
    }
  },
);

router.post(
  "/:projectId/tasks/:taskId/comments",
  requireProjectAccess(["project_manager", "team_member"]),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const projectId = Number(req.params.projectId);
      const taskId = Number(req.params.taskId);
      const { body } = req.body;

      if (!Number.isInteger(taskId) || taskId <= 0) {
        return res.status(400).json({ message: "Invalid task ID" });
      }

      if (!Number.isInteger(projectId) || projectId <= 0) {
        return res.status(400).json({ message: "Invalid project ID" });
      }

      if (typeof body !== "string" || !body.trim()) {
        return res.status(400).json({
          message: "Comment body is required",
        });
      }

      if (body.trim().length > 5000) {
        return res.status(400).json({
          message: "Comment cannot exceed 5000 characters",
        });
      }

      await client.query("BEGIN");

      // Verify that the task belongs to this project.
      const taskResult = await client.query(
        "SELECT id FROM tasks WHERE id = $1 AND project_id = $2",
        [taskId, projectId],
      );

      if (taskResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          message: "Task not found in this project",
        });
      }

      // Create the comment.
      const result = await client.query(
        `INSERT INTO comments (task_id, user_id, body)
         VALUES ($1, $2, $3)
         RETURNING id, task_id, user_id, body, created_at, updated_at`,
        [taskId, req.user.id, body.trim()],
      );

      const comment = result.rows[0];

      // Record the activity in the same transaction.
      await recordActivity(client, {
        userId: req.user.id,
        projectId,
        action: "comment.created",
        entityType: "comment",
        entityId: comment.id,
        metadata: {
          taskId,
          commentId: comment.id,
        },
      });

      // Notify other project members.
      const createdNotifications = await notifyProjectMembers(client, {
        projectId,
        actorId: req.user.id,
        eventType: "comment.created",
        message: `${req.user.name || "A team member"} commented on a task`,
        entityType: "comment",
        entityId: comment.id,
      });

      await client.query("COMMIT");

      const io = req.app.get("io");

      if (io) {
        io.to(`project:${Number(projectId)}`).emit("comment.created", {
          projectId: Number(projectId),
          taskId: Number(taskId),
          comment,
        });

        for (const notification of createdNotifications) {
          io.to(`user:${notification.user_id}`).emit("notification.created", {
            notificationId: notification.id,
            projectId: Number(projectId),
            eventType: "comment.created",
            entityType: "comment",
            entityId: comment.id,
          });
        }
      }

      return res.status(201).json({
        message: "Comment created successfully",
        comment,
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Create comment error:", error.message);

      return res.status(500).json({
        message: "Failed to create comment",
      });
    } finally {
      client.release();
    }
  },
);

const validTaskStatuses = ["todo", "in_progress", "done", "blocked"];

// Update a task with optimistic concurrency control.

router.patch(
  "/:projectId/tasks/:taskId",
  requireProjectAccess(),
  async (req, res) => {
    const { projectId, taskId } = req.params;
    const { version, title, status, assignedTo } = req.body || {};

    if (!/^[1-9]\d*$/.test(taskId)) {
      return res.status(400).json({ message: "Invalid task ID" });
    }

    if (!Number.isInteger(version) || version < 1) {
      return res.status(400).json({
        message: "The current task version is required",
      });
    }

    if (
      title === undefined &&
      status === undefined &&
      assignedTo === undefined
    ) {
      return res.status(400).json({
        message: "Provide at least one field to update",
      });
    }

    if (
      title !== undefined &&
      (typeof title !== "string" || !title.trim() || title.trim().length > 255)
    ) {
      return res.status(400).json({
        message: "Task title must contain 1–255 characters",
      });
    }

    if (status !== undefined && !validTaskStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid task status" });
    }

    if (
      assignedTo !== undefined &&
      assignedTo !== null &&
      !/^[1-9]\d*$/.test(String(assignedTo))
    ) {
      return res.status(400).json({
        message: "assignedTo must be a valid user ID or null",
      });
    }

    const isAdmin = req.projectRole === "admin";
    const isManager = req.projectRole === "project_manager";
    const isTeamMember = req.projectRole === "team_member";

    if (!isAdmin && !isManager && !isTeamMember) {
      return res.status(403).json({
        message: "Your role cannot update tasks",
      });
    }

    // Team members may change status only, and only on their assigned tasks.
    if (isTeamMember) {
      if (
        title !== undefined ||
        assignedTo !== undefined ||
        status === undefined
      ) {
        return res.status(403).json({
          message: "Team members can only update task status",
        });
      }
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const found = await client.query(
        `SELECT *
         FROM tasks
         WHERE id = $1 AND project_id = $2
         FOR UPDATE`,
        [taskId, projectId],
      );

      if (found.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          message: "Task not found in this project",
        });
      }

      const task = found.rows[0];

      if (isTeamMember && String(task.assigned_to) !== String(req.user.id)) {
        await client.query("ROLLBACK");
        return res.status(403).json({
          message: "You can only update tasks assigned to you",
        });
      }

      if (task.version !== version) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: "Task was changed by someone else. Refresh and retry.",
          currentVersion: task.version,
        });
      }

      let newAssignedTo = task.assigned_to;

      if (assignedTo !== undefined) {
        newAssignedTo = assignedTo;

        if (assignedTo !== null) {
          const member = await client.query(
            `SELECT pm.user_id
             FROM project_members pm
             JOIN users u ON u.id = pm.user_id
             WHERE pm.project_id = $1
               AND pm.user_id = $2
               AND pm.role = 'team_member'
               AND u.is_active = TRUE`,
            [projectId, assignedTo],
          );

          if (member.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({
              message: "Assignee must be an active team member of this project",
            });
          }
        }
      }

      const newTitle = title === undefined ? task.title : title.trim();
      const newStatus = status === undefined ? task.status : status;
      const newCompleted = newStatus === "done";

      const updated = await client.query(
        `UPDATE tasks
         SET title = $1,
             status = $2,
             completed = $4,
             assigned_to = $3,
             version = version + 1,
             updated_at = NOW()
         WHERE id = $5
           AND project_id = $6
           AND version = $7
         RETURNING *`,
        [
          newTitle,
          newStatus,
          newAssignedTo,
          newCompleted,
          taskId,
          projectId,
          version,
        ],
      );

      if (updated.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: "Task changed concurrently. Refresh and retry.",
        });
      }

      const updatedTask = updated.rows[0];

      // Describe exactly what changed for the audit trail.
      const changes = {};

      if (newTitle !== task.title) {
        changes.title = { from: task.title, to: newTitle };
      }

      if (newStatus !== task.status) {
        changes.status = { from: task.status, to: newStatus };
      }

      if (String(newAssignedTo ?? "") !== String(task.assigned_to ?? "")) {
        changes.assignedTo = {
          from: task.assigned_to,
          to: newAssignedTo,
        };
      }

      await recordActivity(client, {
        userId: req.user.id,
        projectId: Number(projectId),
        action: "task.updated",
        entityType: "task",
        entityId: updatedTask.id,
        metadata: {
          changes,
          previousVersion: task.version,
          newVersion: updatedTask.version,
        },
      });

      const createdNotifications = await notifyProjectMembers(client, {
        projectId: Number(projectId),
        actorId: req.user.id,
        eventType: "task.updated",
        message: `${req.user.name || "A team member"} updated a task`,
        entityType: "task",
        entityId: updatedTask.id,
      });

      await client.query("COMMIT");

      const io = req.app.get("io");

      if (io) {
        io.to(`project:${Number(projectId)}`).emit("task.updated", {
          projectId: Number(projectId),
          task: updatedTask,
          changes,
        });

        for (const notification of createdNotifications) {
          io.to(`user:${notification.user_id}`).emit("notification.created", {
            notificationId: notification.id,
            projectId: Number(projectId),
            eventType: "task.updated",
            entityType: "task",
            entityId: updatedTask.id,
          });
        }
      }

      return res.json({
        message: "Task updated successfully",
        task: updatedTask,
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Update task error:", error.message);
      console.error("PostgreSQL code:", error.code);
      console.error("Detail:", error.detail);

      return res.status(500).json({
        message: "Failed to update task",
      });
    } finally {
      client.release();
    }
  },
);

module.exports = router;
