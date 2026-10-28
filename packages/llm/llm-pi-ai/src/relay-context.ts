/** Model-hidden correlation for gateways that persist upstream conversations. */
import { createHash } from 'node:crypto'
import { isAgentLoopRequest } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'

/** Versioned JSON metadata accepted by the session-aware relay. */
export interface RelayContext {
  version: 1
  session_id: string
  branch_id: string
  purpose: 'main' | 'compaction' | 'session-title' | 'auxiliary'
  generation: string
  request_id: string
}

/**
 * Identify one logical request independently of transport attempts.
 * @param options - final provider-neutral request, including durable message identities.
 * @param generation - the session surface replacement generation captured for this request.
 * @returns wire metadata, or undefined when the caller has no session identity.
 */
export function relayContextFor(options: GenerateOptions, generation = 0): RelayContext | undefined {
  if (options.sessionId === undefined) return undefined
  const sessionId = String(options.sessionId)
  const purpose: RelayContext['purpose'] = options.purpose ?? (isAgentLoopRequest(options) ? 'main' : 'auxiliary')
  const identity = {
    version: 1 as const,
    session_id: sessionId,
    branch_id: sessionId,
    purpose,
    generation: String(generation),
  }
  const request = {
    ...identity,
    provider: options.provider,
    model: options.model,
    reasoningEffort: options.reasoningEffort,
    serviceTier: options.serviceTier,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    stop: options.stop,
    system: options.system,
    tools: options.tools,
    toolHistory: options.toolHistory,
    messages: options.messages,
  }
  return { ...identity, request_id: digest(request) }
}

/**
 * Include effective SDK defaults and protocol projection in an idempotency identity.
 * @param context - identity of the logical Harness request.
 * @param payload - actual request body before adding relay metadata.
 * @returns metadata whose request ID also covers the emitted payload.
 */
export function relayContextWithPayload(context: RelayContext, payload: Record<string, unknown>): RelayContext {
  return { ...context, request_id: digest({ request: context.request_id, payload }) }
}

function digest(request: unknown): string {
  const encoded = JSON.stringify(request, (_key, value: unknown) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0))
  })
  return createHash('sha256').update(encoded).digest('hex')
}
