import fs from 'fs/promises'
import pool from '../db.js'
import { queueRecordingEvaluation } from './evaluation.js'

const GROQ_TRANSCRIPTION_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'

export async function transcribeAudioFile(filePath, fetchImpl = fetch) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured')
  }

  const audioBuffer = await fs.readFile(filePath)
  const form = new FormData()
  form.append('file', new Blob([audioBuffer], { type: 'audio/webm' }), 'recording.webm')
  form.append('model', process.env.GROQ_TRANSCRIPTION_MODEL || 'whisper-large-v3-turbo')
  form.append('response_format', 'json')

  const response = await fetchImpl(GROQ_TRANSCRIPTION_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`ASR provider returned ${response.status}: ${body.slice(0, 500)}`)
  }

  const result = await response.json()
  if (typeof result.text !== 'string') {
    throw new Error('ASR provider returned no transcript text')
  }
  return result.text.trim()
}

export async function processRecordingTranscription(recordingId, filePath) {
  const claim = await pool.query(
    `UPDATE recording_sessions
     SET transcription_status = 'PROCESSING', transcription_error = NULL
     WHERE id = $1 AND audio_url IS NOT NULL
       AND transcription_status IN ('PENDING', 'FAILED')
     RETURNING id`,
    [recordingId]
  )

  // This makes retries and duplicate callbacks harmless.
  if (claim.rowCount === 0) return

  try {
    const transcript = await transcribeAudioFile(filePath)
    await pool.query(
      `UPDATE recording_sessions
       SET transcript = $2, transcription_status = 'COMPLETED',
           transcription_error = NULL, transcribed_at = NOW()
       WHERE id = $1`,
      [recordingId, transcript]
    )
    await pool.query(
      `INSERT INTO recording_evaluations (recording_session_id, status)
       VALUES ($1, 'PENDING')
       ON CONFLICT (recording_session_id) DO NOTHING`,
      [recordingId]
    )
    queueRecordingEvaluation(recordingId)
  } catch (error) {
    console.error(`Transcription failed for recording ${recordingId}:`, error)
    await pool.query(
      `UPDATE recording_sessions
       SET transcription_status = 'FAILED', transcription_error = $2
       WHERE id = $1`,
      [recordingId, String(error.message || error).slice(0, 1000)]
    )
  }
}
