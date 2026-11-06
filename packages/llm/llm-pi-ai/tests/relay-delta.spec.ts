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

function chatFrame(id: string, count: number) {
  return { object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    relay_ack: { version: 2, request_id: id, base_count: count, base_hash: 'b'.repeat(64) } }
}

async function consumeChat(request: RelayDeltaRequest, frame: Record<string, unknown>, ending = 'data: [DONE]\n\n') {
  const wire = `data: ${JSON.stringify(frame)}\n\n${ending}`
  const fn = request.wrapFetch(async () => new Response(wire, { headers: { 'content-type': 'text/event-stream' } }))
  await (await fn('http://localhost')).text()
}

describe('Chat Completions relay deltas', () => {
  it('trims messages after successful DONE and preserves retry payloads', async () => {
    const route = 'chat-delta-text'
    const messages = [item('reference '.repeat(10000))]
    const first = new RelayDeltaRequest(route)
    const original = first.prepare({ messages }, context('chat', 'one'))
    await consumeChat(first, chatFrame('one', 1))
    expect(new RelayDeltaRequest(route).prepare({ messages }, context('chat', 'one'))).toEqual(original)
    const full = { messages: [...messages, { role: 'assistant', content: 'answer' }, item('continue')] }
    const second = new RelayDeltaRequest(route).prepare(full, context('chat', 'two'))
    expect(second['messages']).toEqual(full.messages.slice(1))
    expect(second['relay_context']).toMatchObject({ mode: 'delta', base_count: 1, base_hash: 'b'.repeat(64) })
    expect(JSON.stringify(second).length).toBeLessThan(JSON.stringify(original).length / 100)
    expect(new RelayDeltaRequest(route).prepare(full, context('chat', 'two'))).toEqual(second)
  })

  it('tracks canonical tool items separately from local message offsets', async () => {
    const route = 'chat-delta-tools'
    const first = new RelayDeltaRequest(route)
    const messages = [item('run'), { role: 'assistant', content: 'Checking', tool_calls: [
      { id: 'one', type: 'function', function: { name: 'probe', arguments: '{}' } },
      { id: 'two', type: 'function', function: { name: 'probe', arguments: '{}' } },
    ] }, { role: 'tool', tool_call_id: 'one', content: 'ok' }, { role: 'tool', tool_call_id: 'two', content: 'ok' }]
    first.prepare({ messages }, context('chat', 'one'))
    await consumeChat(first, chatFrame('one', 6))
    const suffix = [{ role: 'assistant', content: 'done' }, item('next')]
    const second = new RelayDeltaRequest(route).prepare({ messages: [...messages, ...suffix] }, context('chat', 'two'))
    expect(second['messages']).toEqual(suffix)
    expect(second['relay_context']).toMatchObject({ mode: 'delta', base_count: 6 })
  })

  it.each([null, '', [], [{ type: 'text', text: '' }]])('counts tool-only content consistently: %j', async (content) => {
    const route = `chat-empty-${JSON.stringify(content)}`
    const messages = [{ role: 'assistant', content, tool_calls: [
      { id: 'one', type: 'function', function: { name: 'probe', arguments: '{}' } },
    ] }]
    const first = new RelayDeltaRequest(route)
    first.prepare({ messages }, context('chat', 'one'))
    await consumeChat(first, chatFrame('one', 1))
    const next = new RelayDeltaRequest(route).prepare({ messages: [...messages, item('next')] }, context('chat', 'two'))
    expect(next['messages']).toEqual([item('next')])
    expect(next['relay_context']).toMatchObject({ mode: 'delta', base_count: 1 })
  })

  it.each(['', 'data: {"error":{"message":"failed"}}\n\ndata: [DONE]\n\n'])('does not acknowledge incomplete or failed Chat streams: %s', async (ending) => {
    const route = 'chat-incomplete-' + ending
    const first = new RelayDeltaRequest(route)
    first.prepare({ messages: [item('old')] }, context('chat', 'one'))
    await consumeChat(first, chatFrame('one', 1), ending)
    const next = new RelayDeltaRequest(route).prepare({ messages: [item('old'), item('new')] }, context('chat', 'two'))
    expect(next['relay_context']).toMatchObject({ mode: 'full' })
  })

  it('rejects acknowledgements with the wrong request or normalized count', async () => {
    for (const [id, count] of [['wrong', 1], ['one', 2]] as const) {
      const route = `chat-invalid-${id}-${count}`
      const first = new RelayDeltaRequest(route)
      first.prepare({ messages: [item('old')] }, context('chat', 'one'))
      await consumeChat(first, chatFrame(id, count))
      const next = new RelayDeltaRequest(route).prepare({ messages: [item('old'), item('new')] }, context('chat', 'two'))
      expect(next['relay_context']).toMatchObject({ mode: 'full' })
    }
  })

  it('accepts synchronous Chat completions without requiring Responses status fields', async () => {
    const route = 'chat-sync'
    const first = new RelayDeltaRequest(route)
    first.prepare({ messages: [item('old')] }, context('chat', 'one'))
    const response = { ...chatFrame('one', 1), object: 'chat.completion' }
    const fn = first.wrapFetch(async () => Response.json(response))
    await fn('http://localhost')
    const next = new RelayDeltaRequest(route).prepare({ messages: [item('old'), item('next')] }, context('chat', 'two'))
    expect(next['relay_context']).toMatchObject({ mode: 'delta' })
  })

  it('handles split SSE bytes and invalidates a rejected checkpoint', async () => {
    const route = 'chat-fragmented'
    const first = new RelayDeltaRequest(route)
    first.prepare({ messages: [item('old')] }, context('chat', 'one'))
    const bytes = new TextEncoder().encode(`data: ${JSON.stringify(chatFrame('one', 1))}\n\ndata: [DONE]\n\n`)
    const fn = first.wrapFetch(async () => new Response(new ReadableStream({ start(controller) {
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte]))
      controller.close()
    } }), { headers: { 'content-type': 'text/event-stream' } }))
    await (await fn('http://localhost')).text()
    const second = new RelayDeltaRequest(route)
    const payload = { messages: [item('old'), item('next')] }
    expect(second.prepare(payload, context('chat', 'two'))['relay_context']).toMatchObject({ mode: 'delta' })
    const rejected = second.wrapFetch(async () => Response.json({ error: { message: 'relay_resync_required' } }, { status: 409 }))
    await rejected('http://localhost')
    expect(new RelayDeltaRequest(route).prepare(payload, context('chat', 'two'))['relay_context']).toMatchObject({ mode: 'full' })
  })
})


