import { SEPARATE_MODES } from './pipeline.js'
import { errorMessage } from './util.js'

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    path: { type: 'string' },
    seconds: { type: 'number' },
    sampleRate: { type: 'number' },
    expiresInMinutes: { type: 'number' },
    message: { type: 'string' },
  },
  required: ['ok'],
  additionalProperties: false,
}

function render(_args, value) {
  if (!value || !value.ok) return [{ type: 'text', text: `没有生成：${(value && value.message) || '未知原因'}` }]
  const life = value.expiresInMinutes > 0 ? `这个文件 ${value.expiresInMinutes} 分钟后自动删除，请在这之前把它交给要发送的插件。` : '文件会一直保留。'
  return [{ type: 'text', text: `已生成 WAV：${value.path}（${value.seconds} 秒，${value.sampleRate} Hz，单声道 16 位）。${life}` }]
}

function shape(result) {
  const minutes = result.expiresAt ? Math.max(1, Math.round((result.expiresAt - Date.now()) / 60000)) : 0
  return { ok: true, path: result.path, seconds: result.seconds, sampleRate: result.sampleRate, expiresInMinutes: minutes }
}

function convertTool(converter, s) {
  const what = s.rvc.enabled ? '转成标准 WAV，并用容语（RVC）变声' : '转成标准 WAV（没开容语变声，只转格式）'
  return {
    name: 'rvc_convert',
    description:
      `RVC变声：把本机上的一个音频或视频文件${what}。` +
      '支持 QQ/微信语音（SILK、AMR）、MP3、M4A/AAC、OGG/Opus、FLAC、WAV、WMA，以及 MP4、FLV、WebM 等视频里的声音。' +
      'file 传本机上已经存在的完整路径，比如聊天渠道的工具取回的语音文件；不要通过操作屏幕或桌面去找文件。' +
      '返回新生成的 WAV 路径，不会发送；要回成语音消息，把它交给当前聊天渠道提供的发语音工具。',
    parameters: {
      type: 'object',
      properties: { file: { type: 'string', description: '音频或视频文件的完整本地路径' } },
      required: ['file'],
      additionalProperties: false,
    },
    timeoutMs: 30 * 60000,
    output: { schema: OUTPUT_SCHEMA, render },
    async execute(args) {
      try {
        return shape(await converter.convert({ path: String((args && args.file) || '') }))
      } catch (err) {
        return { ok: false, message: errorMessage(err) }
      }
    },
  }
}

const SEPARATE_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    vocal: { type: 'string' },
    instrumental: { type: 'string' },
    seconds: { type: 'number' },
    mode: { type: 'string' },
    expiresInMinutes: { type: 'number' },
    message: { type: 'string' },
  },
  required: ['ok'],
  additionalProperties: false,
}

function renderSeparate(_args, value) {
  if (!value || !value.ok) return [{ type: 'text', text: `没有分离：${(value && value.message) || '未知原因'}` }]
  const life = value.expiresInMinutes > 0 ? `这两个文件 ${value.expiresInMinutes} 分钟后自动删除，请在这之前用完。` : '文件会一直保留。'
  const len = value.seconds > 0 ? `，约 ${value.seconds} 秒` : ''
  return [{ type: 'text', text: `已分离（${value.mode}${len}）：人声 ${value.vocal}；伴奏 ${value.instrumental}。${life}` }]
}

function shapeSeparate(result) {
  const minutes = result.expiresAt ? Math.max(1, Math.round((result.expiresAt - Date.now()) / 60000)) : 0
  return {
    ok: true,
    vocal: result.vocal.path,
    instrumental: result.instrumental.path,
    seconds: result.seconds,
    mode: result.mode,
    expiresInMinutes: minutes,
  }
}

function separateTool(converter) {
  return {
    name: 'rvc_separate',
    description:
      '人声分离：把本机上的一首歌或一段音频（也可以是视频里的声音）分成人声和伴奏两个 WAV 文件，返回两个文件的路径，不会发送。' +
      '用户要把人声和伴奏分开、提取人声、去掉伴奏、只要伴奏、去人声、做伴奏时调用；两个文件都会返回，用户要哪个就给哪个。' +
      'file 传本机上已经存在的完整路径，比如用户给出的路径或聊天渠道的工具取回的文件；不要通过操作屏幕或桌面去找文件。' +
      'mode 不填就是「去伴奏（激进）」；用户要温和一些时用「去伴奏」；用户只要主唱、想把和声也分到伴奏里时用「提主旋律」。' +
      '一次处理一个文件，有多个文件就逐个调用。分离要一些时间，显卡越好越快。分离出的人声可以再交给 rvc_convert 变声。',
    parameters: {
      type: 'object',
      properties: {
        file: { type: 'string', description: '歌曲或音频、视频文件的完整本地路径' },
        mode: {
          type: 'string',
          enum: SEPARATE_MODES.map((m) => m.label),
          description: '处理方式，不填就是「去伴奏（激进）」',
        },
      },
      required: ['file'],
      additionalProperties: false,
    },
    timeoutMs: 40 * 60000,
    output: { schema: SEPARATE_SCHEMA, render: renderSeparate },
    async execute(args) {
      try {
        return shapeSeparate(await converter.separate({ path: String((args && args.file) || '') }, { mode: args && args.mode }))
      } catch (err) {
        return { ok: false, message: errorMessage(err) }
      }
    },
  }
}

export function mountTools(tools, converter, settings, logger) {
  let disposers = []
  let current = ''
  const apply = () => {
    const s = settings.get()
    const sig = `${s.rvc.enabled ? 'rvc' : 'plain'}|${s.separate.enabled ? 'sep' : 'nosep'}`
    if (sig === current) return
    current = sig
    for (const d of disposers) {
      try {
        d()
      } catch {}
    }
    disposers = []
    try {
      disposers.push(tools.register(convertTool(converter, s)))
    } catch (err) {
      logger && logger.warn && logger.warn(`dsh-rvc 注册工具失败：${errorMessage(err)}`)
    }
    if (!s.separate.enabled) return
    try {
      disposers.push(tools.register(separateTool(converter)))
    } catch (err) {
      logger && logger.warn && logger.warn(`dsh-rvc 注册人声分离工具失败：${errorMessage(err)}`)
    }
  }
  apply()
  const off = settings.onChange(apply)
  return () => {
    off()
    for (const d of disposers) {
      try {
        d()
      } catch {}
    }
    disposers = []
  }
}
