import { useEffect, useState } from 'react'
import type { en } from './locales.ts'
import styles from './ModelsSection.module.css'

type Transport = { required: boolean; sessionReuse: boolean; deltaRequests: boolean; gzipRequests: boolean }
type Result = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; value: Transport }

/** Read-only effective transport settings for the saved provider; API keys stay on the Host. */
export function RelayTransportStatus({ provider, revision, t }: {
  provider: string
  revision: number
  t: (key: keyof typeof en) => string
}) {
  const [refresh, setRefresh] = useState(0)
  const [result, setResult] = useState<Result>({ kind: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setResult({ kind: 'loading' })
    void (async () => {
      try {
        const response = await fetch('/api/provider-relay-capabilities', { method: 'POST',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider }), signal: controller.signal })
        if (!response.ok) throw new Error('capability check failed')
        const data: unknown = await response.json()
        if (typeof data !== 'object' || data === null || !('required' in data) || typeof data.required !== 'boolean'
          || !('sessionReuse' in data) || typeof data.sessionReuse !== 'boolean'
          || !('deltaRequests' in data) || typeof data.deltaRequests !== 'boolean'
          || !('gzipRequests' in data) || typeof data.gzipRequests !== 'boolean') throw new Error('invalid capability response')
        if (data.required && (!data.sessionReuse || !data.deltaRequests || !data.gzipRequests)) throw new Error('inconsistent relay capabilities')
        const value = { required: data.required, sessionReuse: data.sessionReuse,
          deltaRequests: data.deltaRequests, gzipRequests: data.gzipRequests }
        if (active) setResult({ kind: 'ready', value })
      } catch (_error) {
        if (active) setResult({ kind: 'error' })
      }
    })()
    return () => { active = false; controller.abort() }
  }, [provider, revision, refresh])
  return (
    <fieldset aria-busy={result.kind === 'loading'} className={styles['relayTransport']}>
      <legend>{t('relayTitle')}</legend>
      <p className={styles['advancedHint']}>{t('relaySavedHint')}</p>
      {result.kind === 'loading' ? <p aria-live="polite">{t('relayChecking')}</p> : null}
      {result.kind === 'error' ? <p aria-live="polite">{t('relayUnavailable')}</p> : null}
      {result.kind === 'ready' ? <>
        <p aria-live="polite">{t(result.value.required ? 'relayRequired'
          : result.value.sessionReuse || result.value.deltaRequests || result.value.gzipRequests ? 'relayConfigured' : 'relayStandard')}</p>
        <label><input type="checkbox" disabled checked={result.value.sessionReuse} />{t('relaySessionReuse')}</label>
        <label><input type="checkbox" disabled checked={result.value.deltaRequests} />{t('relayDeltaRequests')}</label>
        <label><input type="checkbox" disabled checked={result.value.gzipRequests} />{t('relayGzipRequests')}</label>
      </> : null}
      <button type="button" className={styles['secondaryButton']} disabled={result.kind === 'loading'} onClick={() => { setRefresh(value => value + 1) }}>{t('relayRefresh')}</button>
    </fieldset>
  )
}
