
const jwt = require("jsonwebtoken");
const pool = require("../db");

exports.requireAuth = async (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const token = authorization.slice(7).trim();

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "neostats-api",
      audience: "neostats-client",
    });

    if (!payload.sub || !Number.isInteger(payload.tokenVersion)) {
      return res.status(401).json({ message: "Invalid token" });
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
      return res.status(401).json({
        message: "Token is invalid or has been revoked",
      });
    }

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    next();
  } catch (error) {
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError" ||
      error.name === "NotBeforeError"
    ) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    console.error("Authentication error:", error.message);
    return res.status(500).json({ message: "Authentication failed" });
  }
};
