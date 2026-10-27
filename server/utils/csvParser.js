/**
 * Robust CSV parser for student rosters.
 * Handles comma-separated, tab-separated, quotes, and detects Name / Roll Number columns.
 */
export function parseStudentCsv(rawText) {
  if (!rawText || typeof rawText !== 'string') return []
  
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return []

  const rows = lines.map((line) => {
    const cells = []
    let cur = ''
    let inQuotes = false
    const delimiter = line.includes('\t') ? '\t' : ','
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === delimiter && !inQuotes) {
        cells.push(cur.trim().replace(/^"|"$/g, ''))
        cur = ''
      } else {
        cur += char
      }
    }
    cells.push(cur.trim().replace(/^"|"$/g, ''))
    return cells.filter((c) => c !== '')
  }).filter((r) => r.length >= 2)

  if (rows.length === 0) return []

  let startIndex = 0
  let nameCol = 0
  let rollCol = 1

  const header0 = (rows[0][0] || '').toLowerCase()
  const header1 = (rows[0][1] || '').toLowerCase()

  const isHeader =
    header0.includes('name') ||
    header0.includes('roll') ||
    header0.includes('id') ||
    header1.includes('name') ||
    header1.includes('roll') ||
    header1.includes('id')

  if (isHeader) {
    startIndex = 1
    if (header0.includes('name')) {
      nameCol = 0
      rollCol = 1
    } else if (header1.includes('name')) {
      nameCol = 1
      rollCol = 0
    } else if (header0.includes('roll') || header0.includes('id')) {
      rollCol = 0
      nameCol = 1
    } else {
      rollCol = 1
      nameCol = 0
    }
  } else {
    // Detect which column is numeric/roll number
    const c0 = rows[0][0] || ''
    const c1 = rows[0][1] || ''
    if (/^\d+/.test(c0) && !/^\d+/.test(c1)) {
      rollCol = 0
      nameCol = 1
    } else {
      nameCol = 0
      rollCol = 1
    }
  }

  const results = []
  for (let i = startIndex; i < rows.length; i++) {
    const row = rows[i]
    if (row.length < 2) continue
    const rawName = row[nameCol] || ''
    const rawRoll = row[rollCol] || ''
    if (!rawName.trim() || !rawRoll.trim()) continue
    results.push({
      name: rawName.trim(),
      rollNumber: rawRoll.trim(),
    })
  }

  return results
}
