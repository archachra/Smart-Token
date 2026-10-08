import { randomUUID } from 'crypto'
import pool from '../db.js'

export const MIN_SUGGESTED_TOKEN_CHANGE = -1
export const MAX_SUGGESTED_TOKEN_CHANGE = 3
const ALLOWED_TOKEN_CHANGES = new Set([-1, 0, 1, 2, 3])

const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions'

export function validateEvaluation(value) {
  if (!value || typeof value !== 'object') throw new Error('Evaluation must be an object')
  if (typeof value.relevant !== 'boolean' || typeof value.correct !== 'boolean') {
    throw new Error('Evaluation relevant/correct fields must be boolean')
  }
  if (typeof value.reason !== 'string' || !value.reason.trim()) {
    throw new Error('Evaluation reason is required')
  }
  if (!Number.isInteger(value.suggested_token_change) || !ALLOWED_TOKEN_CHANGES.has(value.suggested_token_change)) {
    throw new Error('Suggested token change must be -1, 0, 1, 2, or 3')
  }
  return {
    relevant: value.relevant,
    correct: value.correct,
    reason: value.reason.trim().slice(0, 2000),
    suggested_token_change: value.suggested_token_change,
  }
}

const EVALUATION_SYSTEM_PROMPT = `You are an expert Computer Science university evaluator assessing a student spoken classroom participation response.

Inputs:
- Topic: The Computer Science domain (e.g. "Computer Networks", "Operating Systems", "Data Structures").
- Extra Info: Specific question or targeted context given by faculty, if present. When present, Extra Info is the PRIMARY reference for correctness and relevance.
- Student Transcript: Spoken response transcribed via Speech-to-Text (ASR).

Evaluation Policy:
1. Speech-to-Text Tolerance: Tolerate minor ASR transcription artifacts, phonetic misspellings, and conversational speech fillers (e.g., "um", "uh", "like", "you know", "basically"). Judge the intended meaning and conceptual understanding, NOT exact wording, rigid syntax, or buzzwords.
2. Relevance: Determine if the student's answer genuinely addresses the Topic and Extra Info context.
3. Correctness: Determine if the core Computer Science concepts in the student's response are accurate.
4. Suggested Token Change rules:
   * +3: ONLY for an exceptionally strong, detailed, and insightful answer to a specific and sufficiently complex question demonstrating deep insight.
   * +2: Strong, detailed answer with clear explanation or multiple correct points demonstrating solid understanding.
   * +1: Good, accurate short answer or core insight.
   * 0: Ambiguous, vague, or insufficient answer, completely incorrect statement, or no meaningful contribution. (Prefer 0 when ambiguous or insufficient).
   * -1: ONLY for a clearly irrelevant answer, deliberate off-topic deflection, or justified deduction.
   * DO NOT determine token change from answer length alone. A concise, precise answer can earn +1 or +2, while long, rambling, hollow answers should receive 0.

Return ONLY a JSON object matching this schema:
{
  "relevant": boolean,
  "correct": boolean,
  "reason": string (concise explanation of relevance, correctness, and token justification),
  "suggested_token_change": integer (-1, 0, 1, 2, or 3)
}`

export async function evaluateWithGroq({ topic, extraInfo, transcript }, fetchImpl = fetch) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured')
  }
  const model = process.env.GROQ_EVALUATION_MODEL || 'openai/gpt-oss-120b'

  let lastError
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetchImpl(GROQ_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: EVALUATION_SYSTEM_PROMPT },
            {
              role: 'user',
              content: JSON.stringify({
                topic,
                extra_info: extraInfo || null,
                student_transcript: transcript,
              }),
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0,
        }),
      })

      if (!response.ok) {
        let errorDetail = ''
        try {
          const errJson = await response.json()
          errorDetail = errJson.error?.message || JSON.stringify(errJson)
        } catch {
          errorDetail = (await response.text()).slice(0, 500)
        }

        if (response.status === 429) {
          throw new Error(`Groq rate limit exceeded (429): ${errorDetail || 'Please retry evaluation in a few moments.'}`)
        }

        if ((response.status === 503 || response.status === 500) && attempt < 2) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
          continue
        }

        throw new Error(`Groq provider returned ${response.status}: ${errorDetail}`)
      }

      const body = await response.json()
      const text = body.choices?.[0]?.message?.content
      if (typeof text !== 'string') {
        throw new Error('Groq provider returned no evaluation text')
      }

      let parsed
      try {
        parsed = JSON.parse(text)
      } catch (jsonErr) {
        throw new Error(`Groq provider returned invalid JSON: ${text.slice(0, 200)}`)
      }

      if (typeof parsed.suggested_token_change === 'string' && /^-?\+?\d+$/.test(parsed.suggested_token_change.trim())) {
        parsed.suggested_token_change = parseInt(parsed.suggested_token_change.trim().replace(/^\+/, ''), 10)
      }

      return validateEvaluation(parsed)
    } catch (err) {
      lastError = err
      if (attempt === 2 || err.message?.includes('429') || err.message?.includes('invalid JSON') || err.message?.includes('GROQ_API_KEY')) {
        throw err
      }
    }
  }
  throw lastError
}

// Keep evaluateWithGemini as backwards-compatible alias to evaluateWithGroq
export const evaluateWithGemini = evaluateWithGroq

