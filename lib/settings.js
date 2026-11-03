import { accessSync, constants, existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs'
import { normalize } from 'node:path'
import { dataDir, ensureDir, settingsFile } from './paths.js'
import { parseConnection } from './rongyu.js'
import { clampNumber, fail, isUnsafePath, maskSecret, stamp, writeJsonAtomic } from './util.js'

export const SETTINGS_VERSION = 1

function defaults() {
  return {
    version: SETTINGS_VERSION,
    rvc: { enabled: false, connection: '' },
    output: { keep: false, dir: '', ttlMinutes: 10 },
  }
}

function merge(base, extra) {
  if (!extra || typeof extra !== 'object') return base
  for (const key of Object.keys(base)) {
    if (!(key in extra)) continue
    const a = base[key]
    const b = extra[key]
    if (a && typeof a === 'object' && !Array.isArray(a)) base[key] = merge(a, b)
    else if (typeof a === typeof b) base[key] = b
  }
  return base
}

function checkDir(dir) {
  if (isUnsafePath(dir)) throw fail('bad_path', '保存目录要填本机的完整路径，比如 D:\\RVC变声')
  const full = normalize(dir)
  try {
    mkdirSync(full, { recursive: true })
    accessSync(full, constants.W_OK)
  } catch {
    throw fail('bad_path', `这个目录建不了或者写不进去：${full}`)
  }
  return full
}

export class SettingsStore {
  constructor(logger) {
    this.logger = logger
    this.listeners = new Set()
    this.value = this.load()
  }

  load() {
    const file = settingsFile()
    const value = defaults()
    if (!existsSync(file)) return value
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
      return merge(value, raw)
    } catch (err) {
      try {
        renameSync(file, `${file}.bad-${stamp()}`)
      } catch {}
      this.logger && this.logger.warn && this.logger.warn(`dsh-rvc 设置文件读不了，已改名备份后用默认值：${err.message}`)
      return value
    }
  }

  get() {
    return JSON.parse(JSON.stringify(this.value))
  }

  onChange(fn) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  async update(patch) {
    const next = merge(this.get(), patch || {})
    next.version = SETTINGS_VERSION
    next.rvc.connection = String(next.rvc.connection || '').trim()
    if (next.rvc.connection) {
      const c = parseConnection(next.rvc.connection)
      next.rvc.connection = `http://127.0.0.1:${c.port}?key=${c.key}`
    }
    next.rvc.enabled = Boolean(next.rvc.enabled)
    next.output.keep = Boolean(next.output.keep)
    next.output.dir = String(next.output.dir || '').trim()
    if (next.output.dir) next.output.dir = checkDir(next.output.dir)
    next.output.ttlMinutes = Math.round(clampNumber(next.output.ttlMinutes, 1, 1440, 10))
    ensureDir(dataDir())
    await writeJsonAtomic(settingsFile(), next)
    const prev = this.value
    this.value = next
    for (const fn of this.listeners) {
      try {
        fn(this.get(), prev)
      } catch {}
    }
    return this.get()
  }

  publicView() {
    const v = this.get()
    let rvc = { enabled: v.rvc.enabled, configured: false, port: 0, keyMasked: '' }
    if (v.rvc.connection) {
      try {
        const c = parseConnection(v.rvc.connection)
        rvc = { enabled: v.rvc.enabled, configured: true, port: c.port, keyMasked: maskSecret(c.key) }
      } catch {}
    }
    return { rvc, output: v.output }
  }
}
