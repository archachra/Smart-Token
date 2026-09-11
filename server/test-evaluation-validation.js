process.env.NODE_ENV = 'test'
import { validateEvaluation } from './services/evaluation.js'

const valid = validateEvaluation({
  relevant: true,
  correct: false,
  reason: 'The response addresses the topic but misses the requested distinction.',
  suggested_token_change: 0,
})
if (!valid.relevant || valid.correct || valid.suggested_token_change !== 0) throw new Error('Valid evaluation was not preserved')

for (const invalid of [
  { relevant: 'yes', correct: true, reason: 'bad', suggested_token_change: 0 },
  { relevant: true, correct: true, reason: '', suggested_token_change: 1 },
  { relevant: true, correct: true, reason: 'bad range', suggested_token_change: 3 },
]) {
  let rejected = false
  try { validateEvaluation(invalid) } catch { rejected = true }
  if (!rejected) throw new Error('Malformed evaluation was accepted')
}

console.log('Evaluation response validation tests passed')
