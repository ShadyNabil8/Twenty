import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Read a JSON file, returning null on any error (missing, corrupt, …). */
export function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

/** Atomic JSON write: write to a temp file in the same dir, then rename. */
export function writeJson(path: string, value: unknown): void {
  try {
    mkdirSync(dirname(path), { recursive: true })
    const tmp = join(dirname(path), `.${Date.now()}.tmp`)
    writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
    renameSync(tmp, path)
  } catch (err) {
    console.error(`[persist] failed to write ${path}:`, err)
  }
}