export async function processRecordingEvaluation(recordingId) {
  const recording = await pool.query(
    `SELECT topic, extra_info AS "extraInfo", transcript, transcription_status AS "transcriptionStatus"
     FROM recording_sessions
     WHERE id = $1`,
    [recordingId]
  )
  if (!recording.rowCount) throw new Error('Recording session not found')
  const input = recording.rows[0]
  if (input.transcriptionStatus !== 'COMPLETED' || !input.transcript) {
    throw new Error('Evaluation requires a completed transcript')
  }

  await pool.query(
    `INSERT INTO recording_evaluations (recording_session_id, status)
     VALUES ($1, 'PENDING')
     ON CONFLICT (recording_session_id) DO NOTHING`,
    [recordingId]
  )

  const claim = await pool.query(
    `UPDATE recording_evaluations
     SET status = 'PROCESSING', error_message = NULL
     WHERE recording_session_id = $1 AND status IN ('PENDING', 'FAILED')
     RETURNING id`,
    [recordingId]
  )
  if (!claim.rowCount) return

  try {
    const result = await evaluateWithGroq(input)
    await pool.query(
      `UPDATE recording_evaluations
       SET status = 'COMPLETED', relevant = $2, correct = $3, reason = $4,
           suggested_token_change = $5, provider = 'groq', model = $6,
           error_message = NULL, completed_at = NOW()
       WHERE recording_session_id = $1`,
      [
        recordingId,
        result.relevant,
        result.correct,
        result.reason,
        result.suggested_token_change,
        process.env.GROQ_EVALUATION_MODEL || 'openai/gpt-oss-120b',
      ]
    )
  } catch (error) {
    await pool.query(
      `UPDATE recording_evaluations
       SET status = 'FAILED', error_message = $2
       WHERE recording_session_id = $1`,
      [recordingId, String(error.message || error).slice(0, 1000)]
    )
    console.error(`Evaluation failed for recording ${recordingId}:`, error)
  }
}

export async function queueRecordingEvaluation(recordingId) {
  try {
    await processRecordingEvaluation(recordingId)
  } catch (error) {
    console.error(`Unable to queue evaluation for recording ${recordingId}:`, error)
  }
}

export async function finalizeRecordingEvaluation({ recordingId, sectionId, facultyUserId, finalTokenChange }) {
  if (!Number.isInteger(finalTokenChange) || finalTokenChange < MIN_SUGGESTED_TOKEN_CHANGE || finalTokenChange > MAX_SUGGESTED_TOKEN_CHANGE) {
    throw Object.assign(new Error(`Final token change must be an integer between ${MIN_SUGGESTED_TOKEN_CHANGE} and ${MAX_SUGGESTED_TOKEN_CHANGE}`), { statusCode: 400 })
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const check = await client.query(
      `SELECT re.id, re.status, re.suggested_token_change AS "suggestedTokenChange",
              re.final_token_change AS "finalTokenChange", re.finalized_event_id AS "finalizedEventId",
              rs.student_id AS "studentId"
       FROM recording_evaluations re
       JOIN recording_sessions rs ON rs.id = re.recording_session_id
       WHERE re.recording_session_id = $1 AND rs.section_id = $2
       FOR UPDATE`,
      [recordingId, sectionId]
    )
    if (!check.rowCount) throw Object.assign(new Error('Evaluation not found in this section'), { statusCode: 404 })
    const evaluation = check.rows[0]
    if (evaluation.finalizedEventId) {
      const existing = await client.query(
        `SELECT e.id, e.token_change AS "tokenChange", COALESCE(sb.balance, 0) AS balance
         FROM events e
         LEFT JOIN student_balances sb ON sb.student_id = e.student_id AND sb.section_id = e.section_id
         WHERE e.id = $1`,
        [evaluation.finalizedEventId]
      )
      await client.query('COMMIT')
      return { evaluation, event: existing.rows[0] }
    }
    if (evaluation.status !== 'COMPLETED') {
      throw Object.assign(new Error('Only completed evaluations can be finalized'), { statusCode: 400 })
    }
    const clientEventId = randomUUID()
    const event = await client.query(
      `INSERT INTO events (client_event_id, section_id, student_id, created_by, event_type, token_change, description)
       VALUES ($1, $2, $3, $4, 'PARTICIPATION', $5, $6)
       RETURNING id, token_change AS "tokenChange", created_at AS "createdAt"`,
      [clientEventId, sectionId, evaluation.studentId, facultyUserId, finalTokenChange, 'Faculty finalized participation evaluation after reviewing AI suggestion']
    )
    const balance = await client.query(
      `INSERT INTO student_balances (student_id, section_id, balance)
       VALUES ($1, $2, $3)
       ON CONFLICT (student_id, section_id)
       DO UPDATE SET balance = student_balances.balance + EXCLUDED.balance, updated_at = NOW()
       RETURNING balance`,
      [evaluation.studentId, sectionId, finalTokenChange]
    )
    const updated = await client.query(
      `UPDATE recording_evaluations
       SET status = 'FINALIZED', final_token_change = $2, finalized_by = $3,
           finalized_at = NOW(), finalized_event_id = $4
       WHERE recording_session_id = $1
       RETURNING *`,
      [recordingId, finalTokenChange, facultyUserId, event.rows[0].id]
    )
    await client.query('COMMIT')
    return { evaluation: updated.rows[0], event: { ...event.rows[0], balance: balance.rows[0].balance } }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
