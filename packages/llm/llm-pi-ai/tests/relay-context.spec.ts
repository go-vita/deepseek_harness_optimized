import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { createUserMessage, createMessage, createAssistantMessage, markAgentLoopRequest } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { relayContextFor, relayContextWithPayload } from '../src/relay-context.ts'
import { PiAiAdapter } from '../src/adapter.ts'
import { resolveProfiles } from '../src/config.ts'
import { memoryAuth } from './auth-double.ts'
import { closeMockServers, mockServer, textEvents } from './mock-server.ts'

afterEach(closeMockServers)

function request(): GenerateOptions {
  return markAgentLoopRequest({
    provider: 'relay', model: 'gpt-test', sessionId: SessionId('session-test'),
    messages: [createUserMessage({ content: [{ type: 'text', text: 'hello' }], source: { kind: 'user' } })],
  })
}

describe('relay request identities', () => {
  it('keeps a retry identity and distinguishes a new identical user turn', () => {
    const first = request()
    const retry = markAgentLoopRequest({ ...first, messages: [...first.messages], signal: new AbortController().signal })
    expect(relayContextFor(first, 2)).toEqual(relayContextFor(retry, 2))
    expect(relayContextFor(first, 2)?.request_id).not.toBe(relayContextFor(request(), 2)?.request_id)
    expect(relayContextFor(first, 2)?.request_id).not.toBe(relayContextFor(first, 3)?.request_id)
  })

  it('isolates auxiliary purposes and callers lacking loop origin', () => {
    const first = request()
    expect(relayContextFor(first)?.purpose).toBe('main')
    expect(relayContextFor({ ...first })?.purpose).toBe('auxiliary')
    expect(relayContextFor({ ...first, purpose: 'compaction' })?.purpose).toBe('compaction')
    expect(relayContextFor({ ...first, purpose: 'session-title' })?.purpose).toBe('session-title')
    expect(relayContextFor({ provider: 'relay', model: 'gpt-test', messages: [] })).toBeUndefined()
  })

  it('includes model controls while canonicalizing object key order', () => {
    const first = request()
    const a = markAgentLoopRequest({ ...first, tools: [{ name: 'x', description: '', parameters: { type: 'object', properties: {} } }] })
    const b = markAgentLoopRequest({ ...first, tools: [{ name: 'x', description: '', parameters: { properties: {}, type: 'object' } }] })
    expect(relayContextFor(a)).toEqual(relayContextFor(b))
    const context = relayContextFor(a)!
    expect(relayContextWithPayload(context, { service_tier: 'default' }).request_id)
      .not.toBe(relayContextWithPayload(context, { service_tier: 'priority' }).request_id)
    expect(relayContextFor(first)?.request_id).not.toBe(relayContextFor(markAgentLoopRequest({ ...first, serviceTier: 'priority' }))?.request_id)
    expect(relayContextFor(first)?.request_id).not.toBe(relayContextFor(markAgentLoopRequest({ ...first, model: 'different' }))?.request_id)
  })
})

it('sends opt-in relay metadata through SDK payload hooks with existing controls intact', async () => {
  const server = await mockServer([{ events: textEvents }, { events: textEvents }, { events: textEvents }])
  const configured = ({ providers: { relay: { api: 'openai-completions', baseURL: server.url,
    relaySessionReuse: true, models: [{ id: 'gpt-test' }] } } })
  const adapter = new PiAiAdapter({ profiles: () => resolveProfiles(configured.providers),
    resolveApiKey: () => Promise.resolve('test-key'), auth: memoryAuth(), resolveSessionGeneration: () => 7 })
  const first = markAgentLoopRequest({ ...request(), serviceTier: 'priority' as const })
  for await (const _chunk of adapter.stream(first)) { /* drain */ }
  for await (const _chunk of adapter.stream(first)) { /* retry the same input */ }
  for await (const _chunk of adapter.stream({ ...first, purpose: 'compaction' })) { /* auxiliary */ }
  expect(server.requests[0]).toMatchObject({ service_tier: 'priority',
    relay_context: { version: 1, session_id: 'session-test', branch_id: 'session-test', purpose: 'main', generation: '7' } })
  expect(server.requests[1]).toEqual(server.requests[0])
  expect(server.requests[2]).toMatchObject({ relay_context: { purpose: 'compaction' } })
})

it('omits relay metadata for non-opt-in providers', async () => {
  const server = await mockServer([{ events: textEvents }])
  const adapter = new PiAiAdapter({ profiles: () => resolveProfiles({ relay: { api: 'openai-completions', baseURL: server.url, models: [{ id: 'gpt-test' }] } }),
    resolveApiKey: () => Promise.resolve('test-key'), auth: memoryAuth() })
  for await (const _chunk of adapter.stream(request())) { /* drain */ }
  expect(server.requests[0]).not.toHaveProperty('relay_context')
})

