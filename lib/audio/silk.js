import { fail } from '../util.js'
import { writeWav16 } from './wav.js'

const SILK_RATE = 24000
const TENCENT_PREFIX = 0x02

let modPromise = null

function silkModule() {
  if (!modPromise) modPromise = import('silk-wasm')
  return modPromise
}

export async function decodeSilk(buf) {
  let mod
  try {
    mod = await silkModule()
  } catch (err) {
    modPromise = null
    throw fail('silk_missing', `SILK 解码组件加载失败：${err.message}`)
  }
  const decode = mod.decode || (mod.default && mod.default.decode)
  const input = buf[0] === TENCENT_PREFIX ? buf : Buffer.concat([Buffer.from([TENCENT_PREFIX]), buf])
  let res
  try {
    res = await decode(input, SILK_RATE)
  } catch (err) {
    throw fail('bad_audio', `SILK 语音解码失败：${err.message || err}`)
  }
  const data = res && res.data
  if (!data || data.length < 2) throw fail('bad_audio', 'SILK 语音解出来是空的')
  const pcm = new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + (data.length - (data.length % 2))))
  return writeWav16(pcm, SILK_RATE)
}
