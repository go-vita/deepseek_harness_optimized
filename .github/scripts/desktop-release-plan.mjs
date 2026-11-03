/** Select installers from one completed cloud build without mixing retry attempts. */
export function planDesktopRelease(run, workflowId, artifacts, version) {
  if (run.workflow_id !== workflowId) throw new Error('Select a cloud Harness packaging run')
  if (run.status !== 'completed' || run.conclusion !== 'success') throw new Error('The selected build must have completed successfully')
  if (!/^[a-f0-9]{40}$/.test(run.head_sha)) throw new Error('Build source commit is missing')
  if (!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(version ?? '')) throw new Error('Build source version must be a release version')
  const selected = artifacts.filter(artifact => {
    const match = /^harness-(mac-arm64|mac-x64|win-x64|web)-/.exec(artifact.name)
    const mode = match?.[1] === 'web' ? 'prebuilt' : 'unsigned'
    return match !== null && artifact.name.endsWith(`.${run.run_number}.${run.run_attempt}-${mode}`)
  })
  if (selected.length === 0) throw new Error('No installers found for the latest build attempt; artifacts may have expired')
  if (selected.some(artifact => artifact.expired)) throw new Error('Build artifacts have expired; rebuild before creating a release')
  const platforms = selected.map(artifact => /^harness-(mac-arm64|mac-x64|win-x64|web)-/.exec(artifact.name)[1])
  if (new Set(platforms).size !== platforms.length) throw new Error('Duplicate platform artifacts in the selected build')
  const prefix = version.includes('-') ? version + '.' : version + '-test.'
  if (selected.some(artifact => !artifact.name.replace(/^harness-(mac-arm64|mac-x64|win-x64|web)-/, '').startsWith(prefix))) {
    throw new Error('Installer version does not match its source version')
  }
  return {
    version,
    sha: run.head_sha,
    artifactIds: selected.map(artifact => artifact.id).join(','),
    artifacts: selected.map(artifact => artifact.name),
  }
}

/** Reuse one matching draft, including drafts made by the earlier run-based workflow. */
export function selectDesktopRelease(releases, sha, { allowPublishedPrerelease = false } = {}) {
  const tag = `desktop-commit-${sha}`
  const matches = releases.filter(release => release.tag_name === tag
    || ((release.tag_name.startsWith('desktop-build-') || /^v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?-optimized\.[1-9][0-9]*$/.test(release.tag_name)) && release.target_commitish === sha))
  if (matches.length > 1) throw new Error('Multiple releases already exist for this commit; consolidate them before retrying')
  const release = matches[0]
  if (release && (release.target_commitish !== sha
    || (!release.draft && !(allowPublishedPrerelease && release.prerelease && !release.immutable)))) {
    throw new Error('Refusing to modify a published release or a draft for another source commit')
  }
  return release
}

/** Allocate inside the workflow's repository-wide release concurrency group. */
export function nextDesktopReleaseTag(version, releases, refs) {
  if (!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(version ?? '')) throw new Error('Invalid source version')
  const prefix = `v${version}-optimized.`
  let highest = 0n
  for (const name of [...releases.map(release => release.tag_name), ...refs.map(ref => ref.ref.replace(/^refs\/tags\//, ''))]) {
    if (!name.startsWith(prefix)) continue
    const suffix = name.slice(prefix.length)
    if (!/^[1-9][0-9]*$/.test(suffix)) continue
    const number = BigInt(suffix)
    if (number > highest) highest = number
  }
  return prefix + (highest + 1n)
}
