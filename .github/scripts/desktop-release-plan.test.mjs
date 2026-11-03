import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planDesktopRelease as plan, selectDesktopRelease, nextDesktopReleaseTag } from './desktop-release-plan.mjs'

const planDesktopRelease = (...args) => plan(...args, '0.2.1-rc.3')

const run = { id: 123, workflow_id: 8, status: 'completed', conclusion: 'success', head_sha: 'a'.repeat(40), run_number: 5, run_attempt: 2 }
const artifact = { id: 11, name: 'harness-mac-arm64-0.2.1-rc.3.20261103.5.2-unsigned', expired: false }

test('selects current attempt installers and excludes logs and previous attempts', () => {
  const result = planDesktopRelease(run, 8, [artifact,
    { ...artifact, id: 12, name: artifact.name.replace('.5.2-', '.5.1-') },
    { ...artifact, id: 13, name: 'harness-mac-arm64-logs-123-2' }])
  assert.equal(result.artifactIds, '11')
  assert.equal(result.sha, run.head_sha)
  assert.equal(result.version, '0.2.1-rc.3')
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

test('different packaging runs preserve source identity and version', () => {
  const first = planDesktopRelease(run, 8, [artifact])
  const second = planDesktopRelease({ ...run, id: 456, run_number: 7, run_attempt: 1 }, 8,
    [{ ...artifact, name: artifact.name.replace('.5.2-', '.7.1-') }])
  assert.equal(first.sha, second.sha)
  assert.equal(first.version, second.version)
  assert.notEqual(first.sha, planDesktopRelease({ ...run, head_sha: 'b'.repeat(40) }, 8, [artifact]).sha)
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
  assert.equal(result.version, '0.2.1-rc.3')
})

test('allocates consecutive community versions, including reserved tags and drafts', () => {
  assert.equal(nextDesktopReleaseTag('0.2.1-rc.3', [], []), 'v0.2.1-rc.3-optimized.1')
  const releases = [{ tag_name: 'v0.2.1-rc.3-optimized.2' }, { tag_name: 'v0.2.1-rc.4-optimized.99' }]
  assert.equal(nextDesktopReleaseTag('0.2.1-rc.3', releases, [{ ref: 'refs/tags/v0.2.1-rc.3-optimized.10' }]), 'v0.2.1-rc.3-optimized.11')
  assert.equal(nextDesktopReleaseTag('1.0.0', releases, []), 'v1.0.0-optimized.1')
  assert.throws(() => nextDesktopReleaseTag('../bad', [], []), /Invalid/)
})
test('reuses versioned releases by exact source commit and rejects duplicates', () => {
  const release = { tag_name: 'v0.2.1-rc.3-optimized.1', target_commitish: run.head_sha, draft: true }
  assert.equal(selectDesktopRelease([release], run.head_sha), release)
  assert.equal(selectDesktopRelease([release], 'b'.repeat(40)), undefined)
  assert.throws(() => selectDesktopRelease([release, { ...release, tag_name: `desktop-commit-${run.head_sha}` }], run.head_sha), /Multiple/)
  const published = { ...release, draft: false, prerelease: true }
  assert.equal(selectDesktopRelease([published], run.head_sha, { allowPublishedPrerelease: true }), published)
  assert.throws(() => selectDesktopRelease([{ ...published, immutable: true }], run.head_sha, { allowPublishedPrerelease: true }), /published/)
})
test('reads the build source version and rejects mismatched artifact versions', () => {
  for (const version of [undefined, '../bad', '1.2.3']) {
    assert.throws(() => plan(run, 8, [artifact], version), /version/)
  }
  assert.equal(plan(run, 8, [{ ...artifact, name: artifact.name.replace('0.2.1-rc.3.', '1.2.3-test.') }], '1.2.3').version, '1.2.3')
})
