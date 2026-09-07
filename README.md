# SmartToken

SmartToken is a modern, light-first classroom participation and token management system designed for faculty, students, and administration. It features an interactive React frontend shell, a robust Node.js/Express REST API backend, and a production-ready PostgreSQL append-only event ledger architecture.

---

## Architecture Overview

SmartToken separates workflow state (e.g. raised hands, participation recording status) from financial/token audit ledger events.

```
[ React + Vite UI ]  <--->  [ Express REST API ]  <--->  [ PostgreSQL Database ]
 (Light-First Shell)         (Node.js Backend)            (v1 Event Ledger Schema)
```

- **Frontend**: React + Vite + React Router DOM (clean light-first aesthetic, `#2563eb` primary accent, soft borders, dynamic UI state).
- **Backend API**: Node.js + Express + `pg` connection pooling.
- **Database**: PostgreSQL 16+ using UUID primary keys, enums, composite primary keys, and an append-only event audit ledger with idempotent offline sync keys (`client_event_id`).

---

## Database Schema (`db/schema.sql`)

The v1 PostgreSQL database design includes 10 core tables and custom ENUM types:

### ENUMs
- `user_role`: `'ADMIN'`, `'FACULTY'`, `'STUDENT'`
- `event_type`: `'ATTENDANCE'`, `'PARTICIPATION'`, `'TOKEN_AWARD'`, `'CORRECTION'`
- `recording_status`: `'APPROVED'`, `'RECORDING'`, `'COMPLETED'`

### Core Domain Tables
1. **`users`**: Platform user identity (`id` UUID PK, `email` UNIQUE, `name`, `role` enum).
2. **`students`**: Student profile (`id` UUID PK, `user_id` FK -> `users`, `student_id_number` UNIQUE, `email`).
3. **`courses`**: Academic course definitions (`code` UNIQUE, `title`, `description`).
4. **`sections`**: Course section offerings (`course_id` FK -> `courses`, `section_name`, `term`, UNIQUE constraint).
5. **`enrollments`**: Student section enrollments (`student_id` FK, `section_id` FK, `attendance_status`).
6. **`section_faculty`**: Faculty assignment to sections (`section_id` FK, `faculty_id` FK).
7. **`student_balances`**: Current token balances per section (**Composite PK**: `(student_id, section_id)`).
8. **`events`**: Append-only token transaction ledger (`client_event_id` UNIQUE, `section_id` FK, `student_id` FK, `created_by` FK, `event_type` enum, `token_change`, `correction_of` self-referential FK).
9. **`raised_hands`**: Active participation queue state (`section_id` FK, `student_id` FK, `raised_at` timestamp, UNIQUE constraint per active hand).
10. **`recording_sessions`**: Participation recording workflow state (`section_id` FK, `student_id` FK, `raised_hand_id` FK UNIQUE, `status` enum, `started_at`, `ended_at`).

---

## Backend API Endpoints

### 1. Section Roster & Token Balances
- **`GET /api/sections/:sectionId/students`**
  - Returns enrolled students for a section with roll numbers and current token balances.

### 2. Token Adjustments & Event Ledger
- **`POST /api/events`**
  - Records atomic token changes (+X / -X) into `events` table and updates `student_balances`.
  - Enforces `client_event_id` uniqueness for idempotent offline sync.

### 3. Attendance Management
- **`PATCH /api/sections/:sectionId/students/:studentId/attendance`**
  - Updates student attendance status (`"PRESENT"` or `"ABSENT"`).
  - Automatically calculates token changes (`ABSENT -> PRESENT` = +1, `PRESENT -> ABSENT` = -1) and updates balances atomically inside a PostgreSQL transaction.

### 4. Raised-Hand Queue Workflow
- **`POST /api/sections/:sectionId/participation/raise`**: Student raises hand (creates active request timestamp).
- **`GET /api/sections/:sectionId/participation/raised`**: Retrieves active raised-hand requests ordered chronologically by `raised_at ASC`.
- **`DELETE /api/sections/:sectionId/participation/raised/:requestId`**: Removes a handled raised-hand request from the queue.

### 5. Participation Recording Sessions
- **`POST /api/sections/:sectionId/participation/raised/:requestId/approve`**: Faculty approves a raised-hand request for recording (creates `APPROVED` session).
- **`PATCH /api/sections/:sectionId/participation/recordings/:recordingId/start`**: Student starts recording (`APPROVED -> RECORDING`, sets `started_at`).
- **`PATCH /api/sections/:sectionId/participation/recordings/:recordingId/complete`**: Student stops recording (`RECORDING -> COMPLETED`, sets `ended_at`).
- **`GET /api/sections/:sectionId/students/:studentId/participation/recording`**: Retrieves student's current active recording session.

---

## Getting Started & Setup

### Prerequisites
- **Node.js** v18+
- **PostgreSQL** v16+ (running on `localhost:5432`)

### 1. Install Dependencies
```bash
npm install
```

### 2. Database Migration & Schema Verification
Initialize the database (`smarttoken_db`) and run automated schema assertions:
```bash
node db/verify.js
```

### 3. Run Backend API Server
```bash
node server/index.js
```

### 4. Run Frontend Development Server
```bash
npm run dev
```

---

## Testing

SmartToken includes dedicated automated test suites for all backend routes and database constraints:

```bash
# Run Database Schema Verification
node db/verify.js

# Run API Test Suites
node server/test-roster-api.js
node server/test-events-api.js
node server/test-attendance-api.js
node server/test-raised-hand-api.js
node server/test-get-raised-hands-api.js
node server/test-delete-raised-hand-api.js
node server/test-recording-sessions-api.js

# Run Frontend Production Build
npm run build
```

---

## License

Private Repository - SmartToken Project.