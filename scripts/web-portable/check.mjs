import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 24 || (major === 24 && minor < 9)) throw new Error('Install Node.js 24.9 or later before using this package.')
if (!['darwin', 'linux'].includes(process.platform) || !['x64', 'arm64'].includes(process.arch)) {
  throw new Error('This Web package supports macOS and Linux on x64 or ARM64. Use the Windows desktop installer on Windows.')
}
const hashes = JSON.parse(readFileSync(join(root, 'packages.sha256.json'), 'utf8'))
for (const [name, expected] of Object.entries(hashes)) {
  if (name !== name.split('/').at(-1) || name.includes('\\') || name === '..') throw new Error('Invalid package filename')
  const digest = createHash('sha256').update(readFileSync(join(root, 'packages', name))).digest('hex')
  if (digest !== expected) throw new Error(`Package checksum mismatch: ${name}`)
}
if (process.argv.includes('--installed') && !existsSync(join(root, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'))) {
  throw new Error('Dependencies are not installed. Run ./install.sh first; start.sh never installs or downloads components.')
}

const installedPath = join(root, '.web-installed.json')
if (process.argv.includes('--record-install') || process.argv.includes('--installed')) {
  if (!existsSync(join(root, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'))) throw new Error('CLI dependency is missing')
  const lockHash = createHash('sha256').update(readFileSync(join(root, 'pnpm-lock.yaml'))).digest('hex')
  const expected = { platform: process.platform, arch: process.arch, nodeMajor: major, lockHash }
  if (process.argv.includes('--record-install')) writeFileSync(installedPath, JSON.stringify(expected) + '\n')
  else {
    if (!existsSync(installedPath) || JSON.stringify(JSON.parse(readFileSync(installedPath, 'utf8'))) !== JSON.stringify(expected)) {
      throw new Error('Dependencies must be installed for this runtime and lockfile. Run ./install.sh; startup never installs components.')
    }
  }
}
