import { afterEach, expect, it, vi } from 'vitest'
import { resolveProfiles } from '../src/config.ts'
import { createRelayCapabilityResolver } from '../src/relay-capabilities.ts'

const capabilities = { object: 'llm_relay.capabilities', version: 2, session_reuse: true, delta_requests: true, gzip_requests: true }
function requestedURL(input: Parameters<typeof fetch>[0] | undefined): string | undefined {
  if (input instanceof Request) return input.url
  return input instanceof URL ? input.href : input
}
function profile() {
  return resolveProfiles({ relay: { api: 'openai-completions', baseURL: 'https://example.test/v1', models: [{ id: 'gpt-test' }] } }).get('relay')!
}
afterEach(() => { vi.unstubAllGlobals() })
it('coalesces discovery and forces relay features even when profile flags are false', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(capabilities))
  vi.stubGlobal('fetch', fetcher)
  const resolve = createRelayCapabilityResolver()
  const p = { ...profile(), relaySessionReuse: false, relayDeltaRequests: false, gzipRequests: false }
  expect(await Promise.all([resolve(p, 'fixture-key'), resolve(p, 'fixture-key')])).toEqual([true, true])
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(requestedURL(fetcher.mock.calls[0]?.[0])).toBe('https://example.test/v1/relay-capabilities')
  expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('authorization')).toBe('Bearer fixture-key')
  await resolve(p, 'other-fixture-key')
  await resolve(profile(), 'fixture-key')
  expect(fetcher).toHaveBeenCalledTimes(3)
})
it.each([404, 405])('leaves ordinary providers unchanged on HTTP %s', async (status) => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response('', { status })))
  expect(await createRelayCapabilityResolver()(profile(), 'fixture-key')).toBe(false)
})
it('does not treat ordinary provider JSON as relay capabilities', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ data: [] })))
  expect(await createRelayCapabilityResolver()(profile(), 'fixture-key')).toBe(false)
})
it('rejects unavailable required relay features and retries discovery after failure', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ ...capabilities, session_reuse: false }))
    .mockResolvedValueOnce(Response.json(capabilities))
  vi.stubGlobal('fetch', fetcher)
  const resolve = createRelayCapabilityResolver(); const p = profile()
  await expect(resolve(p, 'fixture-key')).rejects.toThrow('required session reuse')
  expect(await resolve(p, 'fixture-key')).toBe(true)
})
it('fails before generation on a discovery service error', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response('', { status: 503 })))
  await expect(createRelayCapabilityResolver()(profile(), 'fixture-key')).rejects.toThrow('HTTP 503')
})

it.each(['https://example.test/claude', 'https://example.test/claude/v1'])('uses Anthropic authentication and v1 capability path from %s', async (baseURL) => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(capabilities))
  vi.stubGlobal('fetch', fetcher)
  const p = resolveProfiles({ relay: { api: 'anthropic-messages', baseURL, models: [{ id: 'claude-test' }] } }).get('relay')!
  expect(await createRelayCapabilityResolver()(p, 'fixture-key')).toBe(true)
  expect(requestedURL(fetcher.mock.calls[0]?.[0])).toBe('https://example.test/claude/v1/relay-capabilities')
  const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers)
  expect(headers.get('x-api-key')).toBe('fixture-key')
  expect(headers.has('authorization')).toBe(false)
})

it.each(['native-bearer', 'header-key', 'no-auth'] as const)('discovers relay capabilities with %s authentication', async (kind) => {
  const { PiAiAdapter } = await import('../src/adapter.ts')
  const { memoryAuth } = await import('./auth-double.ts')
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(capabilities))
  vi.stubGlobal('fetch', fetcher)
  const profiles = resolveProfiles({ anthropic: { api: 'anthropic-messages', baseURL: 'https://example.test/relay',
    ...kind === 'header-key' ? { headers: { 'x-api-key': 'fixture-key' } } : {}, models: [{ id: 'fixture' }] } })
  const auth = memoryAuth()
  auth.authContext.env = name => Promise.resolve(kind === 'native-bearer' && name === 'ANTHROPIC_AUTH_TOKEN' ? 'fixture-key' : undefined)
  const adapter = new PiAiAdapter({ profiles: () => profiles, resolveApiKey: () => Promise.resolve(undefined), auth,
    resolveRelayCapabilities: createRelayCapabilityResolver() })
  const result = await adapter.relayTransportStatus('anthropic')
  expect(result.required).toBe(kind !== 'no-auth')
  if (kind === 'no-auth') expect(fetcher).not.toHaveBeenCalled()
  else expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('x-api-key')).toBe('fixture-key')
})
