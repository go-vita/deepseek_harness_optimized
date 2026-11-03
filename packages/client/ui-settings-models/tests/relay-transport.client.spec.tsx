// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { RelayTransportStatus } from '../src/client/RelayTransportStatus.tsx'
import { en } from '../src/client/locales.ts'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('shows forced relay features as checked and disabled without exposing credentials', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({
    required: true, sessionReuse: true, deltaRequests: true, gzipRequests: true,
  }))
  vi.stubGlobal('fetch', fetcher)
  render(<RelayTransportStatus provider="relay" revision={1} t={key => en[key]} />)
  await screen.findByText(en.relayRequired)
  for (const label of [en.relaySessionReuse, en.relayDeltaRequests, en.relayGzipRequests]) {
    const box = screen.getByRole<HTMLInputElement>('checkbox', { name: label })
    expect(box.checked).toBe(true)
    expect(box.disabled).toBe(true)
    fireEvent.click(box)
    expect(box.checked).toBe(true)
  }
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ provider: 'relay' })
})
it('keeps ordinary providers unselected instead of claiming relay support', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ required: false, sessionReuse: false, deltaRequests: false, gzipRequests: false })))
  render(<RelayTransportStatus provider="ordinary" revision={1} t={key => en[key]} />)
  await screen.findByText(en.relayStandard)
  for (const box of screen.getAllByRole<HTMLInputElement>('checkbox')) expect(box.checked).toBe(false)
})
it('shows a failed check and allows retry without persisting guessed settings', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('', { status: 502 }))
    .mockResolvedValueOnce(Response.json({ required: true, sessionReuse: true, deltaRequests: true, gzipRequests: true }))
  vi.stubGlobal('fetch', fetcher)
  render(<RelayTransportStatus provider="relay" revision={1} t={key => en[key]} />)
  await screen.findByText(en.relayUnavailable)
  expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: en.relayRefresh }))
  await screen.findByText(en.relayRequired)
  expect(fetcher).toHaveBeenCalledTimes(2)
})
it('cancels the old check when switching providers and does not show stale results', async () => {
  let firstSignal: AbortSignal | null | undefined
  let settle: ((value: Response) => void) | undefined
  const fetcher = vi.fn<typeof fetch>().mockImplementationOnce((_url, init) => {
    firstSignal = init?.signal
    return new Promise<Response>((resolve) => { settle = resolve })
  }).mockResolvedValue(Response.json({ required: false, sessionReuse: false, deltaRequests: false, gzipRequests: false }))
  vi.stubGlobal('fetch', fetcher)
  const view = render(<RelayTransportStatus provider="first" revision={1} t={key => en[key]} />)
  view.rerender(<RelayTransportStatus provider="second" revision={2} t={key => en[key]} />)
  await screen.findByText(en.relayStandard)
  expect(firstSignal?.aborted).toBe(true)
  settle?.(Response.json({ required: true, sessionReuse: true, deltaRequests: true, gzipRequests: true }))
  await waitFor(() => { expect(screen.queryByText(en.relayRequired)).toBeNull() })
})

it('does not claim that inconsistent required transport is enabled', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ required: true, sessionReuse: true, deltaRequests: false, gzipRequests: true })))
  render(<RelayTransportStatus provider="relay" revision={1} t={key => en[key]} />)
  await screen.findByText(en.relayUnavailable)
  expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
})
