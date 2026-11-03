import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dshQqDir } from './paths.js'

const KEY_RE = /^qq:(\d+):(private|group):(\d+)(?:@iso)?(?:#(\d+))?$/
const MAX_GEN = 1000

export function deriveSessionId(key) {
  const hex = createHash('sha256').update(String(key)).digest('hex')
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join('-')
}

export function parseKey(key) {
  const m = KEY_RE.exec(String(key ?? ''))
  return m ? { selfId: m[1], scope: m[2], peerId: m[3] } : null
}

function plainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
}

export function readLedger(file = join(dshQqDir(), 'session-state.json')) {
  try {
    if (!existsSync(file)) return { gens: {}, sessions: {} }
    const raw = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
    const obj = plainObject(raw)
    return { gens: plainObject(obj.gens), sessions: plainObject(obj.sessions) }
  } catch {
    return { gens: {}, sessions: {} }
  }
}

function genOf(ledger, baseKey) {
  const n = Number(ledger.gens[baseKey])
  return Number.isFinite(n) && n > 0 ? Math.min(MAX_GEN, Math.floor(n)) : 0
}

function single(hits) {
  return hits.size === 1 ? [...hits.values()][0] : null
}

export function matchFromLedger(ledger, sessionId, selfId) {
  const hits = new Map()
  for (const [key, value] of Object.entries(ledger.sessions)) {
    if (String(value) !== sessionId) continue
    const k = parseKey(key)
    if (!k || k.selfId !== selfId) continue
    hits.set(`${k.scope}:${k.peerId}`, { scope: k.scope, peerId: k.peerId })
  }
  return single(hits)
}

export function matchFromCandidates(ledger, sessionId, selfId, candidates) {
  const hits = new Map()
  for (const c of candidates) {
    const base = `qq:${selfId}:${c.scope}:${c.peerId}`
    for (const baseKey of [`${base}@iso`, base]) {
      const top = genOf(ledger, baseKey)
      for (let gen = 0; gen <= top; gen += 1) {
        const key = gen > 0 ? `${baseKey}#${gen}` : baseKey
        const stored = ledger.sessions[key]
        const id = stored ? String(stored) : deriveSessionId(key)
        if (id === sessionId) hits.set(`${c.scope}:${c.peerId}`, { scope: c.scope, peerId: c.peerId })
      }
    }
  }
  return single(hits)
}
