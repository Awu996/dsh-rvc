import WebSocket from 'ws'
import { fail } from './util.js'

const OPEN = 1
const IDLE_MS = 60000

function connectError(err, url) {
  const msg = String(err?.message || err || '')
  if (/ECONNREFUSED/i.test(msg)) {
    return fail('connect_failed', `连不上 NapCat（${url}）：NapCat 没开，或者这个端口没有开 WebSocket 服务器`)
  }
  if (/\b(401|403)\b/.test(msg)) return fail('rejected', 'NapCat 拒绝了连接：token 和 NapCat 里设置的不一致')
  if (/timed? ?out|ETIMEDOUT/i.test(msg)) return fail('connect_failed', `连接 NapCat 超时（${url}）`)
  return fail('connect_failed', `连不上 NapCat（${url}）：${msg}`)
}

export class NapCat {
  constructor(settings, logger) {
    this.settings = settings
    this.logger = logger
    this.ws = null
    this.key = ''
    this.opening = null
    this.attempt = 0
    this.seq = 0
    this.pending = new Map()
    this.idleTimer = null
    this.serverError = ''
    this.offSettings = settings.onChange(() => this.close())
  }

  endpoint() {
    const s = this.settings.get()
    return { url: `${s.url}/api`, token: s.token, key: `${s.url}\n${s.token}` }
  }

  connect() {
    const ep = this.endpoint()
    if (this.ws && this.ws.readyState === OPEN && this.key === ep.key) return Promise.resolve(this.ws)
    if (this.opening && this.key === ep.key) return this.opening
    this.close()
    this.key = ep.key
    this.serverError = ''
    const attempt = ++this.attempt
    const opening = new Promise((resolve, reject) => {
      let ws
      try {
        ws = new WebSocket(ep.url, {
          headers: ep.token ? { Authorization: `Bearer ${ep.token}` } : undefined,
          handshakeTimeout: 8000,
        })
      } catch (err) {
        reject(connectError(err, ep.url))
        return
      }
      let settled = false
      ws.on('open', () => {
        if (settled) return
        settled = true
        if (attempt !== this.attempt) {
          try {
            ws.close()
          } catch {}
          reject(fail('disconnected', '连接设置已经改了，请再试一次'))
          return
        }
        this.ws = ws
        resolve(ws)
      })
      ws.on('message', (raw) => this.onMessage(raw))
      ws.on('error', (err) => {
        if (settled) return
        settled = true
        reject(connectError(err, ep.url))
      })
      ws.on('close', () => {
        if (this.ws === ws) this.ws = null
        const reason = this.serverError
          ? fail('rejected', `NapCat 断开了连接：${this.serverError}`)
          : fail('disconnected', '和 NapCat 的连接断开了，请稍后再试')
        this.failPending(ws, reason)
        if (!settled) {
          settled = true
          reject(fail('connect_failed', `连不上 NapCat（${ep.url}）`))
        }
      })
    })
    this.opening = opening
    const clear = () => {
      if (this.opening === opening) this.opening = null
    }
    opening.then(clear, clear)
    return opening
  }

  onMessage(raw) {
    let payload
    try {
      payload = JSON.parse(String(raw))
    } catch {
      return
    }
    if (!payload || typeof payload !== 'object') return
    if (payload.echo !== undefined && this.pending.has(payload.echo)) {
      const p = this.pending.get(payload.echo)
      this.pending.delete(payload.echo)
      if (payload.status === 'ok' || payload.retcode === 0) p.resolve(payload.data)
      else p.reject(fail('napcat_failed', `NapCat 返回失败：${payload.wording || payload.message || `retcode=${payload.retcode}`}`))
      return
    }
    if (payload.status === 'failed' || (typeof payload.retcode === 'number' && payload.retcode !== 0)) {
      this.serverError = String(payload.wording || payload.message || `retcode=${payload.retcode}`)
    }
  }

  failPending(ws, err) {
    for (const [echo, p] of this.pending) {
      if (p.ws !== ws) continue
      this.pending.delete(echo)
      p.reject(err)
    }
  }

  async call(action, params = {}, timeoutMs = 30000) {
    const ws = await this.connect()
    const echo = `qqvoice-${++this.seq}`
    this.clearIdle()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(echo)
        this.scheduleIdle()
        reject(fail('timeout', `NapCat 没有及时响应（${action}）`))
      }, timeoutMs)
      const finish = () => {
        clearTimeout(timer)
        this.scheduleIdle()
      }
      this.pending.set(echo, {
        ws,
        resolve: (value) => {
          finish()
          resolve(value)
        },
        reject: (err) => {
          finish()
          reject(err)
        },
      })
      try {
        ws.send(JSON.stringify({ action, params, echo }))
      } catch (err) {
        this.pending.delete(echo)
        finish()
        reject(fail('disconnected', `发给 NapCat 失败：${err?.message || err}`))
      }
    })
  }

  clearIdle() {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
  }

  scheduleIdle() {
    this.clearIdle()
    if (this.pending.size > 0) return
    this.idleTimer = setTimeout(() => {
      if (this.pending.size === 0) this.close()
    }, IDLE_MS)
    this.idleTimer.unref?.()
  }

  close() {
    this.clearIdle()
    this.attempt += 1
    this.opening = null
    this.key = ''
    const ws = this.ws
    this.ws = null
    if (ws) {
      this.failPending(ws, fail('disconnected', '和 NapCat 的连接已经关闭'))
      try {
        ws.close()
      } catch {}
    }
  }

  dispose() {
    try {
      this.offSettings?.()
    } catch {}
    this.close()
  }
}
