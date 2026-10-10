const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "neostats",
});

pool.on("error", (error) => {
  // An idle PostgreSQL connection can be terminated during a database
  // restart or administrator action. Keep the API process alive so the
  // pool can establish a fresh connection for the next request.
  console.error("Unexpected PostgreSQL pool error:", error.message);
});

module.exports = pool;
