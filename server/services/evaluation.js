import { randomUUID } from 'crypto'
import pool from '../db.js'

const MAX_SUGGESTED_TOKEN_CHANGE = 1
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

export function validateEvaluation(value) {
  if (!value || typeof value !== 'object') throw new Error('Evaluation must be an object')
  if (typeof value.relevant !== 'boolean' || typeof value.correct !== 'boolean') throw new Error('Evaluation relevant/correct fields must be boolean')
  if (typeof value.reason !== 'string' || !value.reason.trim()) throw new Error('Evaluation reason is required')
  if (!Number.isInteger(value.suggested_token_change) || value.suggested_token_change < -MAX_SUGGESTED_TOKEN_CHANGE || value.suggested_token_change > MAX_SUGGESTED_TOKEN_CHANGE) throw new Error('Suggested token change must be -1, 0, or 1')
  return { relevant: value.relevant, correct: value.correct, reason: value.reason.trim().slice(0, 2000), suggested_token_change: value.suggested_token_change }
}

export async function evaluateWithGemini({ topic, extraInfo, transcript }) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured')
  const model = process.env.GEMINI_EVALUATION_MODEL || 'gemini-2.0-flash'
  const response = await fetch(`${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: 'Evaluate a student participation response. Topic is broad context. Extra Info, when present, is the specific question or expected content. Judge relevance and correctness against both. Do not invent missing context. Unrelated but grammatical text is not correct. Return only JSON matching the schema.' }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify({ topic, extra_info: extraInfo || null, student_transcript: transcript }) }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', properties: { relevant: { type: 'BOOLEAN' }, correct: { type: 'BOOLEAN' }, reason: { type: 'STRING' }, suggested_token_change: { type: 'INTEGER', enum: [-1, 0, 1] } }, required: ['relevant', 'correct', 'reason', 'suggested_token_change'] } },
    }),
  })
  if (!response.ok) throw new Error(`Gemini provider returned ${response.status}: ${(await response.text()).slice(0, 500)}`)
  const body = await response.json()
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text
  if (typeof text !== 'string') throw new Error('Gemini provider returned no evaluation')
  return validateEvaluation(JSON.parse(text))
}

export async function processRecordingEvaluation(recordingId) {
  const recording = await pool.query(`SELECT topic, extra_info AS "extraInfo", transcript, transcription_status AS "transcriptionStatus" FROM recording_sessions WHERE id = $1`, [recordingId])
  if (!recording.rowCount) throw new Error('Recording session not found')
  const input = recording.rows[0]
  if (input.transcriptionStatus !== 'COMPLETED' || !input.transcript) throw new Error('Evaluation requires a completed transcript')
  await pool.query(`INSERT INTO recording_evaluations (recording_session_id, status) VALUES ($1, 'PENDING') ON CONFLICT (recording_session_id) DO NOTHING`, [recordingId])
  const claim = await pool.query(`UPDATE recording_evaluations SET status = 'PROCESSING', error_message = NULL WHERE recording_session_id = $1 AND status IN ('PENDING', 'FAILED') RETURNING id`, [recordingId])
  if (!claim.rowCount) return
  try {
    const result = await evaluateWithGemini(input)
    await pool.query(`UPDATE recording_evaluations SET status = 'COMPLETED', relevant = $2, correct = $3, reason = $4, suggested_token_change = $5, provider = 'gemini', model = $6, error_message = NULL, completed_at = NOW() WHERE recording_session_id = $1`, [recordingId, result.relevant, result.correct, result.reason, result.suggested_token_change, process.env.GEMINI_EVALUATION_MODEL || 'gemini-2.0-flash'])
  } catch (error) {
    await pool.query(`UPDATE recording_evaluations SET status = 'FAILED', error_message = $2 WHERE recording_session_id = $1`, [recordingId, String(error.message || error).slice(0, 1000)])
    console.error(`Evaluation failed for recording ${recordingId}:`, error)
  }
}

export async function queueRecordingEvaluation(recordingId) {
  try { await processRecordingEvaluation(recordingId) } catch (error) { console.error(`Unable to queue evaluation for recording ${recordingId}:`, error) }
}

export async function finalizeRecordingEvaluation({ recordingId, sectionId, facultyUserId, finalTokenChange }) {
  if (!Number.isInteger(finalTokenChange) || finalTokenChange < -1 || finalTokenChange > 1) throw Object.assign(new Error('Final token change must be -1, 0, or 1'), { statusCode: 400 })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const check = await client.query(`SELECT re.id, re.status, re.suggested_token_change AS "suggestedTokenChange", re.final_token_change AS "finalTokenChange", re.finalized_event_id AS "finalizedEventId", rs.student_id AS "studentId" FROM recording_evaluations re JOIN recording_sessions rs ON rs.id = re.recording_session_id WHERE re.recording_session_id = $1 AND rs.section_id = $2 FOR UPDATE`, [recordingId, sectionId])
    if (!check.rowCount) throw Object.assign(new Error('Evaluation not found in this section'), { statusCode: 404 })
    const evaluation = check.rows[0]
    if (evaluation.finalizedEventId) {
      const existing = await client.query(`SELECT e.id, e.token_change AS "tokenChange", COALESCE(sb.balance, 0) AS balance FROM events e LEFT JOIN student_balances sb ON sb.student_id = e.student_id AND sb.section_id = e.section_id WHERE e.id = $1`, [evaluation.finalizedEventId])
      await client.query('COMMIT')
      return { evaluation, event: existing.rows[0] }
    }
    if (evaluation.status !== 'COMPLETED') throw Object.assign(new Error('Only completed evaluations can be finalized'), { statusCode: 400 })
    const clientEventId = randomUUID()
    const event = await client.query(`INSERT INTO events (client_event_id, section_id, student_id, created_by, event_type, token_change, description) VALUES ($1, $2, $3, $4, 'PARTICIPATION', $5, $6) RETURNING id, token_change AS "tokenChange", created_at AS "createdAt"`, [clientEventId, sectionId, evaluation.studentId, facultyUserId, finalTokenChange, 'Faculty finalized participation evaluation after reviewing AI suggestion'])
    const balance = await client.query(`INSERT INTO student_balances (student_id, section_id, balance) VALUES ($1, $2, $3) ON CONFLICT (student_id, section_id) DO UPDATE SET balance = student_balances.balance + EXCLUDED.balance, updated_at = NOW() RETURNING balance`, [evaluation.studentId, sectionId, finalTokenChange])
    const updated = await client.query(`UPDATE recording_evaluations SET status = 'FINALIZED', final_token_change = $2, finalized_by = $3, finalized_at = NOW(), finalized_event_id = $4 WHERE recording_session_id = $1 RETURNING *`, [recordingId, finalTokenChange, facultyUserId, event.rows[0].id])
    await client.query('COMMIT')
    return { evaluation: updated.rows[0], event: { ...event.rows[0], balance: balance.rows[0].balance } }
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
}
