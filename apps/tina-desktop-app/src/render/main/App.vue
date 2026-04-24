<template>
  <main
    ref="windowRef"
    style="width: 100%; height: 100%; position: relative; overflow: hidden"
  >
    <WinLayout
      :direction="place"
      :init-width="initWidth"
      :init-height="initHeight"
      @resize-start-callback="onResizeStart"
      @resizing-callback="resizeModel"
      @resize-end-callback="onResizeEnd"
      @through-chat-area="throughChatArea"
      @through-model-area="throughModelArea"
    >
      <template #chat>
        <ChatLayout
          v-if="showChat"
          :messages="messages"
          @send-message="sendMessage"
          @focus-change="onChatInputFocusChange"
          @composing-change="onChatInputComposingChange"
        />
      </template>
      <template #model="{ isResizing }">
        <ModelLayout :direction="place" :is-active="isResizing">
          <Model
            :model-src="modelUrl"
            :width="modelWidth"
            :height="modelHeight"
            :scale="1"
            :need-transparent-on-hover="canModelThrough"
          />
          <template #icon-btn="prop">
            <IconButtonsJoin
              ref="iconButtonsRef"
              :need-reverse="prop.needReverse"
            >
              <IconButton
                tooltip="录音"
                :need-active-color="true"
                @after-active="handleStartRecording"
                @after-deactive="handleStopRecording"
              >
                <iconpark-icon name="voice" />
              </IconButton>
              <IconButton
                v-if="place === 'right'"
                tooltip="靠左"
                :need-active-color="false"
                @click="togglePlace"
              >
                <iconpark-icon name="alignment-left-bottom" />
              </IconButton>
              <IconButton
                v-else
                tooltip="靠右"
                :need-active-color="false"
                @click="togglePlace"
              >
                <iconpark-icon name="alignment-right-bottom"
              /></IconButton>
              <IconButton
                :tooltip="canModelThrough ? '不可穿透' : '可穿透'"
                @after-active="disableModelThrough"
                @after-deactive="enableModelThrough"
              >
                <iconpark-icon name="send-to-back" />
              </IconButton>
              <IconButton
                tooltip="聊天记录"
                @after-active="showChatPanel"
                @after-deactive="hideChatPanel"
              >
                <iconpark-icon name="message"
              /></IconButton>
            </IconButtonsJoin>
          </template>
          <template #big-btn>
            <div ref="bigButtonRef" class="h-full w-full">
              <!-- <VoicePlayButton :is-playing="false" /> -->
              <!-- <VoiceRecordButton :wave="waveformData" /> -->
              <SettingButton @click="openSettings" />
            </div>
          </template>
        </ModelLayout>
      </template>
    </WinLayout>
  </main>
</template>

<script setup lang="ts">
import {
  inject,
  onMounted,
  onUnmounted,
  ref,
  useTemplateRef,
  watchEffect,
} from 'vue'
import {
  DEFAULT_MODEL_ENTRY,
  DEFAULT_MODEL_ID,
  Model,
  toModelProtocolUrl,
} from '@tina-chris/live2d-model'
import {
  ChatLayout,
  IconButton,
  IconButtonsJoin,
  ModelLayout,
  SettingButton,
  // VoicePlayButton,
  // VoiceRecordButton,
  WinLayout,
  useAudio,
  useDrawLoop,
  useMessage,
} from '@tina-chris/tina-ui'
import { useMouseInElement, useResizeObserver } from '@vueuse/core'

const toast: any = inject('toast')

// 先加载默认模型，后续在设置界面可以切换
const modelUrl = ref(toModelProtocolUrl(DEFAULT_MODEL_ID, DEFAULT_MODEL_ENTRY))

// 加载用户当前使用的模型
const loadActiveModel = async () => {
  try {
    const active = await window.electronAPI.getActiveModel()
    if (active?.url) {
      modelUrl.value = active.url
    }
  } catch (error) {
    console.error('Failed to load active model:', error)
    toast.error(
      'Failed to load active model on startup, using default model instead'
    )
  }
}

