import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as tar from 'tar'
import { expect, it } from 'vitest'
import { portableManifest, stagePortablePackages, verifyPortableTarball } from './web-portable.ts'

it('pins fork packages to bundled tarballs instead of registry releases', () => {
  const manifest = portableManifest('1.0.0', [
    { name: '@deepseek-ai/dsh', filename: 'cli.tgz' },
    { name: '@deepseek-ai/dsh-web-frontend', filename: 'web.tgz' },
    { name: '@deepseek-ai/dsh-llm-pi-ai', filename: 'adapter.tgz' },
  ])
  expect(manifest.dependencies['@deepseek-ai/dsh']).toBe('file:packages/cli.tgz')
  expect(manifest.overrides['@deepseek-ai/dsh-llm-pi-ai']).toBe('file:packages/adapter.tgz')
  expect(() => portableManifest('1.0.0', [])).toThrow('Both the CLI')
  expect(() => portableManifest('1.0.0', [
    { name: 'duplicate', filename: 'a.tgz' }, { name: 'duplicate', filename: 'b.tgz' },
  ])).toThrow('Duplicate')
})
it('stages compiled JavaScript packages and records package hashes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'web-portable-'))
  try {
    mkdirSync(join(root, 'package'))
    writeFileSync(join(root, 'package/package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0' }))
    writeFileSync(join(root, 'package/index.js'), 'export const fixture = true')
    const archive = join(root, 'fixture.tgz')
    await tar.c({ cwd: root, gzip: true, file: archive }, ['package'])
    const result = await stagePortablePackages([archive], join(root, 'out'))
    expect(result).toEqual([{ name: 'fixture', filename: 'fixture.tgz' }])
    const hashes = JSON.parse(readFileSync(join(root, 'out/packages.sha256.json'), 'utf8'))
    expect(hashes['fixture.tgz']).toMatch(/^[a-f0-9]{64}$/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
it.each([
  ['addon.node', Buffer.from('not needed')],
  ['program', Buffer.from('7f454c4600000000', 'hex')],
  ['program', Buffer.from('cffaedfe00000000', 'hex')],
  ['program', Buffer.from('4d5a900000000000', 'hex')],
])('rejects native payload %s', async (name, content) => {
  const root = mkdtempSync(join(tmpdir(), 'web-portable-native-'))
  try {
    mkdirSync(join(root, 'package'))
    writeFileSync(join(root, 'package', name), content)
    const archive = join(root, 'fixture.tgz')
    await tar.c({ cwd: root, gzip: true, file: archive }, ['package'])
    await expect(verifyPortableTarball(archive)).rejects.toThrow('must not contain native binaries')
  } finally { rmSync(root, { recursive: true, force: true }) }
})
