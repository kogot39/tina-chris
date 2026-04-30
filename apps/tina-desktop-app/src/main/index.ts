import path, { join } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import {
  BrowserWindow,
  Menu,
  Tray,
  app,
  dialog,
  ipcMain,
  net,
  protocol,
  screen,
} from 'electron'
import { is } from '@electron-toolkit/utils'
import {
  DEFAULT_MODEL_ENTRY,
  MODEL_PROTOCOL,
  MODEL_STORAGE_DIR,
  deleteCustomModel,
  ensureModelStoreInitialized,
  getActiveModel,
  importModelFromFile,
  listStoredModels,
  resetToDefaultModel,
  resolveModelFileFromProtocolRequest,
  setActiveModel,
} from '@tina-chris/live2d-model/model-storage'
import {
  AgentLoop,
  ChannelManager,
  LLMManager,
  STTManager,
  TTSManager,
  createTTSVoiceCloneByKey,
  deleteTTSVoiceCloneByKey,
  getAvailableChannels,
  getAvailableLLMs,
  getAvailableSTTs,
  getAvailableTTSs,
  getAvailableToolProviders,
  getAvailableToolTypes,
  getChannelConfigFormByKey,
  getLLMConfigFormByKey,
  getSTTConfigFormByKey,
  getTTSConfigFormByKey,
  getTTSVoiceCloneFormByKey,
  getToolConfigFormByKey,
  isSupportedChannelProvider,
  isSupportedToolProvider,
  isSupportedToolType,
  listTTSVoiceClonesByKey,
  loadConfig,
  saveConfig,
  syncWorkspacePromptFiles,
} from '@tina-chris/tina-server'
import {
  ConnectionEndMessage,
  ConnectionStartMessage,
  InboundMessage,
  MessageBus,
} from '@tina-chris/tina-bus'
import { getRootFilePath } from '@tina-chris/tina-util'

import type { OutboundMessage } from '@tina-chris/tina-bus'

