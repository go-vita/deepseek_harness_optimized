import { createServer } from 'node:http'
import { gunzipSync } from 'node:zlib'
import { expect, it } from 'vitest'
import { createUserMessage, createAssistantMessage, markAgentLoopRequest } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { PiAiAdapter } from '../src/adapter.ts'
import { resolveProfiles } from '../src/config.ts'
import { memoryAuth } from './auth-double.ts'

it('streams Chat through the real SDK with full, delta and byte-equivalent retries', async () => {
  const requests: Record<string, unknown>[] = []
  const server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    request.on('end', () => {
      const bytes = Buffer.concat(chunks)
      const payload: Record<string, unknown> = JSON.parse((request.headers['content-encoding'] === 'gzip'
        ? gunzipSync(bytes) : bytes).toString())
      requests.push(payload)
      const meta = payload['relay_context'] as Record<string, unknown>
      const messages = payload['messages'] as Record<string, unknown>[]
      const count = Number(meta['base_count'] ?? 0) + messages.length
      const common = { id: 'chatcmpl-fixture', object: 'chat.completion.chunk', created: 1, model: 'gpt-test' }
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      for (const frame of [
        { ...common, choices: [{ index: 0, delta: { role: 'assistant', content: 'hello' }, finish_reason: null }] },
        { ...common, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], relay_ack: {
          version: 2, request_id: meta['request_id'], base_count: count, base_hash: 'c'.repeat(64),
        } },
        { ...common, choices: [], usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 } },
      ]) response.write(`data: ${JSON.stringify(frame)}\n\n`)
      response.end('data: [DONE]\n\n')
    })
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('fixture did not bind TCP')
  const adapter = new PiAiAdapter({ profiles: () => resolveProfiles({ relay: {
    api: 'openai-completions', baseURL: `http://127.0.0.1:${address.port}`, relaySessionReuse: true,
    relayDeltaRequests: true, gzipRequests: true, models: [{ id: 'gpt-test' }],
  } }), resolveApiKey: () => Promise.resolve('test-key'), auth: memoryAuth() })
  try {
    const first = markAgentLoopRequest({ provider: 'relay', model: 'gpt-test', sessionId: SessionId('chat-sdk-delta'),
      serviceTier: 'priority' as const,
      messages: [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'reference '.repeat(10000) }] })],
    })
    for await (const _chunk of adapter.stream(first)) { /* drain */ }
    const second = markAgentLoopRequest({ ...first, messages: [...first.messages,
      createAssistantMessage({ source: { provider: 'relay', model: 'gpt-test' }, content: [{ type: 'text', text: 'hello' }] }),
      createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'continue' }] }),
    ] })
    for await (const _chunk of adapter.stream(second)) { /* drain */ }
    for await (const _chunk of adapter.stream(second)) { /* same logical request retries */ }
    expect(requests).toHaveLength(3)
    expect(requests[0]?.['relay_context']).toMatchObject({ version: 2, mode: 'full' })
    expect(requests[1]?.['relay_context']).toMatchObject({ version: 2, mode: 'delta' })
    expect(requests[1]?.['messages']).toEqual([{ role: 'assistant', content: 'hello' }, { role: 'user', content: 'continue' }])
    expect(requests[1]?.['service_tier']).toBe('priority')
    expect(JSON.stringify(requests[1]).length).toBeLessThan(JSON.stringify(requests[0]).length / 100)
    expect(requests[2]).toEqual(requests[1])
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()) })
  }
})
