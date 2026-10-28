/** Opt-in HTTP request compression for gateways that accept gzip request bodies. */
import { gzip } from 'node:zlib'
import { promisify } from 'node:util'
const gzipAsync = promisify(gzip)
const MIN_GZIP_BYTES = 32 * 1024

/** Compress sufficiently large buffered JSON request bodies, preserving all other fetch behavior. */
export async function gzipRequestFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const body = init?.body
  if (typeof body !== 'string' || Buffer.byteLength(body, 'utf8') < MIN_GZIP_BYTES) return fetch(input, init)
  const headers = new Headers(init?.headers)
  if (headers.has('content-encoding') || !headers.get('content-type')?.toLowerCase().includes('application/json')) return fetch(input, init)
  const compressed = await gzipAsync(Buffer.from(body, 'utf8'))
  if (compressed.byteLength >= Buffer.byteLength(body, 'utf8')) return fetch(input, init)
  headers.set('content-encoding', 'gzip')
  headers.delete('content-length')
  return fetch(input, { ...init, headers, body: compressed as unknown as BodyInit })
}
