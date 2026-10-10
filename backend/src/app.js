require("dotenv").config();

const express = require("express");
const cors = require("cors");

const taskRoutes = require("./routes/taskRoutes");

const app = express();

app.use(cors({
  origin: "http://localhost:3000"
}));

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({
    status: "success",
    message: "NeoStats backend is running"
  });
});

app.use("/api/tasks", taskRoutes);

module.exports = app;