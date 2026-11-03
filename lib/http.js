import http from 'node:http'
import https from 'node:https'
import { fail } from './util.js'

function pick(url) {
  const u = url instanceof URL ? url : new URL(url)
  if (u.protocol === 'http:') return { u, mod: http }
  if (u.protocol === 'https:') return { u, mod: https }
  throw fail('bad_url', `不支持的地址：${u.protocol}`)
}

export function request(url, options = {}) {
  const { method = 'GET', headers = {}, body = null, timeoutMs = 30000, maxBytes = 64 * 1048576 } = options
  const { u, mod } = pick(url)
  const payload = body === null || body === undefined ? null : Buffer.isBuffer(body) ? body : Buffer.from(String(body))
  const finalHeaders = { ...headers }
  if (payload) finalHeaders['content-length'] = String(payload.length)
  return new Promise((resolve, reject) => {
    let done = false
    const finish = (err, value) => {
      if (done) return
      done = true
      clearTimeout(timer)
      if (err) reject(err)
      else resolve(value)
    }
    const req = mod.request(u, { method, headers: finalHeaders, agent: false }, (res) => {
      const chunks = []
      let size = 0
      res.on('data', (chunk) => {
        size += chunk.length
        if (size > maxBytes) {
          req.destroy()
          finish(fail('response_too_large', '返回的数据太大'))
          return
        }
        chunks.push(chunk)
      })
      res.on('end', () => finish(null, { status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks) }))
      res.on('error', (err) => finish(err))
    })
    const timer = setTimeout(() => {
      req.destroy()
      finish(fail('timeout', '等待对方响应超时'))
    }, timeoutMs)
    req.on('error', (err) => finish(connectionError(err, u)))
    if (payload) req.write(payload)
    req.end()
  })
}

export function connectionError(err, u) {
  const code = err && err.code
  if (code === 'ECONNREFUSED') return fail('unreachable', `连不上 ${u.host}，对方程序可能没打开`)
  if (code === 'ECONNRESET') return fail('reset', `${u.host} 断开了连接`)
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return fail('unreachable', `找不到地址 ${u.hostname}`)
  if (code === 'ETIMEDOUT') return fail('timeout', `连接 ${u.host} 超时`)
  return err instanceof Error ? err : fail('network', String(err))
}

export function json(res) {
  try {
    return JSON.parse(res.body.toString('utf8'))
  } catch {
    return null
  }
}
