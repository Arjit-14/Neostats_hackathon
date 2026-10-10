
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const pool = require("../db");

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function makeToken() {
  return crypto.randomBytes(32).toString("hex");
}

function totp(secret, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 30000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const key = Buffer.from(secret, "base64url");
  const hash = crypto.createHmac("sha1", key).update(buffer).digest();
  const offset = hash[hash.length - 1] & 15;
  const code = ((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, "0");
  return code;
}

function validTotp(secret, code) {
  return typeof code === "string" && /^[0-9]{6}$/.test(code) &&
    [-30000, 0, 30000].some((offset) => crypto.timingSafeEqual(Buffer.from(totp(secret, Date.now() + offset)), Buffer.from(code)));
}

async function consumeRecoveryCode(userId, code) {
  if (typeof code !== "string" || code.length < 8) return false;
  const result = await pool.query("SELECT two_factor_recovery_code_hashes FROM users WHERE id = $1", [userId]);
  const hashes = result.rows[0]?.two_factor_recovery_code_hashes || [];
  const match = digest(code);
  const index = hashes.indexOf(match);
  if (index < 0) return false;
  hashes.splice(index, 1);
  await pool.query("UPDATE users SET two_factor_recovery_code_hashes = $1::jsonb WHERE id = $2", [JSON.stringify(hashes), userId]);
  return true;
}

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const result = await pool.query(
      `SELECT id, name, email, password_hash, role,
              is_active, token_version, two_factor_enabled, two_factor_secret
       FROM users
       WHERE email = $1`,
      [email.trim().toLowerCase()]
    );

    const user = result.rows[0];

    // Use the same response for unknown accounts and incorrect passwords.
    if (
      !user ||
      !user.is_active ||
      !(await bcrypt.compare(password, user.password_hash))
    ) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const hasAuthenticatorCode = validTotp(user.two_factor_secret, req.body.twoFactorCode);
    const hasRecoveryCode = await consumeRecoveryCode(user.id, req.body.recoveryCode);
    if (user.two_factor_enabled && !hasAuthenticatorCode && !hasRecoveryCode) {
      return res.status(401).json({ message: "A valid authenticator code is required" });
    }

    const token = jwt.sign(
      {
        tokenVersion: user.token_version,
      },
      process.env.JWT_SECRET,
      {
        subject: String(user.id),
        expiresIn: "15m",
        issuer: "neostats-api",
        audience: "neostats-client",
      }
    );

    res.json({
      message: "Login successful",
      token,
      expiresIn: 900,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error.message);
    res.status(500).json({ message: "Login failed" });
  }
};

