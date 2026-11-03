import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { bundledFfmpeg } from '../paths.js'
import { fail } from '../util.js'

export function ffmpegPath() {
  const p = bundledFfmpeg()
  if (!existsSync(p)) throw fail('ffmpeg_missing', '插件自带的解码程序 bin\\ffmpeg.exe 不见了，请重新安装 RVC变声插件')
  return p
}

export function runFfmpeg(args, { timeoutMs = 120000 } = {}) {
  const exe = ffmpegPath()
  return new Promise((resolve, reject) => {
    let stderr = ''
    let killed = false
    const child = spawn(exe, ['-nostdin', '-hide_banner', '-loglevel', 'error', ...args], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    const timer = setTimeout(() => {
      killed = true
      child.kill()
    }, timeoutMs)
    child.stderr.on('data', (d) => {
      if (stderr.length < 4000) stderr += d.toString('utf8')
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(fail('ffmpeg_failed', `解码程序启动失败：${err.message}`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (killed) reject(fail('timeout', '音频解码超时'))
      else resolve({ code, stderr: stderr.trim() })
    })
  })
}

export async function decodeToWav(input, output, { demuxer, sampleRate, maxSeconds, timeoutMs } = {}) {
  const args = ['-y', '-protocol_whitelist', 'file,pipe']
  if (demuxer) args.push('-f', demuxer)
  args.push('-i', input, '-map', '0:a:0', '-vn', '-sn', '-dn', '-ac', '1')
  if (sampleRate) args.push('-ar', String(sampleRate))
  if (maxSeconds) args.push('-t', String(maxSeconds))
  args.push('-c:a', 'pcm_s16le', '-f', 'wav', output)
  const res = await runFfmpeg(args, { timeoutMs })
  if (res.code !== 0) {
    const text = res.stderr
    if (/matches no streams|does not contain any stream|Output file does not contain/i.test(text)) {
      throw fail('no_audio', '这个文件里没有声音')
    }
    if (/Invalid data found|could not find codec|Unknown input format|not supported/i.test(text)) {
      throw fail('bad_audio', '这个文件的格式解不了，或者文件已经损坏')
    }
    throw fail('bad_audio', `音频解码失败：${text.split('\n').pop() || '未知原因'}`)
  }
}
