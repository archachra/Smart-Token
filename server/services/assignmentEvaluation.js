import { randomUUID } from 'crypto'
import fs from 'fs'
import fsPromises from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import pool from '../db.js'
import { extractTextFromFile } from './documentExtractor.js'
import { PDFParse } from 'pdf-parse'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const uploadsRoot = path.resolve(__dirname, '..')

const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions'

export function validateAssignmentEvaluation(value, maxTokens = 5) {
  if (!value || typeof value !== 'object') throw new Error('Evaluation must be an object')
  let suggested = value.suggested_tokens
  if (typeof suggested === 'string' && /^\d+$/.test(suggested.trim())) {
    suggested = parseInt(suggested.trim(), 10)
  }
  if (!Number.isInteger(suggested)) {
    throw new Error('Suggested tokens must be an integer')
  }
  // Clamp between 0 and maxTokens
  suggested = Math.max(0, Math.min(suggested, maxTokens))

  const reason = typeof value.reason === 'string' && value.reason.trim()
    ? value.reason.trim().slice(0, 2000)
    : 'Completed evaluation.'

  return {
    suggested_tokens: suggested,
    reason,
  }
}

export function isImageBasedPdfText(text) {
  if (!text || typeof text !== 'string') return true
  const stripped = text.replace(/--\s*\d+\s*of\s*\d+\s*--/gi, '').replace(/\s+/g, '')
  return stripped.length < 30
}

/**
 * Cross-platform PDF page rendering directly to in-memory PNG buffers.
 * Uses pdf-parse (@napi-rs/canvas + pdfjs-dist), which works identically
 * on Linux (containers/VMs), macOS, and Windows without platform binaries.
 */
export async function renderPdfToPageBuffers(pdfPath) {
  const fileBuffer = await fsPromises.readFile(pdfPath)
  const parser = new PDFParse({ data: fileBuffer })
  const screenshotResult = await parser.getScreenshot()

  const pages = []
  if (screenshotResult && Array.isArray(screenshotResult.pages)) {
    for (const page of screenshotResult.pages) {
      pages.push({
        pageNumber: page.pageNumber || pages.length + 1,
        buffer: Buffer.from(page.data),
        mimeType: 'image/png',
      })
    }
  }
  return pages
}

/**
 * Cross-platform local OCR using tesseract.js.
 * Operates directly on in-memory buffers without writing temporary files to disk.
 */
export async function extractOcrTextFromBuffers(buffers) {
  if (!buffers || buffers.length === 0) return ''
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng')
  try {
    let combined = ''
    for (let i = 0; i < buffers.length; i++) {
      const ret = await worker.recognize(buffers[i])
      if (ret && ret.data && ret.data.text) {
        combined += `\n\n--- Page ${i + 1} ---\n` + ret.data.text
      }
    }
    return combined.trim()
  } finally {
    await worker.terminate()
  }
}

/**
 * Vision-capable evaluation via Groq qwen/qwen3.8-27b (free tier, <=3 images).
 */
