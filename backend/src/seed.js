
require("dotenv").config();

const bcrypt = require("bcrypt");
const pool = require("./db");

const users = [
  {
    name: "Platform Admin",
    email: "admin@neostats.local",
    role: "admin",
  },
  {
    name: "Project Manager",
    email: "manager@neostats.local",
    role: "project_manager",
  },
  {
    name: "Team Member",
    email: "member@neostats.local",
    role: "team_member",
  },
  {
    name: "Project Viewer",
    email: "viewer@neostats.local",
    role: "viewer",
  },
];

async function seed() {
  const password = process.env.SEED_PASSWORD;

  if (!password || password.length < 12) {
    throw new Error(
      "Set SEED_PASSWORD in backend/.env to a temporary password of at least 12 characters."
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const userIds = {};

    for (const user of users) {
      const result = await client.query(
        `INSERT INTO users (name, email, password_hash, role)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO NOTHING
         RETURNING id`,
        [user.name, user.email, passwordHash, user.role]
      );

      let userId;

      if (result.rows.length > 0) {
        userId = result.rows[0].id;
      } else {
        const existing = await client.query(
          "SELECT id FROM users WHERE email = $1",
          [user.email]
        );
        userId = existing.rows[0].id;
      }

      userIds[user.role] = userId;
    }

    const projectResult = await client.query(
      `SELECT id FROM projects
       WHERE name = $1 AND created_by = $2
       LIMIT 1`,
      ["NeoStats Demo Project", userIds.admin]
    );

    let projectId;

    if (projectResult.rows.length > 0) {
      projectId = projectResult.rows[0].id;
    } else {
      const created = await client.query(
        `INSERT INTO projects (name, description, manager_id, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [
          "NeoStats Demo Project",
          "Sample project for testing roles, tasks, and collaboration.",
          userIds.project_manager,
          userIds.admin,
        ]
      );

      projectId = created.rows[0].id;
    }

    const memberships = [
      [projectId, userIds.project_manager, "project_manager"],
      [projectId, userIds.team_member, "team_member"],
      [projectId, userIds.viewer, "viewer"],
    ];

    for (const [project, user, role] of memberships) {
      await client.query(
        `INSERT INTO project_members (project_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (project_id, user_id)
         DO UPDATE SET role = EXCLUDED.role`,
        [project, user, role]
      );
    }

    await client.query("COMMIT");

    console.log("Seed completed successfully.");
    console.log("Test users:");

    for (const user of users) {
      console.log(`- ${user.email} (${user.role})`);
    }

    console.log(`Demo project ID: ${projectId}`);
    console.log("All four accounts use the local SEED_PASSWORD.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

seed()
  .catch((error) => {
    console.error("Seed failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
