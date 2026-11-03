import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function dshHome() {
  const env = process.env.DSH_HOME
  return env && env.trim() ? env.trim() : join(homedir(), '.dsh')
}

export function dataDir() {
  return join(dshHome(), 'dsh-rvc', 'qq-voice')
}

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true })
  return dir
}

export function voiceDir() {
  return ensureDir(join(dataDir(), 'voices'))
}

export function settingsFile() {
  return join(dataDir(), 'settings.json')
}

export function dshQqDir() {
  return join(dshHome(), 'dsh-qq')
}
