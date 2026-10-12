import fs from 'fs/promises'
import path from 'path'
import { createRequire } from 'module'
import mammoth from 'mammoth'

const require = createRequire(import.meta.url)
let PDFParse
try {
  const pdfModule = require('pdf-parse')
  PDFParse = pdfModule.PDFParse || pdfModule
} catch (e) {
  console.warn('pdf-parse module load error:', e.message)
}

export async function extractTextFromFile(filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase()
    const buffer = await fs.readFile(filePath)

    if (ext === '.pdf') {
      if (PDFParse) {
        try {
          const parser = new PDFParse({ data: buffer })
          const res = await parser.getText()
          if (res && res.text) return res.text.trim()
        } catch (pdfErr) {
          console.warn('PDF parse error:', pdfErr.message)
        }
      }
      return ''
    } else if (ext === '.docx' || ext === '.doc') {
      try {
        const res = await mammoth.extractRawText({ buffer })
        if (res && res.value) return res.value.trim()
      } catch (docxErr) {
        console.warn('DOCX parse error:', docxErr.message)
      }
      return ''
    } else if (['.txt', '.md', '.json', '.csv', '.js', '.py', '.java', '.c', '.cpp', '.sql', '.html'].includes(ext)) {
      return buffer.toString('utf-8').trim()
    }

    return ''
  } catch (err) {
    console.error(`Error extracting text from ${filePath}:`, err.message)
    return ''
  }
}
