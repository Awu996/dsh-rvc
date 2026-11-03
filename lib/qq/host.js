import { ChatResolver } from './chat.js'
import { VoiceFiles } from './files.js'
import { NapCat } from './napcat.js'
import { API_BASE, createRoutes } from './routes.js'
import { SettingsStore } from './settings.js'
import { mountTools } from './tools.js'
import { errorMessage } from './util.js'

export function applyQqVoice(ctx, logger, version) {
  const settings = new SettingsStore(logger)
  const napcat = new NapCat(settings, logger)
  const resolver = new ChatResolver(napcat, settings)
  const files = new VoiceFiles(logger)
  const deps = { settings, napcat, resolver, logger }

  ctx.effect(() => {
    files.start()
    return () => {
      files.stop()
      resolver.dispose()
      napcat.dispose()
    }
  }, 'dsh-rvc qq-voice runtime')

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
      logger.warn('dsh-rvc：这个 DSH 没有 tools 服务，agent 用不了 qqvoice_get / qqvoice_send')
      return
    }
    try {
      unmountTools = ctx.effect(() => mountTools(tools, deps), 'dsh-rvc qq-voice tools')
    } catch (err) {
      logger.warn(`dsh-rvc：QQ语音桥的工具没挂上：${errorMessage(err)}`)
    }
  }
  if (typeof ctx.inject === 'function') ctx.inject(['tools'], () => mountWithTools())
  else mountWithTools()

  if (typeof ctx.inject === 'function') {
    const handler = createRoutes({ settings, napcat, resolver, version, logger })
    let unregister = null
    ctx.inject(['webServer'], (sub) => {
      if (unregister) {
        try {
          unregister()
        } catch {}
        unregister = null
      }
      try {
        unregister = ctx.effect(() => sub.webServer.register({ kind: 'prefix', path: API_BASE, handler }), 'dsh-rvc qq-voice routes')
      } catch (err) {
        logger.warn(`dsh-rvc：QQ语音桥的设置页接口没挂上：${errorMessage(err)}`)
      }
    })
  }
}
