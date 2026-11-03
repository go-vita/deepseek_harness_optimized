import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planDesktopRelease } from './desktop-release-plan.mjs'

const run = { id: 123, workflow_id: 8, status: 'completed', conclusion: 'success', head_sha: 'a'.repeat(40), run_number: 5, run_attempt: 2 }
const artifact = { id: 11, name: 'harness-mac-arm64-0.2.1-rc.3.20261103.5.2-unsigned', expired: false }

test('selects current attempt installers and excludes logs and previous attempts', () => {
  const result = planDesktopRelease(run, 8, [artifact,
    { ...artifact, id: 12, name: artifact.name.replace('.5.2-', '.5.1-') },
    { ...artifact, id: 13, name: 'harness-mac-arm64-logs-123-2' }])
  assert.equal(result.artifactIds, '11')
  assert.equal(result.sha, run.head_sha)
  assert.equal(result.tag, 'desktop-build-123-2')
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
