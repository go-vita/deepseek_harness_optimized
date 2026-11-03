/** Package a verified local-profile build for consumers who provide Node.js and install dependencies themselves. */
import { createHash } from 'node:crypto'
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import { spawnSync } from 'node:child_process'
import { load, dump } from 'js-yaml'
import * as tar from 'tar'
import { readClientBuildRecord, repositoryClientBuildEnvironment, resolveClientBuildEnvironment } from './client-build-environment.ts'
import { packFamilyMembers } from './release/pack.ts'
import { releaseFamily } from './release/families.ts'
import { pnpmInvocation } from './pnpm-invocation.ts'
import { portableManifest, stagePortablePackages } from './web-portable.ts'
import { validateDesktopBuildVersion } from '../apps/desktop/scripts/desktop-build-version.mjs'

const { values } = parseArgs({ options: { out: { type: 'string', default: 'dist/web-portable' }, 'build-version': { type: 'string' } } })
const root = process.cwd()
const output = resolve(root, values.out)
if (!output.startsWith(root + sep)) throw new Error('Web bundle output must be inside the checkout')
const base = JSON.parse(readFileSync(join(root, 'apps/cli/package.json'), 'utf8')).version as string
const version = validateDesktopBuildVersion(values['build-version'] ?? base, base)
const filename = `deepseek-harness-${version}-web.tar.gz`
mkdirSync(output, { recursive: true })
if (existsSync(join(output, filename))) throw new Error('This Web bundle version already exists; use a new build version')
readClientBuildRecord(root, resolveClientBuildEnvironment(repositoryClientBuildEnvironment(root), 'local'))
const temporary = mkdtempSync(join(output, '.staging-'))
try {
  const dshDir = join(temporary, 'dsh')
  const vendorDir = join(temporary, 'vendor')
  const dsh = await packFamilyMembers(root, releaseFamily('dsh'), dshDir, 4)
  const vendor = await packFamilyMembers(root, releaseFamily('vendor'), vendorDir, 4)
  const directory = `deepseek-harness-${version}-web`
  const bundle = join(temporary, directory)
  mkdirSync(bundle)
  const tarballs = [...dsh.map(file => join(dshDir, file)), ...vendor.map(file => join(vendorDir, file))]
  const identities = await stagePortablePackages(tarballs, bundle)
  const { overrides, ...manifest } = portableManifest(version, identities)
  writeFileSync(join(bundle, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
  const original = load(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')) as Record<string, unknown>
  const allowBuilds = original['allowBuilds'] as Record<string, boolean>
  const patches = original['patchedDependencies'] as Record<string, string>
  for (const path of Object.values(patches)) {
    if (!path.startsWith('patches/') || path.split('/').includes('..')) throw new Error('Invalid dependency patch path')
    mkdirSync(join(bundle, 'patches'), { recursive: true })
    copyFileSync(join(root, path), join(bundle, path))
  }
  writeFileSync(join(bundle, 'pnpm-workspace.yaml'), dump({ ...original, packages: [],
    overrides: { ...original['overrides'] as Record<string, string>, ...overrides },
    allowBuilds: { ...allowBuilds, [`@deepseek-ai/dsh-subprocess-local@${overrides['@deepseek-ai/dsh-subprocess-local']}`]: true },
    peerDependencyRules: original['peerDependencyRules'], patchedDependencies: patches, allowUnusedPatches: true }))
  for (const name of ['install.sh', 'start.sh', 'check.mjs', 'README.md', 'README.zh.md']) {
    copyFileSync(join(root, 'scripts/web-portable', name), join(bundle, name))
  }
  for (const name of ['install.sh', 'start.sh']) chmodSync(join(bundle, name), 0o755)
  cpSync(join(root, 'LICENSE'), join(bundle, 'LICENSE'))
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })
  if (revision.status !== 0) throw new Error('Cannot record build source commit')
  const status = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })
  if (status.status !== 0) throw new Error('Cannot record build source status')
  writeFileSync(join(bundle, 'build.json'), JSON.stringify({ version, sourceCommit: revision.stdout.trim(),
    sourceDirty: status.stdout.trim().length > 0, kind: 'prebuilt-web',
    node: '>=24.9.0', pnpm: '11.28.5', runtimeIncluded: false, dependenciesIncluded: false }, null, 2) + '\n')
  const invocation = pnpmInvocation(['install', '--lockfile-only', '--ignore-scripts'])
  const locked = spawnSync(invocation.command, invocation.args, { cwd: bundle, stdio: 'inherit' })
  if (locked.status !== 0) throw new Error('Portable dependency lock generation failed')
  rmSync(join(bundle, 'node_modules'), { recursive: true, force: true })
  await tar.c({ gzip: true, cwd: temporary, file: join(output, filename) }, [directory])
  const digest = createHash('sha256').update(readFileSync(join(output, filename))).digest('hex')
  writeFileSync(join(output, filename + '.sha256'), `${digest}  ${filename}\n`)
  console.log(`Web bundle: ${join(output, filename)}`)
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
