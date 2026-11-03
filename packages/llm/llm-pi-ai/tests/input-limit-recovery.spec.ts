import { afterEach, expect, it } from 'vitest'
import { CONTEXT_WINDOW_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '../src/adapter.ts'
import { resolveProfiles } from '../src/config.ts'
import { memoryAuth } from './auth-double.ts'
import { closeMockServers, mockServer } from './mock-server.ts'
afterEach(closeMockServers)
it('maps relay input-size SSE failure into the compaction recovery code', async () => {
  const response = { id: 'resp_fixture', object: 'response', created_at: 1, model: 'gpt-test', status: 'failed', output: [],
    error: { code: 'cli_error', message: 'context_length_exceeded: codex_input_too_large: Input exceeds 1048576 characters' } }
  const events = [{ type: 'response.created', response: { ...response, status: 'in_progress', error: null } },
    { type: 'response.failed', response }].map(frame => ({ event: frame.type, data: JSON.stringify(frame) }))
  const server = await mockServer([{ events }])
  const configured = ({ providers: { relay: { api: 'openai-responses', apiKeyEnv: 'PI_TEST_KEY', baseURL: server.url, models: [{ id: 'gpt-test' }] } } })
  const profiles = resolveProfiles(configured.providers)
  const adapter = new PiAiAdapter({ profiles: () => profiles, resolveApiKey: () => Promise.resolve('test-key'), auth: memoryAuth() })
  const chunks = []
  for await (const chunk of adapter.stream({ provider: 'relay', model: 'gpt-test', messages: [] })) chunks.push(chunk)
  expect(chunks.find(c => c.type === 'finish')).toMatchObject({ reason: { kind: 'error', failure: { code: CONTEXT_WINDOW_EXCEEDED_CODE, message: expect.stringContaining('codex_input_too_large') } } })
})
