import { basename } from 'node:path'
import { toStandardWav } from './audio/normalize.js'
import { parseConnection, rongyuConvert, rongyuSeparate, rongyuStatus } from './rongyu.js'
import { checkLocalFile, errorMessage, fail, SerialQueue } from './util.js'

export const LIMITS = {
  maxSeconds: 600,
  maxInputBytes: 200 * 1048576,
  maxPending: 6,
}

export const SEPARATE_LIMITS = {
  maxInputBytes: 512 * 1048576,
  maxPending: 2,
  timeoutMs: 35 * 60000,
}

export const SEPARATE_MODES = [
  { label: '去伴奏（激进）', id: 'aggressive' },
  { label: '去伴奏', id: 'normal' },
  { label: '提主旋律', id: 'main_vocal' },
]

function modeOf(value) {
  const text = String(value ?? '').trim().replace(/\(/g, '（').replace(/\)/g, '）').replace(/\s+/g, '')
  return SEPARATE_MODES.find((m) => m.label === text || m.id === text) || SEPARATE_MODES[0]
}

function returnedWav(p) {
  const file = checkLocalFile(p, 0).path
  if (!/\.wav$/i.test(file)) throw fail('bad_reply', '容语返回的不是 WAV 文件')
  return file
}

export class Converter {
  constructor(settings, outputs, logger) {
    this.settings = settings
    this.outputs = outputs
    this.logger = logger
    this.queue = new SerialQueue(LIMITS.maxPending)
    this.sepQueue = new SerialQueue(SEPARATE_LIMITS.maxPending)
  }

  async status() {
    const s = this.settings.get()
    const out = {
      queue: this.queue.size,
      rvc: {
        enabled: s.rvc.enabled,
        configured: Boolean(s.rvc.connection),
        reachable: false,
        ready: false,
        message: '',
        edition: '',
        model: '',
        separate: false,
        separating: false,
      },
    }
    if (s.rvc.connection) {
      try {
        const st = await rongyuStatus(parseConnection(s.rvc.connection))
        out.rvc.reachable = true
        out.rvc.ready = st.ready
        out.rvc.edition = st.edition
        out.rvc.model = st.model
        out.rvc.separate = st.separate
        out.rvc.separating = st.separating
        out.rvc.message = st.ready ? `可用，当前模型：${st.model || '未知'}` : st.message || '容语暂时不能变声'
      } catch (err) {
        out.rvc.message = errorMessage(err)
      }
    } else {
      out.rvc.message = '还没填容语的连接串'
    }
    return out
  }

  convert(input, opts = {}) {
    return this.queue.run(async () => {
      const s = this.settings.get()
      const source = input && input.buffer ? { buffer: Buffer.from(input.buffer) } : { path: checkLocalFile(input && input.path, LIMITS.maxInputBytes).path }
      if (source.buffer && source.buffer.length > LIMITS.maxInputBytes) throw fail('too_large', '音频太大了')
      let audio = await toStandardWav(source, { maxSeconds: LIMITS.maxSeconds })
      const steps = [`转换格式（${audio.source}）`]
      let model = ''
      const useRvc = opts.rvc === undefined ? s.rvc.enabled : Boolean(opts.rvc) && s.rvc.enabled
      if (useRvc) {
        if (audio.peak < 0.0005) throw fail('silent', '这段音频几乎没有声音，变不了声')
        const v = await this.voice(audio, s)
        audio = v.audio
        model = v.model
        steps.push('容语变声')
      }
      return this.finish(audio, steps, model)
    })
  }

  separate(input, opts = {}) {
    return this.sepQueue.run(async () => {
      const s = this.settings.get()
      if (!s.separate.enabled) throw fail('separate_off', '人声分离已关闭，请在 DSH 设置「RVC变声」页里打开')
      if (!s.rvc.connection) throw fail('rvc_unset', '还没填容语的连接串，请在 DSH 设置「RVC变声」页里填好')
      const src = checkLocalFile(input && input.path, SEPARATE_LIMITS.maxInputBytes).path
      const mode = modeOf(opts.mode)
      const res = await rongyuSeparate(parseConnection(s.rvc.connection), src, mode.id, SEPARATE_LIMITS.timeoutMs)
      const vocalSrc = returnedWav(res.vocal)
      const instSrc = returnedWav(res.instrumental)
      const vocal = await this.outputs.adopt(vocalSrc, basename(vocalSrc))
      let instrumental
      try {
        instrumental = await this.outputs.adopt(instSrc, basename(instSrc))
      } catch (err) {
        await this.outputs.release(vocal.id)
        throw err
      }
      return {
        ok: true,
        mode: mode.label,
        seconds: Math.round(res.duration * 10) / 10,
        vocal,
        instrumental,
        kept: vocal.kept,
        expiresAt: vocal.expiresAt,
      }
    })
  }

  async voice(audio, s) {
    if (!s.rvc.connection) throw fail('rvc_unset', '开了容语变声，但还没填容语的连接串')
    const res = await rongyuConvert(parseConnection(s.rvc.connection), audio)
    const out = await toStandardWav({ buffer: res.buffer }, { maxSeconds: LIMITS.maxSeconds + 30 })
    return { audio: out, model: res.model }
  }

  async finish(audio, steps, model) {
    const saved = await this.outputs.save(audio.buffer)
    return {
      ok: true,
      id: saved.id,
      path: saved.path,
      seconds: Math.round(audio.seconds * 100) / 100,
      sampleRate: audio.sampleRate,
      kept: saved.kept,
      expiresAt: saved.expiresAt,
      steps,
      model,
    }
  }
}
