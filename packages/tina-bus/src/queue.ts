import { InboundMessage, OutboundMessage } from './events'
import { logger, timeout, writableIterator } from '@tina-chris/tina-util'

import type { WritableIterator } from '@tina-chris/tina-util'

type InboundCallback = (message: InboundMessage) => Promise<void>
type OutboundCallback = (message: OutboundMessage) => Promise<void>

export class MessageBus {
  // 入站消息由外部通道产生，并由内部处理器（如 STTManager）消费
  private inbound: WritableIterator<InboundMessage>

  // 出站消息由内部处理器产生，并由外部消费
  private outbound: WritableIterator<OutboundMessage>

  // 入站订阅以 InboundMessage.sendTo 为键
  // 这镜像了出站通道订阅，并避免唤醒不是当前消息目标的处理器
  private inboundSubscriptions: Map<string, InboundCallback[]>

  // 出站订阅以 OutboundMessage.channel 为键，
  // 外部决定哪个客户端应该接收该消息。
  private outboundSubscriptions: Map<string, OutboundCallback[]>

  private inboundRunning: boolean
  private outboundRunning: boolean

  constructor() {
    this.inbound = writableIterator<InboundMessage>()
    this.outbound = writableIterator<OutboundMessage>()
    this.inboundSubscriptions = new Map<string, InboundCallback[]>()
    this.outboundSubscriptions = new Map<string, OutboundCallback[]>()
    this.inboundRunning = false
    this.outboundRunning = false
  }

  // 外部将消息发布到内部处理总线。
  publishInbound(message: InboundMessage) {
    this.inbound.push(message)
  }

  // 从队列中消费一条入站消息。
  async consumeInbound(): Promise<InboundMessage> {
    const result = await this.inbound.next()
    return result.value
  }

  // 内部处理器将消息发布回外部
  publishOutbound(message: OutboundMessage) {
    this.outbound.push(message)
  }

  // 从队列中消费一条出站消息
  async consumeOutbound(): Promise<OutboundMessage> {
    const result = await this.outbound.next()
    return result.value
  }

  subscribeInbound(sendTo: string, callback: InboundCallback) {
    if (!this.inboundSubscriptions.has(sendTo)) {
      this.inboundSubscriptions.set(sendTo, [])
    }
    this.inboundSubscriptions.get(sendTo)!.push(callback)
  }

  // 外部按频道名称订阅内部消息。
  subscribeOutbound(channel: string, callback: OutboundCallback) {
    if (!this.outboundSubscriptions.has(channel)) {
      this.outboundSubscriptions.set(channel, [])
    }
    this.outboundSubscriptions.get(channel)!.push(callback)
  }

  private getInboundTargets(message: InboundMessage): string[] {
    return Array.isArray(message.sendTo) ? message.sendTo : [message.sendTo]
  }

  private getInboundCallbacks(message: InboundMessage): InboundCallback[] {
    const callbacks = new Set<InboundCallback>()

    // sendTo 支持多个内部目标。
    // 使用 Set 可防止当一个处理器在同一消息包含的多个目标下注册时重复执行回调
    for (const target of this.getInboundTargets(message)) {
      const subscriptions = this.inboundSubscriptions.get(target)
      subscriptions?.forEach((callback) => callbacks.add(callback))
    }

    return Array.from(callbacks)
  }

  // 监听入站消息，并仅调度给匹配的处理器
  async dispatchInbound() {
    this.inboundRunning = true
    while (this.inboundRunning) {
      try {
        const message = await Promise.race([
          this.consumeInbound(),
          timeout(1000),
        ])
        // 拿到回调函数数组后再逐个执行
        this.getInboundCallbacks(message).forEach((callback) => {
          callback(message).catch((e) => {
            logger.error(
              `Error in inbound subscription callback for targets ${this.getInboundTargets(
                message
              ).join(',')}:`,
              e
            )
          })
        })
      } catch (e) {
        if (e instanceof Error && e.message === 'Timeout') {
          continue
        }
      }
    }
  }

  // 监听出站消息，并调度给匹配的通道
  async dispatchOutbound() {
    this.outboundRunning = true
    while (this.outboundRunning) {
      try {
        const message = await Promise.race([
          this.consumeOutbound(),
          timeout(1000),
        ])

        this.outboundSubscriptions.get(message.channel)?.forEach((callback) => {
          callback(message).catch((e) => {
            logger.error(
              `Error in outbound subscription callback for channel ${message.channel}:`,
              e
            )
          })
        })
      } catch (e) {
        if (e instanceof Error && e.message === 'Timeout') {
          continue
        }
      }
    }
  }

  // 停止调度循环。队列本身保持可重用
  stopInboundDispatch() {
    this.inboundRunning = false
  }

  stopOutboundDispatch() {
    this.outboundRunning = false
  }
}
