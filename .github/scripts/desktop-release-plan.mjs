/** Select installers from one completed cloud build without mixing retry attempts. */
export function planDesktopRelease(run, workflowId, artifacts) {
  if (run.workflow_id !== workflowId) throw new Error('Select a Package Desktop · GitHub Cloud run')
  if (run.status !== 'completed' || run.conclusion !== 'success') throw new Error('The selected build must have completed successfully')
  if (!/^[a-f0-9]{40}$/.test(run.head_sha)) throw new Error('Build source commit is missing')
  const suffix = `.${run.run_number}.${run.run_attempt}-unsigned`
  const selected = artifacts.filter(artifact => /^harness-(mac-arm64|mac-x64|win-x64)-/.test(artifact.name)
    && artifact.name.endsWith(suffix))
  if (selected.length === 0) throw new Error('No installers found for the latest build attempt; artifacts may have expired')
  if (selected.some(artifact => artifact.expired)) throw new Error('Build artifacts have expired; rebuild before creating a release')
  const platforms = selected.map(artifact => /^harness-(mac-arm64|mac-x64|win-x64)-/.exec(artifact.name)[1])
  if (new Set(platforms).size !== platforms.length) throw new Error('Duplicate platform artifacts in the selected build')
  return {
    tag: `desktop-build-${run.id}-${run.run_attempt}`,
    sha: run.head_sha,
    artifactIds: selected.map(artifact => artifact.id).join(','),
    artifacts: selected.map(artifact => artifact.name),
  }
}