it('preserves main request origin through runtime file projection', async () => {
  const server = await mockServer([{ events: textEvents }])
  const adapter = new PiAiAdapter({ profiles: () => resolveProfiles({ relay: { api: 'openai-completions', baseURL: server.url, relaySessionReuse: true, models: [{ id: 'gpt-test' }] } }),
    resolveApiKey: () => Promise.resolve('test-key'), auth: memoryAuth() })
  const ctx = new Context()
  try {
    await ctx.plugin(LlmRuntime)
    ctx.llm.registerAdapter(['relay'], adapter)
    const options = request()
    options.messages = [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'file', attachment: {
      attachmentId: AttachmentId(`sha256:${'ab'.repeat(32)}`), name: 'test.txt', bytes: 3,
    } }] })]
    for await (const _chunk of ctx.llm.stream(options)) { /* drain */ }
    expect(server.requests[0]).toMatchObject({ relay_context: { purpose: 'main' } })
  } finally { await ctx.fiber.dispose() }
})


it('preserves the initial Responses instruction/tool prefix across appended main history', async () => {
  const server = await mockServer(Array.from({ length: 3 }, () => ({ status: 401, body: JSON.stringify({ error: { message: 'fixture rejection' } }) })))
  const adapter = new PiAiAdapter({ profiles: () => resolveProfiles({ relay: {
    api: 'openai-responses', baseURL: server.url, relaySessionReuse: true,
    models: [{ id: 'gpt-test' }],
  } }), resolveApiKey: () => Promise.resolve('test-key'), auth: memoryAuth(), resolveSessionGeneration: () => 5 })
  const initial = createMessage({ role: 'system', source: { kind: 'system-prompt' }, content: [{ type: 'text', text: 'Stable initial instructions.' }] })
  const original = request()
  const tools = [{ name: 'read', description: 'Read a file', parameters: { type: 'object', properties: {} } }]
  const first = markAgentLoopRequest({ ...original, messages: [initial, ...original.messages], tools })
  const second = markAgentLoopRequest({ ...first, messages: [...first.messages,
    createAssistantMessage({ source: { provider: 'relay', model: 'gpt-test' }, content: [{ type: 'text', text: 'Earlier answer.' }] }),
    createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Continue.' }] }),
  ] })
  const third = markAgentLoopRequest({ ...second, messages: [...second.messages,
    createMessage({ role: 'system', source: { kind: 'system-prompt' }, content: [{ type: 'text', text: 'New appended instructions.' }] }),
  ] })
  for (const options of [first, second, third]) {
    for await (const _chunk of adapter.stream(options)) { /* serialization only */ }
  }
  const payloads = server.requests as {
    instructions?: string
    tools?: unknown[]
    input: unknown[]
    relay_context: { generation: string; purpose: string; request_id: string }
  }[]
  expect(payloads).toHaveLength(3)
  expect(payloads[1]?.instructions).toEqual(payloads[0]?.instructions)
  expect(payloads[2]?.instructions).toEqual(payloads[0]?.instructions)
  expect(payloads[1]?.tools).toEqual(payloads[0]?.tools)
  expect(payloads[2]?.tools).toEqual(payloads[0]?.tools)
  expect(payloads[1]?.input.slice(0, payloads[0]?.input.length)).toEqual(payloads[0]?.input)
  expect(payloads[2]?.input.slice(0, payloads[1]?.input.length)).toEqual(payloads[1]?.input)
  expect(JSON.stringify(payloads[2]?.input)).toContain('New appended instructions.')
  for (const payload of payloads) expect(payload.relay_context).toMatchObject({ generation: '5', purpose: 'main' })
  expect(new Set(payloads.map(payload => payload.relay_context.request_id)).size).toBe(3)
})

it('emits opt-in v2 full handshake through the actual Responses SDK', async () => {
  const server = await mockServer([{ status: 401, body: JSON.stringify({ error: { message: 'fixture rejection' } }) }])
  const adapter = new PiAiAdapter({ profiles: () => resolveProfiles({ relay: {
    api: 'openai-responses', baseURL: server.url, relaySessionReuse: true, relayDeltaRequests: true,
    models: [{ id: 'gpt-test' }],
  } }), resolveApiKey: () => Promise.resolve('test-key'), auth: memoryAuth() })
  for await (const _chunk of adapter.stream(request())) { /* no model call */ }
  expect(server.requests[0]).toMatchObject({ relay_context: { version: 2, mode: 'full', purpose: 'main' } })
})
