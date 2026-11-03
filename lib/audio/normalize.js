import { closeSync, openSync, promises as fsp, readSync } from 'node:fs'
import { join } from 'node:path'
import { workDir } from '../paths.js'
import { fail, randomId, removeQuietly } from '../util.js'
import { detectFormat } from './detect.js'
import { decodeToWav } from './ffmpeg.js'
import { decodeSilk } from './silk.js'
import { isStandardWav, levels, parseWav, readMono16, writeWav16 } from './wav.js'

export const MAX_RATE = 48000

function readHead(path, n = 512) {
  const fd = openSync(path, 'r')
  try {
    const buf = Buffer.alloc(n)
    const got = readSync(fd, buf, 0, n, 0)
    return buf.subarray(0, got)
  } finally {
    closeSync(fd)
  }
}

function rewrap(buf, info) {
  if (isStandardWav(info) && info.dataOffset === 44 && info.dataLength === buf.length - 44) return buf
  return writeWav16(readMono16(buf, info), info.sampleRate)
}

export async function toStandardWav(source, options = {}) {
  const maxSeconds = options.maxSeconds || 600
  const timeoutMs = options.timeoutMs || 180000
  const temps = []
  const temp = (ext) => {
    const p = join(workDir(), `t-${randomId()}${ext}`)
    temps.push(p)
    return p
  }
  try {
    let inputPath = source.path || ''
    const head = source.buffer ? source.buffer.subarray(0, 512) : readHead(inputPath)
    const fmt = detectFormat(head)
    if (fmt.kind === 'empty') throw fail('empty_file', '文件是空的')
    if (fmt.kind === 'text') throw fail('not_audio', '这不是音频文件，看起来是网页或文字（可能是下载失败时拿到的报错页面）')
    let wav = null
    if (fmt.kind === 'silk') {
      wav = await decodeSilk(source.buffer || (await fsp.readFile(inputPath)))
    } else if (fmt.kind === 'wav') {
      const buf = source.buffer || (await fsp.readFile(inputPath))
      const info = parseWav(buf)
      if (info && info.supported && info.sampleRate <= MAX_RATE) wav = rewrap(buf, info)
    }
    if (!wav) {
      if (fmt.skip) {
        const buf = source.buffer || (await fsp.readFile(inputPath))
        inputPath = temp('.m4s')
        await fsp.writeFile(inputPath, buf.subarray(fmt.skip))
      } else if (source.buffer) {
        inputPath = temp('.bin')
        await fsp.writeFile(inputPath, source.buffer)
      }
      const out = temp('.wav')
      await decodeToWav(inputPath, out, { demuxer: fmt.demuxer, maxSeconds: maxSeconds + 1, timeoutMs })
      let buf = await fsp.readFile(out)
      let info = parseWav(buf)
      if (!info || !info.supported) throw fail('bad_audio', '音频解码失败')
      if (info.sampleRate > MAX_RATE) {
        const out2 = temp('.wav')
        await decodeToWav(out, out2, { demuxer: 'wav', sampleRate: MAX_RATE, timeoutMs })
        buf = await fsp.readFile(out2)
        info = parseWav(buf)
        if (!info || !info.supported) throw fail('bad_audio', '音频重采样失败')
      }
      wav = rewrap(buf, info)
    }
    const info = parseWav(wav)
    if (info.seconds > maxSeconds) throw fail('too_long', `音频太长（约 ${Math.round(info.seconds)} 秒），最多 ${maxSeconds} 秒`)
    if (info.seconds < 0.1) throw fail('too_short', '音频太短了，不到 0.1 秒')
    const samples = readMono16(wav, info)
    const lv = levels(samples)
    return { buffer: wav, samples, sampleRate: info.sampleRate, seconds: info.seconds, source: fmt.label || fmt.kind, peak: lv.peak, rms: lv.rms }
  } finally {
    for (const p of temps) await removeQuietly(p)
  }
}
