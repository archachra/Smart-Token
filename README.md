# SmartToken

SmartToken is an enterprise-grade classroom participation, token management, and AI-assisted educational evaluation platform designed for modern faculty, students, and academic administration. It combines a light-first, responsive React 18 PWA frontend shell with a Node.js / Express 5 REST API backend, an append-only PostgreSQL 17 event ledger, offline-first resilience via IndexedDB and Service Workers, and an AI evaluation pipeline powered by Groq Whisper and LLM inference engines.

🌐 **Live Production Deployment**: [https://app.65.2.79.19.nip.io](https://app.65.2.79.19.nip.io)

---

## System Architecture

SmartToken maintains a clean separation of concerns across presentation, business workflows, AI evaluation pipelines, and atomic financial/token audit ledgers:

```
┌─────────────────────────────────────────────────────────────────┐
│                       React 18 + Vite PWA                       │
│  - Light-First Shell & Roster Navigation (Class 3Q13)           │
│  - IndexedDB Durable Offline Action Queue (smarttoken_offline_db)│
│  - Service Worker Cache (Zero-Flicker Online / Offline)         │
│  - HTML5 MediaRecorder In-Browser Audio Capture (WebM/WAV)      │
└────────────────┬────────────────────────────────▲───────────────┘
                 │ HTTP / JSON                    │
                 ▼                                │
┌─────────────────────────────────────────────────┴───────────────┐
│                     Node.js / Express 5 API                     │
│  - JWT Authentication & RBAC (Admin, Faculty, Student)          │
│  - Rule-based Student Auth (<FirstName>@3Q13)                   │
│  - Discussion Topic & Open Floor Orchestration                  │
│  - Idempotent Append-Only Ledger & Debounced Token Batching     │
│  - Multi-part Audio & Document (PDF/DOCX) Processing            │
└────────────────┬────────────────────────────────▲───────────────┘
                 │                                │
         ┌───────┴──────┐                 ┌───────┴──────┐
         ▼              ▼                 ▼              ▼
 ┌──────────────┐┌──────────────┐ ┌──────────────┐┌──────────────┐
 │PostgreSQL 17 ││ Groq Whisper │ │   Groq LLM   ││ Local Storage│
 │ Ledger & Rel.││(whisper-large│ │ (Evaluations ││  (Audio &    │
 │  13 Tables   ││   -v3-turbo) │ │ & Rubrics)   ││ Submissions) │
 └──────────────┘└──────────────┘ └──────────────┘└──────────────┘
```

---

## Key Features & Production Capabilities

### 1. Direct Spoken Participation (Open Floor Mode)
- **Instant Student Contributions**: Students can click **Start Speaking / Record Response** at any time during class without waiting for a manual turn-based approval queue.
- **Dynamic Discussion Prompts**: Faculty publishes the active session topic and guiding question in real time. Students inherit this prompt instantly on their devices.
- **In-Browser Audio Capture**: Web Audio & HTML5 `MediaRecorder` capture audio in high-fidelity WebM format with elapsed timers, waveform audio playback, and instant cloud submission.

### 2. Faculty In-Class Recording ("Record from Here")
- **One-Click Roster Recording**: Faculty can trigger recording directly from any student card on the Classroom Roster (`/participation`).
- **Live Faculty Microphone**: Audio is recorded using the instructor's device microphone, displaying a live pulsing recording badge and timer.
- **Automated Pipeline Ingestion**: Upon clicking "Stop Recording", the audio blob is uploaded, attached to that student's record, transcribed via Groq Whisper, evaluated by AI, and queued in the Review dashboard.

### 3. AI-Powered Audio Transcription & Pedagogical Evaluation
- **Groq Whisper ASR**: Automatic speech recognition powered by `whisper-large-v3-turbo` transcribes student spoken audio in ~1.2 seconds.
- **Ground-Truth Reference Material**: Faculty can upload reference notes (PDF, TXT, MD) or paste answer keys. The AI checks student answers against this authoritative material.
- **Calibrated Rubric Scoring**: LLM evaluates conceptual correctness, tolerates speech-to-text quirks and accents, and suggests token adjustments (`-1` to `+3`) with a clear rationale.
- **Faculty Authority Gatekeeper**: AI recommendations never bypass faculty authority; suggestions require faculty confirmation on the Review dashboard before permanently committing to the ledger.

### 4. Faculty Review & Decision Dashboard (`/review`)
- **Centralized Submission Queue**: Review all spoken responses (both student-recorded and faculty-recorded) with status indicators (*Ready for Review*, *Finalized*).
- **Integrated Audio Player & Transcript**: Faculty can listen to the original recording and read the machine transcript side-by-side.
- **One-Click Approval or Token Override**: Faculty can accept AI suggestions with one click or adjust the token reward before atomic ledger finalization.

### 5. Quick Token Award with Debounced Batch Accumulation
- **Zero-Lag UI Feedback**: Tapping `+1 Token` immediately increments the student's balance on screen with 0ms delay.
- **Smart Click Debouncing**: Rapid clicks within an 850ms window (e.g., tapping `+1` three times) automatically consolidate into a single `+3 Tokens` transaction in the ledger history rather than cluttering it with three separate `+1` entries.
- **Default Attendance to PRESENT**: At the start of every session, all enrolled students default to `PRESENT`, allowing faculty to mark only exceptions (`ABSENT`).

### 6. Core Offline Mode & Idempotent Synchronization
- **Offline PWA Support**: Production service worker (`public/sw.js`) precaches index HTML and hashed JavaScript/CSS bundles for offline launch.
- **IndexedDB Persistence**: Durable browser-side event store (`smarttoken_offline_db`) safely queues pending attendance marks and token adjustments.
- **Idempotent Synchronization**: Flushes queued actions to the backend using unique cryptographic `client_event_id` UUIDs, preventing duplicate token awards even across dropped connections.

### 7. Course Assignments & OCR Document Grading
- **Assignment Management**: Faculty create assignments with titles, descriptions, due dates, max tokens, and reference answer documents.
- **Student Document Submission**: Students submit digital files (PDF, DOCX, images) directly from `/student`.
- **Automated OCR & Grading**: Integrates `tesseract.js` for optical character recognition on scanned student submissions against assignment rubrics.

### 8. University Administration Portal (`/admin`)
- **Section Management**: Manage sections (e.g., 3Q12, 3Q13, 3Q14), course catalogs, and faculty assignments.
- **Bulk CSV Student Onboarding**: Upload student roster spreadsheets; the system automatically provisions user accounts, hashes passwords, and enrolls students into sections in a single atomic transaction.

---

## Production Deployment Architecture (AWS EC2)

The live production deployment is hosted on **AWS EC2** using a robust dual-app reverse proxy:

* **Cloud Infrastructure**: AWS EC2 `t3.micro` instance in `ap-south-1b` (Mumbai) running **Amazon Linux 2023 (AL2023)**.
* **Public Domain & SSL**: Configured with dynamic wildcard DNS via `nip.io` (`app.65.2.79.19.nip.io`) and **Let's Encrypt SSL/TLS** certificates provisioned via Certbot for secure HTTPS.
* **Nginx Reverse Proxy**:
  * `https://app.65.2.79.19.nip.io` -> Proxies to the main SmartToken full-stack app on port `3002`.
  * `http://65.2.79.19` -> Proxies to the static team website on port `3001`.
* **Process Management**: **PM2** (`smart-token-app`) maintains zero-downtime execution with automatic restart on server reboot.

---

## Database Architecture (`smarttoken_db`)

The database runs on **PostgreSQL 17** with strict referential integrity across 13 relational domain tables:

### Custom ENUMs
- `user_role`: `'ADMIN'`, `'FACULTY'`, `'STUDENT'`
- `event_type`: `'ATTENDANCE'`, `'PARTICIPATION'`, `'TOKEN_AWARD'`, `'CORRECTION'`
- `recording_status`: `'APPROVED'`, `'RECORDING'`, `'COMPLETED'`
- `recording_source`: `'STUDENT_DEVICE'`, `'FACULTY_DEVICE'`

### Relational Domain Tables (13 Tables)
1. **`users`**: Platform user identity (`id` UUID PK, `email` UNIQUE, `name`, `role`, `password_hash`).
2. **`students`**: Student academic profile (`id` UUID PK, `user_id` FK -> `users`, `student_id_number` UNIQUE, `name`, `email`).
3. **`courses`**: Academic course catalog (`id` UUID PK, `code` UNIQUE, `title`, `description`).
4. **`sections`**: Course section offerings (`id` UUID PK, `course_id` FK, `section_name`, `term`, `active_topic`, `active_extra_info`, `active_material_text`).
5. **`section_faculty`**: M:N mapping between faculty members and assigned sections (`section_id` FK, `faculty_id` FK).
6. **`enrollments`**: Student enrollment record (`student_id` FK, `section_id` FK, `attendance_status` DEFAULT `'PRESENT'`).
7. **`student_balances`**: Materialized token totals per section (Composite PK: `(student_id, section_id)`).
8. **`events`**: Append-only token ledger (`id` UUID PK, `client_event_id` UNIQUE, `section_id` FK, `student_id` FK, `created_by` FK, `event_type`, `token_change`, `description`, `correction_of` FK, `created_at`).
9. **`recording_sessions`**: Participation recording sessions (`id` UUID PK, `section_id` FK, `student_id` FK, `recording_source`, `status`, `topic`, `extra_info`, `reference_material`, `audio_url`, `transcript`, `transcription_status`).
10. **`recording_evaluations`**: AI evaluation records (`id` UUID PK, `recording_session_id` FK UNIQUE, `status`, `relevant`, `correct`, `reason`, `suggested_token_change`, `final_token_change`, `finalized_at`).
11. **`assignments`**: Course coursework management (`id` UUID PK, `section_id` FK, `title`, `description`, `max_tokens`, `file_url`).
12. **`assignment_submissions`**: Student submissions (`id` UUID PK, `assignment_id` FK, `student_id` FK, `file_url`, `status`, `score`, `evaluation_status`).
13. **`raised_hands`**: Hand-raise queue history (`id` UUID PK, `section_id` FK, `student_id` FK, `raised_at`).

---

## Default User Accounts & Authentication Rules

### 1. Faculty & Admin Accounts
| Role | Email | Password | Details |
|---|---|---|---|
| **Lead Faculty** | `ssingh1_phd23@thapar.edu` | `FacultyPass123!` | Instructor for Section 3Q13 (Full Access) |
| **Faculty (Alt)** | `faculty@example.com` | `FacultyPass123!` | Secondary faculty test account |
| **Admin** | `admin@smarttoken.edu` | `AdminPass123!` | Superuser (Section creation, CSV provisioning) |

### 2. Student Accounts (Section 3Q13)
All 30 students of Section 3Q13 are pre-enrolled with predictable authentication rules:
* **Email Format**: `<first_name_lowercase>@smarttoken.edu` (e.g. `arnav@smarttoken.edu`, `ashmeen@smarttoken.edu`, `parth@smarttoken.edu`)
* **Password Rule**: `<FirstName>@3Q13` (e.g. `Arnav@3Q13`, `Ashmeen@3Q13`, `Parth@3Q13`)
* **Generic Fallback Password**: `Student@3Q13`

---

## Getting Started Locally

### Prerequisites
- **Node.js** v20+ or v22+
- **PostgreSQL** v16+ or v17+ (running on `localhost:5432`)
- **Groq API Key** (for Whisper ASR & LLM evaluation)
- **Google Gemini API Key** (optional fallback)

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Configuration
Create a `.env` file in the project root:
```env
PORT=3002
DATABASE_URL=postgres://postgres:password@localhost:5432/smarttoken_db
JWT_SECRET=your_jwt_secret_key
GROQ_API_KEY=gsk_your_groq_api_key
GROQ_TRANSCRIPTION_MODEL=whisper-large-v3-turbo
GROQ_EVALUATION_MODEL=openai/gpt-oss-120b
GEMINI_API_KEY=your_gemini_api_key
```

### 3. Database Initialization & Schema Verification
```bash
# Set up tables and initial section data
node scripts/setup_db.js

# Seed/update Class 3Q13 roster with rule-based passwords
node scripts/update_class_3q13.js
```

### 4. Start Development Servers
```bash
# Start backend Express server (port 3002)
node server/index.js

# Start frontend Vite dev server (port 5173)
npm run dev
```

---

## Automated Test Suites

SmartToken includes comprehensive test suites verifying end-to-end functionality:

```bash
# 1. Verify Direct Participation & Speech Recording Lifecycle
node scripts/test_direct_participation_flow.mjs

# 2. Verify Core Offline Mode & Idempotent Ledger Synchronization
node server/test-offline-sync.js

# 3. Verify Token Ledger Constraints & Balance Updates
node server/test-events-api.js

# 4. Verify Attendance Atomic Updates
node server/test-attendance-api.js

# 5. Verify Assignment Creation, Upload, and OCR Workflow
node server/test-assignments-api.js

# 6. Verify Production Frontend Build & Service Worker Precaching
npm run build
```

---

## License

Private Repository — SmartToken Project.
Course: UCS503 Software Engineering.
