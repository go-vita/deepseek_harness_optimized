import { afterEach, expect, it, vi } from 'vitest'
import { gunzipSync } from 'node:zlib'
import { gzipRequestFetch } from '../src/request-compression.ts'
import { Config, resolveProfiles } from '../src/config.ts'
import { PiAiAdapter } from '../src/adapter.ts'
import { memoryAuth } from './auth-double.ts'
import { closeMockServers, mockServer } from './mock-server.ts'
import { createUserMessage } from '@deepseek-ai/dsh-llm'

afterEach(async () => { vi.unstubAllGlobals(); await closeMockServers() })
it('compresses a large JSON body without changing its contents or auth headers', async () => {
  const fetcher = vi.fn(async () => new Response('ok'))
  vi.stubGlobal('fetch', fetcher)
  const body = JSON.stringify({ input: '汉字 and "quotes"\n'.repeat(5000) })
  await gzipRequestFetch('https://example.test/v1/responses', { method: 'POST', body,
    headers: { 'content-type': 'application/json', authorization: 'Bearer test', 'content-length': String(Buffer.byteLength(body)) } })
  const [, init] = fetcher.mock.calls[0] as unknown as [unknown, RequestInit]
  expect(new Headers(init.headers).get('content-encoding')).toBe('gzip')
  expect(new Headers(init.headers).get('content-length')).toBeNull()
  expect(new Headers(init.headers).get('authorization')).toBe('Bearer test')
  expect(gunzipSync(Buffer.from(init.body as Uint8Array)).toString()).toBe(body)
})
it('passes small or already encoded requests through unchanged', async () => {
  const fetcher = vi.fn(async () => new Response('ok')); vi.stubGlobal('fetch', fetcher)
  const small: RequestInit = { body: '{}', headers: { 'content-type': 'application/json' } }
  await gzipRequestFetch('https://example.test', small)
  expect(fetcher.mock.calls[0]?.[1]).toBe(small)
  const encoded: RequestInit = { body: 'x'.repeat(40000), headers: { 'content-type': 'application/json', 'content-encoding': 'other' } }
  await gzipRequestFetch('https://example.test', encoded)
  expect(fetcher.mock.calls[1]?.[1]).toBe(encoded)
})

it('compresses real pi-ai Responses SDK requests when enabled on that provider', async () => {
  const item = { id: 'msg_test', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'hello', annotations: [] }] }
  const response = { id: 'resp_test', object: 'response', created_at: 1, model: 'gpt-test', status: 'completed', output: [item], usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } }
  const events = [{ type: 'response.created', response: { ...response, status: 'in_progress', output: [] } },
    { type: 'response.output_item.added', output_index: 0, item: { ...item, status: 'in_progress', content: [] } },
    { type: 'response.content_part.added', output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
    { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'hello' },
    { type: 'response.output_item.done', output_index: 0, item }, { type: 'response.completed', response },
  ].map(frame => ({ event: frame.type, data: JSON.stringify(frame) }))
  const server = await mockServer([{ events }])
  const configured = Config({ providers: { relay: { api: 'openai-responses', baseURL: server.url,
    apiKeyEnv: 'PI_TEST_KEY', gzipRequests: true, models: [{ id: 'gpt-test' }] } } })
  const profiles = resolveProfiles(configured.providers.get())
  const adapter = new PiAiAdapter({ profiles: () => profiles, resolveApiKey: () => Promise.resolve('test-key'), auth: memoryAuth() })
  const message = createUserMessage({ content: [{ type: 'text', text: 'large history '.repeat(6000) }],
    source: { kind: 'model', provider: 'relay', model: 'gpt-test' } })
  const chunks = []
  for await (const chunk of adapter.stream({ provider: 'relay', model: 'gpt-test', messages: [message] })) chunks.push(chunk)
  expect(server.headers[0]?.['content-encoding']).toBe('gzip')
  expect(JSON.stringify(server.requests[0])).toContain('large history')
  expect(chunks.length).toBeGreaterThan(0)
})
