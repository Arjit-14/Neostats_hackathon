require("dotenv").config();

const pool = require("./db");

async function testConnection() {
  try {
    const result = await pool.query(
      "SELECT NOW() AS current_time"
    );

    console.log("PostgreSQL connected!");
    console.log(result.rows[0]);
  } catch (error) {
    console.error("Connection failed:", error.message);
  } finally {
    await pool.end();
  }
}

testConnection();