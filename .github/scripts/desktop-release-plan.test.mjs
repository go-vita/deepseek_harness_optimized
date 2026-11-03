import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planDesktopRelease, selectDesktopRelease } from './desktop-release-plan.mjs'

const run = { id: 123, workflow_id: 8, status: 'completed', conclusion: 'success', head_sha: 'a'.repeat(40), run_number: 5, run_attempt: 2 }
const artifact = { id: 11, name: 'harness-mac-arm64-0.2.1-rc.3.20261103.5.2-unsigned', expired: false }

test('selects current attempt installers and excludes logs and previous attempts', () => {
  const result = planDesktopRelease(run, 8, [artifact,
    { ...artifact, id: 12, name: artifact.name.replace('.5.2-', '.5.1-') },
    { ...artifact, id: 13, name: 'harness-mac-arm64-logs-123-2' }])
  assert.equal(result.artifactIds, '11')
  assert.equal(result.sha, run.head_sha)
  assert.equal(result.tag, `desktop-commit-${run.head_sha}`)
})
test('accepts all three platforms from one build', () => {
  const result = planDesktopRelease(run, 8, [artifact, { ...artifact, id: 12, name: artifact.name.replace('mac-arm64', 'mac-x64') },
    { ...artifact, id: 13, name: artifact.name.replace('mac-arm64', 'win-x64') }])
  assert.equal(result.artifactIds, '11,12,13')
})
test('rejects wrong workflows, failed or running builds, missing sources and expired installers', () => {
  for (const changed of [{ workflow_id: 9 }, { status: 'in_progress' }, { conclusion: 'failure' }, { head_sha: 'main' }]) {
    assert.throws(() => planDesktopRelease({ ...run, ...changed }, 8, [artifact]))
  }
  assert.throws(() => planDesktopRelease(run, 8, [{ ...artifact, expired: true }]), /expired/)
  assert.throws(() => planDesktopRelease(run, 8, []), /No installers/)
})
test('rejects duplicate platform artifacts', () => {
  assert.throws(() => planDesktopRelease(run, 8, [artifact, { ...artifact, id: 12 }]), /Duplicate/)
})

test('different packaging runs and attempts for the same commit share a release tag', () => {
  const first = planDesktopRelease(run, 8, [artifact])
  const second = planDesktopRelease({ ...run, id: 456, run_number: 7, run_attempt: 1 }, 8,
    [{ ...artifact, name: artifact.name.replace('.5.2-', '.7.1-') }])
  assert.equal(first.tag, second.tag)
  assert.notEqual(first.tag, planDesktopRelease({ ...run, head_sha: 'b'.repeat(40) }, 8, [artifact]).tag)
})
test('reuses canonical and legacy drafts while rejecting ambiguous or published releases', () => {
  const legacy = { tag_name: 'desktop-build-123-2', target_commitish: run.head_sha, draft: true }
  const canonical = { ...legacy, tag_name: `desktop-commit-${run.head_sha}` }
  assert.equal(selectDesktopRelease([legacy], run.head_sha), legacy)
  assert.equal(selectDesktopRelease([canonical], run.head_sha), canonical)
  assert.equal(selectDesktopRelease([], run.head_sha), undefined)
  assert.throws(() => selectDesktopRelease([legacy, canonical], run.head_sha), /Multiple releases/)
  assert.throws(() => selectDesktopRelease([{ ...canonical, draft: false }], run.head_sha), /published/)
  assert.throws(() => selectDesktopRelease([{ ...canonical, target_commitish: 'b'.repeat(40) }], run.head_sha), /another source/)
})

test('automatic publishing can append to the same mutable prerelease but never to stable or immutable releases', () => {
  const release = { tag_name: `desktop-commit-${run.head_sha}`, target_commitish: run.head_sha, draft: false, prerelease: true }
  const options = { allowPublishedPrerelease: true }
  assert.equal(selectDesktopRelease([release], run.head_sha, options), release)
  assert.throws(() => selectDesktopRelease([release], run.head_sha), /published/)
  assert.throws(() => selectDesktopRelease([{ ...release, prerelease: false }], run.head_sha, options), /published/)
  assert.throws(() => selectDesktopRelease([{ ...release, immutable: true }], run.head_sha, options), /published/)
  assert.throws(() => selectDesktopRelease([{ ...release, target_commitish: 'b'.repeat(40) }], run.head_sha, options), /another source/)
})

test('groups the prebuilt Web package with Windows and ignores mismatched artifact modes', () => {
  const web = { ...artifact, id: 14, name: artifact.name.replace('mac-arm64', 'web').replace('-unsigned', '-prebuilt') }
  const windows = { ...artifact, id: 15, name: artifact.name.replace('mac-arm64', 'win-x64') }
  const result = planDesktopRelease(run, 8, [web, windows, { ...web, id: 16, name: web.name.replace('-prebuilt', '-unsigned') }])
  assert.equal(result.artifactIds, '14,15')
  assert.equal(result.tag, `desktop-commit-${run.head_sha}`)
})
