/** Running Turn clock isolated from the transcript's render cycle. */
import { memo, useEffect, useState } from 'react'
import { TextShimmer } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionClockSample } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import { formatRunDuration, LIVE_RUN_CLOCK_INTERVAL_MS } from './message-chrome.ts'
import { RunningWhaleTail } from './RunningWhaleTail.tsx'
import a11yCss from './accessibility.module.css'
import css from './ChatView.module.css'

interface RunningStatusProps {
  readonly startTime: number | undefined
  /** Host time and Client monotonic receipt from the current follow baseline. */
  readonly clock?: SessionClockSample
  /** Connection state controls animation; elapsed time keeps advancing. */
  readonly paused: boolean
  readonly t: ChatViewSlotProps['t']
}

/**
 * Show live elapsed time after the current Turn's content without announcing ticks.
 * @param props - Current Turn start, Host clock reference, animation state, and localized copy.
 * @returns the blue running indicator; mount only while the Session is running.
 */
export const RunningStatus = memo(function RunningStatus({ startTime, clock, paused, t }: RunningStatusProps) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (startTime === undefined) return
    const anchor = performance.now()
    const initial = Math.max(0, (clock === undefined
      ? Date.now()
      : clock.hostTime + anchor - clock.receivedAt) - startTime)
    setElapsed(initial)
    const timer = setInterval(() => {
      setElapsed(initial + Math.max(0, performance.now() - anchor))
    }, LIVE_RUN_CLOCK_INTERVAL_MS)
    return () => { clearInterval(timer) }
  }, [startTime, clock])
  const label = startTime === undefined ? t('chat.deepDiving') : t('chat.deepDivingFor', {
    duration: formatRunDuration(Math.max(1000, elapsed), t).map(part => part.text).join(''),
  })
  return (
    <div className={css.running} data-chat-running>
      <span className={a11yCss.visuallyHidden} role="status" aria-live="polite" aria-atomic="true">{t('chat.deepDiving')}</span>
      <span className={css.runningDivider} aria-hidden="true" />
      <span className={css.runningContent}>
        <RunningWhaleTail />
        <TextShimmer active={!paused} className={css.runningText}>{label}</TextShimmer>
      </span>
    </div>
  )
})
