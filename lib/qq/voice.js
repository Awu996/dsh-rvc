import { copyFile, open, stat, utimes, writeFile } from 'node:fs/promises'
import { extname, isAbsolute, join } from 'node:path'
import { voiceDir } from './paths.js'
import { fail, randomId, stamp } from './util.js'

const HISTORY_COUNT = 30
const VOICE_MAX_BYTES = 32 * 1048576

function unescapeCQ(v) {
  return v.replace(/&#91;/g, '[').replace(/&#93;/g, ']').replace(/&#44;/g, ',').replace(/&amp;/g, '&')
}

export function recordsOf(message) {
  if (Array.isArray(message)) {
    return message.filter((s) => s && s.type === 'record' && s.data && typeof s.data === 'object').map((s) => s.data)
  }
  if (typeof message === 'string' && message.includes('[CQ:record')) {
    const out = []
    for (const m of message.matchAll(/\[CQ:record((?:,[^\]]*)?)\]/g)) {
      const data = {}
      for (const pair of (m[1] || '').replace(/^,/, '').split(',')) {
        const at = pair.indexOf('=')
        if (at > 0) data[pair.slice(0, at)] = unescapeCQ(pair.slice(at + 1))
      }
      out.push(data)
    }
    return out
  }
  return []
}

async function recentMessages(napcat, chat) {
  try {
    const res =
      chat.scope === 'group'
        ? await napcat.call('get_group_msg_history', { group_id: Number(chat.peerId), count: HISTORY_COUNT }, 20000)
        : await napcat.call('get_friend_msg_history', { user_id: Number(chat.peerId), count: HISTORY_COUNT }, 20000)
    return Array.isArray(res?.messages) ? res.messages : []
  } catch (err) {
    if (err?.code === 'napcat_failed' && /不存在/.test(String(err.message))) return []
    throw err
  }
}

export async function ownerVoices(napcat, chat, owner) {
  const list = await recentMessages(napcat, chat)
  const found = []
  list.forEach((m, index) => {
    const sender = String(m?.sender?.user_id ?? m?.user_id ?? '')
    if (!owner || sender !== owner) return
    const recs = recordsOf(m?.message)
    if (recs.length === 0) return
    found.push({ time: Number(m?.time) || 0, index, rec: recs[0] })
  })
  return found.sort((a, b) => b.time - a.time || b.index - a.index)
}

function outName(ext) {
  return `qq-voice-${stamp()}-${randomId(4)}${ext}`
}

async function localFile(p) {
  const s = String(p ?? '').trim()
  if (!s || /^[\\/]{2}/.test(s) || !isAbsolute(s)) return ''
  try {
    const st = await stat(s)
    return st.isFile() && st.size > 0 && st.size <= VOICE_MAX_BYTES ? s : ''
  } catch {
    return ''
  }
}

async function copyFresh(from, to) {
  await copyFile(from, to)
  const now = new Date()
  await utimes(to, now, now).catch(() => {})
  return to
}

async function download(url) {
  if (!/^https?:\/\//i.test(url)) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0 || buf.length > VOICE_MAX_BYTES) return null
    let ext = ''
    try {
      ext = extname(new URL(url).pathname).toLowerCase()
    } catch {}
    return { buf, ext: /^\.[a-z0-9]{2,5}$/.test(ext) ? ext : '.amr' }
  } catch {
    return null
  }
}

async function saveDownload(url) {
  const d = await download(url)
  if (!d) return ''
  const p = join(voiceDir(), outName(d.ext))
  await writeFile(p, d.buf)
  return p
}

export async function fetchVoiceFile(napcat, rec) {
  const dir = voiceDir()
  const file = String(rec?.file || '').trim()
  let reason = ''
  if (file) {
    try {
      const res = await napcat.call('get_record', { file, out_format: 'wav' }, 30000)
      const out = join(dir, outName('.wav'))
      const made = await localFile(res?.file)
      if (made) return await copyFresh(made, out)
      if (res?.base64) {
        const buf = Buffer.from(String(res.base64), 'base64')
        if (buf.length > 0 && buf.length <= VOICE_MAX_BYTES) {
          await writeFile(out, buf)
          return out
        }
      }
      if (res?.url) {
        const p = await saveDownload(String(res.url))
        if (p) return p
      }
      reason = 'NapCat 没有返回语音文件'
    } catch (err) {
      reason = `NapCat 取语音失败：${err?.message || err}`
    }
  }
  const raw = await localFile(rec?.path)
  if (raw) return await copyFresh(raw, join(dir, outName(extname(raw).toLowerCase() || '.amr')))
  if (rec?.url) {
    const p = await saveDownload(String(rec.url))
    if (p) return p
  }
  throw fail('no_voice_file', reason || '这条语音拿不到音频文件')
}

export async function wavSeconds(path) {
  let fh
  try {
    fh = await open(path, 'r')
    const size = (await fh.stat()).size
    const head = Buffer.alloc(Math.min(size, 65536))
    await fh.read(head, 0, head.length, 0)
    if (head.length < 12 || head.toString('ascii', 0, 4) !== 'RIFF' || head.toString('ascii', 8, 12) !== 'WAVE') return 0
    let pos = 12
    let bytesPerSecond = 0
    while (pos + 8 <= head.length) {
      const id = head.toString('ascii', pos, pos + 4)
      const len = head.readUInt32LE(pos + 4)
      if (id === 'fmt ' && pos + 24 <= head.length) {
        const channels = head.readUInt16LE(pos + 10)
        const rate = head.readUInt32LE(pos + 12)
        const bits = head.readUInt16LE(pos + 22)
        bytesPerSecond = rate * channels * (bits / 8)
      }
      if (id === 'data') {
        if (bytesPerSecond <= 0) return 0
        const data = Math.min(len, Math.max(0, size - pos - 8))
        return Math.round((data / bytesPerSecond) * 10) / 10
      }
      pos += 8 + len + (len % 2)
    }
    return 0
  } catch {
    return 0
  } finally {
    await fh?.close().catch(() => {})
  }
}

export async function sendVoice(napcat, chat, file) {
  const action = chat.scope === 'group' ? 'send_group_msg' : 'send_private_msg'
  const target = chat.scope === 'group' ? { group_id: Number(chat.peerId) } : { user_id: Number(chat.peerId) }
  const res = await napcat.call(action, { ...target, message: [{ type: 'record', data: { file } }] }, 120000)
  return Number(res?.message_id ?? 0) || 0
}
