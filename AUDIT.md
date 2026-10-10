# NeoStats Requirements Audit

This audit reflects the implementation in this repository. A live PostgreSQL/Docker verification was not possible in the restricted environment, so database and two-client Socket.IO results remain unverified.

## Status matrix

| Area | Status | Evidence / limitation |
| --- | --- | --- |
| Four global/project roles | PASS | `backend/src/middleware/authMiddleware.js`, `backend/src/middleware/projectAccess.js` |
| JWT login, logout, expiry and token revocation | PASS | `backend/src/controllers/authController.js`, `backend/src/routes/authRoutes.js` |
| Registration and password reset | PARTIAL | Endpoints are implemented; email delivery is a development abstraction controlled by `EXPOSE_DEV_RESET_TOKEN`. |
| Email verification | PARTIAL | Token endpoints exist; no production email provider is configured. |
| Admin user list/create/update/deactivate | PASS | `backend/src/routes/userRoutes.js`; self-demotion/deactivation is blocked. |
| TOTP 2FA and hashed recovery codes | PARTIAL | Enrollment, confirmation, disable, login verification, and single-use recovery codes exist; frontend settings UI and brute-force-specific 2FA throttling remain. |
| Project lifecycle and memberships | PASS | `backend/src/routes/projectRoutes.js`; archive and membership authorization are server-side. |
| Task CRUD and project isolation | PASS | Project-scoped task list/detail/create/update/delete routes. |
| Task optimistic concurrency | PASS | Version required, incremented, and stale writes return `409`. |
| Comment CRUD | PASS | List/create/update/delete routes validate task-project ownership. |
| Activity history | PASS | `backend/src/routes/activityRoutes.js` provides authorized reads; existing mutation coverage is strongest for task updates/comments. |
| Notifications | PASS | Ownership checks, pagination, unread count, read/read-all, and socket events exist. |
| Socket authentication and room authorization | PASS | `backend/src/server.js`; frontend uses one authenticated connection and reconnect room joins. |
| Socket events for every mutation | PARTIAL | Task updates/deletes, comments, and notifications are covered; project/member mutation broadcasts and comment edit/delete broadcasts remain. |
| Security headers, body limit, CORS, login rate limit | PASS | `backend/src/app.js`, `backend/src/middleware/rateLimit.js`. |
| Frontend dashboard/projects/tasks/comments/notifications | PASS | `app/dashboard`, `components`, `hooks`, `lib/api.ts`. |
| Frontend registration/reset/2FA/user administration UI | MISSING | Backend contracts exist, but dedicated screens are not yet implemented. |
| Automated role/integration/security tests | PARTIAL | Existing task permission test remains; database/Docker was unavailable for full integration tests. |
| OpenAPI/API reference | MISSING | Endpoint behavior is documented here and in source comments, but no generated OpenAPI document exists. |

## Safe local setup

From `backend/`, configure `.env` with database settings, `JWT_SECRET`, and a temporary `SEED_PASSWORD` of at least 12 characters.

```powershell
node src/db/migrate.js
node src/seed.js
npm run dev
```

From the repository root, in a second terminal:

```powershell
npm run dev
```

The frontend uses `NEXT_PUBLIC_API_URL=http://localhost:5000`. The migration and seed scripts are idempotent for the existing records; they do not reset, drop, or truncate data.

## Verification run

- `node --check` on every backend JavaScript file: passed.
- `node node_modules/typescript/bin/tsc --noEmit`: passed.
- `npm run build`: passed.
- `npm run lint`: blocked by archived `.history` snapshots, backend CommonJS files included by the root config, and inherited React hook lint findings.
- Docker/database integration and two-authenticated-client real-time checks: blocked because Docker access was unavailable.
