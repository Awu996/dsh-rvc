const PCM = 1
const FLOAT = 3
const EXTENSIBLE = 0xfffe

export function parseWav(buf) {
  if (!buf || buf.length < 12) return null
  const riff = buf.toString('ascii', 0, 4)
  if ((riff !== 'RIFF' && riff !== 'RF64') || buf.toString('ascii', 8, 12) !== 'WAVE') return null
  let pos = 12
  let fmt = null
  let dataOffset = -1
  let dataLength = 0
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4)
    let size = buf.readUInt32LE(pos + 4)
    const body = pos + 8
    if (id === 'fmt ' && body + 16 <= buf.length) {
      let tag = buf.readUInt16LE(body)
      const channels = buf.readUInt16LE(body + 2)
      const sampleRate = buf.readUInt32LE(body + 4)
      const bits = buf.readUInt16LE(body + 14)
      if (tag === EXTENSIBLE && size >= 40 && body + 26 <= buf.length) tag = buf.readUInt16LE(body + 24)
      fmt = { tag, channels, sampleRate, bits }
    } else if (id === 'data') {
      dataOffset = body
      if (size === 0xffffffff || body + size > buf.length) size = buf.length - body
      dataLength = size
      break
    }
    pos = body + size + (size & 1)
  }
  if (!fmt || dataOffset < 0) return null
  const blockAlign = (fmt.bits / 8) * fmt.channels
  const supported =
    fmt.channels >= 1 &&
    fmt.sampleRate >= 1000 &&
    ((fmt.tag === PCM && [8, 16, 24, 32].includes(fmt.bits)) || (fmt.tag === FLOAT && [32, 64].includes(fmt.bits)))
  const frames = blockAlign > 0 ? Math.floor(dataLength / blockAlign) : 0
  return {
    ...fmt,
    float: fmt.tag === FLOAT,
    supported,
    dataOffset,
    dataLength,
    frames,
    seconds: fmt.sampleRate > 0 ? frames / fmt.sampleRate : 0,
  }
}

export function isStandardWav(info) {
  return Boolean(info && info.supported && info.tag === PCM && info.bits === 16 && info.channels === 1 && info.sampleRate <= 48000)
}

export function readMono16(buf, info) {
  const out = new Int16Array(info.frames)
  const ch = info.channels
  const bytes = info.bits / 8
  const stride = bytes * ch
  let p = info.dataOffset
  for (let i = 0; i < info.frames; i++) {
    let acc = 0
    for (let c = 0; c < ch; c++) {
      const o = p + c * bytes
      let v
      if (info.float) v = info.bits === 32 ? buf.readFloatLE(o) : buf.readDoubleLE(o)
      else if (info.bits === 16) v = buf.readInt16LE(o) / 32768
      else if (info.bits === 8) v = (buf[o] - 128) / 128
      else if (info.bits === 24) v = buf.readIntLE(o, 3) / 8388608
      else v = buf.readInt32LE(o) / 2147483648
      acc += Number.isFinite(v) ? v : 0
    }
    let s = Math.round((acc / ch) * 32767)
    if (s > 32767) s = 32767
    else if (s < -32768) s = -32768
    out[i] = s
    p += stride
  }
  return out
}

export function writeWav16(samples, sampleRate) {
  const dataBytes = samples.length * 2
  const buf = Buffer.alloc(44 + dataBytes)
  buf.write('RIFF', 0, 'ascii')
  buf.writeUInt32LE(36 + dataBytes, 4)
  buf.write('WAVE', 8, 'ascii')
  buf.write('fmt ', 12, 'ascii')
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(PCM, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36, 'ascii')
  buf.writeUInt32LE(dataBytes, 40)
  Buffer.from(samples.buffer, samples.byteOffset, dataBytes).copy(buf, 44)
  return buf
}

export function levels(samples) {
  let peak = 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i])
    if (v > peak) peak = v
    sum += v * v
  }
  return { peak: peak / 32768, rms: samples.length ? Math.sqrt(sum / samples.length) / 32768 : 0 }
}
