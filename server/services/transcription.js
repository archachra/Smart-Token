import fs from 'fs/promises'
import pool from '../db.js'
import { queueRecordingEvaluation } from './evaluation.js'

const GROQ_TRANSCRIPTION_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'

export async function transcribeAudioFile(filePath, fetchImpl = fetch) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured')
  }

  let audioBuffer = await fs.readFile(filePath)

  // Auto-detect format & repair truncated or offset headers
  const ebmlSignature = Buffer.from([0x1a, 0x45, 0xdf, 0xa3])
  const ebmlIdx = audioBuffer.indexOf(ebmlSignature)

  let filename = 'recording.webm'
  let mimeType = 'audio/webm'

  if (ebmlIdx > 0) {
    // Trim stray bytes preceding the valid WebM header
    audioBuffer = audioBuffer.subarray(ebmlIdx)
    await fs.writeFile(filePath, audioBuffer).catch(() => {})
  } else if (audioBuffer.length >= 3 && audioBuffer[0] === 0x45 && audioBuffer[1] === 0xdf && audioBuffer[2] === 0xa3) {
    // Truncated first byte 0x1A: auto-prepend 0x1A
    audioBuffer = Buffer.concat([Buffer.from([0x1a]), audioBuffer])
    await fs.writeFile(filePath, audioBuffer).catch(() => {})
  }

  // Detect container from magic bytes
  if (audioBuffer.length >= 8 && audioBuffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    filename = 'recording.m4a'
    mimeType = 'audio/mp4'
  } else if (audioBuffer.length >= 4 && audioBuffer.subarray(0, 4).toString('ascii') === 'RIFF') {
    filename = 'recording.wav'
    mimeType = 'audio/wav'
  } else if (audioBuffer.length >= 4 && audioBuffer.subarray(0, 4).toString('ascii') === 'OggS') {
    filename = 'recording.ogg'
    mimeType = 'audio/ogg'
  } else if (audioBuffer.length >= 3 && (audioBuffer.subarray(0, 3).toString('ascii') === 'ID3' || (audioBuffer[0] === 0xff && (audioBuffer[1] & 0xe0) === 0xe0))) {
    filename = 'recording.mp3'
    mimeType = 'audio/mpeg'
  }

  const form = new FormData()
  form.append('file', new Blob([audioBuffer], { type: mimeType }), filename)
  form.append('model', process.env.GROQ_TRANSCRIPTION_MODEL || 'whisper-large-v3-turbo')
  form.append('language', process.env.GROQ_TRANSCRIPTION_LANGUAGE || 'en')
  form.append('prompt', process.env.GROQ_TRANSCRIPTION_PROMPT || 'Classroom discussion in English and Hinglish.')
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
