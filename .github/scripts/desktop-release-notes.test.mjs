import { test } from 'node:test'
import assert from 'node:assert/strict'
import { desktopReleaseNotes, mergeDesktopReleaseNotes } from './desktop-release-notes.mjs'

const metadata = { repository: 'example/harness', sha: 'a'.repeat(40), buildUrl: 'https://example.test/build' }
const commit = (prefix, message = 'change') => ({ sha: prefix.padEnd(40, '0'), commit: { message } })
test('older installers do not advertise changes from newer commits', () => {
  const notes = desktopReleaseNotes({ ...metadata, commits: [commit('101e11f8aa')] })
  assert.match(notes, /Relay sessions and request transport/)
  assert.doesNotMatch(notes, /### Cloud desktop packaging/)
  assert.doesNotMatch(notes, /### Weekly quota visibility/)
})
test('included feature commits produce detailed scope and all commit links', () => {
  const notes = desktopReleaseNotes({ ...metadata, commits: [commit('9f73917ae5'), commit('c933b6acac'), commit('bbbbbbbbbb', 'future feature')] })
  for (const text of ['Fast', 'reasoning-effort', 'VirtualBox', 'Weekly quota visibility', 'future feature', metadata.sha]) assert.ok(notes.includes(text))
})
test('rerunning notes preserves manual additions without duplicate managed content', () => {
  const first = desktopReleaseNotes({ ...metadata, commits: [] })
  const second = desktopReleaseNotes({ ...metadata, commits: [commit('101e11f8aa')] })
  const updated = mergeDesktopReleaseNotes(`Manual preface\n${first}\nManual footer`, second)
  assert.ok(updated.startsWith('Manual preface'))
  assert.ok(updated.endsWith('Manual footer'))
  assert.equal(updated.split('## Build information').length, 2)
  assert.equal(mergeDesktopReleaseNotes(updated, second), updated)
})
test('upgrades the original default draft and preserves other unmarked descriptions', () => {
  assert.equal(mergeDesktopReleaseNotes('Unsigned desktop test packages.\nOld notes', 'new'), 'new')
  assert.equal(mergeDesktopReleaseNotes('My notes', 'new'), 'My notes\n\nnew')
})

test('adding another platform preserves original build links without repeating run links', () => {
  const firstUrl = 'https://github.com/example/harness/actions/runs/123'
  const secondUrl = 'https://github.com/example/harness/actions/runs/456'
  const first = desktopReleaseNotes({ ...metadata, buildUrl: firstUrl, commits: [] })
  const second = desktopReleaseNotes({ ...metadata, buildUrl: secondUrl, previousBody: first, commits: [] })
  assert.ok(second.includes(firstUrl))
  assert.ok(second.includes(secondUrl))
  const retry = desktopReleaseNotes({ ...metadata, buildUrl: secondUrl, previousBody: second, commits: [] })
  assert.equal(retry, second)
})

test('includes actionable English Web installation and upgrade instructions', () => {
  const notes = desktopReleaseNotes({ ...metadata, commits: [] })
  for (const text of ['Web installation: macOS and Linux', 'Node.js 24.9', 'pnpm 11.28.5', './install.sh', './start.sh',
    '--port 8080 --no-open', 'Ctrl+C', '~/.dsh', 'node_modules', 'Windows installation']) assert.ok(notes.includes(text))
})
