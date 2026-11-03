import { existsSync, readFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { dataDir, dshQqDir, ensureDir, settingsFile } from './paths.js'
import { fail, maskSecret, stamp, writeJsonAtomic } from './util.js'

export const DEFAULT_URL = 'ws://127.0.0.1:3001'
const SETTINGS_VERSION = 1
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])
const QQ_RE = /^[1-9]\d{4,11}$/

function defaults() {
  return { version: SETTINGS_VERSION, url: DEFAULT_URL, token: '', owner: '', ownerChatOnly: true }
}

export function normalizeUrl(text) {
  let s = String(text || '').trim().replace(/：/g, ':')
  if (!s) return DEFAULT_URL
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `ws://${s}`
  let u
  try {
    u = new URL(s)
  } catch {
    throw fail('bad_url', 'NapCat 地址不对，应该像 ws://127.0.0.1:3001')
  }
  if (u.protocol !== 'ws:' && u.protocol !== 'wss:') {
    throw fail('bad_url', 'NapCat 地址要以 ws:// 开头，比如 ws://127.0.0.1:3001')
  }
  if (!LOOPBACK.has(u.hostname.toLowerCase())) {
    throw fail('bad_url', '只能连这台电脑上的 NapCat（127.0.0.1 或 localhost）：发语音用的是本机文件，NapCat 必须和 DSH 在同一台电脑上')
  }
  return `${u.protocol}//${u.host}`
}

export function normalizeOwner(text) {
  const s = String(text ?? '').trim()
  if (!s) return ''
  if (!QQ_RE.test(s)) throw fail('bad_owner', '主人 QQ 号要填 5 到 12 位数字')
  return s
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
      if (raw && typeof raw === 'object') {
        if (typeof raw.url === 'string') {
          try {
            value.url = normalizeUrl(raw.url)
          } catch {}
        }
        if (typeof raw.token === 'string') value.token = raw.token.trim().slice(0, 512)
        if (typeof raw.owner === 'string') {
          try {
            value.owner = normalizeOwner(raw.owner)
          } catch {}
        }
        if (typeof raw.ownerChatOnly === 'boolean') value.ownerChatOnly = raw.ownerChatOnly
      }
      return value
    } catch (err) {
      try {
        renameSync(file, `${file}.bad-${stamp()}`)
      } catch {}
      this.logger?.warn?.(`dsh-rvc QQ语音桥设置文件读不了，已改名备份后用默认值：${err.message}`)
      return value
    }
  }

  get() {
    return { ...this.value }
  }

  ready() {
    return Boolean(this.value.owner)
  }

  onChange(fn) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  async update(patch) {
    const p = patch && typeof patch === 'object' ? patch : {}
    const next = this.get()
    if (p.url !== undefined) next.url = normalizeUrl(p.url)
    if (p.token !== undefined) next.token = String(p.token ?? '').trim().slice(0, 512)
    if (p.owner !== undefined) next.owner = normalizeOwner(p.owner)
    if (typeof p.ownerChatOnly === 'boolean') next.ownerChatOnly = p.ownerChatOnly
    next.version = SETTINGS_VERSION
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
    const v = this.value
    return {
      url: v.url,
      hasToken: Boolean(v.token),
      tokenMasked: maskSecret(v.token),
      owner: v.owner,
      ownerChatOnly: v.ownerChatOnly,
    }
  }
}

export function readDshQqSettings() {
  const file = join(dshQqDir(), 'settings.json')
  if (!existsSync(file)) throw fail('no_dsh_qq', '没有找到 dsh-qq 的设置文件，请手动填写')
  let raw
  try {
    raw = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
  } catch {
    throw fail('bad_dsh_qq', 'dsh-qq 的设置文件读不了，请手动填写')
  }
  const owners = Array.isArray(raw?.ownerIds)
    ? [...new Set(raw.ownerIds.map((x) => String(x).trim()).filter((x) => QQ_RE.test(x)))]
    : []
  return {
    url: typeof raw?.wsUrl === 'string' ? raw.wsUrl.trim() : '',
    token: typeof raw?.accessToken === 'string' ? raw.accessToken.trim() : '',
    owners,
  }
}
