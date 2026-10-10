
const express = require("express");
const router = express.Router();

const {
  login,
  register,
  me,
  logout,
  requestPasswordReset,
  resetPassword,
  beginTwoFactor,
  confirmTwoFactor,
  disableTwoFactor,
  requestEmailVerification,
  verifyEmail,
} = require("../controllers/authController");

const { requireAuth } = require("../middleware/authMiddleware");
const { rateLimit } = require("../middleware/rateLimit");

const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

router.post("/register", authLimit, register);
router.post("/login", authLimit, login);
router.post("/password-reset/request", authLimit, requestPasswordReset);
router.post("/password-reset/confirm", authLimit, resetPassword);
router.post("/email-verification/confirm", authLimit, verifyEmail);
router.get("/me", requireAuth, me);
router.post("/logout", requireAuth, logout);
router.post("/email-verification/request", requireAuth, requestEmailVerification);
router.post("/2fa/begin", requireAuth, beginTwoFactor);
router.post("/2fa/confirm", requireAuth, confirmTwoFactor);
router.post("/2fa/disable", requireAuth, disableTwoFactor);

module.exports = router;
