import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { canonicalEvent, verifyAuditEvents } from '../src/domain/audit'
const hash = async (input) => createHash('sha256').update(input).digest('hex')
async function commit(event, previous = 'GENESIS') { return { ...event, previous_hash: previous, event_hash: await hash(canonicalEvent(event) + previous) } }
describe('audit chain', () => { it('verifies a valid deterministic chain', async () => { const a = await commit({ sequence_number: 1, action_type: 'DRIVE_CREATED', entity_type: 'drive', status: 'SUCCESS' }); const b = await commit({ sequence_number: 2, action_type: 'RULES_LOCKED', entity_type: 'drive', status: 'SUCCESS' }, a.event_hash); await expect(verifyAuditEvents([a, b], hash)).resolves.toEqual({ valid: true, checked: 2, brokenAt: null }) }); it('detects altered historical data', async () => { const a = await commit({ sequence_number: 1, action_type: 'DRIVE_CREATED', entity_type: 'drive', status: 'SUCCESS' }); await expect(verifyAuditEvents([{ ...a, action_type: 'DELETED' }], hash)).resolves.toMatchObject({ valid: false, brokenAt: 1 }) }) })
