import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { voiceDir } from './paths.js'
import { removeQuietly } from './util.js'

export const VOICE_TTL_MINUTES = 30
const SWEEP_MS = 5 * 60000

export class VoiceFiles {
  constructor(logger) {
    this.logger = logger
    this.timer = null
  }

  start() {
    this.sweep().catch(() => {})
    this.timer = setInterval(() => this.sweep().catch(() => {}), SWEEP_MS)
    this.timer.unref?.()
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async sweep(now = Date.now()) {
    const dir = voiceDir()
    const names = await fsp.readdir(dir).catch(() => [])
    const ttl = VOICE_TTL_MINUTES * 60000
    for (const name of names) {
      if (!name.startsWith('qq-voice-')) continue
      const p = join(dir, name)
      const st = await fsp.stat(p).catch(() => null)
      if (st && st.isFile() && now - st.mtimeMs > ttl) await removeQuietly(p)
    }
  }
}