export async function evaluateAssignmentWithGroqVision({
  title,
  maxTokens = 5,
  extraInfo = '',
  assignmentContent = '',
  imageBuffers = [],
}, fetchImpl = fetch) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured')
  }

  if (!imageBuffers || imageBuffers.length === 0) {
    throw new Error('No images provided for Groq vision evaluation')
  }
  if (imageBuffers.length > 3) {
    throw new Error(`Groq vision model supports at most 3 images, received ${imageBuffers.length}`)
  }

  const prompt = `You are an academic evaluator grading a student assignment submission.
Evaluate the student's work shown in the attached image(s) against the assignment requirements, questions, and grading guidance.

Assignment Title: "${title}"
Maximum Tokens: ${maxTokens}
Grading Guidance: ${extraInfo || 'Standard academic evaluation.'}

Assignment Questions / Requirements:
${assignmentContent ? assignmentContent.slice(0, 25000) : 'See assignment title and grading guidance.'}

Instructions:
- Carefully inspect all code cells, calculations, logic, and generated visual plots/charts in the attached images.
- Verify whether the required libraries, logic, and visual elements are present and correct.
- Suggested tokens must be an integer between 0 and ${maxTokens}.
- Provide a concise explanation of the score and constructive feedback.

Return ONLY a JSON object:
{
  "suggested_tokens": integer (between 0 and ${maxTokens}),
  "reason": string (concise explanation of score and feedback)
}`

  const content = [{ type: 'text', text: prompt }]

  for (const item of imageBuffers) {
    const mime = item.mimeType || 'image/png'
    content.push({
      type: 'image_url',
      image_url: { url: `data:${mime};base64,${item.buffer.toString('base64')}` },
    })
  }

  const response = await fetchImpl(GROQ_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'qwen/qwen3.8-27b',
      messages: [{ role: 'user', content }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Groq vision provider returned ${response.status}: ${errText.slice(0, 500)}`)
  }

  const body = await response.json()
  const text = body.choices?.[0]?.message?.content
  if (typeof text !== 'string') {
    throw new Error('Groq vision provider returned no evaluation text')
  }

  const parsed = JSON.parse(text)
  return validateAssignmentEvaluation(parsed, maxTokens)
}

/**
 * Fast Groq text evaluator (openai/gpt-oss-120b).
 */
export async function evaluateAssignmentWithGroq({
  title,
  maxTokens = 5,
  extraInfo = '',
  assignmentContent = '',
  submissionContent = '',
  isOcr = false,
}, fetchImpl = fetch) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured')
  }
  const model = process.env.GROQ_EVALUATION_MODEL || 'openai/gpt-oss-120b'

  let systemPrompt = `You are an academic evaluator grading a student assignment submission.
Evaluate the student's work against the assignment requirements, questions, and grading guidance.
Suggested tokens must be an integer between 0 and ${maxTokens}.

Return ONLY a JSON object:
{
  "suggested_tokens": integer (between 0 and ${maxTokens}),
  "reason": string (concise explanation of score and feedback)
}`

  if (isOcr) {
    systemPrompt += `

IMPORTANT OCR EVALUATION GUIDELINES:
- The student submission was scanned or extracted via OCR from exported notebook pages / document images.
- Tolerate OCR quirks, scanning artifacts, and minor character misrecognitions (such as 'ipport' for 'import', 'yl' for 'y1', 'xxkk2' for '**2', missing punctuation).
- Visual plots and graphs appear in OCR as axis markers, tick marks, legends, and title text.
- Focus on evaluating whether the student implemented the required code logic, used the expected libraries, answered the assignment questions, and produced the required plots and outputs. Do not penalize for optical recognition artifacts.`
  }

  const userPayload = {
    assignment_title: title,
    max_tokens: maxTokens,
    grading_guidance: extraInfo || 'Standard academic evaluation.',
    assignment_questions: assignmentContent ? assignmentContent.slice(0, 25000) : 'See assignment title and guidance.',
    student_submission: submissionContent ? submissionContent.slice(0, 35000) : '(No text extracted from submission)',
  }

  const response = await fetchImpl(GROQ_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Groq provider returned ${response.status}: ${errText.slice(0, 500)}`)
  }

  const body = await response.json()
  const text = body.choices?.[0]?.message?.content
  if (typeof text !== 'string') {
    throw new Error('Groq provider returned no evaluation text')
  }

  const parsed = JSON.parse(text)
  return validateAssignmentEvaluation(parsed, maxTokens)
}

