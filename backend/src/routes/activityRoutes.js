const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/authMiddleware");
const { requireProjectAccess } = require("../middleware/projectAccess");

const router = express.Router();
router.use(requireAuth);

router.get("/:projectId/activity", requireProjectAccess(), async (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
  const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
  const result = await pool.query(
    `SELECT a.id, a.user_id, a.project_id, a.action, a.entity_type, a.entity_id,
            a.metadata, a.created_at, u.name AS actor_name
       FROM activity_logs a
       LEFT JOIN users u ON u.id = a.user_id
      WHERE a.project_id = $1
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT $2 OFFSET $3`,
    [req.params.projectId, limit, offset]
  );
  res.json({ activities: result.rows, pagination: { limit, offset } });
});

module.exports = router;
