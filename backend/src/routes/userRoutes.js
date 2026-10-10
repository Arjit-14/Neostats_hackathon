const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("../db");
const { requireAuth } = require("../middleware/authMiddleware");
const { requireAdmin } = require("../middleware/adminMiddleware");

const router = express.Router();
router.use(requireAuth, requireAdmin);

const roles = ["admin", "project_manager", "team_member", "viewer"];

router.get("/", async (req, res) => {
  const result = await pool.query(
    "SELECT id, name, email, role, is_active, email_verified_at, two_factor_enabled, created_at, updated_at FROM users ORDER BY id"
  );
  res.json({ users: result.rows });
});

router.post("/", async (req, res) => {
  const { name, email, password, role = "viewer" } = req.body || {};
  if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 120) {
    return res.status(400).json({ message: "Name must contain 2-120 characters" });
  }
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ message: "A valid email address is required" });
  }
  if (typeof password !== "string" || password.length < 12 || password.length > 128) {
    return res.status(400).json({ message: "Password must contain 12-128 characters" });
  }
  if (!roles.includes(role)) return res.status(400).json({ message: "Invalid user role" });

  try {
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, email_verified_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, name, email, role, is_active, email_verified_at, two_factor_enabled, created_at`,
      [name.trim(), email.trim().toLowerCase(), await bcrypt.hash(password, 12), role]
    );
    res.status(201).json({ user: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ message: "Email is already registered" });
    console.error("Create user error:", error.message);
    res.status(500).json({ message: "Failed to create user" });
  }
});

router.patch("/:userId", async (req, res) => {
  const userId = Number(req.params.userId);
  const { name, role, isActive } = req.body || {};
  if (!Number.isSafeInteger(userId) || userId < 1) return res.status(400).json({ message: "Invalid user ID" });
  if (name !== undefined && (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 120)) return res.status(400).json({ message: "Invalid name" });
  if (role !== undefined && !roles.includes(role)) return res.status(400).json({ message: "Invalid user role" });
  if (isActive !== undefined && typeof isActive !== "boolean") return res.status(400).json({ message: "isActive must be boolean" });
  if (userId === req.user.id && (role !== undefined && role !== "admin" || isActive === false)) return res.status(400).json({ message: "You cannot deactivate or demote your own admin account" });

  const result = await pool.query(
    `UPDATE users SET
       name = COALESCE($1, name),
       role = COALESCE($2, role),
       is_active = COALESCE($3, is_active),
       token_version = CASE WHEN $3 = FALSE OR $2 IS NOT NULL THEN token_version + 1 ELSE token_version END,
       updated_at = NOW()
     WHERE id = $4
     RETURNING id, name, email, role, is_active, email_verified_at, two_factor_enabled, created_at, updated_at`,
    [name?.trim() ?? null, role ?? null, isActive ?? null, userId]
  );
  if (result.rowCount === 0) return res.status(404).json({ message: "User not found" });
  res.json({ user: result.rows[0] });
});

module.exports = router;
