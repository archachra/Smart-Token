# SmartToken

SmartToken is an enterprise-grade classroom participation, token management, and AI-assisted educational evaluation platform designed for modern faculty, students, and administration. It combines an interactive, light-first React frontend shell with an Express REST API backend, PostgreSQL append-only event ledger architecture, offline-first resilience, and AI pipelines powered by Groq Whisper and LLM evaluation engines.

---

## System Architecture

SmartToken maintains a clean separation of concerns across presentation, business workflows, AI evaluation pipelines, and atomic financial/token audit ledgers:

```
┌────────────────────────────────────────────────────────┐
│                   React + Vite PWA                     │
│  - Light-First Shell & Roster Navigation               │
│  - IndexedDB Durable Offline Action Queue              │
│  - Service Worker Cache (Zero-Flicker Online / Offline)│
│  - MediaRecorder In-Browser Audio Capture              │
└──────────────┬───────────────────────────▲─────────────┘
               │ HTTP / JSON               │
               ▼                           │
┌──────────────────────────────────────────┴─────────────┐
│                 Node.js / Express API                  │
│  - JWT Authentication & RBAC (Admin, Faculty, Student) │
│  - Discussion Topic & Open Floor Orchestration         │
│  - Idempotent Append-Only Ledger & Offline Sync        │
│  - Multi-part Audio & Document Processing              │
└──────────────┬───────────────────────────▲─────────────┘
               │                           │
       ┌───────┴──────┐            ┌───────┴──────┐
       ▼              ▼            ▼              ▼
┌──────────────┐┌──────────────┐┌──────────────┐┌──────────────┐
│  PostgreSQL  ││ Groq Whisper ││  Gemini API  ││ Local Storage│
│ Ledger & Rel.││ Audio ASR    ││ Evaluation & ││  (Audio &    │
│    Data      ││ Transcription││ OCR Grading  ││ Submissions) │
└──────────────┘└──────────────┘└──────────────┘└──────────────┘
```

---

## Key Features & New Capabilities

### 1. Direct Spoken Participation (Open Floor Mode)
- **Seamless Student Contributions**: Students can click **Start Speaking / Record Response** at any time during class without waiting for manual hand-raise approval.
- **Dynamic Discussion Prompts**: Faculty sets the active session topic and guiding question in real time. Students inherit this topic instantly on their devices.
- **Audio Recording & Playback**: In-browser audio capture with elapsed timer, waveform/audio playback, and instant cloud submission.
- **Preserved Legacy Hand-Raising**: Legacy hand-raise queue, approval mechanisms, and polling code are preserved in comments for easy re-enablement if required.

### 2. Faculty In-Class Recording ("Record from Here")
- **One-Click Roster Recording**: Faculty can trigger recording directly from any student card on the Classroom Roster (`/participation`).
- **Live Faculty Device Microphone**: Audio is recorded using the teacher's device microphone, displaying a live pulsing recording badge and timer.
- **Instant Pipeline Ingestion**: On clicking "Stop Recording", the audio is automatically uploaded, attached to the student's profile, transcribed via Groq Whisper, evaluated by AI, and routed directly to the Review dashboard.

### 3. AI-Powered Audio Transcription & Evaluation
- **Groq Whisper ASR**: Automatic speech recognition powered by `whisper-large-v3` transcribes student spoken audio into text in seconds.
- **Pedagogical Evaluation**: An LLM evaluation engine evaluates the student's transcript against the active discussion topic, assesses relevance and accuracy, and suggests token changes with detailed reasoning.
- **Faculty Authority**: AI recommendations never bypass faculty authority; suggestions require faculty review and confirmation before ledger commits.

### 4. Participation Review Dashboard (`/review`)
- **Centralized Submission Queue**: Review all spoken responses (both student-recorded and faculty-recorded) with status indicators (Pending Review, Finalized).
- **Integrated Audio Player & Transcript**: Faculty can listen to original audio recordings and read machine transcripts side-by-side.
- **One-Click Decision or Custom Overrides**: Faculty can accept AI suggestions or adjust token rewards (+X / -X) before atomic ledger finalization.

