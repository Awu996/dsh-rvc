import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

export function dshHome() {
  const env = process.env.DSH_HOME
  return env && env.trim() ? env.trim() : join(homedir(), '.dsh')
}

export function dataDir() {
  return join(dshHome(), 'dsh-rvc')
}

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true })
  return dir
}

export function workDir() {
  return ensureDir(join(dataDir(), 'work'))
}

export function outputDir() {
  return ensureDir(join(dataDir(), 'outputs'))
}

export function settingsFile() {
  return join(dataDir(), 'settings.json')
}

export function bundledFfmpeg() {
  return join(PACKAGE_ROOT, 'bin', 'ffmpeg.exe')
}
