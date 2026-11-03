import { LlmError } from '@deepseek-ai/dsh-llm'
import type { ResolvedPiAiProviderProfile } from './config.ts'

/** Negotiate relay transport once per provider snapshot and credential. */
export function createRelayCapabilityResolver() {
  const cache = new WeakMap<ResolvedPiAiProviderProfile, { key: string; pending: Promise<boolean> }>()
  return async (
    profile: ResolvedPiAiProviderProfile, apiKey: string | undefined, signal?: AbortSignal, api = profile.api,
  ): Promise<boolean> => {
    const baseURL = profile.baseURL
    if (!baseURL || !apiKey || !['openai-completions', 'openai-responses', 'anthropic-messages'].includes(api ?? '')) return false
    const previous = cache.get(profile)
    if (previous?.key === apiKey) return previous.pending
    const pending = (async (): Promise<boolean> => {
      const base = new URL(baseURL.endsWith('/') ? baseURL : baseURL + '/')
      if (api === 'anthropic-messages' && !base.pathname.endsWith('/v1/')) base.pathname += 'v1/'
      const url = new URL('relay-capabilities', base)
      const deadline = AbortSignal.timeout(profile.streamIdleTimeoutMs)
      const response = await fetch(url, { headers: api === 'anthropic-messages' ? { 'x-api-key': apiKey } : { Authorization: `Bearer ${apiKey}` }, redirect: 'error',
        signal: signal === undefined ? deadline : AbortSignal.any([signal, deadline]) })
      if (response.status === 404 || response.status === 405) return false
      if (!response.ok) throw new LlmError(`Relay capability discovery failed: HTTP ${response.status}`, 'RELAY_CAPABILITIES_UNAVAILABLE')
      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('application/json')) return false
      const data: unknown = await response.json()
      if (typeof data !== 'object' || data === null || !('object' in data) || data.object !== 'llm_relay.capabilities') return false
      if (!('version' in data) || data.version !== 2 || !('session_reuse' in data) || data.session_reuse !== true
        || !('delta_requests' in data) || data.delta_requests !== true || !('gzip_requests' in data) || data.gzip_requests !== true) {
        throw new LlmError('The relay does not offer the required session reuse, delta, and gzip capabilities', 'RELAY_CAPABILITIES_UNAVAILABLE')
      }
      return true
    })()
    cache.set(profile, { key: apiKey, pending })
    try { return await pending }
    catch (error) {
      if (cache.get(profile)?.pending === pending) cache.delete(profile)
      throw error
    }
  }
}