### 5. Core Offline Mode & Synchronous Resilience
- **Offline PWA Support**: Production service worker (`public/sw.js`) precaches index HTML and hashed JavaScript and CSS bundles for offline reopening.
- **IndexedDB Persistence**: Durable browser-side event store (`smarttoken_offline_db`) safely queues pending attendance marks and token adjustments before confirmation.
- **Zero-Flicker Online Experience**: Seamless online operations sync immediately to the server without lingering queue badges or flickering sync states.
- **Idempotent Synchronization**: Reconnects and pushes queued actions using unique `client_event_id` keys, preventing duplicate awards even across lost responses or network drops.
- **User-Scoped Isolation**: Cached rosters and pending actions are strictly partitioned by authenticated user and purged on logout.

### 6. Course Assignments & OCR Grading Pipeline
- **Assignment Creation**: Faculty can create lab/course assignments with titles, descriptions, due dates, max tokens, and reference answer documents.
- **Student Document Submission**: Students can upload solution files (PDF, DOCX, images) from their portal (`/student`).
- **Automated Text Extraction & Evaluation**: Background OCR and LLM grading pipelines inspect submissions against grading rubrics.
- **Faculty Assignment Review**: Dedicated faculty views to inspect student submissions, view OCR extraction, and award tokens.

---

## Database Architecture (`smarttoken_db`)

The database schema utilizes PostgreSQL 16+ with UUID keys, custom ENUMs, foreign key cascades, and atomic ledger constraints:

### Custom ENUMs
- `user_role`: `'ADMIN'`, `'FACULTY'`, `'STUDENT'`
- `event_type`: `'ATTENDANCE'`, `'PARTICIPATION'`, `'TOKEN_AWARD'`, `'CORRECTION'`
- `recording_status`: `'APPROVED'`, `'RECORDING'`, `'COMPLETED'`
- `recording_source`: `'STUDENT_DEVICE'`, `'FACULTY_DEVICE'`

### Core Domain Tables
1. **`users`**: Platform user identity (`id` UUID PK, `email` UNIQUE, `name`, `role`, `password_hash`).
2. **`students`**: Student academic profile (`id` UUID PK, `user_id` FK -> `users`, `student_id_number` UNIQUE, `name`, `email`).
3. **`courses`**: Course catalog (`id` UUID PK, `code` UNIQUE, `title`, `description`).
4. **`sections`**: Offerings with session topic state (`id` UUID PK, `course_id` FK, `section_name`, `term`, `active_topic` TEXT, `active_extra_info` TEXT).
5. **`enrollments`**: Student enrollments (`student_id` FK, `section_id` FK, `attendance_status`).
6. **`section_faculty`**: Faculty assignment to sections (`section_id` FK, `faculty_id` FK).
7. **`student_balances`**: Cached token balances per section (Composite PK: `(student_id, section_id)`).
8. **`events`**: Append-only token ledger (`id` UUID PK, `client_event_id` UNIQUE, `section_id` FK, `student_id` FK, `created_by` FK, `event_type` ENUM, `token_change`, `reason`, `correction_of` FK).
9. **`recording_sessions`**: Participation sessions (`id` UUID PK, `section_id` FK, `student_id` FK, `recording_source` ENUM, `status` ENUM, `topic`, `extra_info`, `audio_url`, `transcript`, `transcription_status`).
10. **`recording_evaluations`**: AI evaluation records (`id` UUID PK, `recording_session_id` FK UNIQUE, `status`, `relevant`, `correct`, `reason`, `suggested_token_change`, `final_token_change`, `finalized_at`).
11. **`assignments`**: Course assignments (`id` UUID PK, `section_id` FK, `title`, `description`, `max_tokens`, `file_url`).
12. **`assignment_submissions`**: Student assignment work (`id` UUID PK, `assignment_id` FK, `student_id` FK, `file_url`, `status`, `score`, `evaluation_status`).
13. **`raised_hands`**: Legacy hand-raise queue (`id` UUID PK, `section_id` FK, `student_id` FK, `raised_at`).

---

## API Reference

### 1. Roster & Balances
- `GET /api/sections/:sectionId/students`: Returns enrolled students with student IDs, attendance, and token balances.