// Electron main 入口在当前包的 type=module 下会以 ESM 运行。
// 打包配置调整后不能再依赖 CommonJS 注入的 __dirname，因此这里显式从 import.meta.url 还原。
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 注册自定义协议，确保其具有适当的权限以支持安全的资源加载
protocol.registerSchemesAsPrivileged([
  {
    scheme: MODEL_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

let tray: Tray | null = null
// 加载运行时配置对象，初始化总线和各个管理器实例
const runtimeConfig = loadConfig()
const messageBus = new MessageBus()
const sttManager = new STTManager(runtimeConfig, messageBus)
const ttsManager = new TTSManager(runtimeConfig, messageBus)
const channelManager = new ChannelManager(runtimeConfig, messageBus)
const llmManager = new LLMManager(runtimeConfig)
const agentLoop = new AgentLoop(runtimeConfig, messageBus, llmManager)
// 简单判定并转换配置对象为纯数据结构
const toPlainObject = (value: unknown): Record<string, unknown> | undefined => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined
  }

  return value as Record<string, unknown>
}

// IPC 透传时统一深拷贝为可序列化对象，避免 class 实例和运行时引用泄漏到渲染进程。
const cloneSerializable = <T>(value: T): T => {
  return JSON.parse(JSON.stringify(value)) as T
}

// 从配置中获取指定提供商的配置项值
const getSttConfigByProvider = (
  providerKey: string
): Record<string, unknown> | null => {
  const sttGroup = toPlainObject(runtimeConfig.stt)
  if (!sttGroup) return null

  const providerConfig = toPlainObject(sttGroup[providerKey])
  if (!providerConfig) return null

  return Object.fromEntries(Object.entries(providerConfig))
}

const getTtsConfigByProvider = (
  providerKey: string
): Record<string, unknown> | null => {
  const ttsGroup = toPlainObject(runtimeConfig.tts)
  if (!ttsGroup) return null

  const providerConfig = toPlainObject(ttsGroup[providerKey])
  if (!providerConfig) return null

  return Object.fromEntries(Object.entries(providerConfig))
}

const getLlmConfigByProvider = (
  providerKey: string
): Record<string, unknown> | null => {
  const llmGroup = toPlainObject(runtimeConfig.llm)
  if (!llmGroup) return null

  const providerConfig = toPlainObject(llmGroup[providerKey])
  if (!providerConfig) return null

  return Object.fromEntries(Object.entries(providerConfig))
}

// 从配置中获取指定聊天通道提供商的配置项值
const getChannelConfigByProvider = (
  providerKey: string
): Record<string, unknown> | null => {
  const channelGroup = toPlainObject(runtimeConfig.channels)
  if (!channelGroup) return null

  const providerConfig = toPlainObject(channelGroup[providerKey])
  if (!providerConfig) return null

  return Object.fromEntries(Object.entries(providerConfig))
}

// 代理设置作为普通数据返回，而不是类实例
// renderer 端将此对象视为固定表单的可编辑源
const getAgentConfig = () => {
  return cloneSerializable(runtimeConfig.agent)
}

// 从配置中获取指定工具的指定工具类型的提供商的配置项值
const getToolConfigByProvider = (
  toolType: string,
  providerKey: string
): Record<string, unknown> | null => {
  const toolsGroup = toPlainObject(runtimeConfig.tools)
  if (!toolsGroup) return null

  const toolGroup = toPlainObject(toolsGroup[toolType])
  if (!toolGroup) return null

  const providerConfig = toPlainObject(toolGroup[providerKey])
  if (!providerConfig) return null

  return Object.fromEntries(Object.entries(providerConfig))
}
// 从配置中获取指定工具类型的当前提供商
const getCurrentToolProvider = (toolType: string): string => {
  const toolsGroup = toPlainObject(runtimeConfig.tools)
  const toolGroup = toolsGroup ? toPlainObject(toolsGroup[toolType]) : undefined
  const current = toolGroup?.current
  return typeof current === 'string' ? current : ''
}

function createWindow(): void {
  const { width, height, x, y } = screen.getPrimaryDisplay().bounds
  const faviconPath = path.join(__dirname, '../../public/favicon.ico')

  const mainWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    autoHideMenuBar: true,
    focusable: false,
    movable: false,
    skipTaskbar: true,
    hasShadow: false,
    // 避免视频停止播放
    type: 'toolbar',
    icon: faviconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      webSecurity: false,
    },
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    // 开发环境下加载 Vite 服务器地址，支持热更新，并打开开发者工具以便调试
    mainWindow.webContents.openDevTools()
    mainWindow.loadURL(
      `${process.env['ELECTRON_RENDERER_URL']}/main/index.html`
    )
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/main/index.html'))
  }

  mainWindow.setIgnoreMouseEvents(true, { forward: true })
  mainWindow.setAlwaysOnTop(true, 'floating')

  mainWindow.once('ready-to-show', () => {
    mainWindow.showInactive()
  })

  // 创建系统托盘图标并设置菜单
  tray = new Tray(faviconPath)
  tray.setToolTip('Tina Desktop')

  let settingWindow: BrowserWindow | null = null

  // 配置设置窗口
  const openSettingWindow = (): boolean => {
    // 打开设置前主窗口应该关闭正在活跃的状态，并且设置窗口打开后主窗口应该完全不响应鼠标事件
    mainWindow.setIgnoreMouseEvents(true, { forward: false })
    if (settingWindow) {
      if (settingWindow.isMinimized()) {
        settingWindow.restore()
      }
      settingWindow.show()
      settingWindow.focus()
      return true
    }

    settingWindow = new BrowserWindow({
      width: 720,
      height: 540,
      show: false,
      frame: false,
      autoHideMenuBar: true,
      resizable: false,
      movable: true,
      icon: faviconPath,
      webPreferences: {
        preload: join(__dirname, '../preload/index.cjs'),
        webSecurity: false,
      },
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      // 开发环境下加载 Vite 服务器地址，支持热更新，并打开开发者工具以便调试
      settingWindow.webContents.openDevTools()
      settingWindow.loadURL(
        `${process.env['ELECTRON_RENDERER_URL']}/setting/index.html`
      )
    } else {
      settingWindow.loadFile(join(__dirname, '../renderer/setting/index.html'))
    }

    settingWindow.once('ready-to-show', () => {
      settingWindow?.show()
    })

    // 注册关闭事件，确保设置窗口关闭时能够正确清理资源并允许主窗口重新接收鼠标事件
    settingWindow.on('closed', () => {
      mainWindow.setIgnoreMouseEvents(true, { forward: true })
      // 设置窗口关闭后通知主窗口，以便它可以执行必要的状态重置或资源清理
      mainWindow.webContents.send('window:setting-closed')

      settingWindow = null
    })

    return true
  }
  // 系统托盘菜单项，提供打开设置窗口和退出应用的功能
  const trayMenu = Menu.buildFromTemplate([
    {
      label: '打开设置',
      click: () => {
        openSettingWindow()
      },
    },
    {
      label: '退出',
      click: () => {
        app.quit()
      },
    },
  ])

  tray.setContextMenu(trayMenu)

  // 加载live2d模型相关配置
  const modelRootDir = getRootFilePath(MODEL_STORAGE_DIR)

  const emitActiveModelChanged = async () => {
    try {
      const active = await getActiveModel(modelRootDir)
      // 同时通知主窗口和设置窗口（如果存在）激活模型发生变化，以便它们可以同步更新显示
      mainWindow.webContents.send('model:active-changed', active)
      settingWindow?.webContents.send('model:active-changed', active)
    } catch (error) {
      console.error('Failed to emit active model changed event:', error)
    }
  }

  protocol.handle(MODEL_PROTOCOL, async (request) => {
    const filePath = resolveModelFileFromProtocolRequest(
      modelRootDir,
      request.url
    )

    if (!filePath) {
      return new Response('Model file not found', { status: 404 })
    }

    // 使用 Electron 的 net 模块来处理请求，以确保它具有正确的权限和上下文
    return net.fetch(pathToFileURL(filePath).toString())
  })

  ipcMain.handle('model:list', async () => {
    return listStoredModels(modelRootDir)
  })

  ipcMain.handle('model:get-active', async () => {
    return getActiveModel(modelRootDir)
  })

  ipcMain.handle('model:set-active', async (_event, modelId: string) => {
    const active = await setActiveModel(modelRootDir, modelId)
    await emitActiveModelChanged()
    return active
  })

  // 导入模型文件并设置为激活模型
  ipcMain.handle('model:import', async () => {
    const selected = await dialog.showOpenDialog({
      properties: ['openFile'],
      // 控制文件类型选择，不支持model3以下的模型
      filters: [
        {
          name: 'Live2D Model JSON',
          extensions: ['model3.json'],
        },
      ],
    })

    if (selected.canceled || selected.filePaths.length === 0) {
      return null
    }

    // 导入文件到.model目录，并获取模型信息
    const imported = await importModelFromFile({
      modelRootDir,
      modelJsonPath: selected.filePaths[0],
    })

    // 将导入的模型设置为当前激活模型，并通知窗口更新显示
    const active = await setActiveModel(modelRootDir, imported.id)
    await emitActiveModelChanged()
    return active
  })

  ipcMain.handle('model:delete', async (_event, modelId: string) => {
    const active = await deleteCustomModel(modelRootDir, modelId)
    await emitActiveModelChanged()
    return active
  })

  // 重置为默认模型，没啥大用
  ipcMain.handle('model:reset-default', async () => {
    const active = await resetToDefaultModel(modelRootDir)
    await emitActiveModelChanged()
    return active
  })

  ipcMain.handle('window:set-click-through', (_e, enabled: boolean) => {
    if (!mainWindow) return false
    mainWindow.setFocusable(!enabled)
    mainWindow.setIgnoreMouseEvents(enabled, { forward: true })
    return true
  })

  // 窗口相关的 IPC 处理器
  ipcMain.handle('window:set-always-on-top', (_e, enabled: boolean) => {
    if (!mainWindow) return false
    mainWindow.setAlwaysOnTop(enabled, 'floating')
    return true
  })

  ipcMain.handle('window:open-setting', () => {
    return openSettingWindow()
  })

  ipcMain.handle('window:close-setting', () => {
    if (settingWindow) {
      settingWindow.close()
    }
  })

  ipcMain.handle('window:minimize-setting', () => {
    if (settingWindow) {
      settingWindow.minimize()
    }
  })

  // bus: 订阅消息
  messageBus.subscribeOutbound('desktop', async (message: OutboundMessage) => {
    // 将总线中的消息通过 IPC 发送到主窗口，供前端展示或处理
    mainWindow.webContents.send('bus:outbound-message', message)
  })

  // bus: 向内部发布消息

  // 发送开始消息，通知 STT 管理器开始语音识别
  ipcMain.handle('bus:send-inbound-start', async () => {
    messageBus.publishInbound(
      new ConnectionStartMessage({
        channel: 'desktop',
        chatId: 'default',
        senderId: 'user',
        sendTo: 'stt-manager',
      })
    )
  })
  // 发送音频消息，包含用户的语音数据，供 STT 管理器进行识别
  ipcMain.handle(
    'bus:send-inbound-audio',
    async (_event, audio: ArrayBuffer) => {
      messageBus.publishInbound(
        new InboundMessage({
          channel: 'desktop',
          chatId: 'default',
          senderId: 'user',
          sendTo: 'stt-manager',
          type: 'audio',
          media: audio,
        })
      )
    }
  )
  // 发送结束消息，通知 STT 管理器结束语音识别
  ipcMain.handle('bus:send-inbound-end', async () => {
    messageBus.publishInbound(
      new ConnectionEndMessage({
        channel: 'desktop',
        chatId: 'default',
        senderId: 'user',
        sendTo: 'stt-manager',
      })
    )
  })
  // 发送文本消息，包含用户输入的文本内容，供 AgentLoop 或其他组件处理
  ipcMain.handle('bus:send-inbound-text', async (_event, content: string) => {
    const nextContent = typeof content === 'string' ? content.trim() : ''
    if (!nextContent) {
      return false
    }

    messageBus.publishInbound(
      new InboundMessage({
        channel: 'desktop',
        chatId: 'default',
        senderId: 'user',
        sendTo: 'agent',
        type: 'text',
        content: nextContent,
      })
    )
    return true
  })

  // Tool 相关的 IPC 处理器

  // 获取可用的工具类型列表，供前端展示和选择
  ipcMain.handle('tool:list-types', async () => {
    return getAvailableToolTypes()
  })
  // 获取指定工具类型的可用提供商列表，供前端展示和选择
  ipcMain.handle('tool:list-providers', async (_event, toolType: string) => {
    if (!isSupportedToolType(toolType)) {
      throw new Error(`Unsupported tool type: ${toolType}`)
    }

    return getAvailableToolProviders(toolType)
  })
  // 获取指定工具类型的当前提供商，供前端展示当前使用的工具提供商
  ipcMain.handle(
    'tool:get-current-provider',
    async (_event, toolType: string) => {
      if (!isSupportedToolType(toolType)) {
        throw new Error(`Unsupported tool type: ${toolType}`)
      }

      return getCurrentToolProvider(toolType)
    }
  )
  // 获取指定工具类型和提供商的配置表单结构，供前端动态生成配置界面
  ipcMain.handle(
    'tool:get-config-form',
    async (_event, toolType: string, providerKey: string) => {
      const schema = getToolConfigFormByKey(toolType, providerKey)
      if (!schema) {
        throw new Error(`Unsupported tool provider: ${toolType}/${providerKey}`)
      }

      return schema
    }
  )
  // 获取指定工具类型和提供商的当前配置项值，供前端在配置界面中显示当前配置值
  ipcMain.handle(
    'tool:get-current-config',
    async (_event, toolType: string, providerKey: string) => {
      if (!isSupportedToolProvider(toolType, providerKey)) {
        throw new Error(`Unsupported tool provider: ${toolType}/${providerKey}`)
      }

      return getToolConfigByProvider(toolType, providerKey)
    }
  )
  // 保存指定工具类型和提供商的配置项值，并应用新的配置
  ipcMain.handle(
    'tool:save-config',
    async (
      _event,
      toolType: string,
      providerKey: string,
      values: Record<string, unknown>
    ) => {
      // 检查工具类型和提供商是否合法，确保前端传入的参数有效且受支持
      if (!isSupportedToolProvider(toolType, providerKey)) {
        throw new Error(`Unsupported tool provider: ${toolType}/${providerKey}`)
      }
      // 将新的配置项值更新到运行时配置中，并持久化保存
      runtimeConfig.updateToolConfig(toolType, providerKey, values)
      saveConfig(runtimeConfig)
      // 工具配置可能会影响 AgentLoop 的行为，保存配置后立即重新初始化 AgentLoop，让新的工具配置重新注册。
      agentLoop.initialize()

      return {
        current: getCurrentToolProvider(toolType),
      }
    }
  )

  // 聊天通道相关的 IPC 处理器

  // 获取可用的聊天通道提供商列表。
  // Channel 是多开模型，因此这里直接携带每个 provider 的启用和连接状态，不再返回 current。
  ipcMain.handle('channel:list-providers', async () => {
    return getAvailableChannels(runtimeConfig, channelManager)
  })
  // 获取指定聊天通道的配置表单结构，供设置页动态渲染。
  ipcMain.handle(
    'channel:get-config-form',
    async (_event, providerKey: string) => {
      const schema = getChannelConfigFormByKey(providerKey)
      if (!schema) {
        throw new Error(`Unsupported channel provider: ${providerKey}`)
      }

      return schema
    }
  )
  // 获取指定聊天通道的当前配置项值。
  ipcMain.handle(
    'channel:get-current-config',
    async (_event, providerKey: string) => {
      return getChannelConfigByProvider(providerKey)
    }
  )
  // 保存通道配置只更新对应 provider 的配置。
  // 如果该 provider 已启用，则立即重启连接；未启用时只持久化配置，等待卡片开关开启。
  ipcMain.handle(
    'channel:save-config',
    async (_event, providerKey: string, values: Record<string, unknown>) => {
      if (!isSupportedChannelProvider(providerKey)) {
        throw new Error(`Unsupported channel provider: ${providerKey}`)
      }

      runtimeConfig.updateChannelConfig(providerKey, values)
      saveConfig(runtimeConfig)
      const providerConfig = runtimeConfig.getChannelConfig(providerKey)
      const status = providerConfig?.enabled
        ? await channelManager.restartChannel(providerKey)
        : channelManager.getStatus(providerKey)

      return {
        providerKey,
        status,
      }
    }
  )
  // 卡片开关控制 channel 的启用状态：先持久化用户选择，再尝试建立或关闭连接。
  // 即使连接失败，enabled 仍然保留为用户刚才选择的值，方便用户修改凭证后刷新重连。
  ipcMain.handle(
    'channel:set-enabled',
    async (_event, providerKey: string, enabled: boolean) => {
      if (!isSupportedChannelProvider(providerKey)) {
        throw new Error(`Unsupported channel provider: ${providerKey}`)
      }

      runtimeConfig.updateChannelConfig(providerKey, { enabled })
      saveConfig(runtimeConfig)
      const status = await channelManager.setChannelEnabled(
        providerKey,
        enabled
      )

      return {
        providerKey,
        enabled,
        status,
      }
    }
  )
  // 设置页读取单个 provider 的连接状态，用于配置页底部展示和手动刷新。
  ipcMain.handle('channel:get-status', async (_event, providerKey: string) => {
    if (!isSupportedChannelProvider(providerKey)) {
      throw new Error(`Unsupported channel provider: ${providerKey}`)
    }

    return channelManager.getStatus(providerKey)
  })
  ipcMain.handle('channel:start', async (_event, providerKey?: string) => {
    if (providerKey && !isSupportedChannelProvider(providerKey)) {
      throw new Error(`Unsupported channel provider: ${providerKey}`)
    }

    return channelManager.startChannel(providerKey)
  })
  ipcMain.handle('channel:stop', async (_event, providerKey?: string) => {
    if (providerKey && !isSupportedChannelProvider(providerKey)) {
      throw new Error(`Unsupported channel provider: ${providerKey}`)
    }

    return channelManager.stopChannel(providerKey)
  })

  // 语音识别相关的 IPC 处理器

  // 获取可用的语音识别提供商列表
  ipcMain.handle('stt:list-providers', async () => {
    return getAvailableSTTs()
  })
  // 获取当前选定的语音识别提供商
  ipcMain.handle('stt:get-current-provider', async () => {
    return runtimeConfig.stt.current || ''
  })
  // 获取指定语音识别提供商的配置表单结构，以便前端动态生成配置界面
  ipcMain.handle('stt:get-config-form', async (_event, providerKey: string) => {
    const schema = getSTTConfigFormByKey(providerKey)
    if (!schema) {
      throw new Error(`Unsupported STT provider: ${providerKey}`)
    }

    return schema
  })
  // 获取指定语音识别提供商的当前配置项值，以便前端在配置界面中显示当前设置
  ipcMain.handle(
    'stt:get-current-config',
    async (_event, providerKey: string) => {
      return getSttConfigByProvider(providerKey)
    }
  )
  // 保存指定语音识别提供商的配置项值，并应用新的配置
  ipcMain.handle(
    'stt:save-config',
    async (_event, providerKey: string, values: Record<string, unknown>) => {
      // 首先获取配置表单结构，确保提供商合法且支持配置
      const schema = getSTTConfigFormByKey(providerKey)
      if (!schema) {
        throw new Error(`Unsupported STT provider: ${providerKey}`)
      }
      // 将新的配置项值更新到运行时配置中，并持久化保存
      runtimeConfig.updateConfig('stt', providerKey, values)
      saveConfig(runtimeConfig)
      // 这里的更新策略是将当前的所有会话关闭，下次接收到音频消息时会根据新的配置重新实例化 STT 供应平台实例，以确保新配置生效
      await sttManager.shutdown()

      // 返回更新后的当前配置项值，前端可以根据这个返回值来更新显示
      return {
        current: runtimeConfig.stt.current || '',
      }
    }
  )

  // TTS 相关的 IPC 处理器，基本和 STT 的处理器类似

  // 获取可用的文本转语音提供商列表
  ipcMain.handle('tts:list-providers', async () => {
    return getAvailableTTSs()
  })
  // 获取当前选定的文本转语音提供商
  ipcMain.handle('tts:get-current-provider', async () => {
    return runtimeConfig.tts.current || ''
  })
  // 获取指定文本转语音提供商的配置表单结构，以便前端动态生成配置界面
  ipcMain.handle('tts:get-config-form', async (_event, providerKey: string) => {
    const schema = getTTSConfigFormByKey(providerKey)
    if (!schema) {
      throw new Error(`Unsupported TTS provider: ${providerKey}`)
    }

    return schema
  })
  // 获取指定文本转语音提供商的当前配置项值，以便前端在配置界面中显示当前设置
  ipcMain.handle(
    'tts:get-current-config',
    async (_event, providerKey: string) => {
      return getTtsConfigByProvider(providerKey)
    }
  )
  // 保存指定文本转语音提供商的配置项值，并应用新的配置
  ipcMain.handle(
    'tts:save-config',
    async (_event, providerKey: string, values: Record<string, unknown>) => {
      const schema = getTTSConfigFormByKey(providerKey)
      if (!schema) {
        throw new Error(`Unsupported TTS provider: ${providerKey}`)
      }
      // 将新的配置项值更新到运行时配置中，并持久化保存
      runtimeConfig.updateConfig('tts', providerKey, values)
      saveConfig(runtimeConfig)
      await ttsManager.shutdown()

      return {
        current: runtimeConfig.tts.current || '',
      }
    }
  )
  // TTS 声音克隆相关的 IPC 处理器，与 STT 配置不同点，部分 TTS 支持声音克隆功能，相关的配置项需要通过独立的 IPC 接口来处理，以保持配置体系的清晰和职责分离

  // 获取指定 TTS 提供商的声音克隆配置表单结构，以便前端动态生成配置界面
  ipcMain.handle(
    'tts:get-voice-clone-form',
    async (_event, providerKey: string) => {
      // 检查是否支持声音克隆功能，如果不支持则抛出错误，前端可以根据这个错误来决定是否展示声音克隆相关的配置项
      const schema = getTTSVoiceCloneFormByKey(providerKey)
      if (!schema) {
        throw new Error(
          `TTS provider does not support voice clone: ${providerKey}`
        )
      }

      return schema
    }
  )
  // 创建声音克隆，接收前端传入的配置项值，调用 Tina Server 中的 createTTSVoiceCloneByKey 方法来创建声音克隆，并返回创建结果
  ipcMain.handle(
    'tts:create-voice-clone',
    async (_event, providerKey: string, values: Record<string, unknown>) => {
      return createTTSVoiceCloneByKey(
        providerKey,
        getTtsConfigByProvider(providerKey),
        values
      )
    }
  )
  // 列出声音克隆，获取指定 TTS 提供商的声音克隆出的音色列表，供前端展示和管理
  ipcMain.handle(
    'tts:list-voice-clones',
    async (_event, providerKey: string) => {
      return listTTSVoiceClonesByKey(
        providerKey,
        getTtsConfigByProvider(providerKey)
      )
    }
  )
  // 删除某个音色
  ipcMain.handle(
    'tts:delete-voice-clone',
    async (_event, providerKey: string, voice: string) => {
      await deleteTTSVoiceCloneByKey(
        providerKey,
        getTtsConfigByProvider(providerKey),
        voice
      )

      return true
    }
  )

  // LLM 相关的 IPC 处理器

  // 获取可用的大语言模型提供商列表
  ipcMain.handle('llm:list-providers', async () => {
    return getAvailableLLMs()
  })
  // 获取当前选定的大语言模型提供商
  ipcMain.handle('llm:get-current-provider', async () => {
    return runtimeConfig.llm.current || ''
  })
  // 获取指定大语言模型提供商的配置表单结构，以便前端动态生成配置界面
  ipcMain.handle('llm:get-config-form', async (_event, providerKey: string) => {
    const schema = getLLMConfigFormByKey(providerKey)
    if (!schema) {
      throw new Error(`Unsupported LLM provider: ${providerKey}`)
    }

    return schema
  })
  // 获取指定大语言模型提供商的当前配置项值，以便前端在配置界面中显示当前设置
  ipcMain.handle(
    'llm:get-current-config',
    async (_event, providerKey: string) => {
      return getLlmConfigByProvider(providerKey)
    }
  )
  // 保存指定大语言模型提供商的配置项值，并应用新的配置
  ipcMain.handle(
    'llm:save-config',
    async (_event, providerKey: string, values: Record<string, unknown>) => {
      const schema = getLLMConfigFormByKey(providerKey)
      if (!schema) {
        throw new Error(`Unsupported LLM provider: ${providerKey}`)
      }

      runtimeConfig.updateConfig('llm', providerKey, values)
      saveConfig(runtimeConfig)
      // 重置 LLM 管理器内的 LLM 接口实例，让新的配置生效
      llmManager.reset()

      return {
        current: runtimeConfig.llm.current || '',
      }
    }
  )

  // Agent 配置页使用固定表单，不走 provider/dynamic form 体系。
  ipcMain.handle('agent:get-config', async () => {
    return getAgentConfig()
  })
  // 保存 Agent 配置项值，并应用新的配置
  ipcMain.handle(
    'agent:save-config',
    async (_event, values: Record<string, unknown>) => {
      runtimeConfig.updateConfig('agent', '', values)
      saveConfig(runtimeConfig)

      // 保存配置后立即同步 workspace 中的提示词产物，
      // 让后续 AgentLoop 只需要读取 markdown 文件即可构建上下文。
      const { workspacePath } = syncWorkspacePromptFiles(runtimeConfig.agent)
      // Agent settings 可以更改工作区、运行时参数、提示文件，以及会话位置。文件写入后重新初始化，以便下次使用
      agentLoop.initialize()

      return {
        agent: getAgentConfig(),
        workspacePath,
      }
    }
  )
}

