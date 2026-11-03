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

export function mountTools(tools, converter, settings, logger) {
  let disposers = []
  let current = ''
  const apply = () => {
    const s = settings.get()
    const sig = s.rvc.enabled ? 'rvc' : 'plain'
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
