import {
  BaseLLM,
  type ChatArguments,
  LLMResponse,
  ToolCallRequest,
} from '../base'
import OpenAI from 'openai'
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletion,
} from 'openai/resources'
import type {
  ChatCompletionChunk,
} from 'openai/resources/chat/completions'
import { logger } from '@tina-chris/tina-util'
import type { DynamicFormSchema } from '@tina-chris/tina-ui'

// 可配置内容
export class CustomLLMConfig {
  apiKey: string = ''
  apiBase: string = ''
}

// 提供一个函数来生成自定义 LLM 配置的表单 schema，供前端动态渲染配置界面使用。
export function getCustomLLMConfigForm(): DynamicFormSchema {
  return {
    key: 'llm-custom',
    legend: '自定义LLM配置',
    saveText: '保存并应用',
    fields: [
      {
        name: 'apiKey',
        type: 'input',
        label: 'API Key',
        hint: '用于访问兼容 OpenAI Chat Completions 的模型服务',
        required: true,
        valueType: 'string',
        rules: [
          {
            type: 'required',
            message: '请输入 API Key',
          },
        ],
        componentProps: {
          type: 'password',
          autocomplete: 'off',
          placeholder: 'sk-xxxx',
        },
      },
      {
        name: 'apiBase',
        type: 'input',
        label: 'API Base URL',
        hint: '兼容 OpenAI API 的基础地址，例如 OpenRouter、自建网关等',
        required: true,
        valueType: 'string',
        rules: [
          {
            type: 'required',
            message: '请输入 API Base URL',
          },
        ],
        componentProps: {
          placeholder: 'https://api.example.com/v1',
        },
      },
    ],
  }
}

// TODO: 内部的几个信息处理方法可以以抽象成一个工具函数，供其他 LLM 实现复用

export class CustomLLM extends BaseLLM {
  private static readonly EMPTY_USAGE: Record<string, number> = {}

  private client: OpenAI

  constructor({ apiKey, apiBase }: CustomLLMConfig) {
    super()
    this.client = new OpenAI({
      apiKey,
      baseURL: apiBase || undefined,
    })
  }

  async chat({
    messages,
    tools = [],
    model = '',
    maxTokens = 8192,
    temperature = 0.7,
    stream = false,
    streamId = crypto.randomUUID(),
    onChunk,
  }: ChatArguments): Promise<LLMResponse> {
    try {
      const requestOptions: Parameters<
        typeof this.client.chat.completions.create
      >[0] = {
        model,
        messages: messages as ChatCompletionMessageParam[],
        max_completion_tokens: maxTokens,
        temperature,
        stream,
      }
      // 携带可调用的工具信息，启用模型的工具调用能力；如果 tools 为空则不传这个字段，避免某些模型因为 tools 字段存在但内容不合法而报错。
      if (tools.length > 0) {
        requestOptions.tools = tools as ChatCompletionTool[]
        requestOptions.tool_choice = 'auto'
      }

      const response = await this.client.chat.completions.create(requestOptions)

      if (this.isStreamResponse(response)) {
        // 流式响应需要特殊处理，逐块解析并通过 onChunk 回调增量传递内容
        return this.parseStreamResponse(response, streamId, onChunk)
      }
      // 非流式响应直接解析成 LLMResponse 返回
      return this.parseResponse(response)
    } catch (error) {
      logger.error('CustomLLM chat error')
      logger.error(error)
      return new LLMResponse('Error calling LLM', [], 'error', {})
    }
  }

  // 自定义 LLM 没有默认模型，返回空字符串
  // 在 agent 配置中必须进行配置
  getDefaultModel(): string {
    return ''
  }
  // 判断输出结果是流式还是非流式的类型保护函数，基于是否存在 Symbol.asyncIterator 来区分
  private isStreamResponse(
    response: ChatCompletion | AsyncIterable<ChatCompletionChunk>
  ): response is AsyncIterable<ChatCompletionChunk> {
    return Symbol.asyncIterator in response
  }

