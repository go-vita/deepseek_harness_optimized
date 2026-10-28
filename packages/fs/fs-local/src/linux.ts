/** Linux atomic no-replace publication for filesystems without hard links. */
import { getSystemErrorName } from 'node:util'

type RenameAt2 = (oldDir: number, oldPath: string, newDir: number, newPath: string, flags: number) => number
let renameAt2: RenameAt2 | undefined

/** Atomically move a staged file without replacing any existing destination. */
export async function renameNoReplaceLinux(source: string, destination: string): Promise<void> {
  const koffi = (await import('koffi')).default
  if (renameAt2 === undefined) {
    const libc = koffi.load('libc.so.6')
    renameAt2 = libc.func('int renameat2(int olddirfd, const char *oldpath, int newdirfd, const char *newpath, unsigned int flags)') as RenameAt2
  }
  if (renameAt2(-100, source, -100, destination, 1) === 0) return
  const errno = koffi.errno()
  let code = 'EIO'
  try { code = getSystemErrorName(-errno) } catch { /* unknown errno */ }
  throw Object.assign(new Error(`renameat2 ${code}: ${destination}`), { code, errno, syscall: 'renameat2', path: destination })
}
