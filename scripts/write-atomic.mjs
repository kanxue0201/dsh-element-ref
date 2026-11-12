#!/usr/bin/env node
/**
 * Write a file atomically.
 *
 * DSH hot-reloads `lib/*.js` the moment the watcher sees a change. A plain write truncates the
 * file first, so the importer can read a half-written bundle, fail with a SyntaxError, and — since
 * a module that never evaluates cannot catch its own error — take the whole web boot down with
 * "1 entry did not activate".
 *
 * Writing to a sibling temp file and renaming it over the target makes the swap atomic on NTFS and
 * POSIX alike: readers see either the old file or the new one, never a torn one.
 *
 * Usage: node scripts/write-atomic.mjs <target> [source]
 *        (with no source, stdin is used)
 */
import { readFile, writeFile, rename, unlink } from 'node:fs/promises'
import { dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const target = process.argv[2]
if (!target) {
  console.error('usage: node scripts/write-atomic.mjs <target> [source]')
  process.exit(2)
}

const body = process.argv[3]
  ? await readFile(process.argv[3])
  : await new Promise((resolve, reject) => {
    const chunks = []
    process.stdin.on('data', (chunk) => chunks.push(chunk))
    process.stdin.on('end', () => resolve(Buffer.concat(chunks)))
    process.stdin.on('error', reject)
  })

const temp = join(dirname(target), `.${basename(target)}.${process.pid}.tmp`)
await writeFile(temp, body)
try {
  await rename(temp, target)
} catch (error) {
  await unlink(temp).catch(() => {})
  throw error
}
console.log(`wrote ${target} atomically (${body.length} bytes)`)
