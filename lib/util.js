import { randomBytes } from 'node:crypto'
import { promises as fsp, statSync } from 'node:fs'
import { isAbsolute, normalize } from 'node:path'

export class RvcError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

export function fail(code, message) {
  return new RvcError(code, message)
}

export function errorMessage(err) {
  if (!err) return '未知错误'
  if (err instanceof RvcError) return err.message
  return String(err.message || err)
}

export function errorCode(err) {
  return err instanceof RvcError ? err.code : 'internal_error'
}

export function randomId(bytes = 6) {
  return randomBytes(bytes).toString('hex')
}

export function stamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
}

export function maskSecret(value) {
  const s = String(value || '')
  if (s.length <= 8) return s ? '****' : ''
  return `${s.slice(0, 4)}****${s.slice(-4)}`
}

export function clampNumber(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export function isUnsafePath(p) {
  const s = String(p || '')
  if (!s) return true
  if (/^[\\/]{2}/.test(s)) return true
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return true
  if (!isAbsolute(s)) return true
  return false
}

export function checkLocalFile(p, maxBytes) {
  if (isUnsafePath(p)) throw fail('bad_path', '只能处理本机上的文件，请给出完整的本地路径（比如 D:\\语音\\a.mp3）')
  const full = normalize(String(p))
  let st
  try {
    st = statSync(full)
  } catch {
    throw fail('not_found', `找不到这个文件：${full}`)
  }
  if (!st.isFile()) throw fail('not_file', `这不是一个文件：${full}`)
  if (st.size <= 0) throw fail('empty_file', `文件是空的：${full}`)
  if (maxBytes && st.size > maxBytes) {
    throw fail('too_large', `文件太大（${Math.round(st.size / 1048576)} MB），最多 ${Math.round(maxBytes / 1048576)} MB`)
  }
  return { path: full, size: st.size }
}

export async function writeJsonAtomic(file, value) {
  const tmp = `${file}.${randomId(4)}.tmp`
  await fsp.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
  try {
    await fsp.rename(tmp, file)
  } catch (err) {
    await fsp.rm(tmp, { force: true }).catch(() => {})
    throw err
  }
}

export async function removeQuietly(p) {
  if (!p) return
  await fsp.rm(p, { force: true, recursive: true }).catch(() => {})
}

export class SerialQueue {
  constructor(maxPending) {
    this.maxPending = maxPending
    this.pending = 0
    this.tail = Promise.resolve()
  }

  get size() {
    return this.pending
  }

  run(task) {
    if (this.pending >= this.maxPending) {
      return Promise.reject(fail('busy', `前面已经有 ${this.pending} 段在排队，请稍后再试`))
    }
    this.pending += 1
    const job = this.tail.then(() => task())
    this.tail = job.catch(() => {}).finally(() => {
      this.pending -= 1
    })
    return job
  }
}
