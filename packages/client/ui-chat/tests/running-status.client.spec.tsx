// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { RunningStatus } from '../src/client/chat/RunningStatus.tsx'
import { zh } from '../src/client/locale.ts'
import type { SessionClockSample } from '@deepseek-ai/dsh-api-session-controller/client'

const t = makeTranslate(zh, commonZh)

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(5_000) })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function statusHarness(startTime?: number, clock?: SessionClockSample) {
  const clockProps = clock === undefined ? {} : { clock }
  const view = render(<RunningStatus startTime={startTime} paused={false} t={t} {...clockProps} />)
  return {
    ...view,
    content: () => view.container.querySelector('[data-chat-running] > :last-child'),
    set: (nextStartTime?: number, paused = false) => {
      view.rerender(<RunningStatus startTime={nextStartTime} paused={paused} t={t} {...clockProps} />)
    },
  }
}

describe('RunningStatus', () => {
  it.each([-8, 8])('counts through model silence with a %i-hour Client clock offset', (hours) => {
    const hostTime = 100_000
    vi.setSystemTime(hostTime + hours * 3_600_000)
    const view = statusHarness(hostTime - 5_000, { hostTime, receivedAt: performance.now() })
    expect(view.content()?.textContent).toBe('深度求索中，用时 5秒 ···')
    act(() => { vi.advanceTimersByTime(30_000) })
    expect(view.content()?.textContent).toBe('深度求索中，用时 35秒 ···')
  })

  it('restores already elapsed Host time when a running Turn is opened', () => {
    vi.setSystemTime(1_000)
    const receivedAt = performance.now()
    act(() => { vi.advanceTimersByTime(2_000) })
    const view = statusHarness(10_000, { hostTime: 100_000, receivedAt })
    expect(view.content()?.textContent).toBe('深度求索中，用时 1分32秒 ···')
  })

  it('ignores forward and backward wall-clock changes during a run', () => {
    const view = statusHarness(1_000, { hostTime: 5_000, receivedAt: performance.now() })
    act(() => { vi.advanceTimersByTime(2_000) })
    expect(view.content()?.textContent).toBe('深度求索中，用时 6秒 ···')
    act(() => { vi.setSystemTime(Date.now() + 8 * 3_600_000); vi.advanceTimersByTime(3_000) })
    expect(view.content()?.textContent).toBe('深度求索中，用时 9秒 ···')
    act(() => { vi.setSystemTime(0); vi.advanceTimersByTime(3_000) })
    expect(view.content()?.textContent).toBe('深度求索中，用时 12秒 ···')
  })

  it('keeps advancing for an older Host with no clock sample and a future Turn start', () => {
    const view = statusHarness(Date.now() + 8 * 3_600_000)
    act(() => { vi.advanceTimersByTime(3_000) })
    expect(view.content()?.textContent).toBe('深度求索中，用时 3秒 ···')
  })

  it('waits for an open Turn start before allocating its clock', () => {
    const view = statusHarness()
    expect(view.content()?.textContent).toBe('深度求索中')
    expect(vi.getTimerCount()).toBe(0)
    view.set(1_000)
    expect(view.content()?.textContent).toMatch(/^深度求索中，用时 \d+秒 ···$/)
    expect(view.content()?.querySelectorAll('[data-shimmer="true"]')).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(1)
    view.set()
    expect(view.content()?.textContent).toBe('深度求索中')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps the indicator mounted while a continuous run moves to the next Turn', () => {
    const view = statusHarness(1_000)
    const content = view.content()
    const status = view.getByRole('status')
    const initialText = content?.textContent
    act(() => { vi.advanceTimersByTime(2_000) })
    expect(content?.textContent).toMatch(/^深度求索中，用时 \d+秒 ···$/)
    expect(content?.textContent).not.toBe(initialText)
    view.set(7_000)
    expect(view.content()).toBe(content)
    expect(content?.textContent).toMatch(/^深度求索中，用时 \d+秒 ···$/)
    expect(vi.getTimerCount()).toBe(1)
    const nextTurnText = content?.textContent
    act(() => { vi.advanceTimersByTime(2_000) })
    expect(content?.textContent).toMatch(/^深度求索中，用时 \d+秒 ···$/)
    expect(content?.textContent).not.toBe(nextTurnText)
    expect(view.getByRole('status')).toBe(status)
    expect(status.textContent).toBe('深度求索中')
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps the duration nonnegative when the start is ahead of the local clock', () => {
    const view = statusHarness(6_000)
    expect(view.content()?.textContent).toMatch(/^深度求索中，用时 \d+秒 ···$/)
    expect(view.content()?.textContent).not.toContain('-')
    act(() => { vi.advanceTimersByTime(3_000) })
    expect(view.content()?.textContent).toMatch(/^深度求索中，用时 \d+秒 ···$/)
    expect(view.content()?.textContent).not.toContain('-')
  })

  it('keeps the running duration advancing while reconnecting without stream chunks', () => {
    const view = statusHarness(4_000)
    view.set(4_000, true)
    expect(view.content()?.textContent).toBe('深度求索中，用时 1秒 ···')
    act(() => { vi.advanceTimersByTime(3_000) })
    expect(view.content()?.textContent).toBe('深度求索中，用时 4秒 ···')
    view.set(4_000)
    expect(view.content()?.textContent).toBe('深度求索中，用时 4秒 ···')
    expect(vi.getTimerCount()).toBe(1)
  })
})
