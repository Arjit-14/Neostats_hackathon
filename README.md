# NeoStats Practice --- Full-Stack Task Manager

A practice full-stack application built while preparing for the NeoStats
Full Stack Engineering Hackathon. The app uses Next.js for the frontend,
Express.js for the REST API, PostgreSQL for persistent storage, and
Docker with a named volume for database persistence.

> **Current scope:** The application supports listing and creating
> tasks. Authentication, authorization, automated tests, formal database
> migrations, and a dedicated seed script are not currently implemented.

## Architecture

``` text
Browser
  |
  | http://localhost:3000
  v
Next.js frontend (project root)
  |
  | HTTP / JSON requests
  | http://localhost:5000
  v
Express.js API (backend/)
  |
  | node-postgres (`pg`)
  | localhost:5432
  v
PostgreSQL 16 (Docker container)
  |
  v
Docker named volume: neostats-postgres-data
```

### Main components

-   **Frontend:** Next.js App Router, React, TypeScript, and Tailwind
    CSS.
-   **Backend:** Express.js with separate route and controller modules.
-   **Database:** PostgreSQL. Tasks are stored in a database table
    rather than an in-memory array.
-   **Persistence:** PostgreSQL data is stored in the Docker named
    volume `neostats-postgres-data`.

## Prerequisites

-   Node.js 22 or newer and npm.
-   Git.
-   Docker Desktop running.
-   A browser such as Chrome, Edge, or Firefox.
-   Optional: Postman, Bruno, or curl for testing API endpoints.

## Project structure

``` text
neostats-practice/
├── app/                         # Next.js pages and layout
├── public/                      # Static assets
├── package.json                 # Frontend dependencies and scripts
├── .gitignore
├── README.md
└── backend/
    ├── src/
    │   ├── routes/
    │   │   └── taskRoutes.js    # Task API routes
    │   ├── controllers/
    │   │   └── taskController.js
    │   ├── app.js               # Express app, middleware, route mounting
    │   ├── server.js            # Starts the API server
    │   ├── db.js                # PostgreSQL connection pool
    │   └── init-db.js           # Creates the tasks table
    ├── .env                     # Local secrets; do not commit
    └── package.json             # Backend dependencies and scripts
```

The exact files in your working tree may differ slightly as the project
evolves.

## 1. Install dependencies

Open a terminal in the project root:

``` bash
npm install
```

Open a second terminal and install backend dependencies:

``` bash
cd backend
npm install
```

The backend uses Express, CORS, dotenv, Nodemon, and the `pg` PostgreSQL
driver.

## 2. Configure environment variables

Create `backend/.env` and set the values for your local database:

``` env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=replace_with_your_local_password
DB_NAME=neostats
```

Use the same password that was supplied to PostgreSQL when the container
was first initialized. Do not commit `.env` files or real credentials to
GitHub.

The current local Docker setup used `postgres123` as the initial
development password. If that is still the password in your local
container, `DB_PASSWORD=postgres123` will match it. This is a
development-only password, not suitable for a deployed application.

Ensure the backend loads environment variables before creating or using
the database pool. The current setup loads `dotenv` in the backend
application/startup code.

## 3. Start PostgreSQL with Docker

The following commands are for Git Bash or a compatible shell. Start
Docker Desktop first.

Create a named volume (this is safe to run if the volume already
exists):

``` bash
docker volume create neostats-postgres-data
```

Start a new PostgreSQL 16 container with the named volume:

``` bash
docker run -d \
  --name neostats-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=replace_with_your_local_password \
  -e POSTGRES_DB=neostats \
  -p 5432:5432 \
  -v neostats-postgres-data:/var/lib/postgresql/data \
  postgres:16
```

Replace the password placeholder with your local development password,
and use the same value in `backend/.env`.

If the `neostats-postgres` container already exists, do **not** run the
creation command again. Start the existing container instead:

``` bash
docker start neostats-postgres
```

Check container status and logs:

``` bash
docker ps
docker logs --tail 30 neostats-postgres
```

Wait for PostgreSQL to report that it is ready to accept connections.

### Database persistence

The named volume `neostats-postgres-data` stores the database files
independently of the container's writable layer. Stopping or removing
the container does not remove this named volume. To preserve data, reuse
the same volume when recreating the container and do not delete the
volume.

``` bash
docker stop neostats-postgres
docker start neostats-postgres
```

Avoid `docker volume rm neostats-postgres-data` unless you intentionally
want to remove the stored database data.

## 4. Initialize the database table

After PostgreSQL is ready and `backend/.env` is configured, open a
terminal:

``` bash
cd backend
node src/init-db.js
```

The script creates the `tasks` table if it does not already exist. The
table contains:

