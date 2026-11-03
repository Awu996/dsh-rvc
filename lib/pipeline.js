import { toStandardWav } from './audio/normalize.js'
import { parseConnection, rongyuConvert, rongyuStatus } from './rongyu.js'
import { checkLocalFile, errorMessage, fail, SerialQueue } from './util.js'

export const LIMITS = {
  maxSeconds: 600,
  maxInputBytes: 200 * 1048576,
  maxPending: 6,
}

export class Converter {
  constructor(settings, outputs, logger) {
    this.settings = settings
    this.outputs = outputs
    this.logger = logger
    this.queue = new SerialQueue(LIMITS.maxPending)
  }

  async status() {
    const s = this.settings.get()
    const out = {
      queue: this.queue.size,
      rvc: { enabled: s.rvc.enabled, configured: Boolean(s.rvc.connection), ready: false, message: '', edition: '', model: '' },
    }
    if (s.rvc.connection) {
      try {
        const st = await rongyuStatus(parseConnection(s.rvc.connection))
        out.rvc.ready = st.ready
        out.rvc.edition = st.edition
        out.rvc.model = st.model
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
