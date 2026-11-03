const START = '<!-- harness-generated:start -->'
const END = '<!-- harness-generated:end -->'

const changes = [
  ['101e11f8aa', 'Relay sessions and request transport', [
    'Add session identifiers, branch isolation, stable request IDs, and separate request purposes for compatible relays.',
    'Add configuration for session reuse, acknowledged incremental requests, and gzip compression of large requests. These features require relay support and the corresponding provider options.',
    'Improve relay context-limit error detection and context accounting for providers that report cumulative usage.',
  ]],
  ['9f73917ae5', 'Model selection, session controls, and context handling', [
    'Update the reasoning-effort configuration and parameter-mapping UI for custom models.',
    'Add a session-scoped Fast control, a lightning indicator beside the model, and propagation of the selected service tier.',
    'Add a footer display for provider weekly quota and configuration for the quota endpoint.',
    'Improve compaction recovery after context overflow and append-only handling of system instruction updates.',
    'Fix file creation on Linux VirtualBox shared folders that do not support hard links. Windows and macOS file-permission behavior is unchanged.',
  ]],
  ['58079f7af3', 'Context overflow recovery', ['Compact a bounded portion of history after model context overflow to reduce the risk of another oversized recovery request.']],
  ['aad2ddf17d', 'Compaction request limits', ['Bound the input sent to the compaction model during overflow recovery.']],
  ['30a28a99d3', 'Incremental Chat Completions requests', [
    'Support acknowledged incremental Chat Completions requests, sending only the suffix after a confirmed checkpoint and retaining stable logical requests across retries.',
    'Do not advance checkpoints on interrupted or failed streams. Preserve tool-call history and cover service-tier propagation and Responses compatibility in tests.',
  ]],
  ['c933b6acac', 'Weekly quota visibility', ['Hide the footer quota display when the relay denies quota access for the current API key. Preserve existing handling of other endpoint failures.']],
  ['a44de55ee5', 'Tests and type checking', ['Correct readonly configuration types, assistant message source types, and fetch mock signatures in relay tests.']],
  ['146734986c', 'Cloud desktop packaging', [
    'Add a separate GitHub-hosted packaging workflow for Apple Silicon Macs, Intel Macs, and Windows x64. Preserve local and self-hosted packaging workflows.',
    'Add an explicit --local --unsigned test-build mode that does not require the upstream update-service configuration. Test installers disable automatic and mandatory updates.',
  ]],
  ['1d59f2c9e5', 'Release drafts from existing builds', ['Add a manually triggered workflow that transfers installers from a successful build to a release draft within GitHub, without rebuilding or downloading and uploading through a local computer.']],
  ['849befe1e7', 'Automatic Anthropic relay transport', [
    'Discover compatible Anthropic relay capabilities using x-api-key authentication and automatically enable the required session reuse, incremental requests, and gzip transport.',
    'Support full Anthropic requests and acknowledged incremental requests, preserving the same logical request across retries and normalizing moving SDK cache hints for stable history matching.',
    'Advance checkpoints only after a successful message_stop event; interrupted and failed streams do not confirm reusable history.',
    'Requires an updated compatible relay backend. Ordinary Anthropic providers retain their existing behavior.',
  ]],
]

