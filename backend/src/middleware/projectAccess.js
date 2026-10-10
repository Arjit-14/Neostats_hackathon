
const pool = require("../db");

exports.requireProjectAccess = (allowedRoles = []) => {
  return async (req, res, next) => {
    try {
      const projectId = req.params.projectId;

      if (!/^\d+$/.test(projectId || "") || Number(projectId) < 1) {
        return res.status(400).json({
          message: "A valid project ID is required",
        });
      }

      const projectResult = await pool.query(
        `SELECT id, name, description, manager_id, created_by,
                is_archived, created_at, updated_at
         FROM projects
         WHERE id = $1`,
        [projectId]
      );

      if (projectResult.rowCount === 0) {
        return res.status(404).json({
          message: "Project not found",
        });
      }

      req.project = projectResult.rows[0];

      if (req.user.role === "admin") {
        req.projectRole = "admin";
        return next();
      }

      const membershipResult = await pool.query(
        `SELECT role
         FROM project_members
         WHERE project_id = $1 AND user_id = $2`,
        [projectId, req.user.id]
      );

      if (membershipResult.rowCount === 0) {
        return res.status(403).json({
          message: "You do not have access to this project",
        });
      }

      const membershipRole = membershipResult.rows[0].role;

      if (
        allowedRoles.length > 0 &&
        !allowedRoles.includes(membershipRole)
      ) {
        return res.status(403).json({
          message: "Your project role does not permit this action",
        });
      }

      req.projectRole = membershipRole;
      next();
    } catch (error) {
      console.error("Project authorization error:", error.message);
      res.status(500).json({
        message: "Failed to verify project access",
      });
    }
  };
};
