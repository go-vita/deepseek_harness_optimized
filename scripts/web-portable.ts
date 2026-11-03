/** Assemble prebuilt JavaScript packages without a runtime or platform binaries. */
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import * as tar from 'tar'
import { packedManifest } from './release/tarball.ts'

/** Refuse native payloads and unsafe archive paths before shipping JavaScript packages. */
export async function verifyPortableTarball(file: string): Promise<void> {
  const failures: string[] = []
  await tar.t({ file, onReadEntry: (entry) => {
    const name = entry.path
    if (!name.startsWith('package/') || name.split('/').includes('..') || /\.(?:node|dylib|dll|exe|so(?:\.\d+)*)$/iu.test(name)) {
      failures.push(name)
    }
    if (entry.type === 'SymbolicLink' || entry.type === 'Link') failures.push(name)
    let header = Buffer.alloc(0)
    entry.on('data', (chunk: Buffer) => {
      if (header.length < 4) header = Buffer.concat([header, chunk.subarray(0, 4 - header.length)])
    })
    entry.on('end', () => {
      const magic = header.toString('hex')
      if (['7f454c46', 'feedface', 'cefaedfe', 'feedfacf', 'cffaedfe', 'cafebabe', 'bebafeca', 'cafebabf', 'bfbafeca'].includes(magic)
        || magic.startsWith('4d5a')) failures.push(name)
    })
  } })
  if (failures.length > 0) throw new Error(`Web portable packages must not contain native binaries or links: ${basename(file)}: ${failures.join(', ')}`)
}

/** Build the consumer manifest with local overrides so fork packages never resolve to upstream code. */
export function portableManifest(version: string, identities: readonly { name: string; filename: string }[]) {
  const overrides = Object.fromEntries(identities.map(item => [item.name, `file:packages/${item.filename}`]))
  if (new Set(identities.map(item => item.name)).size !== identities.length) throw new Error('Duplicate portable package names')
  const cli = overrides['@deepseek-ai/dsh']
  const web = overrides['@deepseek-ai/dsh-web-frontend']
  if (!cli || !web) throw new Error('Both the CLI and built Web frontend must be included')
  return { name: 'deepseek-harness-web-portable', version, private: true, type: 'module', packageManager: 'pnpm@11.28.5',
    engines: { node: '>=24.9.0' }, dependencies: { '@deepseek-ai/dsh': cli, '@deepseek-ai/dsh-web-frontend': web }, overrides }
}

/** Copy verified npm tarballs and record their names and hashes for the install step. */
export async function stagePortablePackages(files: readonly string[], destination: string) {
  mkdirSync(join(destination, 'packages'), { recursive: true })
  const identities: { name: string; filename: string }[] = []
  const hashes: Record<string, string> = {}
  for (const file of files) {
    await verifyPortableTarball(file)
    const manifest = packedManifest(file)
    if (typeof manifest['name'] !== 'string' || typeof manifest['version'] !== 'string') throw new Error('Invalid packed identity')
    const filename = basename(file)
    if (Object.hasOwn(hashes, filename)) throw new Error(`Duplicate tarball filename: ${filename}`)
    copyFileSync(file, join(destination, 'packages', filename))
    identities.push({ name: manifest['name'], filename })
    hashes[filename] = createHash('sha256').update(readFileSync(file)).digest('hex')
  }
  writeFileSync(join(destination, 'packages.sha256.json'), JSON.stringify(hashes, null, 2) + '\n')
  return identities
}