app.whenReady().then(async () => {
  // 启动消息总线分发循环
  messageBus.dispatchInbound()
  messageBus.dispatchOutbound()
  // 聊天通道是远程入口，应用启动后按配置自动拉起所有已启用的 channel。
  // 如果没有启用任何 provider，ChannelManager 会直接返回空结果，不会产生外部连接。
  channelManager.startChannel().catch((error) => {
    console.error('Failed to start channel manager:', error)
  })

  // 启动应用前，初始化模型存储目录，将 public 中的默认模型复制到模型存储目录
  // 确保应用有一个可用的默认模型，并且用户的自定义模型能够被正确管理和访问
  const modelRootDir = getRootFilePath(MODEL_STORAGE_DIR)
  const defaultModelSourceDir = join(
    app.getAppPath(),
    'public',
    'hiyori_free_t08'
  )

  try {
    await ensureModelStoreInitialized({
      modelRootDir,
      defaultModelSourceDir,
      defaultModelEntry: DEFAULT_MODEL_ENTRY,
    })
  } catch (error) {
    console.error('Failed to initialize model store:', error)
  }

  createWindow()
})
// 在应用退出前确保 STT、TTS 和聊天通道管理器能够正确关闭所有会话并清理资源
app.on('before-quit', () => {
  // 停止消息总线的分发循环，确保在应用退出过程中不会有新的消息被处理，避免潜在的资源竞争和状态不一致问题
  messageBus.stopInboundDispatch()
  messageBus.stopOutboundDispatch()

  sttManager.shutdown().catch(() => undefined)
  ttsManager.shutdown().catch(() => undefined)
  channelManager.shutdown().catch(() => undefined)
})