// 接收取消监听的函数，组件卸载时调用以避免内存泄漏
let offModelChanged: (() => void) | null = null
let offSettingWindowClosed: (() => void) | null = null
let offBusMessage: (() => void) | null = null

// 动态控制窗口大小
const initWidth = ref(0)
const initHeight = ref(0)
// 400 和 480 是初始预设值，后续会根据窗口大小动态调整
const modelWidth = ref(400)
const modelHeight = ref(480)
const windowRef = useTemplateRef<HTMLDivElement>('windowRef')
useResizeObserver(windowRef, (entries) => {
  const { width } = entries[0].contentRect
  // 初始宽度占0.2，高度为宽度的1.2倍
  initWidth.value = width * 0.2
  initHeight.value = initWidth.value * 1.2
})

const resizeModel = (width: number, height: number) => {
  modelWidth.value = width
  modelHeight.value = height
}
// 窗口缩放处理
const isResizingState = ref(false)

const onResizeStart = (width: number, height: number) => {
  isResizingState.value = true
  resizeModel(width, height)
}

const onResizeEnd = (width: number, height: number) => {
  isResizingState.value = false
  resizeModel(width, height)
}
// 鼠标穿透控制相关
const iconButtonsRef = useTemplateRef('iconButtonsRef')
const bigButtonRef = useTemplateRef<HTMLDivElement>('bigButtonRef')
const { isOutside: isIconButtonsOutside } = useMouseInElement(iconButtonsRef)
const { isOutside: isBigButtonOutside } = useMouseInElement(bigButtonRef)
// 控制防遮挡功能
const canModelThrough = ref(true)
// 控制聊天面板显示
const showChat = ref(false)
const isChatInputFocused = ref(false)
const isChatInputComposing = ref(false)

// 跟踪各大模块是否被鼠标悬停
const isHoveringChat = ref(false)
const isHoveringModel = ref(false)

const toggleClickThrough = (enable: boolean): void => {
  window.electronAPI.setClickThrough(enable)
}

// 集中解决鼠标穿透逻辑的冲突状态：只要有实体元素需要交互，都不允许穿透
watchEffect(() => {
  // 0. 如果处于缩放改变窗口大小的过程，强制不穿透避免卡顿
  if (isResizingState.value) {
    toggleClickThrough(false)
    return
  }
  // TODO: 目前聊天输入框的焦点和输入法状态会导致 IME 候选框定位异常，当前仍未解决
  // 1. 如果聊天输入框持有焦点或正在输入法组词，必须保持可聚焦状态，避免 IME 候选框定位异常。
  if (isChatInputFocused.value || isChatInputComposing.value) {
    toggleClickThrough(false)
    return
  }

  // 2. 如果展开了聊天区域且鼠标正悬停其上
  if (showChat.value && isHoveringChat.value) {
    toggleClickThrough(false)
    return
  }

  // 3. 如果鼠标正悬停在模型区里的任何按钮上（按钮区域始终要可交互，禁止穿透）
  const isHoveringButtons =
    !isIconButtonsOutside.value || !isBigButtonOutside.value
  if (isHoveringButtons) {
    toggleClickThrough(false)
    return
  }

  // 4. 如果开启了不穿透模式（canModelThrough 为 false），且正悬停在模型区上
  if (!canModelThrough.value && isHoveringModel.value) {
    toggleClickThrough(false)
    return
  }

  // default: 如果都没有，说明鼠标在模型外的透明背景上，允许点击穿透到下层桌面
  toggleClickThrough(true)
})
// 穿透的相关状态更新函数，供子组件在鼠标进入/离开时调用以更新状态
const throughChatArea = (isOutside: boolean): void => {
  isHoveringChat.value = !isOutside
}

const throughModelArea = (isOutside: boolean): void => {
  isHoveringModel.value = !isOutside
}

const onChatInputFocusChange = (focused: boolean): void => {
  isChatInputFocused.value = focused
}

const onChatInputComposingChange = (composing: boolean): void => {
  isChatInputComposing.value = composing
}

const enableModelThrough = (): void => {
  canModelThrough.value = true
}

