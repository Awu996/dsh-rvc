import { randomBytes } from 'node:crypto'
import { promises as fsp, statSync } from 'node:fs'
import { extname, isAbsolute, normalize } from 'node:path'

export class BridgeError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

export function fail(code, message) {
  return new BridgeError(code, message)
}

export function errorMessage(err) {
  if (!err) return '未知错误'
  if (err instanceof BridgeError) return err.message
  return String(err.message || err)
}

export function errorCode(err) {
  return err instanceof BridgeError ? err.code : 'internal_error'
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

export const AUDIO_EXTS = new Set(['.wav', '.mp3', '.silk', '.slk', '.amr', '.ogg', '.opus', '.m4a', '.aac', '.flac'])
export const MAX_SEND_BYTES = 20 * 1048576

export function checkAudioFile(p) {
  const s = String(p || '').trim()
  if (!s || /^[\\/]{2}/.test(s) || /^[a-z][a-z0-9+.-]*:\/\//i.test(s) || !isAbsolute(s)) {
    throw fail('bad_path', '只能发本机上的音频文件，请给出完整的本地路径，比如处理音频的工具返回的路径')
  }
  const full = normalize(s)
  const ext = extname(full).toLowerCase()
  if (!AUDIO_EXTS.has(ext)) {
    throw fail('bad_type', `不支持这种文件（${ext || '没有后缀'}），能发的格式：wav、mp3、silk、amr、ogg、opus、m4a、aac、flac`)
  }
  let st
  try {
    st = statSync(full)
  } catch {
    throw fail('not_found', `找不到这个文件：${full}`)
  }
  if (!st.isFile()) throw fail('not_file', `这不是一个文件：${full}`)
  if (st.size <= 0) throw fail('empty_file', '文件是空的')
  if (st.size > MAX_SEND_BYTES) {
    throw fail('too_large', `文件太大（${Math.ceil(st.size / 1048576)} MB），语音最多 ${MAX_SEND_BYTES / 1048576} MB`)
  }
  return full
}
