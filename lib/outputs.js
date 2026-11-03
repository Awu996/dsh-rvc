import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { dataDir, ensureDir, outputDir } from './paths.js'
import { randomId, removeQuietly, stamp } from './util.js'

const SWEEP_MS = 5 * 60000

export class OutputStore {
  constructor(settings, logger) {
    this.settings = settings
    this.logger = logger
    this.items = new Map()
    this.timer = null
  }

  start() {
    this.sweep().catch(() => {})
    this.timer = setInterval(() => this.sweep().catch(() => {}), SWEEP_MS)
    if (this.timer.unref) this.timer.unref()
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    for (const item of this.items.values()) if (item.timeout) clearTimeout(item.timeout)
  }

  keepDir() {
    const cfg = this.settings.get().output
    return ensureDir(cfg.dir || join(dataDir(), 'kept'))
  }

  async save(buffer) {
    const cfg = this.settings.get().output
    const id = randomId(8)
    const keep = Boolean(cfg.keep)
    const dir = keep ? this.keepDir() : outputDir()
    const path = join(dir, `${stamp()}-voice-${id}.wav`)
    await fsp.writeFile(path, buffer)
    const ttlMs = cfg.ttlMinutes * 60000
    const item = { id, path, kept: keep, createdAt: Date.now(), expiresAt: keep ? 0 : Date.now() + ttlMs, timeout: null }
    if (!keep) {
      item.timeout = setTimeout(() => this.release(id), ttlMs)
      if (item.timeout.unref) item.timeout.unref()
    }
    this.items.set(id, item)
    if (this.items.size > 500) {
      for (const [key, old] of this.items) {
        if (this.items.size <= 500) break
        if (old.kept) this.items.delete(key)
      }
    }
    return { id, path, kept: keep, expiresAt: item.expiresAt }
  }

  async release(idOrPath) {
    for (const [id, item] of this.items) {
      if (id === idOrPath || item.path === idOrPath) {
        if (item.timeout) clearTimeout(item.timeout)
        this.items.delete(id)
        if (!item.kept) await removeQuietly(item.path)
        return true
      }
    }
    return false
  }

  async sweep() {
    const ttlMs = this.settings.get().output.ttlMinutes * 60000
    const dir = outputDir()
    const names = await fsp.readdir(dir).catch(() => [])
    const now = Date.now()
    for (const name of names) {
      if (!name.endsWith('.wav')) continue
      const p = join(dir, name)
      const st = await fsp.stat(p).catch(() => null)
      if (st && now - st.mtimeMs > ttlMs + 60000) await removeQuietly(p)
    }
    const work = join(dataDir(), 'work')
    const temps = await fsp.readdir(work).catch(() => [])
    for (const name of temps) {
      const p = join(work, name)
      const st = await fsp.stat(p).catch(() => null)
      if (st && now - st.mtimeMs > 30 * 60000) await removeQuietly(p)
    }
  }
}
