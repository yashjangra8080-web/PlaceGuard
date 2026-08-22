import { describe, expect, it } from 'vitest'
import { evaluateEligibility } from '../src/domain/eligibility'
const rule = { min_cgpa: 7.5, max_backlogs: 0, allowed_branches: ['CSE', 'IT'], required_skills: ['JavaScript'] }
describe('eligibility engine', () => { it('accepts a qualifying candidate', () => expect(evaluateEligibility({ cgpa: 8.4, backlogs: 0, branch: 'CSE', skills: ['JavaScript'] }, rule).eligible).toBe(true)); it('explains low CGPA', () => expect(evaluateEligibility({ cgpa: 6.8, backlogs: 0, branch: 'CSE', skills: ['JavaScript'] }, rule).failedRules[0]).toContain('6.8')); it('rejects wrong branch, backlog and missing skills', () => expect(evaluateEligibility({ cgpa: 8, backlogs: 1, branch: 'ECE', skills: [] }, rule).failedRules).toHaveLength(3)) })
