import { useEffect, useState, useSyncExternalStore } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ModelDirectoryState } from './directory.ts'
import css from './ModelSelect.module.css'

export function WeeklyQuota({ directory, t }: { directory: SnapshotStore<ModelDirectoryState> } & PropsLocale<'model'>) {
  const provider = useSyncExternalStore(fn => directory.subscribe(fn), () => directory.getSnapshot()).current?.provider
  const [value, setValue] = useState<{ provider: string; percent: number | null } | null>(null)
  useEffect(() => {
    if (!provider) return
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined
    const refresh = async () => {
      controller = new AbortController()
      try {
        const response = await fetch('/api/provider-weekly-quota', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider }), signal: controller.signal })
        if (!response.ok) throw new Error('quota unavailable')
        const data = await response.json() as { enabled?: boolean; weekly?: { remainingPercent?: unknown } | null; refreshAfterMs?: number }
        if (!active) return
        if (!data.enabled) setValue(null)
        else {
          const percent = data.weekly?.remainingPercent
          setValue({ provider, percent: typeof percent === 'number' && Number.isFinite(percent) ? percent : null })
        }
      } catch { if (active) setValue(old => old?.provider === provider ? { provider, percent: null } : null) }
      if (active) timer = setTimeout(refresh, 60000)
    }
    void refresh()
    return () => { active = false; controller?.abort(); if (timer) clearTimeout(timer) }
  }, [provider])
  if (!provider || value?.provider !== provider) return null
  return <span className={css.weeklyQuota}>{value.percent === null ? t('quota.unavailable') : t('quota.weekly', { percent: String(value.percent) })}</span>
}
