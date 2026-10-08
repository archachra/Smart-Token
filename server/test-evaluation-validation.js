process.env.NODE_ENV = 'test'
import { validateEvaluation } from './services/evaluation.js'

// Test all valid token change values: -1, 0, 1, 2, 3
for (const change of [-1, 0, 1, 2, 3]) {
  const valid = validateEvaluation({
    relevant: true,
    correct: change > 0,
    reason: `Valid response with token change ${change}`,
    suggested_token_change: change,
  })
  if (!valid.relevant || valid.suggested_token_change !== change) {
    throw new Error(`Valid evaluation with token change ${change} was not preserved`)
  }
}

// Test invalid evaluations
for (const invalid of [
  { relevant: 'yes', correct: true, reason: 'bad relevant type', suggested_token_change: 0 },
  { relevant: true, correct: 'no', reason: 'bad correct type', suggested_token_change: 1 },
  { relevant: true, correct: true, reason: '', suggested_token_change: 1 },
  { relevant: true, correct: true, reason: '   ', suggested_token_change: 2 },
  { relevant: true, correct: true, reason: 'bad range under', suggested_token_change: -2 },
  { relevant: true, correct: true, reason: 'bad range over', suggested_token_change: 4 },
  { relevant: true, correct: true, reason: 'bad float', suggested_token_change: 1.5 },
  { relevant: true, correct: true, reason: 'bad string num', suggested_token_change: '2' },
  null,
  undefined,
  'string',
]) {
  let rejected = false
  try { validateEvaluation(invalid) } catch { rejected = true }
  if (!rejected) throw new Error(`Malformed evaluation was accepted: ${JSON.stringify(invalid)}`)
}

console.log('Evaluation response validation tests passed for [-1, 0, 1, 2, 3]')
