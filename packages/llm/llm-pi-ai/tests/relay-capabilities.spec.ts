import { afterEach, expect, it, vi } from 'vitest'
import { resolveProfiles } from '../src/config.ts'
import { createRelayCapabilityResolver } from '../src/relay-capabilities.ts'

const capabilities = { object: 'llm_relay.capabilities', version: 2, session_reuse: true, delta_requests: true, gzip_requests: true }
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
  expect(String(fetcher.mock.calls[0]?.[0])).toBe('https://example.test/v1/relay-capabilities')
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
