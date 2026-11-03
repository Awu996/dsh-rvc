import { matchFromCandidates, matchFromLedger, readLedger } from './session-match.js'
import { fail } from './util.js'

const SELF_TTL_MS = 60000
const LIST_TTL_MS = 120000
const EXPLICIT_RE = /^(group|private|群聊|群|好友|私聊)\s*[:：]?\s*(\d{5,12})$/i

export function chatLabel(scope, name) {
  if (scope === 'group') return name ? `群聊（${name}）` : '当前群聊'
  return name ? `私聊（${name}）` : '当前私聊'
}

export function normName(s) {
  return String(s ?? '').normalize('NFKC').replace(/\s+/g, '').toLowerCase()
}

export function matchTargets(entries, query) {
  const text = String(query ?? '').trim().replace(/^@+/, '').trim()
  if (!text) return { exact: [], partial: [] }
  const ex = EXPLICIT_RE.exec(text)
  if (ex) {
    const p = ex[1].toLowerCase()
    const scope = p === 'group' || p === '群聊' || p === '群' ? 'group' : 'private'
    return { exact: entries.filter((e) => e.scope === scope && e.peerId === ex[2]), partial: [] }
  }
  if (/^\d{5,12}$/.test(text)) return { exact: entries.filter((e) => e.peerId === text), partial: [] }
  const q = normName(text)
  if (!q) return { exact: [], partial: [] }
  const exact = entries.filter((e) => e.keys.some((k) => k === q))
  if (exact.length > 0) return { exact, partial: [] }
  return { exact: [], partial: entries.filter((e) => e.keys.some((k) => k.includes(q))) }
}

export class ChatResolver {
  constructor(napcat, settings) {
    this.napcat = napcat
    this.settings = settings
    this.selfCache = null
    this.listCache = null
    this.offSettings = settings.onChange(() => this.reset())
  }

  reset() {
    this.selfCache = null
    this.listCache = null
  }

  dispose() {
    try {
      this.offSettings?.()
    } catch {}
  }

  async self() {
    if (this.selfCache && Date.now() - this.selfCache.at < SELF_TTL_MS) return this.selfCache.value
    const info = await this.napcat.call('get_login_info', {}, 15000)
    const selfId = String(info?.user_id ?? '').trim()
    if (!/^\d+$/.test(selfId)) throw fail('napcat_failed', 'NapCat 没有返回机器人的 QQ 号，可能 QQ 还没登录')
    const value = { selfId, nickname: String(info?.nickname ?? '') }
    this.selfCache = { at: Date.now(), value }
    return value
  }

  async lists(force) {
    if (!force && this.listCache && Date.now() - this.listCache.at < LIST_TTL_MS) return this.listCache.value
    const friends = await this.napcat.call('get_friend_list', {}, 20000)
    const groups = await this.napcat.call('get_group_list', {}, 20000)
    const candidates = []
    const names = new Map()
    const entries = []
    const keysOf = (...list) => [...new Set(list.map(normName).filter(Boolean))]
    for (const f of Array.isArray(friends) ? friends : []) {
      const id = String(f?.user_id ?? '').trim()
      if (!/^\d+$/.test(id)) continue
      const name = String(f?.remark || f?.nickname || '')
      candidates.push({ scope: 'private', peerId: id })
      names.set(`private:${id}`, name)
      entries.push({ scope: 'private', peerId: id, name, keys: keysOf(f?.remark, f?.nickname) })
    }
    for (const g of Array.isArray(groups) ? groups : []) {
      const id = String(g?.group_id ?? '').trim()
      if (!/^\d+$/.test(id)) continue
      const name = String(g?.group_name || '')
      candidates.push({ scope: 'group', peerId: id })
      names.set(`group:${id}`, name)
      entries.push({ scope: 'group', peerId: id, name, keys: keysOf(g?.group_name) })
    }
    const value = { candidates, names, entries }
    this.listCache = { at: Date.now(), value }
    return value
  }

  async findTargets(query) {
    let found = matchTargets((await this.lists(false)).entries, query)
    if (found.exact.length === 0) found = matchTargets((await this.lists(true)).entries, query)
    const shape = (e) => ({ scope: e.scope, peerId: e.peerId, name: e.name, label: chatLabel(e.scope, e.name) })
    return { exact: found.exact.map(shape), partial: found.partial.map(shape) }
  }

  async resolve(sessionId) {
    const sid = String(sessionId ?? '').trim()
    if (!sid) throw fail('no_session', '拿不到当前会话的编号，确认不了是哪个 QQ 聊天，没有执行')
    const { selfId } = await this.self()
    const ledger = readLedger()
    const owner = this.settings.get().owner
    let hit = matchFromLedger(ledger, sid, selfId)
    let names = null
    if (!hit) {
      for (const force of [false, true]) {
        const l = await this.lists(force)
        names = l.names
        const extra = owner ? [{ scope: 'private', peerId: owner }] : []
        hit = matchFromCandidates(ledger, sid, selfId, [...extra, ...l.candidates])
        if (hit) break
      }
    }
    if (!hit) {
      throw fail('unknown_chat', '确认不了当前是哪个 QQ 聊天：可能现在不是在 QQ 里聊，或者 QQ 插件换过会话。为了不发错，没有执行')
    }
    if (!names) {
      try {
        names = (await this.lists(false)).names
      } catch {
        names = new Map()
      }
    }
    return { scope: hit.scope, peerId: hit.peerId, selfId, label: chatLabel(hit.scope, names.get(`${hit.scope}:${hit.peerId}`) || '') }
  }
}