### 2. Discussion Topic & Participation
- `GET /api/sections/:sectionId/participation/topic`: Fetches active session discussion topic and prompt.
- `PUT /api/sections/:sectionId/participation/topic`: Sets active topic and prompt (Faculty/Admin).
- `POST /api/sections/:sectionId/participation/recordings`: Creates direct recording session (Student self-record or Faculty "Record from Here").
- `PATCH /api/sections/:sectionId/participation/recordings/:id/complete`: Completes recording session, stores base64 audio, triggers Groq Whisper and AI evaluation.
- `GET /api/sections/:sectionId/participation/recordings`: Lists all recordings with transcripts, evaluation results, and finalized token decisions (Faculty/Admin).
- `GET /api/sections/:sectionId/participation/recordings/:id/transcription`: Fetches transcript and evaluation status for a recording session.
- `POST /api/sections/:sectionId/participation/recordings/:id/evaluation/decision`: Finalizes teacher token award into the ledger.

### 3. Token Ledger & Attendance
- `POST /api/events`: Atomically appends token changes (+X / -X) to ledger and updates student balance with idempotency support via `client_event_id`.
- `PATCH /api/sections/:sectionId/students/:studentId/attendance`: Updates attendance (`PRESENT` / `ABSENT`) and applies balance adjustments atomically.

### 4. Assignments & OCR
- `POST /api/sections/:sectionId/assignments`: Creates assignment with metadata and attachments.
- `GET /api/sections/:sectionId/assignments`: Lists section assignments with submission statistics.
- `POST /api/sections/:sectionId/assignments/:id/submissions`: Submits student homework file (PDF/DOCX).
- `POST /api/sections/:sectionId/assignments/:id/submissions/:subId/decision`: Faculty awards tokens for assignment completion.

---

## Default User Accounts

For testing and demonstration, the following accounts are pre-configured:

| Role | Email | Password | Details |
|---|---|---|---|
| **Faculty** | `faculty@example.com` | `FacultyPass123!` | Section Instructor (Full access to Roster, Topic, Record from Here, Review) |
| **Faculty** | `faculty@smarttoken.edu` | `FacultyPass123!` | Primary faculty account |
| **Student** | `student@example.com` | `StudentPass123!` | Test student account (`STU123456`) |
| **Student** | `student@smarttoken.edu` | `StudentPass123!` | Enrolled student (Arnav Chachra - `CS101-001`) |
| **Admin** | `admin@example.com` | `AdminPass123!` | Administrative superuser |

---

## Getting Started

### Prerequisites
- **Node.js** v18+
- **PostgreSQL** v16+ (running on `localhost:5432`)
- **Groq API Key** (for Whisper ASR)
- **Gemini API Key** (for AI evaluation & OCR)

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Configuration
Create or inspect `.env` in the project root:
```env
PORT=3001
PGHOST=localhost
PGPORT=5432
PGUSER=your_postgres_user
PGPASSWORD=your_postgres_password
SMARTTOKEN_DB_NAME=smarttoken_db
JWT_SECRET=your_jwt_secret_key
GROQ_API_KEY=your_groq_api_key
GEMINI_API_KEY=your_gemini_api_key
```

### 3. Database Initialization & Schema Verification
```bash
# Verify connection and schema integrity
node db/verify.js

# Optional: Apply direct participation migration if not already applied
psql -U your_postgres_user -d smarttoken_db -f scripts/migrate_direct_participation.sql
```

### 4. Start Development Servers
```bash
# Start Express backend (runs on http://localhost:3001)
node server/index.js

# Start Vite frontend (runs on http://localhost:5173)
npm run dev
```

---

## Automated Verification & Test Suites

SmartToken includes dedicated automated test suites verifying end-to-end functionality:

```bash
# 1. Verify Direct Participation & Faculty "Record from Here" Pipeline
node scripts/test_direct_participation_flow.mjs

# 2. Verify Core Offline Mode & Idempotent Ledger Synchronization
node server/test-offline-sync.js

# 3. Verify Assignment Creation, Upload, and OCR Decision Workflow
node server/test-assignments-api.js

# 4. Verify Attendance Atomic Updates
node server/test-attendance-api.js

# 5. Verify Token Events & Ledger Constraints
node server/test-events-api.js

# 6. Verify Production Frontend Build & Service Worker Asset Pre-caching
npm run build
```

---

## License

Private Repository — SmartToken Project.
