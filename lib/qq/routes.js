import { readDshQqSettings } from './settings.js'
import { BridgeError, errorCode, errorMessage, fail } from './util.js'

export const API_BASE = '/dsh-rvc/qq/api'

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])
const MAX_JSON = 65536

function hostName(req) {
  const h = String(req.headers.host || '').trim().toLowerCase()
  if (!h) return ''
  try {
    return new URL(`http://${h}`).hostname
  } catch {
    return ''
  }
}

function guard(req) {
  if (!LOOPBACK.has(hostName(req))) return '设置页只能在本机打开的 DSH 里使用'
  const site = req.headers['sec-fetch-site']
  if (site && site !== 'same-origin' && site !== 'none') return '拒绝来自其它网页的请求'
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (req.headers['x-qqvoice'] !== '1') return '请求缺少标记'
    const origin = req.headers.origin
    if (origin && origin.toLowerCase() !== `http://${String(req.headers.host || '').toLowerCase()}`) return '请求来源不对'
  }
  return ''
}

function send(res, status, obj) {
  if (res.headersSent) {
    res.end()
    return
  }
  const body = Buffer.from(JSON.stringify(obj))
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.length),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(body)
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    if (!/application\/json/i.test(String(req.headers['content-type'] || ''))) {
      req.resume()
      reject(fail('bad_request', '请求格式不对'))
      return
    }
    const chunks = []
    let size = 0
    let done = false
    req.on('data', (chunk) => {
      if (done) return
      size += chunk.length
      if (size > MAX_JSON) {
        done = true
        reject(fail('too_large', '请求内容太大'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (done) return
      done = true
      const text = Buffer.concat(chunks).toString('utf8')
      if (!text) {
        resolve({})
        return
      }
      try {
        const v = JSON.parse(text)
        resolve(v && typeof v === 'object' && !Array.isArray(v) ? v : {})
      } catch {
        reject(fail('bad_request', '请求内容看不懂'))
      }
    })
    req.on('error', (err) => {
      if (done) return
      done = true
      reject(err)
    })
  })
}

export function createRoutes({ settings, napcat, resolver, version, logger }) {
  const state = () => ({ version, settings: settings.publicView(), ready: settings.ready() })

  async function test() {
    resolver.reset()
    const self = await resolver.self()
    const out = { bot: { id: self.selfId, nickname: self.nickname } }
    const owner = settings.get().owner
    if (owner) {
      let nickname = ''
      try {
        const info = await napcat.call('get_stranger_info', { user_id: Number(owner) }, 15000)
        nickname = String(info?.nickname ?? '')
      } catch {}
      let friend = false
      try {
        const l = await resolver.lists(true)
        friend = l.candidates.some((c) => c.scope === 'private' && c.peerId === owner)
        if (!nickname) nickname = l.names.get(`private:${owner}`) || ''
      } catch {}
      out.owner = { id: owner, nickname, friend, isBot: owner === self.selfId }
    }
    return out
  }

  const routes = {
    'GET /state': async () => state(),
    'POST /settings': async (req) => {
      const body = await readJson(req)
      const patch = {}
      for (const k of ['url', 'token', 'owner']) {
        if (typeof body[k] === 'string') patch[k] = body[k]
      }
      if (typeof body.ownerChatOnly === 'boolean') patch.ownerChatOnly = body.ownerChatOnly
      await settings.update(patch)
      return state()
    },
    'POST /import': async (req) => {
      await readJson(req)
      const got = readDshQqSettings()
      const patch = {}
      if (got.url) patch.url = got.url
      if (got.token) patch.token = got.token
      if (got.owners.length > 0) patch.owner = got.owners[0]
      if (Object.keys(patch).length > 0) await settings.update(patch)
      return {
        ...state(),
        imported: { url: Boolean(patch.url), token: Boolean(patch.token), owner: Boolean(patch.owner), owners: got.owners.length },
      }
    },
    'POST /test': async (req) => {
      await readJson(req)
      return { test: await test() }
    },
  }

  return async function handler(req, res) {
    let url
    try {
      url = new URL(req.url || '/', 'http://local')
    } catch {
      send(res, 400, { ok: false, code: 'bad_request', message: '地址不对' })
      return
    }
    const reason = guard(req)
    if (reason) {
      req.resume()
      send(res, 403, { ok: false, code: 'forbidden', message: reason })
      return
    }
    const sub = url.pathname.slice(API_BASE.length) || '/'
    const method = req.method === 'HEAD' ? 'GET' : req.method
    const route = routes[`${method} ${sub}`]
    if (!route) {
      req.resume()
      send(res, 404, { ok: false, code: 'not_found', message: '没有这个接口' })
      return
    }
    try {
      const value = await route(req, res, url)
      if (value !== undefined && !res.headersSent) send(res, 200, { ok: true, ...value })
    } catch (err) {
      if (!(err instanceof BridgeError)) logger?.warn?.(`dsh-rvc QQ语音桥接口 ${method} ${sub} 出错：${errorMessage(err)}`)
      send(res, err instanceof BridgeError ? 400 : 500, { ok: false, code: errorCode(err), message: errorMessage(err) })
    }
  }
}
