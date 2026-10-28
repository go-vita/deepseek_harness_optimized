// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ComponentProps } from 'react'
import { WeeklyQuota } from '../src/client/WeeklyQuota.tsx'
import type { ModelDirectoryState } from '../src/client/directory.ts'
import { zh } from '../src/client/locales.ts'

const t: ComponentProps<typeof WeeklyQuota>['t'] = (key, params) => {
  const value = (zh as Record<string, string>)[key] ?? key
  return value.replace(/\{(\w+)\}/g, (match, name: string) => params && name in params ? String(params[name]) : match)
}
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('shows the authenticated provider quota and clears it when the session changes provider', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url, request) => {
    const { provider } = JSON.parse(request.body as string)
    return Response.json(provider === 'codex' ? { enabled: true, weekly: { remainingPercent: 73 } } : { enabled: false })
  }))
  const directory = createSnapshotStore<ModelDirectoryState>({ current: { provider: 'codex', model: 'gpt' }, routable: true, groups: [], failures: [], status: 'ready', pending: null, error: null })
  render(<WeeklyQuota directory={directory} t={t} />)
  expect(await screen.findByText('周剩余 73%')).toBeTruthy()
  directory.update((state) => { state.current = { provider: 'other', model: 'another' } })
  await waitFor(() => expect(screen.queryByText('周剩余 73%')).toBeNull())
})
it('reports an unavailable quota without inventing a percentage', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ enabled: true, weekly: null })))
  const directory = createSnapshotStore<ModelDirectoryState>({ current: { provider: 'codex', model: 'gpt' }, routable: true, groups: [], failures: [], status: 'ready', pending: null, error: null })
  render(<WeeklyQuota directory={directory} t={t} />)
  expect(await screen.findByText('周剩余 —')).toBeTruthy()
})
