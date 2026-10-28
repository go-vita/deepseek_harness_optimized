/** Opt-in acknowledged HTTP deltas; no native model or deployment work. */
import { createHash } from 'node:crypto'
import type { RelayContext } from './relay-context.ts'

type Item = Record<string, unknown>
interface Checkpoint { count: number; hash: string; prefix: string[]; config: string }
interface Entry {
  checkpoint?: Checkpoint | undefined
  last?: { id: string; checkpoint?: Checkpoint | undefined } | undefined
  touched: number
}
const entries = new Map<string, Entry>()
function hash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }
function key(context: RelayContext, route: string): string {
  return hash([route, context.session_id, context.branch_id, context.purpose, context.generation])
}

/** One provider invocation; response acknowledgement is accepted only after completion. */
export class RelayDeltaRequest {
  private pending?: { entry: Entry; prefix: string[]; config: string; requestId: string }
  constructor(private readonly route: string) {}

  prepare(payload: Record<string, unknown>, context: RelayContext): Record<string, unknown> {
    const input = Array.isArray(payload['input']) ? (payload['input'] as Item[]).filter(item => item['type'] !== 'reasoning') : undefined
    const full = { ...payload, relay_context: { ...context, version: 2, mode: 'full' } }
    if (input === undefined || context.purpose !== 'main') return full
    const id = key(context, this.route)
    let entry = entries.get(id)
    if (entry === undefined) {
      if (entries.size >= 32) entries.delete(entries.keys().next().value as string)
      entry = { touched: Date.now() }; entries.set(id, entry)
    }
    entry.touched = Date.now()
    const prefix = input.map(hash)
    const config = hash({ ...payload, input: undefined })
    const checkpoint = entry.last?.id === context.request_id ? entry.last.checkpoint : entry.checkpoint
    entry.last = { id: context.request_id, checkpoint }
    this.pending = { entry, prefix, config, requestId: context.request_id }
    if (checkpoint === undefined || checkpoint.config !== config || checkpoint.count > input.length
      || !checkpoint.prefix.every((value, index) => prefix[index] === value)) return full
    return { ...payload, input: input.slice(checkpoint.count), relay_context: { ...context, version: 2,
      mode: 'delta', base_count: checkpoint.count, base_hash: checkpoint.hash } }
  }

  private accept(value: unknown): void {
    if (value === null || typeof value !== 'object' || this.pending === undefined) return
    const frame = value as Record<string, unknown>
    if (frame['type'] === 'response.failed') {
      if (JSON.stringify(frame).includes('relay_resync_required')) {
        this.pending.entry.checkpoint = undefined; this.pending.entry.last = undefined
      }
      return
    }
    const response = (frame['type'] === 'response.completed' ? frame['response'] : frame) as Record<string, unknown> | undefined
    if (response?.['status'] !== 'completed') return
    const ack = response['relay_ack'] as Record<string, unknown> | undefined
    const { entry, prefix, config, requestId } = this.pending
    if (ack?.['version'] !== 2 || ack['request_id'] !== requestId || ack['base_count'] !== prefix.length
      || typeof ack['base_hash'] !== 'string' || !/^[0-9a-f]{64}$/.test(ack['base_hash'])) return
    entry.checkpoint = { count: prefix.length, hash: ack['base_hash'], prefix, config }
  }

  /** Observe SSE in the consumer's stream, so aborted/failed streams never advance. */
  wrapFetch(base: typeof fetch): typeof fetch {
    return async (input, init) => {
      const response = await base(input, init)
      if (!response.ok) {
        try {
          if ((await response.clone().text()).includes('relay_resync_required') && this.pending !== undefined) {
            this.pending.entry.checkpoint = undefined; this.pending.entry.last = undefined
          }
        } catch { /* retain previous checkpoint on network interruption */ }
        return response
      }
      if (response.body === null) return response
      if (!response.headers.get('content-type')?.includes('text/event-stream')) {
        try { this.accept(await response.clone().json()) } catch { /* no checkpoint */ }
        return response
      }
      let buffer = ''
      let overflow = false
      const decoder = new TextDecoder()
      const transform = new TransformStream<Uint8Array, Uint8Array>({
        transform: (chunk, controller) => {
          controller.enqueue(chunk)
          if (overflow) return
          buffer += decoder.decode(chunk, { stream: true })
          if (buffer.length > 4 * 1024 * 1024) { overflow = true; buffer = ''; return }
          let newline: number
          while ((newline = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1)
            if (line.startsWith('data: {')) { try { this.accept(JSON.parse(line.slice(6))) } catch { /* incomplete frame */ } }
          }
        },
      })
      return new Response(response.body.pipeThrough(transform), {
        status: response.status, statusText: response.statusText, headers: response.headers,
      })
    }
  }
}
