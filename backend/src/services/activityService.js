async function recordActivity(
  db,
  {
    userId,
    projectId,
    action,
    entityType,
    entityId,
    metadata = {},
  }
) {
  await db.query(
    `INSERT INTO activity_logs
       (user_id, project_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      userId,
      projectId,
      action,
      entityType,
      entityId,
      JSON.stringify(metadata),
    ]
  );
}

async function notifyProjectMembers(
  db,
  {
    projectId,
    actorId,
    eventType,
    message,
    entityType,
    entityId,
  }
) {
  const result = await db.query(
    `INSERT INTO notifications
       (user_id, actor_id, project_id, event_type, message,
        entity_type, entity_id)
     SELECT
       pm.user_id,
       $2,
       $1,
       $3,
       $4,
       $5,
       $6
     FROM project_members pm
     WHERE pm.project_id = $1
       AND pm.user_id <> $2
     RETURNING id, user_id`,
    [
      projectId,
      actorId,
      eventType,
      message,
      entityType,
      entityId,
    ]
  );

  return result.rows;
}

module.exports = {
  recordActivity,
  notifyProjectMembers,
};
