require("dotenv").config();

const pool = require("./db");

async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        completed BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("Tasks table ready");
  } catch (error) {
    console.error("Database initialization failed:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

initializeDatabase();