-   `id` --- auto-generated primary key.
-   `title` --- required task title.
-   `completed` --- Boolean completion status, defaulting to `false`.
-   `created_at` --- timestamp set when the task is created.

This project currently uses a table-initialization script, not a formal
migration system. A dedicated seed script has not yet been added.

### Optional: add sample data

To insert a sample task into the local database:

``` bash
docker exec -it neostats-postgres psql -U postgres -d neostats \
  -c "INSERT INTO tasks (title) VALUES ('Sample task for demo');"
```

This inserts data into the database, so it remains after the Express
server restarts.

## 5. Run the backend

In a terminal:

``` bash
cd backend
npm run dev
```

The Express API should listen on port `5000`.

Health endpoint:

-   `GET http://localhost:5000/api/health`

Expected response:

``` json
{
  "status": "success",
  "message": "NeoStats backend is running"
}
```

## 6. Run the frontend

Open another terminal in the project root (not inside `backend/`):

``` bash
npm run dev
```

Open the frontend:

-   `http://localhost:3000`

Keep Docker, the backend terminal, and the frontend terminal running
while using the application.

## API endpoints

Base URL: `http://localhost:5000`

  Method   Endpoint        Description
  -------- --------------- --------------------------------
  `GET`    `/api/health`   Check that the API is running
  `GET`    `/api/tasks`    Retrieve tasks from PostgreSQL
  `POST`   `/api/tasks`    Create a task in PostgreSQL

### Create a task

``` bash
curl -X POST http://localhost:5000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Prepare hackathon demo"}'
```

A successful creation returns HTTP `201 Created` with the created task.

### Retrieve tasks

``` bash
curl http://localhost:5000/api/tasks
```

The response is a JSON array of tasks.

## Frontend/backend connection and CORS

The frontend runs on `http://localhost:3000` and the API runs on
`http://localhost:5000`. Because the ports differ, these are different
browser origins.

The Express application uses CORS middleware configured to allow the
frontend origin `http://localhost:3000`. The frontend sends HTTP
requests to the Express API, and the backend queries PostgreSQL.

CORS is not authentication. It does not prevent direct API calls from
tools such as curl or Postman. The current practice app does not
implement user authentication or authorization.

## Architecture and data integrity notes

-   Routes map HTTP methods and paths to controller functions.
-   Controllers validate the task title and handle API responses.
-   PostgreSQL queries are parameterized for task creation.
-   The database enforces a primary key and a non-null task title.
-   PostgreSQL data persists in a Docker named volume.
-   Database credentials are stored in a local environment file and
    should not be committed.
-   The current app does not yet include authentication/authorization,
    formal migrations, automated tests, or a dedicated seed script.
    These should be added if required by the final challenge.

## Sample login credentials

Not applicable at present: this practice application does not currently
implement a login or authentication flow.

## Troubleshooting

### Port 5432 is already in use

Another PostgreSQL service or container may already be using the port.
Check running containers with:

``` bash
docker ps
```

### Container already exists

Start the existing container:

``` bash
docker start neostats-postgres
```

### Backend cannot connect to PostgreSQL

1.  Check that Docker is running and the PostgreSQL container is up.
2.  Inspect logs with `docker logs --tail 30 neostats-postgres`.
3.  Check that `backend/.env` matches the database name, user, port, and
    password used when the database was initialized.
4.  Confirm that port `5432` is published by the container.

Changing `POSTGRES_PASSWORD` in a later `docker run` command does not
automatically change the password inside an already-initialized database
volume.

### Frontend cannot reach the backend

1.  Check that Express is running on port `5000`.
2.  Test `http://localhost:5000/api/health`.
3.  Check the browser console and confirm the frontend API URL and
    Express CORS origin are correct.

## Git and secret handling

Before committing or pushing the repository:

-   Keep `.env`, `.env.local`, and other secret files out of Git.
-   Keep `node_modules/` and build output out of Git.
-   Never put database passwords or private API keys in frontend code or
    variables prefixed with `NEXT_PUBLIC_`.
-   If a secret was already pushed to a remote repository, rotate it;
    adding it to `.gitignore` does not remove it from Git history.

## Hackathon submission checklist

-   [ ] Frontend starts using `npm run dev` from the project root.
-   [ ] Backend starts using `npm run dev` from `backend/`.
-   [ ] PostgreSQL starts in Docker and uses the named volume.
-   [ ] Database table can be initialized using `node src/init-db.js`.
-   [ ] GET and POST API endpoints work.
-   [ ] Tasks remain after the backend restarts.
-   [ ] `.env` files and credentials are not committed.
-   [ ] Add formal migrations, a repeatable seed script, tests, and any
    challenge-specific authentication/authorization if required.
-   [ ] Update this README to match the final challenge implementation
    before submission.
