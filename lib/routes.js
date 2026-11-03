import { existsSync } from 'node:fs'
import { bundledFfmpeg } from './paths.js'
import { errorCode, errorMessage, fail, RvcError } from './util.js'

export const API_BASE = '/dsh-rvc/api'

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])
const MAX_JSON = 1048576

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
    if (req.headers['x-dsh-rvc'] !== '1') return '请求缺少标记'
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

function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] || 0)
    if (declared > max) {
      req.resume()
      reject(fail('too_large', `请求太大，最多 ${Math.round(max / 1048576)} MB`))
      return
    }
    const chunks = []
    let size = 0
    let done = false
    req.on('data', (chunk) => {
      if (done) return
      size += chunk.length
      if (size > max) {
        done = true
        chunks.length = 0
        reject(fail('too_large', `请求太大，最多 ${Math.round(max / 1048576)} MB`))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (done) return
      done = true
      resolve(Buffer.concat(chunks))
    })
    req.on('error', (err) => {
      if (done) return
      done = true
      reject(err)
    })
  })
}

async function readJson(req) {
  if (!/application\/json/i.test(String(req.headers['content-type'] || ''))) throw fail('bad_request', '请求格式不对')
  const buf = await readBody(req, MAX_JSON)
  if (buf.length === 0) return {}
  try {
    const v = JSON.parse(buf.toString('utf8'))
    return v && typeof v === 'object' ? v : {}
  } catch {
    throw fail('bad_request', '请求内容看不懂')
  }
}

function pickPatch(body) {
  const b = body && typeof body === 'object' ? body : {}
  const p = {}
  if (b.rvc && typeof b.rvc === 'object') {
    p.rvc = {}
    if (typeof b.rvc.enabled === 'boolean') p.rvc.enabled = b.rvc.enabled
    if (typeof b.rvc.connection === 'string') p.rvc.connection = b.rvc.connection
  }
  if (b.output && typeof b.output === 'object') {
    p.output = {}
    if (typeof b.output.keep === 'boolean') p.output.keep = b.output.keep
    if (typeof b.output.dir === 'string') p.output.dir = b.output.dir
    if (b.output.ttlMinutes !== undefined) p.output.ttlMinutes = Number(b.output.ttlMinutes)
  }
  return p
}

export function createRoutes({ settings, converter, version, logger }) {
  const state = () => ({
    version,
    settings: settings.publicView(),
    ffmpeg: existsSync(bundledFfmpeg()),
  })

  const routes = {
    'GET /state': async () => state(),
    'GET /status': async () => ({ status: await converter.status() }),
    'POST /settings': async (req) => {
      const body = await readJson(req)
      await settings.update(pickPatch(body))
      return state()
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
      if (!(err instanceof RvcError)) logger.warn(`dsh-rvc 接口 ${method} ${sub} 出错：${errorMessage(err)}`)
      const status = errorCode(err) === 'too_large' ? 413 : err instanceof RvcError ? 400 : 500
      if (res.headersSent) {
        res.destroy()
        return
      }
      send(res, status, { ok: false, code: errorCode(err), message: errorMessage(err) })
    }
  }
}