exports.register = async (req, res) => {
  const { name, email, password } = req.body || {};
  if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 120 ||
      typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof password !== "string" || password.length < 12 || password.length > 128) {
    return res.status(400).json({ message: "Name, valid email, and a 12-128 character password are required" });
  }
  try {
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'viewer')
       RETURNING id, name, email, role, is_active, email_verified_at`,
      [name.trim(), email.trim().toLowerCase(), await bcrypt.hash(password, 12)]
    );
    res.status(201).json({ message: "Registration successful", user: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ message: "Email is already registered" });
    console.error("Registration error:", error.message);
    res.status(500).json({ message: "Registration failed" });
  }
};

exports.requestPasswordReset = async (req, res) => {
  const { email } = req.body || {};
  if (typeof email !== "string") return res.status(400).json({ message: "Email is required" });
  const result = await pool.query("SELECT id FROM users WHERE email = $1 AND is_active = TRUE", [email.trim().toLowerCase()]);
  if (result.rowCount > 0) {
    const raw = makeToken();
    await pool.query(
      "INSERT INTO account_tokens (user_id, token_hash, purpose, expires_at) VALUES ($1, $2, 'password_reset', NOW() + INTERVAL '15 minutes')",
      [result.rows[0].id, digest(raw)]
    );
    // Development delivery abstraction: expose only when explicitly enabled.
    if (process.env.EXPOSE_DEV_RESET_TOKEN === "true") console.info("Development password reset token:", raw);
  }
  res.json({ message: "If that account exists, reset instructions have been sent" });
};

exports.resetPassword = async (req, res) => {
  const { token, password } = req.body || {};
  if (typeof token !== "string" || typeof password !== "string" || password.length < 12 || password.length > 128) {
    return res.status(400).json({ message: "A valid token and 12-128 character password are required" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query("SELECT id, user_id FROM account_tokens WHERE token_hash = $1 AND purpose = 'password_reset' AND used_at IS NULL AND expires_at > NOW() FOR UPDATE", [digest(token)]);
    if (found.rowCount === 0) { await client.query("ROLLBACK"); return res.status(400).json({ message: "Invalid or expired reset token" }); }
    await client.query("UPDATE users SET password_hash = $1, token_version = token_version + 1, updated_at = NOW() WHERE id = $2", [await bcrypt.hash(password, 12), found.rows[0].user_id]);
    await client.query("UPDATE account_tokens SET used_at = NOW() WHERE id = $1", [found.rows[0].id]);
    await client.query("COMMIT");
    res.json({ message: "Password reset successfully" });
  } catch (error) { await client.query("ROLLBACK"); console.error("Reset password error:", error.message); res.status(500).json({ message: "Password reset failed" }); } finally { client.release(); }
};

exports.requestEmailVerification = async (req, res) => {
  const result = await pool.query("SELECT id FROM users WHERE id = $1 AND email_verified_at IS NULL", [req.user.id]);
  if (result.rowCount > 0) {
    const raw = makeToken();
    await pool.query("INSERT INTO account_tokens (user_id, token_hash, purpose, expires_at) VALUES ($1, $2, 'email_verification', NOW() + INTERVAL '24 hours')", [req.user.id, digest(raw)]);
    if (process.env.EXPOSE_DEV_RESET_TOKEN === "true") console.info("Development email verification token:", raw);
  }
  res.json({ message: "If verification is required, instructions have been sent" });
};

exports.verifyEmail = async (req, res) => {
  const token = req.body?.token;
  if (typeof token !== "string" || !token) return res.status(400).json({ message: "Verification token is required" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query("SELECT id, user_id FROM account_tokens WHERE token_hash = $1 AND purpose = 'email_verification' AND used_at IS NULL AND expires_at > NOW() FOR UPDATE", [digest(token)]);
    if (found.rowCount === 0) { await client.query("ROLLBACK"); return res.status(400).json({ message: "Invalid or expired verification token" }); }
    await client.query("UPDATE users SET email_verified_at = NOW(), updated_at = NOW() WHERE id = $1", [found.rows[0].user_id]);
    await client.query("UPDATE account_tokens SET used_at = NOW() WHERE id = $1", [found.rows[0].id]);
    await client.query("COMMIT");
    res.json({ message: "Email verified successfully" });
  } catch (error) { await client.query("ROLLBACK"); console.error("Verify email error:", error.message); res.status(500).json({ message: "Email verification failed" }); } finally { client.release(); }
};

exports.beginTwoFactor = async (req, res) => {
  const secret = crypto.randomBytes(20).toString("base64url");
  await pool.query("UPDATE users SET two_factor_pending_secret = $1 WHERE id = $2", [secret, req.user.id]);
  res.json({ secret, otpauth: `otpauth://totp/NeoStats:${encodeURIComponent(req.user.email)}?secret=${secret}&issuer=NeoStats` });
};

exports.confirmTwoFactor = async (req, res) => {
  const result = await pool.query("SELECT two_factor_pending_secret FROM users WHERE id = $1", [req.user.id]);
  const secret = result.rows[0]?.two_factor_pending_secret;
  if (!secret || !validTotp(secret, req.body?.code)) return res.status(400).json({ message: "Invalid authenticator code" });
  const recoveryCodes = Array.from({ length: 8 }, () => makeToken().slice(0, 10));
  await pool.query("UPDATE users SET two_factor_secret = $1, two_factor_pending_secret = NULL, two_factor_enabled = TRUE, two_factor_recovery_code_hashes = $2::jsonb, token_version = token_version + 1 WHERE id = $3", [secret, JSON.stringify(recoveryCodes.map(digest)), req.user.id]);
  res.json({ message: "Two-factor authentication enabled", recoveryCodes });
};

exports.disableTwoFactor = async (req, res) => {
  if (!req.body?.password) return res.status(400).json({ message: "Current password is required" });
  const result = await pool.query("SELECT password_hash FROM users WHERE id = $1", [req.user.id]);
  if (!(await bcrypt.compare(req.body.password, result.rows[0].password_hash))) return res.status(401).json({ message: "Invalid password" });
  await pool.query("UPDATE users SET two_factor_enabled = FALSE, two_factor_secret = NULL, two_factor_pending_secret = NULL, two_factor_recovery_code_hashes = '[]'::jsonb, token_version = token_version + 1 WHERE id = $1", [req.user.id]);
  res.json({ message: "Two-factor authentication disabled" });
};

exports.me = async (req, res) => {
  res.json({ user: req.user });
};

exports.logout = async (req, res) => {
  try {
    await pool.query(
      `UPDATE users
       SET token_version = token_version + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [req.user.id]
    );

    res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error.message);
    res.status(500).json({ message: "Logout failed" });
  }
};
