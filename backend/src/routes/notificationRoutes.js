
const express = require("express");
const router = express.Router();

const pool = require("../db");
const { requireAuth } = require("../middleware/authMiddleware");

router.use(requireAuth);

// GET /api/notifications
// List only the authenticated user's notifications.
router.get("/", async (req, res) => {
  try {
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const parsedOffset = Number.parseInt(req.query.offset, 10);

    const limit = Number.isInteger(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 100)
      : 20;

    const offset = Number.isInteger(parsedOffset)
      ? Math.max(parsedOffset, 0)
      : 0;

    const [notificationsResult, countResult] = await Promise.all([
      pool.query(
        `SELECT
           id,
           actor_id,
           project_id,
           event_type,
           message,
           entity_type,
           entity_id,
           is_read,
           created_at
         FROM notifications
         WHERE user_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT $2 OFFSET $3`,
        [req.user.id, limit, offset]
      ),

      pool.query(
        `SELECT COUNT(*)::int AS unread_count
         FROM notifications
         WHERE user_id = $1 AND is_read = FALSE`,
        [req.user.id]
      ),
    ]);

    return res.status(200).json({
      notifications: notificationsResult.rows,
      pagination: {
        limit,
        offset,
      },
      unreadCount: countResult.rows[0].unread_count,
    });
  } catch (error) {
    console.error("Get notifications error:", error.message);
    return res.status(500).json({
      message: "Failed to retrieve notifications",
    });
  }
});

// PATCH /api/notifications/read-all
// Mark all of the authenticated user's notifications as read.
router.patch("/read-all", async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE user_id = $1 AND is_read = FALSE
       RETURNING id`,
      [req.user.id]
    );

    return res.status(200).json({
      message: "Notifications marked as read",
      updatedCount: result.rowCount,
    });
  } catch (error) {
    console.error("Mark all notifications read error:", error.message);
    return res.status(500).json({
      message: "Failed to mark notifications as read",
    });
  }
});

// PATCH /api/notifications/:notificationId/read
// Mark one of the authenticated user's notifications as read.
router.patch("/:notificationId/read", async (req, res) => {
  try {
    const { notificationId } = req.params;

    if (!/^[1-9]\d*$/.test(notificationId)) {
      return res.status(400).json({
        message: "Invalid notification ID",
      });
    }

    const result = await pool.query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE id = $1 AND user_id = $2
       RETURNING id, is_read`,
      [notificationId, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Notification not found",
      });
    }

    return res.status(200).json({
      message: "Notification marked as read",
      notification: result.rows[0],
    });
  } catch (error) {
    console.error("Mark notification read error:", error.message);
    return res.status(500).json({
      message: "Failed to mark notification as read",
    });
  }
});

module.exports = router;
