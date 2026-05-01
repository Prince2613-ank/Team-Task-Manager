# Team Task Manager

A full-stack team task management web application built with Node.js, Express, PostgreSQL, JWT authentication, and a responsive browser frontend.

## Features

- Signup and login with hashed passwords and JWT sessions
- Create projects, join projects with invite codes, and manage project members
- Project roles: `Admin` and `Member`
- Admins can add/remove members, change roles, create/edit/delete tasks, and assign tasks
- Members can view their projects and update the status of tasks assigned to them
- Task fields: title, description, due date, priority, assignee, and status
- Dashboard totals for task status, tasks per user, and overdue work
- RESTful API with validation, error handling, and PostgreSQL relationships
- Railway-ready deployment configuration

## Tech Stack

- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Node.js, Express
- Database: PostgreSQL
- Authentication: JWT, bcrypt password hashing
- Deployment: Railway

## Local Setup

1. Install dependencies.

   ```bash
   npm install
   ```

2. Create a PostgreSQL database.

   ```bash
   createdb team_task_manager
   ```

3. Copy the environment file and update the values.

   ```bash
   cp .env.example .env
   ```

   Required variables:

   ```env
   PORT=3000
   NODE_ENV=development
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/team_task_manager
   JWT_SECRET=replace-with-a-long-random-secret
   DATABASE_SSL=false
   USE_EMBEDDED_DB=false
   ```

   For quick local development without installing PostgreSQL, set:

   ```env
   USE_EMBEDDED_DB=true
   PGLITE_DATA_DIR=.data/pglite
   ```

   The embedded database is only for local development. Railway/production should use the real PostgreSQL `DATABASE_URL`.

4. Start the app.

   ```bash
   npm run dev
   ```

5. Open `http://localhost:3000`.

The app initializes the database schema automatically from `sql/schema.sql` on startup.

If local startup fails with `getaddrinfo ENOTFOUND` for a host such as `postgres.railway.internal` or `dpg-...-a`, your `.env` contains a private cloud database hostname that only works inside that hosting provider. Use a local PostgreSQL URL, set `USE_EMBEDDED_DB=true`, or copy the provider's public/external database URL.

## Railway Deployment

1. Push this project to a GitHub repository.
2. In Railway, create a new project from the GitHub repository.
3. Add a Railway PostgreSQL database to the project.
4. Set the application service variables:

   ```env
   NODE_ENV=production
   JWT_SECRET=replace-with-a-long-random-secret
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   DATABASE_SSL=false
   ```

   If your PostgreSQL connection requires SSL, set `DATABASE_SSL=true`.

   If the app logs `DATABASE_URL is required in production`, the web service is missing the PostgreSQL reference variable. Open the Railway web service variables and add `DATABASE_URL` with the value `${{Postgres.DATABASE_URL}}` after adding the PostgreSQL service.

5. Railway will run `npm install` and start the app with `npm start`.
6. Open the generated public Railway domain and test signup, project creation, member invites, tasks, and dashboards.

## API Overview

Authentication:

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`

Projects:

- `GET /api/projects`
- `POST /api/projects`
- `POST /api/projects/join`
- `GET /api/projects/:projectId`
- `POST /api/projects/:projectId/members`
- `PUT /api/projects/:projectId/members/:userId`
- `DELETE /api/projects/:projectId/members/:userId`

Tasks:

- `GET /api/projects/:projectId/tasks`
- `POST /api/projects/:projectId/tasks`
- `PUT /api/tasks/:taskId`
- `DELETE /api/tasks/:taskId`

Dashboard:

- `GET /api/projects/:projectId/dashboard`
- `GET /api/dashboard`

## Database Design

- `users`: registered users with unique email addresses and hashed passwords
- `projects`: project metadata and invite code
- `project_members`: many-to-many user/project membership with role
- `tasks`: project tasks with assignee, creator, due date, priority, and status

## Submission Checklist

- Live application URL: add your Railway public URL
- GitHub repository: add your repository URL
- Demo video: record a 2-5 minute walkthrough covering auth, projects, roles, tasks, dashboard, and deployment
