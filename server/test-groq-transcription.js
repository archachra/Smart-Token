import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { transcribeAudioFile } from './services/transcription.js'

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'smarttoken-groq-'))
const filePath = path.join(dir, 'recording.webm')
await fs.writeFile(filePath, Buffer.from('test audio'))
const previousKey = process.env.GROQ_API_KEY
process.env.GROQ_API_KEY = 'test-groq-key'
let request
const transcript = await transcribeAudioFile(filePath, async (url, options) => {
  request = { url, options }
  return new Response(JSON.stringify({ text: 'mock transcript from Groq Whisper' }), { status: 200 })
})
if (transcript !== 'mock transcript from Groq Whisper') throw new Error('Groq transcript was not mapped')
if (request.url !== 'https://api.groq.com/openai/v1/audio/transcriptions') throw new Error('Unexpected Groq endpoint')
if (!request.options.headers.Authorization.includes('test-groq-key')) throw new Error('Groq authorization header missing')
const body = await request.options.body
if (!body) throw new Error('Groq multipart audio body missing')

process.env.GROQ_API_KEY = ''
let missingKeyRejected = false
try { await transcribeAudioFile(filePath, async () => { throw new Error('provider should not be called') }) } catch (error) { missingKeyRejected = error.message === 'GROQ_API_KEY is not configured' }
if (!missingKeyRejected) throw new Error('Missing Groq key was not reported clearly')
if (previousKey === undefined) delete process.env.GROQ_API_KEY
else process.env.GROQ_API_KEY = previousKey
await fs.rm(dir, { recursive: true, force: true })
console.log('Groq transcription provider tests passed')
