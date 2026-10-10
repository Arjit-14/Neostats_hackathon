const pool = require("../db");

exports.getTasks = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM tasks ORDER BY id DESC"
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch tasks" });
  }
};

exports.createTask = async (req, res) => {
  try {
    const { title } = req.body;

    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({
        message: "Task title is required",
      });
    }

    const result = await pool.query(
      "INSERT INTO tasks (title) VALUES ($1) RETURNING *",
      [title.trim()]
    );

    res.status(201).json({
      message: "Task created successfully",
      task: result.rows[0],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to create task" });
  }
};