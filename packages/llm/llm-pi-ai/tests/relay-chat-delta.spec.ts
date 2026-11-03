import { createServer } from 'node:http'
import { gunzipSync } from 'node:zlib'
import { expect, it } from 'vitest'
import { createUserMessage, createAssistantMessage, markAgentLoopRequest } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { PiAiAdapter } from '../src/adapter.ts'
import { resolveProfiles } from '../src/config.ts'
import { createRelayCapabilityResolver } from '../src/relay-capabilities.ts'
import { memoryAuth } from './auth-double.ts'

it.each([['openai-completions', 'explicit'], ['openai-completions', 'automatic'],
  ['openai-responses', 'explicit'], ['openai-responses', 'automatic']] as const)('streams %s with %s relay transport through full, delta and byte-equivalent retries', async (api, mode) => {
  let probes = 0
  const encodings: (string | undefined)[] = []
  const requests: Record<string, unknown>[] = []
  const server = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/relay-capabilities') {
      probes += 1
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ object: 'llm_relay.capabilities', version: 2, session_reuse: true, delta_requests: true, gzip_requests: true }))
      return
    }
    encodings.push(request.headers['content-encoding'])
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    request.on('end', () => {
      const bytes = Buffer.concat(chunks)
      const payload: Record<string, unknown> = JSON.parse((request.headers['content-encoding'] === 'gzip'
        ? gunzipSync(bytes) : bytes).toString())
      requests.push(payload)
      const meta = payload['relay_context'] as Record<string, unknown>
      const messages = (payload['messages'] ?? payload['input']) as Record<string, unknown>[]
      const count = Number(meta['base_count'] ?? 0) + messages.length
      if (api === 'openai-responses') {
        const item = { id: 'msg_fixture', type: 'message', role: 'assistant', status: 'completed',
          content: [{ type: 'output_text', text: 'hello', annotations: [] }] }
        const result = { id: 'resp_fixture', object: 'response', created_at: 1, model: 'gpt-test', status: 'completed', output: [item],
          usage: { input_tokens: 10, output_tokens: 1, total_tokens: 11 },
          relay_ack: { version: 2, request_id: meta['request_id'], base_count: count, base_hash: 'c'.repeat(64) } }
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        for (const frame of [
          { type: 'response.created', response: { ...result, status: 'in_progress', output: [] } },
          { type: 'response.output_item.added', output_index: 0, item: { ...item, status: 'in_progress', content: [] } },
          { type: 'response.content_part.added', output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
          { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'hello' },
          { type: 'response.output_item.done', output_index: 0, item },
          { type: 'response.completed', response: result },
        ]) response.write(`event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`)
        response.end()
        return
      }
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
  const profiles = resolveProfiles({ relay: {
    api, baseURL: `http://127.0.0.1:${address.port}`, relaySessionReuse: mode === 'explicit',
    relayDeltaRequests: mode === 'explicit', gzipRequests: mode === 'explicit', models: [{ id: 'gpt-test' }],
  } })
  const adapter = new PiAiAdapter({ profiles: () => profiles, resolveRelayCapabilities: createRelayCapabilityResolver(),
    resolveApiKey: () => Promise.resolve('test-key'), auth: memoryAuth() })
  try {
    const first = markAgentLoopRequest({ provider: 'relay', model: 'gpt-test', sessionId: SessionId('chat-sdk-delta'),
      serviceTier: 'priority' as const,
      messages: [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'reference '.repeat(10000) }] })],
    })
    if (mode === 'automatic') {
      expect(await adapter.relayTransportStatus('relay')).toEqual({ required: true, sessionReuse: true, deltaRequests: true, gzipRequests: true })
      expect(profiles.get('relay')?.relaySessionReuse).toBe(false)
    }
    const prepared = await adapter.prepareCall('relay', 'gpt-test')
    expect(prepared.model.systemPromptUpdate).toBe('in-history')
    for await (const _chunk of adapter.stream(first)) { /* drain */ }
    const second = markAgentLoopRequest({ ...first, messages: [...first.messages,
      createAssistantMessage({ source: { provider: 'relay', model: 'gpt-test' }, content: [{ type: 'text', text: 'hello' }] }),
      createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'continue' }] }),
    ] })
    for await (const _chunk of adapter.stream(second)) { /* drain */ }
    for await (const _chunk of adapter.stream(second)) { /* same logical request retries */ }
    expect(probes).toBe(mode === 'automatic' ? 1 : 0)
    expect(encodings[0]).toBe('gzip')
    expect(requests).toHaveLength(3)
    expect(requests[0]?.['relay_context']).toMatchObject({ version: 2, mode: 'full' })
    expect(requests[1]?.['relay_context']).toMatchObject({ version: 2, mode: 'delta' })
    if (api === 'openai-completions') {
      expect(requests[1]?.['messages']).toEqual([{ role: 'assistant', content: 'hello' }, { role: 'user', content: 'continue' }])
    } else expect(requests[1]?.['input']).toHaveLength(2)
    expect(requests[1]?.['service_tier']).toBe('priority')
    expect(JSON.stringify(requests[1]).length).toBeLessThan(JSON.stringify(requests[0]).length / 100)
    expect(requests[2]).toEqual(requests[1])
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()) })
  }
})
