import { VOICE_TTL_MINUTES } from './files.js'
import { checkAudioFile, errorCode, errorMessage } from './util.js'
import { fetchVoiceFile, ownerVoices, sendVoice, wavSeconds } from './voice.js'

export const SEND_LIMIT = 6
const SEND_WINDOW_MS = 60000
const MAX_SKIP = 5

const GET_DESC =
  'QQ语音桥：取当前这个 QQ 聊天里主人最近发的一条语音，存成本机的 WAV 文件，返回文件路径。' +
  '只会取主人本人发的语音，别人发的不会取。聊天里出现主人发的语音（比如「[语音]」或「[语音转文字] …」），并且需要处理这条语音时调用。' +
  '要的不是最新那条时，skip 填要跳过的条数：比如主人用语音回答了「发给谁」，最新一条就是这个回答，skip 填 1，取前一条；连着用语音回答了几次就填几。' +
  '拿到路径后交给处理音频的工具（比如 rvc_convert）。不要去屏幕或桌面上找文件。'

const GET_ASK =
  '主人发来一条语音、但没说要拿它做什么时，问主人这段语音要变声后发给谁；主人说了发给谁，就用这个工具取回语音（主人是用语音回答的，skip 填 1），交给 rvc_convert 变声，再用 qqvoice_send 发出去，to 填主人说的人。'

const SEND_DESC =
  'QQ语音桥：把本机上的一个音频文件作为语音消息（语音条）发出去。' +
  '不填 to 就发到当前这个 QQ 聊天；要发给别人、群或者主人自己时，to 填对方的 QQ 号、群号，或者好友备注、昵称、群名，发给主人自己填「主人」。' +
  '名字完全对上而且只有一个时直接发；对上好几个，或者只是部分对上时不会发，会返回候选列表，这时先问主人发给哪一个，再用候选里的号码重新调用。' +
  'file 填处理音频的工具返回的完整路径（比如 rvc_convert 的结果）。发出去以后不用再用文字复述语音内容。不要通过操作屏幕来发送。'

const SEND_OWNER_CHAT =
  '现在只有在主人和机器人的私聊里才能用 to 指定发给谁；在群聊和别人的私聊里不要填 to，只能发回当前聊天；发给主人自己（to 填「主人」）不受这个限制。'

const SWITCH_HINT = '这个限制可以在 DSH 设置「RVC变声」的「QQ语音桥」页关掉。'

const MAX_CANDIDATES = 10
const SELF_RE = /^(主人|主人自己|我|我自己|自己)$/
const SELF_ID_RE = /^(?:(?:private|好友|私聊)[:：]?)?(\d{5,12})$/i

function getDescription(ownerChatOnly) {
  return GET_DESC + (ownerChatOnly ? `在主人和机器人的私聊里，${GET_ASK}` : GET_ASK)
}

function sendDescription(ownerChatOnly) {
  return ownerChatOnly ? SEND_DESC + SEND_OWNER_CHAT : SEND_DESC
}

function isSelfTarget(to, owner) {
  const t = String(to ?? '').replace(/\s+/g, '').replace(/^@+/, '')
  if (SELF_RE.test(t)) return true
  if (!owner) return false
  const m = SELF_ID_RE.exec(t)
  return Boolean(m && m[1] === owner)
}

async function chatOrigin(resolver, exec, owner) {
  try {
    const chat = await resolver.resolve(sessionIdOf(exec))
    return chat.scope === 'private' && chat.peerId === owner ? 'owner' : 'other'
  } catch (err) {
    const code = errorCode(err)
    if (code === 'unknown_chat' || code === 'no_session') return 'none'
    throw err
  }
}

function blockedByOwnerChat(origin) {
  const head = '没有发送：现在只有在主人和机器人的私聊里才能指定发给谁'
  if (origin === 'other') return `${head}。不填 to 可以发回当前聊天；要发给主人自己，to 填「主人」。${SWITCH_HINT}`
  return `${head}，确认不了当前是这个私聊。要发给主人自己，to 填「主人」。${SWITCH_HINT}`
}

const GET_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    path: { type: 'string' },
    seconds: { type: 'number' },
    sentSecondsAgo: { type: 'number' },
    skipped: { type: 'number' },
    chat: { type: 'string' },
    expiresInMinutes: { type: 'number' },
    message: { type: 'string' },
  },
  required: ['ok'],
  additionalProperties: false,
}

