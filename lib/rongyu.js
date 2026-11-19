import { json, request } from './http.js'
import { fail } from './util.js'
import { joinChunks, planChunks } from './audio/segment.js'
import { parseWav, readMono16, writeWav16 } from './audio/wav.js'

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])

export function parseConnection(text) {
  let s = String(text || '')
    .replace(/[\s\u3000]+/g, '')
    .replace(/：/g, ':')
    .replace(/？/g, '?')
    .replace(/＝/g, '=')
  if (!s) throw fail('empty', '请先粘贴容语的连接串')
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`
  let u
  try {
    u = new URL(s)
  } catch {
    throw fail('bad_connection', '这不像容语的连接串，请在容语「设置 → 语音接口」里点「复制」后再粘贴')
  }
  if (!LOOPBACK.has(u.hostname.toLowerCase())) throw fail('not_local', '只能连接本机的容语（127.0.0.1），这串地址指向了别的电脑')
  if (u.protocol !== 'http:') throw fail('bad_connection', '容语的连接串应以 http:// 开头')
  const key = (u.searchParams.get('key') || '').trim()
  if (!/^[0-9a-fA-F]{16,128}$/.test(key)) throw fail('bad_connection', '连接串里缺少 Key，请在容语里重新点「复制」')
  if (!u.port) throw fail('bad_connection', '连接串里缺少端口号')
  return { base: `http://127.0.0.1:${u.port}`, key: key.toLowerCase(), port: Number(u.port) }
}

function headers(conn, extra = {}) {
  return { authorization: `Bearer ${conn.key}`, host: `127.0.0.1:${conn.port}`, ...extra }
}

function explain(res) {
  const body = json(res) || {}
  const code = body.code || `http_${res.status}`
  if (res.status === 401) return fail('unauthorized', 'Key 不对，请在容语「设置 → 语音接口」里重新复制连接串')
  if (res.status === 403) return fail('forbidden', '容语拒绝了请求')
  return fail(code, body.message || `容语返回了错误（${res.status}）`)
}

function wrapNetwork(err) {
  if (err && (err.code === 'unreachable' || err.code === 'reset')) {
    return fail('unreachable', '连不上容语：容语没有打开、语音接口没开，或者端口变了（容语提示端口变化时请重新复制连接串）')
  }
  return err
}

export async function rongyuStatus(conn) {
  let res
  try {
    res = await request(`${conn.base}/v1/status`, { headers: headers(conn), timeoutMs: 8000, maxBytes: 65536 })
  } catch (err) {
    throw wrapNetwork(err)
  }
  if (res.status !== 200) throw explain(res)
  const body = json(res)
  if (!body || body.ok !== true) throw fail('bad_reply', '容语的回复看不懂，请确认容语版本支持语音接口')
  return {
    ready: Boolean(body.ready),
    reason: body.reason || '',
    message: body.message || '',
    edition: body.edition || '',
    model: body.model || '',
    busy: Boolean(body.busy),
    maxSeconds: Number(body.max_seconds) > 0 ? Number(body.max_seconds) : 120,
    separate: body.separate === true,
    separating: body.separating === true,
  }
}

export async function rongyuSeparate(conn, filePath, mode, timeoutMs) {
  let res
  try {
    res = await request(`${conn.base}/v1/separate`, {
      method: 'POST',
      headers: headers(conn, { 'content-type': 'application/json' }),
      body: JSON.stringify({ path: filePath, mode }),
      timeoutMs,
      maxBytes: 65536,
    })
  } catch (err) {
    throw wrapNetwork(err)
  }
  if (res.status === 404) {
    const body = json(res) || {}
    if (!body.code || body.code === 'not_found') {
      throw fail('not_supported', '当前容语版本不支持人声分离，请把容语轻量版升级到最新版本')
    }
  }
  if (res.status !== 200) throw explain(res)
  const body = json(res)
  if (!body || body.ok !== true || !body.vocal || !body.instrumental) {
    throw fail('bad_reply', '容语的回复看不懂，请确认容语版本支持人声分离')
  }
  return {
    vocal: String(body.vocal),
    instrumental: String(body.instrumental),
    duration: Number(body.duration) > 0 ? Number(body.duration) : 0,
  }
}

export async function rongyuConvertOnce(conn, wavBuffer, timeoutMs) {
  let res
  try {
    res = await request(`${conn.base}/v1/convert`, {
      method: 'POST',
      headers: headers(conn, { 'content-type': 'audio/wav' }),
      body: wavBuffer,
      timeoutMs,
      maxBytes: 256 * 1048576,
    })
  } catch (err) {
    throw wrapNetwork(err)
  }
  if (res.status !== 200) throw explain(res)
  const info = parseWav(res.body)
  if (!info || !info.supported) throw fail('bad_reply', '容语返回的不是有效的 WAV')
  return { buffer: res.body, info }
}

export async function rongyuConvert(conn, audio, options = {}) {
  const status = await rongyuStatus(conn)
  if (!status.ready) throw fail(status.reason || 'not_ready', status.message || '容语暂时不能变声')
  const perCall = Math.max(10, status.maxSeconds - 8)
  const timeoutMs = options.timeoutMs || (status.edition === 'lite' ? 600000 : 300000)
  const ranges = planChunks(audio.samples, audio.sampleRate, perCall)
  if (ranges.length === 1) {
    const one = await rongyuConvertOnce(conn, audio.buffer, timeoutMs)
    return { buffer: one.buffer, sampleRate: one.info.sampleRate, seconds: one.info.seconds, model: status.model, edition: status.edition }
  }
  const parts = []
  let rate = 0
  for (const [a, b] of ranges) {
    const piece = writeWav16(audio.samples.subarray(a, b), audio.sampleRate)
    const one = await rongyuConvertOnce(conn, piece, timeoutMs)
    if (rate && one.info.sampleRate !== rate) throw fail('bad_reply', '容语在分段转换中途换了模型，请重试')
    rate = one.info.sampleRate
    parts.push(readMono16(one.buffer, one.info))
  }
  const joined = joinChunks(parts, rate)
  return { buffer: writeWav16(joined, rate), sampleRate: rate, seconds: joined.length / rate, model: status.model, edition: status.edition }
}
