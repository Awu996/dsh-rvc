import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { OutputStore } from './outputs.js'
import { PACKAGE_ROOT } from './paths.js'
import { Converter } from './pipeline.js'
import { applyQqVoice } from './qq/host.js'
import { API_BASE, createRoutes } from './routes.js'
import { SettingsStore } from './settings.js'
import { mountTools } from './tools.js'
import { errorMessage } from './util.js'

export const name = 'dsh-rvc'

const VERSION = (() => {
  try {
    return String(JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')).version || '')
  } catch {
    return ''
  }
})()

function makeLogger(ctx) {
  const call = (level, msg) => {
    try {
      const base = ctx.logger
      if (base && typeof base[level] === 'function') base[level](msg)
    } catch {}
  }
  return {
    info: (m) => call('info', m),
    warn: (m) => call('warn', m),
    error: (m) => call('error', m),
    debug: (m) => call('debug', m),
  }
}

function service(converter, outputs) {
  return Object.freeze({
    version: VERSION,
    status: () => converter.status(),
    convert: (input, opts = {}) => converter.convert(input, { rvc: opts.rvc }),
    toWav: (input) => converter.convert(input, { rvc: false }),
    release: (idOrPath) => outputs.release(String(idOrPath || '')),
  })
}

export function apply(ctx) {
  const logger = makeLogger(ctx)
  const settings = new SettingsStore(logger)
  const outputs = new OutputStore(settings, logger)
  const converter = new Converter(settings, outputs, logger)

  ctx.effect(() => {
    outputs.start()
    return () => outputs.stop()
  }, 'dsh-rvc outputs')

  let unmountTools = null
  const mountWithTools = () => {
    if (unmountTools) {
      try {
        unmountTools()
      } catch {}
      unmountTools = null
    }
    let tools
    try {
      tools = ctx.get('tools')
    } catch {}
    if (!tools || typeof tools.register !== 'function') {
      logger.warn('dsh-rvc：这个 DSH 没有 tools 服务，大肥鱼用不了 rvc_convert')
      return
    }
    try {
      unmountTools = ctx.effect(() => mountTools(tools, converter, settings, logger), 'dsh-rvc tools')
    } catch (err) {
      logger.warn(`dsh-rvc：工具没挂上：${errorMessage(err)}`)
    }
  }
  if (typeof ctx.inject === 'function') ctx.inject(['tools'], () => mountWithTools())
  else mountWithTools()

  try {
    ctx.provide('rvc', service(converter, outputs))
  } catch (err) {
    logger.warn(`dsh-rvc：给其它插件用的 rvc 服务没挂上：${errorMessage(err)}`)
  }

  if (typeof ctx.inject === 'function') {
    const handler = createRoutes({ settings, converter, version: VERSION, logger })
    let unregister = null
    ctx.inject(['webServer'], (sub) => {
      if (unregister) {
        try {
          unregister()
        } catch {}
        unregister = null
      }
      try {
        unregister = ctx.effect(() => sub.webServer.register({ kind: 'prefix', path: API_BASE, handler }), 'dsh-rvc routes')
      } catch (err) {
        logger.warn(`dsh-rvc：设置页接口没挂上：${errorMessage(err)}`)
      }
    })
  }

  try {
    applyQqVoice(ctx, logger, VERSION)
  } catch (err) {
    logger.warn(`dsh-rvc：QQ语音桥没加载上，RVC变声不受影响：${errorMessage(err)}`)
  }

  logger.info(`dsh-rvc（RVC变声）${VERSION} 已加载`)
}
