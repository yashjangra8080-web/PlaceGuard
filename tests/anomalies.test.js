import { expect, it } from 'vitest'
import { detectAnomalies } from '../src/domain/anomalies'
it('returns explainable capped risk for deadline, eligibility and authorization violations', () => { const risk = detectAnomalies({ actionAt: '2030-01-02', deadline: '2030-01-01', authorized: false, eligible: false, branchAllowed: true, recentAttempts: 3 }); expect(risk.score).toBe(100); expect(risk.reasons).toContain('UNAUTHORIZED_ACTION') })
