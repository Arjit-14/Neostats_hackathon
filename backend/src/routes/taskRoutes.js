const express = require("express");
const router = express.Router();

const {
  getTasks,
  createTask
} = require("../controllers/taskController");

const { requireAuth } = require("../middleware/authMiddleware");

router.get("/", requireAuth, getTasks);
router.post("/", requireAuth, createTask);

module.exports = router;

