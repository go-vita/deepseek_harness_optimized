import { afterEach, describe, expect, it } from 'vitest'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '../src/adapter.ts'
import { resolveProfiles } from '../src/config.ts'
import { memoryAuth } from './auth-double.ts'
import { closeMockServers, mockServer, textEvents } from './mock-server.ts'

afterEach(closeMockServers)
const efforts = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'] as const

function responseEvents() {
  const item = { id: 'msg_fixture', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'hello', annotations: [] }] }
  const response = { id: 'resp_fixture', object: 'response', created_at: 1, model: 'gpt-6.1-sol', status: 'completed', output: [item], usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } }
  return [
    { type: 'response.created', response: { ...response, status: 'in_progress', output: [] } },
    { type: 'response.output_item.added', output_index: 0, item: { ...item, status: 'in_progress', content: [] } },
    { type: 'response.content_part.added', output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
    { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'hello' },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response },
  ].map(frame => ({ event: frame.type, data: JSON.stringify(frame) }))
}

describe.each(['openai-completions', 'openai-responses'] as const)('%s reasoning values', (api) => {
  it.each(efforts)('advertises and sends %s unchanged alongside session Fast mode', async (effort) => {
    const server = await mockServer([{ events: api === 'openai-responses' ? responseEvents() : textEvents }])
    const configured = ({ providers: { relay: {
      api, apiKeyEnv: 'PI_TEST_KEY', baseURL: server.url,
      models: [{ id: 'gpt-6.1-sol', reasoningEfforts: Object.fromEntries(efforts.map(value => [value, value])) }],
    } } })
    const profiles = resolveProfiles(configured.providers)
    const adapter = new PiAiAdapter({ profiles: () => profiles, resolveApiKey: () => Promise.resolve('local-test-key'), auth: memoryAuth() })
    const info = await adapter.resolveModel('relay', 'gpt-6.1-sol')
    expect(info.reasoning?.efforts.map(value => String(value.id))).toEqual(efforts)
    const chunks = []
    for await (const chunk of adapter.stream({ provider: 'relay', model: 'gpt-6.1-sol', messages: [], reasoningEffort: ReasoningEffortId(effort), serviceTier: 'priority' })) chunks.push(chunk)
    expect(chunks.length).toBeGreaterThan(0)
    expect(server.requests).toHaveLength(1)
    expect(server.requests[0]).toMatchObject(api === 'openai-responses'
      ? { reasoning: { effort }, service_tier: 'priority' }
      : { reasoning_effort: effort, service_tier: 'priority' })
  })
})