const SEND_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    chat: { type: 'string' },
    message: { type: 'string' },
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, type: { type: 'string' }, id: { type: 'string' } },
        required: ['name', 'type', 'id'],
        additionalProperties: false,
      },
    },
  },
  required: ['ok'],
  additionalProperties: false,
}

function chooseFrom(to, list, partial) {
  const shown = list.slice(0, MAX_CANDIDATES)
  const candidates = shown.map((c) => ({ name: c.name || '（没有名字）', type: c.scope === 'group' ? '群' : '好友', id: c.peerId }))
  const head = partial ? `没有名字完全是「${to}」的好友或群，相近的有 ${list.length} 个` : `叫「${to}」的有 ${list.length} 个`
  const more = list.length > shown.length ? `，这里只列出前 ${shown.length} 个` : ''
  return { ok: false, candidates, message: `${head}${more}。没有发送：请先问主人发给哪一个，再用候选里的号码重新调用。` }
}

export function sessionIdOf(exec) {
  const s = exec?.agent?.session
  const id = s?.header?.id ?? s?.id
  return id === undefined || id === null ? '' : String(id)
}

function agoText(sec) {
  if (sec < 60) return `${sec} 秒`
  if (sec < 3600) return `${Math.round(sec / 60)} 分钟`
  if (sec < 86400) return `${Math.round(sec / 3600)} 小时`
  return `${Math.round(sec / 86400)} 天`
}

function renderGet(_args, v) {
  if (!v || !v.ok) return [{ type: 'text', text: `没有取到语音：${(v && v.message) || '未知原因'}` }]
  const parts = []
  if (v.seconds > 0) parts.push(`约 ${v.seconds} 秒`)
  if (v.sentSecondsAgo >= 0) parts.push(`${agoText(v.sentSecondsAgo)}前发的`)
  parts.push(`${v.expiresInMinutes} 分钟后自动删除`)
  const which = v.skipped > 0 ? `倒数第 ${v.skipped + 1} 条语音` : '语音'
  return [{ type: 'text', text: `已取到主人在${v.chat}发的${which}：${v.path}（${parts.join('，')}）` }]
}

function renderSend(_args, v) {
  if (v && v.ok) return [{ type: 'text', text: `已把语音发到${v.chat}` }]
  let text = `语音没发出去：${(v && v.message) || '未知原因'}`
  if (v && Array.isArray(v.candidates) && v.candidates.length > 0) {
    text += '\n' + v.candidates.map((c, i) => `${i + 1}. ${c.name}（${c.type}，${c.id}）`).join('\n')
  }
  return [{ type: 'text', text }]
}

export class SendLimiter {
  constructor(limit = SEND_LIMIT, windowMs = SEND_WINDOW_MS) {
    this.limit = limit
    this.windowMs = windowMs
    this.marks = new Map()
  }

  take(key, now = Date.now()) {
    const list = (this.marks.get(key) || []).filter((t) => now - t < this.windowMs)
    if (list.length >= this.limit) {
      this.marks.set(key, list)
      return false
    }
    list.push(now)
    this.marks.set(key, list)
    if (this.marks.size > 500) this.marks.delete(this.marks.keys().next().value)
    return true
  }
}