/** Describe only changes present in the build's actual commit range. */
export function desktopReleaseNotes({ repository, sha, buildUrl, commits, previousBody = '' }) {
  const included = changes.filter(([prefix]) => commits.some(commit => commit.sha.startsWith(prefix)))
  const sections = included.map(([, title, items]) => `### ${title}\n\n${items.map(item => `- ${item}`).join('\n')}`)
  const list = commits.map(commit => {
    const subject = commit.commit.message.split('\n')[0].replace(/[<>]/g, '')
    return `- [${commit.sha.slice(0, 10)}](https://github.com/${repository}/commit/${commit.sha}) ${subject}`
  }).join('\n')
  const runPrefix = `https://github.com/${repository}/actions/runs/`
  const previousUrls = (previousBody.match(/https:\/\/github\.com\/[^\s)]+\/actions\/runs\/[0-9]+/g) ?? [])
    .filter(url => url.startsWith(runPrefix))
  const buildLinks = [...new Set([...previousUrls, buildUrl])].map(url => `- [Original packaging run](${url})`).join('\n')
  return `${START}\n## Build information\n\n${buildLinks}\n- Source commit:\`${sha}\`\n- [Full diff against the upstream baseline](https://github.com/${repository}/compare/22ddee3792...${sha})\n\n## Changes\n\nThese notes describe the Harness changes included in this build relative to the upstream baseline. Relay-server changes are outside this release.\n\n${sections.join('\n\n')}\n\n## Included commits\n\n${list || 'No changes from the upstream baseline.'}\n\n## Installation and limitations\n\n- On Windows, use the win-x64 .exe desktop installer. On macOS or Linux, use the -web.tar.gz prebuilt Web package when provided: extract it, install Node.js 24.9+ and pnpm 11.28.5, run ./install.sh, then ./start.sh. No frontend/backend rebuild is needed. Older builds may also provide Mac .dmg installers. The automatically generated Source code archives are not prebuilt packages.\n- Windows desktop installers are unsigned test builds. The prebuilt Web package does not include a runtime or native binaries: users install the environment and dependencies themselves. This does not guarantee that macOS will never display security prompts for third-party components. Older Mac desktop installers are not notarized.\n- Automatic and mandatory updates are disabled in these test packages. Install future versions manually.\n- Session reuse, incremental requests, and weekly quota visibility depend on provider configuration, protocol support, and API key permissions.\n- A successful build does not establish that all features have been tested on every platform. Verify installation, startup, and key functionality on the target system before publishing.\n## Web installation: macOS and Linux\n\n1. Download the asset whose name ends in **-web.tar.gz**. It contains the prebuilt frontend/backend and dependency manifests. Do not download GitHub’s Source code ZIP or TAR archive for this installation method.\n2. Install **Node.js 24.9 or later** and **pnpm 11.28.5** yourself. Verify them with \`node --version\` and \`pnpm --version\`. A browser, network access for dependency installation, and a writable installation directory are required.\n3. Extract the package, then open Terminal in the extracted directory. Replace BUILD_VERSION below with the version in the downloaded asset filename.\n\n\`\`\`sh\ntar -xzf deepseek-harness-BUILD_VERSION-web.tar.gz\ncd deepseek-harness-BUILD_VERSION-web\n./install.sh\n./start.sh\n\`\`\`\n\n4. The explicit install step downloads the locked dependencies and verifies package checksums. Some native dependencies may require Python and a C/C++ toolchain (Xcode Command Line Tools on macOS, or the appropriate compiler/build packages on Linux). No frontend or backend source build is required. If dependency installation fails, resolve the reported environment issue and rerun \`./install.sh\`; do not bypass installation errors.\n5. Keep the terminal running. Harness normally opens your browser and prints an authenticated local URL. If it does not open, copy that URL into your browser. Do not share this private URL. Press **Ctrl+C** in the terminal to stop the service.\n6. To choose a port or suppress browser launch, run \`./start.sh --port 8080 --no-open\`. Configure providers and API keys in **Settings → Models**. The startup script never installs dependencies or downloads Node.js.\n7. Sessions and provider settings remain in \`~/.dsh\`, or your existing \`DSH_HOME\`, outside the extracted package. The Web profile is separate from the desktop profile; existing desktop settings are not automatically migrated. To update, stop the old process, extract the new package, run its \`./install.sh\`, then its \`./start.sh\`. Keep the Harness home and do not copy \`node_modules\` across releases or platforms.\n8. On macOS, use a runtime appropriate for your Mac architecture. This JavaScript distribution does not include a custom native Mac app or publisher signature; system prompts for user-installed runtimes or dependencies may still occur. Linux servers without a graphical desktop can keep the service running with \`--no-open\`; remote exposure needs separate network and access-control configuration.\n\n## Windows installation\n\nDownload the **win-x64 .exe** asset, run the installer, and launch Harness. The existing Windows desktop installation method is unchanged. These test installers are unsigned, so Windows may display a security prompt.\n${END}`
}

/** Refresh generated notes while preserving text manually added outside the managed block. */
export function mergeDesktopReleaseNotes(previous, generated) {
  const start = previous.indexOf(START)
  const end = previous.indexOf(END)
  if (start !== -1 && end >= start) return previous.slice(0, start) + generated + previous.slice(end + END.length)
  if (previous.startsWith('Unsigned desktop test packages.')) return generated
  return previous.trim() ? `${previous.trim()}\n\n${generated}` : generated
}
