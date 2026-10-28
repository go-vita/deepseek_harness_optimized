import { describe, it, expect } from 'vitest'
import { RelayDeltaRequest } from '../src/relay-delta.ts'
import type { RelayContext } from '../src/relay-context.ts'

const context = (session: string, request: string): RelayContext => ({ version: 1, session_id: session,
  branch_id: session, generation: '0', purpose: 'main', request_id: request })
const item = (text: string) => ({ role: 'user', content: text })
async function acknowledge(request: RelayDeltaRequest, id: string, count: number) {
  const frame = { type: 'response.completed', response: { status: 'completed', relay_ack: {
    version: 2, request_id: id, base_count: count, base_hash: 'a'.repeat(64),
  } } }
  const wire = `data: ${JSON.stringify(frame)}\n\n`
  const fetcher = request.wrapFetch(async () => new Response(wire, { headers: { 'content-type': 'text/event-stream' } }))
  await (await fetcher('http://localhost')).text()
}

describe('acknowledged relay HTTP deltas', () => {
  it('sends only the new suffix and keeps transport retries byte equivalent', async () => {
    const first = new RelayDeltaRequest('unit-delta')
    const input = [item('large reference '.repeat(10000))]
    const original = first.prepare({ input }, context('chat', 'one'))
    expect((original['relay_context'] as Record<string, unknown>)['mode']).toBe('full')
    await acknowledge(first, 'one', 1)
    const retry = new RelayDeltaRequest('unit-delta').prepare({ input }, context('chat', 'one'))
    expect(retry).toEqual(original)
    const next = new RelayDeltaRequest('unit-delta').prepare({ input: [...input, item('next')] }, context('chat', 'two'))
    expect(next['input']).toEqual([item('next')])
    expect(JSON.stringify(next).length).toBeLessThan(JSON.stringify(original).length / 100)
  })
  it('sends full context for rewrites and separate branches', async () => {
    const first = new RelayDeltaRequest('unit-rewrite')
    first.prepare({ input: [item('old')] }, context('chat', 'one'))
    await acknowledge(first, 'one', 1)
    const rewritten = new RelayDeltaRequest('unit-rewrite').prepare({ input: [item('changed')] }, context('chat', 'two'))
    expect((rewritten['relay_context'] as Record<string, unknown>)['mode']).toBe('full')
    const other = new RelayDeltaRequest('unit-rewrite').prepare({ input: [item('old'), item('next')] }, context('other', 'one'))
    expect((other['relay_context'] as Record<string, unknown>)['mode']).toBe('full')
  })
  it('does not advance from incomplete streams', async () => {
    const first = new RelayDeltaRequest('unit-incomplete')
    first.prepare({ input: [item('old')] }, context('chat', 'one'))
    const fn = first.wrapFetch(async () => new Response('data: {"type":"response.created"}\n\n', { headers: { 'content-type': 'text/event-stream' } }))
    await (await fn('http://localhost')).text()
    const next = new RelayDeltaRequest('unit-incomplete').prepare({ input: [item('old'), item('next')] }, context('chat', 'two'))
    expect((next['relay_context'] as Record<string, unknown>)['mode']).toBe('full')
  })
  it('invalidates rejected checkpoints without making a model retry itself', async () => {
    const first = new RelayDeltaRequest('unit-resync')
    first.prepare({ input: [item('old')] }, context('chat', 'one'))
    await acknowledge(first, 'one', 1)
    const next = new RelayDeltaRequest('unit-resync')
    const payload = { input: [item('old'), item('next')] }
    expect((next.prepare(payload, context('chat', 'two'))['relay_context'] as Record<string, unknown>)['mode']).toBe('delta')
    const fn = next.wrapFetch(async () => new Response('data: {"type":"response.failed","response":{"error":{"message":"relay_resync_required"}}}\n\n', { headers: { 'content-type': 'text/event-stream' } }))
    await (await fn('http://localhost')).text()
    expect((new RelayDeltaRequest('unit-resync').prepare(payload, context('chat', 'two'))['relay_context'] as Record<string, unknown>)['mode']).toBe('full')
  })
})