const disableModelThrough = (): void => {
  canModelThrough.value = false
}

const showChatPanel = () => {
  showChat.value = true
}
const hideChatPanel = () => {
  showChat.value = false
}
// 模型位置控制（当前只能在左侧或右侧）
const place = ref<'left' | 'right'>('right')
const togglePlace = () => {
  place.value = place.value === 'right' ? 'left' : 'right'
}

const { drawLoop } = useDrawLoop() // 音频可视化绘制
const { messages, addMessage } = useMessage() // 消息管理
const { pushAudio, startRecording, stopRecording } = useAudio((chunck) => {
  // 接收到音频数据后，交给主线程发送到总线上

  // 将 Int16Array 转换为 ArrayBuffer
  const buffer = new ArrayBuffer(chunck.byteLength)
  new Int16Array(buffer).set(chunck)

  window.electronAPI.sendAudioInboundMessage(buffer)
})

const handleStartRecording = () => {
  // 通知 STT 开启连接
  window.electronAPI.sendAudioInboundMessageStart()
  // 开始录音时启动绘制循环，实时可视化音频波形
  startRecording(drawLoop)
}
const handleStopRecording = () => {
  stopRecording()
  // 通知 STT 结束连接
  window.electronAPI.sendAudioInboundMessageEnd()
}

// 发送文本消息的函数，供 ChatLayout 组件调用
const sendMessage = async (content: string) => {
  const nextContent = content.trim()
  if (!nextContent) {
    return
  }

  addMessage({
    id: crypto.randomUUID(),
    role: 'human',
    content: nextContent,
    timestamp: Date.now(),
  })

  try {
    await window.electronAPI.sendTextInboundMessage(nextContent)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '文本消息发送到 Agent 失败'
    toast.error?.(message)
  }
}

const openSettings = () => {
  window.electronAPI.openSettingWindow()
}

onMounted(() => {
  loadActiveModel().catch((error) => {
    console.error('Failed to initialize active model on mount', error)
    toast.error('Failed to load active model on startup')
  })
  // 订阅模型变更事件，拿到监听器的取消函数以便在组件卸载时取消监听
  offModelChanged = window.electronAPI.onActiveModelChanged((active) => {
    // 监听到模型变更事件，当设置界面执行更新时会收到通知触发回调更新模型 URL
    modelUrl.value = active.url
  })
  // 订阅设置窗口关闭事件
  offSettingWindowClosed = window.electronAPI.onSettingClosed(() => {})
  // 订阅总线中的消息，拿到取消函数以便在组件卸载时取消订阅
  offBusMessage = window.electronAPI.subscribeOutboundMessage((message) => {
    // 接收到总线中的消息，根据消息类型和发送者进行不同处理
    if (message.senderId === 'tts-manager' && message.type === 'audio') {
      const audioChunks = Array.isArray(message.media) ? message.media : []
      for (const chunk of audioChunks) {
        if (typeof chunk === 'string') {
          pushAudio(chunk)
        }
      }
      return
    }
    // 如果是错误消息，直接弹出错误提示
    if (message.type === 'error') {
      toast.error?.(message.content)
      return
    }

    // 流式回复会在 metadata.id 中携带统一消息 id，前端据此合并为同一条消息。
    const metadataId =
      typeof message.metadata?.id === 'string' ? message.metadata.id : ''
    const role =
      message.senderId === 'stt-manager' && message.type === 'text'
        ? 'human'
        : 'agent'

    addMessage({
      id: metadataId || crypto.randomUUID(),
      role,
      content: message.content,
      timestamp: Date.now(),
    })
  })
})

onUnmounted(() => {
  // 组件卸载时取消模型变更事件监听，避免内存泄漏
  offModelChanged?.()
  offModelChanged = null
  offSettingWindowClosed?.()
  offSettingWindowClosed = null
  offBusMessage?.()
  offBusMessage = null
})
</script>

<style>
html,
body,
#app {
  width: 100%;
  height: 100%;
  margin: 0;
  background: transparent !important;
}
</style>