export async function processSubmissionEvaluation(submissionId) {
  const subQuery = await pool.query(
    `SELECT sub.id, sub.file_url AS "fileUrl", sub.file_name AS "fileName",
            a.title, a.max_tokens AS "maxTokens", a.extra_info AS "extraInfo",
            a.file_url AS "assignmentFileUrl"
     FROM assignment_submissions sub
     JOIN assignments a ON a.id = sub.assignment_id
     WHERE sub.id = $1`,
    [submissionId]
  )

  if (!subQuery.rowCount) throw new Error('Submission not found')
  const item = subQuery.rows[0]

  await pool.query(
    `UPDATE assignment_submissions
     SET evaluation_status = 'PROCESSING', evaluation_error = NULL
     WHERE id = $1`,
    [submissionId]
  )

  try {
    // Extract text from assignment file if present
    let assignmentContent = ''
    if (item.assignmentFileUrl) {
      const cleanPath = item.assignmentFileUrl.replace(/^\//, '')
      const absPath = path.join(uploadsRoot, cleanPath)
      assignmentContent = await extractTextFromFile(absPath)
    }

    // Extract text from student submission file
    let submissionContent = ''
    let submissionFilePath = null
    if (item.fileUrl) {
      const cleanPath = item.fileUrl.replace(/^\//, '')
      submissionFilePath = path.join(uploadsRoot, cleanPath)
      submissionContent = await extractTextFromFile(submissionFilePath)
    }

    const ext = submissionFilePath ? path.extname(submissionFilePath).toLowerCase() : ''
    const isImageFile = ['.png', '.jpg', '.jpeg', '.webp'].includes(ext)
    const isPdfFile = ext === '.pdf'
    const isImageBasedPdf = isPdfFile && isImageBasedPdfText(submissionContent)

    let evalResult = null

    if (isImageFile || isImageBasedPdf) {
      let imageItems = []

      if (isPdfFile) {
        const pages = await renderPdfToPageBuffers(submissionFilePath)
        imageItems = pages.map((p) => ({ buffer: p.buffer, mimeType: p.mimeType }))
      } else if (isImageFile) {
        const fileBuffer = await fsPromises.readFile(submissionFilePath)
        let mimeType = 'image/png'
        if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg'
        else if (ext === '.webp') mimeType = 'image/webp'
        imageItems = [{ buffer: fileBuffer, mimeType }]
      }

      // 1. If 1-3 images, attempt Groq vision with qwen/qwen3.8-27b
      if (imageItems.length > 0 && imageItems.length <= 3) {
        try {
          console.log(`[Assignment Eval] Attempting Groq vision evaluation with qwen/qwen3.8-27b on ${imageItems.length} image(s)...`)
          evalResult = await evaluateAssignmentWithGroqVision({
            title: item.title,
            maxTokens: item.maxTokens,
            extraInfo: item.extraInfo,
            assignmentContent,
            imageBuffers: imageItems,
          })
          console.log(`[Assignment Eval] Groq vision evaluation succeeded!`)
        } catch (visionErr) {
          console.warn(`[Assignment Eval] Groq vision failed (${visionErr.message}), falling back to local OCR...`)
        }
      }

      // 2. If >3 images or vision failed/rate-limited, use cross-platform local OCR fallback
      if (!evalResult && imageItems.length > 0) {
        console.log(`[Assignment Eval] Running cross-platform OCR on ${imageItems.length} page buffer(s)...`)
        const ocrText = await extractOcrTextFromBuffers(imageItems.map((item) => item.buffer))

        if (!ocrText || ocrText.trim().length < 25) {
          throw new Error('Submission appears blank or contains no readable text or code. Please check the uploaded file.')
        }

        evalResult = await evaluateAssignmentWithGroq({
          title: item.title,
          maxTokens: item.maxTokens,
          extraInfo: item.extraInfo,
          assignmentContent,
          submissionContent: ocrText,
          isOcr: true,
        })
      }
    } else {
      // Regular digital text submission (DOCX, TXT, text-extractable PDF)
      if (!submissionContent || submissionContent.trim().length === 0) {
        throw new Error('Submission document contains no text. Please upload a valid assignment file.')
      }

      evalResult = await evaluateAssignmentWithGroq({
        title: item.title,
        maxTokens: item.maxTokens,
        extraInfo: item.extraInfo,
        assignmentContent,
        submissionContent,
        isOcr: false,
      })
    }

    if (!evalResult) {
      throw new Error('Could not evaluate submission content.')
    }

    await pool.query(
      `UPDATE assignment_submissions
       SET evaluation_status = 'COMPLETED',
           suggested_tokens = $2,
           reason = $3,
           evaluation_error = NULL
       WHERE id = $1`,
      [submissionId, evalResult.suggested_tokens, evalResult.reason]
    )

    return evalResult
  } catch (err) {
    console.error(`Evaluation failed for submission ${submissionId}:`, err.message || err)
    await pool.query(
      `UPDATE assignment_submissions
       SET evaluation_status = 'FAILED',
           evaluation_error = $2
       WHERE id = $1`,
      [submissionId, String(err.message || err).slice(0, 1000)]
    )
    throw err
  }
}

export async function finalizeAssignmentSubmission({ submissionId, sectionId, facultyUserId, finalTokens }) {
  if (!Number.isInteger(finalTokens) || finalTokens < 0) {
    throw Object.assign(new Error('Final tokens must be a non-negative integer'), { statusCode: 400 })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const check = await client.query(
      `SELECT sub.id, sub.status, sub.student_id AS "studentId",
              sub.suggested_tokens AS "suggestedTokens",
              sub.approved_tokens AS "approvedTokens",
              sub.finalized_event_id AS "finalizedEventId",
              a.title, a.max_tokens AS "maxTokens"
       FROM assignment_submissions sub
       JOIN assignments a ON a.id = sub.assignment_id
       WHERE sub.id = $1 AND a.section_id = $2
       FOR UPDATE`,
      [submissionId, sectionId]
    )

    if (!check.rowCount) {
      throw Object.assign(new Error('Submission not found in this section'), { statusCode: 404 })
    }

    const submission = check.rows[0]

    // Enforce maxTokens boundary
    if (finalTokens > submission.maxTokens) {
      throw Object.assign(
        new Error(`Approved tokens (${finalTokens}) cannot exceed max tokens (${submission.maxTokens})`),
        { statusCode: 400 }
      )
    }

    // If already finalized, handle edit / update or idempotent return
    if (submission.finalizedEventId) {
      if (submission.approvedTokens === finalTokens) {
        const existingEvent = await client.query(
          `SELECT e.id, e.token_change AS "tokenChange", COALESCE(sb.balance, 0) AS balance
           FROM events e
           LEFT JOIN student_balances sb ON sb.student_id = e.student_id AND sb.section_id = e.section_id
           WHERE e.id = $1`,
          [submission.finalizedEventId]
        )
        await client.query('COMMIT')
        return { submission, event: existingEvent.rows[0] }
      }

      // Faculty edited token count: calculate adjustment difference
      const tokenDiff = finalTokens - (submission.approvedTokens || 0)

      await client.query(
        `UPDATE events
         SET token_change = $1
         WHERE id = $2`,
        [finalTokens, submission.finalizedEventId]
      )

      const balUpdate = await client.query(
        `UPDATE student_balances
         SET balance = balance + $1, updated_at = NOW()
         WHERE student_id = $2 AND section_id = $3
         RETURNING balance`,
        [tokenDiff, submission.studentId, sectionId]
      )

      const updatedSub = await client.query(
        `UPDATE assignment_submissions
         SET status = 'APPROVED',
             approved_tokens = $2,
             finalized_by = $3,
             finalized_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [submissionId, finalTokens, facultyUserId]
      )

      await client.query('COMMIT')
      return {
        submission: updatedSub.rows[0],
        event: {
          id: submission.finalizedEventId,
          tokenChange: finalTokens,
          balance: balUpdate.rows[0]?.balance,
        },
      }
    }

    const clientEventId = randomUUID()
    const description = `Assignment: "${submission.title}"`

    const eventRes = await client.query(
      `INSERT INTO events (
        client_event_id, section_id, student_id, created_by,
        event_type, token_change, description
      ) VALUES ($1, $2, $3, $4, 'TOKEN_AWARD', $5, $6)
      RETURNING id, token_change AS "tokenChange", created_at AS "createdAt"`,
      [clientEventId, sectionId, submission.studentId, facultyUserId, finalTokens, description]
    )
    const event = eventRes.rows[0]

    const balanceRes = await client.query(
      `INSERT INTO student_balances (student_id, section_id, balance)
       VALUES ($1, $2, $3)
       ON CONFLICT (student_id, section_id)
       DO UPDATE SET balance = student_balances.balance + EXCLUDED.balance, updated_at = NOW()
       RETURNING balance`,
      [submission.studentId, sectionId, finalTokens]
    )
    const balance = balanceRes.rows[0].balance

    const updatedSub = await client.query(
      `UPDATE assignment_submissions
       SET status = 'APPROVED',
           approved_tokens = $2,
           finalized_by = $3,
           finalized_at = NOW(),
           finalized_event_id = $4
       WHERE id = $1
       RETURNING *`,
      [submissionId, finalTokens, facultyUserId, event.id]
    )

    await client.query('COMMIT')
    return {
      submission: updatedSub.rows[0],
      event: { ...event, balance },
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
