require("dotenv").config();

const bcrypt = require("bcrypt");
const pool = require("./db");

const demoEmails = [
  "admin@neostats.local",
  "manager@neostats.local",
  "member@neostats.local",
  "viewer@neostats.local",
];

async function resetSeedPasswords() {
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error("Set SEED_PASSWORD in backend/.env to a password of at least 12 characters.");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const result = await pool.query(
    `UPDATE users
        SET password_hash = $1,
            token_version = token_version + 1,
            updated_at = NOW()
      WHERE email = ANY($2::text[])
      RETURNING email`,
    [passwordHash, demoEmails]
  );

  console.log(`Updated password hashes for ${result.rowCount} demo account(s).`);
}

resetSeedPasswords()
  .catch((error) => {
    console.error("Demo password reset failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