describe('Anthropic historical system-update checkpoints', () => {
  it('counts tool-only updates and effort controls before trimming the next delta', async () => {
    const route = 'anthropic-system-updates'
    const messages = [item('first'), { role: 'system', content: [{ type: 'tool_addition', tool: {
      type: 'tool_definition', definition: { name: 'lookup', input_schema: { type: 'object' } },
    } }] }, { role: 'system', content: [], output_config: { effort: 'high' } }]
    const first = new RelayDeltaRequest(route, 'anthropic')
    first.prepare({ messages }, context('chat', 'one'))
    const fetch = first.wrapFetch(async () => new Response(JSON.stringify({ type: 'message', stop_reason: 'end_turn',
      relay_ack: { version: 2, request_id: 'one', base_count: 3, base_hash: 'c'.repeat(64) },
    }), { headers: { 'content-type': 'application/json' } }))
    await (await fetch('http://localhost')).json()
    const suffix = [{ role: 'assistant', content: 'reply' }, item('next'), { role: 'system', content: [
      { type: 'tool_removal', tool: { type: 'tool_reference', name: 'lookup' } },
    ] }]
    const second = new RelayDeltaRequest(route, 'anthropic')
    const delta = second.prepare({ messages: [...messages, ...suffix] }, context('chat', 'two'))
    expect(delta['messages']).toEqual(suffix)
    expect(delta['relay_context']).toMatchObject({ mode: 'delta', base_count: 3 })
    const response = second.wrapFetch(async () => new Response(JSON.stringify({ type: 'message', stop_reason: 'end_turn',
      relay_ack: { version: 2, request_id: 'two', base_count: 6, base_hash: 'd'.repeat(64) },
    }), { headers: { 'content-type': 'application/json' } }))
    await (await response('http://localhost')).json()
    const last = new RelayDeltaRequest(route, 'anthropic').prepare({ messages: [...messages, ...suffix, item('after removal')] }, context('chat', 'three'))
    expect(last['messages']).toEqual([item('after removal')])
    expect(last['relay_context']).toMatchObject({ mode: 'delta', base_count: 6 })
  })
})