export function buildTools({ settings, napcat, resolver, limiter: shared }) {
  const limiter = shared || new SendLimiter()
  const ownerChatOnly = Boolean(settings.get().ownerChatOnly)
  const getTool = {
    name: 'qqvoice_get',
    description: getDescription(ownerChatOnly),
    parameters: {
      type: 'object',
      properties: {
        skip: {
          type: 'integer',
          enum: [0, 1, 2, 3, 4, 5],
          description: '跳过主人最新的几条语音，不填就是 0，取最新一条。主人用语音回答了「发给谁」时填 1，取前一条要变声的语音',
        },
      },
      additionalProperties: false,
    },
    timeoutMs: 120000,
    output: { schema: GET_SCHEMA, render: renderGet },
    async execute(args, exec) {
      try {
        const owner = settings.get().owner
        if (!owner) return { ok: false, message: 'QQ语音桥还没填主人 QQ，请在 DSH 设置「RVC变声」的「QQ语音桥」页里填好' }
        const raw = args && args.skip
        const skip = Number.isInteger(raw) && raw > 0 ? Math.min(raw, MAX_SKIP) : 0
        const chat = await resolver.resolve(sessionIdOf(exec))
        const voices = await ownerVoices(napcat, chat, owner)
        if (voices.length === 0) return { ok: false, chat: chat.label, message: `${chat.label}最近的消息里没有主人发的语音` }
        if (skip >= voices.length) {
          return { ok: false, chat: chat.label, message: `${chat.label}最近的消息里主人只发了 ${voices.length} 条语音，跳过 ${skip} 条后就没有了` }
        }
        const found = voices[skip]
        const path = await fetchVoiceFile(napcat, found.rec)
        const seconds = /\.wav$/i.test(path) ? await wavSeconds(path) : 0
        const ago = found.time > 0 ? Math.max(0, Math.round(Date.now() / 1000 - found.time)) : -1
        return { ok: true, path, seconds, sentSecondsAgo: ago, skipped: skip, chat: chat.label, expiresInMinutes: VOICE_TTL_MINUTES }
      } catch (err) {
        return { ok: false, message: errorMessage(err) }
      }
    },
  }
  const sendTool = {
    name: 'qqvoice_send',
    description: sendDescription(ownerChatOnly),
    parameters: {
      type: 'object',
      properties: {
        file: { type: 'string', description: '要发出去的音频文件的完整本地路径' },
        to: { type: 'string', description: '发给谁。不填就发到当前聊天；可以填 QQ 号、群号，或者好友备注、昵称、群名；发给主人自己填「主人」' },
      },
      required: ['file'],
      additionalProperties: false,
    },
    timeoutMs: 180000,
    output: { schema: SEND_SCHEMA, render: renderSend },
    async execute(args, exec) {
      try {
        const file = checkAudioFile(args && args.file)
        const to = String((args && args.to) || '').trim()
        let chat
        if (to) {
          const s = settings.get()
          if (!s.owner) return { ok: false, message: 'QQ语音桥还没填主人 QQ，请在 DSH 设置「RVC变声」的「QQ语音桥」页里填好' }
          const self = isSelfTarget(to, s.owner)
          if (!self && s.ownerChatOnly) {
            const origin = await chatOrigin(resolver, exec, s.owner)
            if (origin !== 'owner') return { ok: false, message: blockedByOwnerChat(origin) }
          }
          const found = await resolver.findTargets(self ? `private:${s.owner}` : to)
          if (found.exact.length > 1) return chooseFrom(to, found.exact, false)
          if (found.exact.length === 0 && found.partial.length > 0) return chooseFrom(to, found.partial, true)
          if (found.exact.length === 0) {
            return { ok: false, message: self ? '主人不在机器人的好友列表里，发不了私聊语音' : `机器人的好友和群里没有找到「${to}」，可以换成对方的 QQ 号或群号再试` }
          }
          chat = found.exact[0]
        } else {
          chat = await resolver.resolve(sessionIdOf(exec))
        }
        if (!limiter.take(`${chat.scope}:${chat.peerId}`)) {
          return { ok: false, chat: chat.label, message: `一分钟内已经往${chat.label}发了 ${SEND_LIMIT} 条语音，请稍后再发` }
        }
        await sendVoice(napcat, chat, file)
        return { ok: true, chat: chat.label }
      } catch (err) {
        return { ok: false, message: errorMessage(err) }
      }
    },
  }
  return [getTool, sendTool]
}

function signature(settings) {
  if (!settings.ready()) return ''
  return `on|${settings.get().ownerChatOnly ? 1 : 0}`
}

export function mountTools(tools, baseDeps) {
  const deps = { ...baseDeps, limiter: baseDeps.limiter || new SendLimiter() }
  let disposers = []
  let current = ''
  const unmount = () => {
    for (const d of disposers) {
      try {
        d()
      } catch {}
    }
    disposers = []
    current = ''
  }
  const sync = () => {
    const want = signature(deps.settings)
    if (want === current) return
    unmount()
    if (!want) return
    try {
      for (const t of buildTools(deps)) disposers.push(tools.register(t))
      current = want
    } catch (err) {
      unmount()
      deps.logger?.warn?.(`dsh-rvc QQ语音桥注册工具失败：${errorMessage(err)}`)
    }
  }
  sync()
  const off = deps.settings.onChange(sync)
  return () => {
    off()
    unmount()
  }
}
