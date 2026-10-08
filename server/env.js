import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let loaded = false

export function loadEnv() {
  if (loaded) return
  loaded = true

  const candidatePaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '..', '.env'),
    path.resolve(__dirname, '.env'),
  ]

  for (const envPath of candidatePaths) {
    if (fs.existsSync(envPath)) {
      if (typeof process.loadEnvFile === 'function') {
        try {
          process.loadEnvFile(envPath)
          break
        } catch {
          // Fall back to line-by-line parsing if loadEnvFile encounters unquoted comments or syntax errors
        }
      }
      try {
        const content = fs.readFileSync(envPath, 'utf8')
        for (const line of content.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith('#')) continue
          const eqIdx = trimmed.indexOf('=')
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim()
            const val = trimmed.slice(eqIdx + 1).trim()
            if (process.env[key] === undefined) {
              process.env[key] = val.replace(/^["']|["']$/g, '')
            }
          }
        }
        break
      } catch {}
    }
  }

  // Safe configuration check reporting existence only, NEVER values
  if (process.env.NODE_ENV !== 'test') {
    console.log(`[Config] GROQ_API_KEY configured: ${Boolean(process.env.GROQ_API_KEY)}`)
    console.log(`[Config] GEMINI_API_KEY configured: ${Boolean(process.env.GEMINI_API_KEY)}`)
  }
}

loadEnv()