  // 流式响应的解析逻辑：逐块处理增量内容、工具调用和使用统计，最终合成完整的 LLMResponse。
  private async parseStreamResponse(
    stream: AsyncIterable<ChatCompletionChunk>,
    streamId: string,
    onChunk?: ChatArguments['onChunk']
  ): Promise<LLMResponse> {
    const contentParts: string[] = []
    const finishReasonByChoice = new Map<number, string>()
    const toolCallBuffers = new Map<
      number,
      { id?: string; name?: string; arguments: string }
    >()
    let usage: Record<string, number> = {}

    for await (const chunk of stream) {
      if (chunk.usage) {
        usage = {
          prompt_tokens: chunk.usage.prompt_tokens || 0,
          completion_tokens: chunk.usage.completion_tokens || 0,
          total_tokens: chunk.usage.total_tokens || 0,
        }
      }
      // 每个 chunk 可能包含多个 choice 的增量内容，需要逐个处理
      for (const choice of chunk.choices || []) {
        await this.applyChunkChoice(
          choice,
          streamId,
          onChunk,
          contentParts,
          finishReasonByChoice,
          toolCallBuffers
        )
      }
    }

    const toolCalls = this.buildToolCalls(toolCallBuffers)

    return new LLMResponse(
      contentParts.join(''),
      toolCalls,
      finishReasonByChoice.get(0) || 'stop',
      usage
    )
  }

  // 处理流式响应中的每个 choice 块，提取文本增量、工具调用信息和完成原因，并通过 onChunk 回调传递增量内容。
  private async applyChunkChoice(
    choice: ChatCompletionChunk['choices'][number],
    streamId: string,
    onChunk: ChatArguments['onChunk'] | undefined,
    contentParts: string[],
    finishReasonByChoice: Map<number, string>,
    toolCallBuffers: Map<
      number,
      { id?: string; name?: string; arguments: string }
    >
  ): Promise<void> {
    // 处理文本增量内容，追加到 contentParts 中，并通过 onChunk 回调传递给上层。
    if (choice.delta?.content) {
      contentParts.push(choice.delta.content)
      await onChunk?.({
        id: streamId,
        delta: choice.delta.content,
      })
    }

    if (choice.finish_reason) {
      finishReasonByChoice.set(choice.index, choice.finish_reason)
    }
    // 处理工具调用的增量信息，可能分布在多个 chunk 中，需要根据 choice.index 和 tool_calls 的 index 来合并同一工具调用的增量内容。
    for (const toolCallChunk of choice.delta?.tool_calls || []) {
      const index = toolCallChunk.index
      const current = toolCallBuffers.get(index) || {
        arguments: '',
      }

      if (toolCallChunk.id) {
        current.id = toolCallChunk.id
      }
      if (toolCallChunk.function?.name) {
        current.name = toolCallChunk.function.name
      }
      if (toolCallChunk.function?.arguments) {
        current.arguments += toolCallChunk.function.arguments
      }

      toolCallBuffers.set(index, current)
    }
  }

  // 将工具调用的增量信息组装成完整的 ToolCallRequest 数组，供最终 LLMResponse 使用
  private buildToolCalls(
    toolCallBuffers: Map<number, { id?: string; name?: string; arguments: string }>
  ): ToolCallRequest[] {
    const toolCalls: ToolCallRequest[] = []
    const ordered = Array.from(toolCallBuffers.entries()).sort((a, b) => {
      return a[0] - b[0]
    })

    for (const [_index, call] of ordered) {
      if (!call.id || !call.name) {
        continue
      }

      let args: Record<string, any>
      try {
        args = call.arguments ? JSON.parse(call.arguments) : {}
      } catch {
        args = { raw: call.arguments }
      }

      toolCalls.push(new ToolCallRequest(call.id, call.name, args))
    }

    return toolCalls
  }

  private parseResponse(response: ChatCompletion): LLMResponse {
    const choice = response.choices[0]
    const message = choice?.message

    const tool_calls = []
    if (message?.tool_calls) {
      for (const call of message.tool_calls) {
        if (call.type === 'function') {
          let args
          try {
            args = JSON.parse(call.function.arguments)
          } catch {
            args = { raw: call.function.arguments }
          }
          tool_calls.push(
            new ToolCallRequest(call.id, call.function.name, args)
          )
        }
      }
    }

    const usage: Record<string, number> = response.usage
      ? {
          prompt_tokens: response.usage.prompt_tokens || 0,
          completion_tokens: response.usage.completion_tokens || 0,
          total_tokens: response.usage.total_tokens || 0,
        }
      : CustomLLM.EMPTY_USAGE

    return new LLMResponse(
      message?.content || '',
      tool_calls,
      choice?.finish_reason || 'stop',
      usage
    )
  }
}
