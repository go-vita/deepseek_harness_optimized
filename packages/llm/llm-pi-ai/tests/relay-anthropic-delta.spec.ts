import { expect, it } from 'vitest'
import { RelayDeltaRequest } from '../src/relay-delta.ts'

const ctx = (id: string) => ({ version: 1 as const, session_id: 'anthropic-fixture', branch_id: 'main', purpose: 'main' as const,
  generation: '0', request_id: id })
const ack = (id: string, count: number) => ({ version: 2, request_id: id, base_count: count, base_hash: 'a'.repeat(64) })

async function observe(request: RelayDeltaRequest, frames: Record<string, unknown>[]) {
  const body = frames.map(frame => `event: ${String(frame['type'])}\ndata: ${JSON.stringify(frame)}\n\n`).join('')
  await (await request.wrapFetch(async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } }))('https://example.test')).text()
}

it('accepts mixed text/tools only at message_stop and ignores moving cache hints', async () => {
  const route = 'anthropic-mixed-tools'
  const messages = [{ role: 'user', content: [{ type: 'text', text: 'history', cache_control: { type: 'ephemeral' } }] },
    { role: 'assistant', content: [{ type: 'thinking', thinking: 'hidden' }, { type: 'text', text: 'checking' },
      { type: 'tool_use', id: 't1', name: 'lookup', input: {} }, { type: 'tool_use', id: 't2', name: 'lookup', input: {} }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'one' }, { type: 'tool_result', tool_use_id: 't2', content: 'two' }] }]
  const first = new RelayDeltaRequest(route, 'anthropic')
  first.prepare({ messages }, ctx('one'))
  await observe(first, [{ type: 'message_delta', delta: { stop_reason: 'tool_use' } }, { type: 'message_stop', relay_ack: ack('one', 6) }])
  const changedHints = [{ role: 'user', content: 'history' }, ...messages.slice(1), { role: 'assistant', content: 'reply' }, { role: 'user', content: 'next' }]
  const next = new RelayDeltaRequest(route, 'anthropic').prepare({ messages: changedHints }, ctx('two'))
  expect(next['messages']).toEqual(changedHints.slice(3))
  expect(next['relay_context']).toMatchObject({ mode: 'delta', base_count: 6 })
  expect(new RelayDeltaRequest(route, 'anthropic').prepare({ messages: changedHints }, ctx('two'))).toEqual(next)
})

it.each(['interrupted', 'error', 'wrong-ack', 'no-finish'])('does not advance an Anthropic checkpoint after %s', async (kind) => {
  const route = `anthropic-${kind}`
  const messages = [{ role: 'user', content: 'old' }]
  const first = new RelayDeltaRequest(route, 'anthropic')
  first.prepare({ messages }, ctx('one'))
  const frames: Record<string, unknown>[] = kind === 'no-finish' ? [] : [{ type: 'message_delta', delta: { stop_reason: 'end_turn' } }]
  if (kind === 'error') frames.push({ type: 'error', error: { message: 'failed' } })
  if (kind !== 'interrupted') frames.push({ type: 'message_stop', relay_ack: ack(kind === 'wrong-ack' ? 'other' : 'one', 1) })
  await observe(first, frames)
  const next = new RelayDeltaRequest(route, 'anthropic').prepare({ messages: [...messages, { role: 'user', content: 'new' }] }, ctx('two'))
  expect(next['relay_context']).toMatchObject({ mode: 'full' })
})
