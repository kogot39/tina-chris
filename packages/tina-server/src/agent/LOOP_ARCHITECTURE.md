# AgentLoop 架构说明

## 1. 整体概览

AgentLoop 是 tina-server 的核心调度器，位于 `packages/tina-server/src/agent/loop.ts`。它负责将"用户发来一条消息"这个事件，编排成一整套 **LLM 调用 → 工具执行 → 结果回传 → 会话持久化** 的流水线。

```
外部 (桌面端 / QQ / 其他 channel)
   │
   ▼
MessageBus ──→ AgentLoop ──→ ContextBuilder (构建 LLM 上下文)
                   │
                   ├─→ LLM (stream / complete)
                   │      │
                   │      ├─→ 流式回调 (text / thinking / tool → 桌面端 + TTS)
                   │      │
                   │      ▼
                   ├─→ ToolRegistry (执行工具)
                   │      │
                   │      ▼
                   ├─→ SessionManager (JSONL 持久化)
                   │
                   └─→ SessionMemorySummarizer (长对话摘要)
```

**核心循环极其简单**：

```
while (没有中止) {
    调用 LLM → 得到 assistantMessage
    如果有 toolCall → 执行工具 → 结果写回 context → 再调一次 LLM
    如果没有 toolCall → 结束
}
```

---

## 2. 核心设计决策

### 2.1 消息的"双重形态"

每条消息都以 **两种形态** 并存，这是理解 loop 架构的入口：

| 形态 | 类型 | 用途 | 存储 |
|------|------|------|------|
| **ContextMessage** | `pi-ai Message` | 传给 LLM 做上下文回放，包含完整 toolCall/toolResult 链 | 内存中 (`context.messages`) |
| **DisplayMessage** | `SessionDisplayMessage` | 前端展示 + 历史恢复，只存最小展示结构 | JSONL 文件 |

**为什么需要两种？**

- LLM 上下文需要精确的 toolCall id 关联：`assistant(toolCall:{id:"1"}) → tool(result, toolCallId:"1")`。这些 id 必须在 context 中完整保留。
- 前端展示只需要：用户说了什么、助手回了什么、用了什么工具、结果如何。不需要关心 pi-ai 内部格式。
- JSONL 持久化只存 DisplayMessage + 最小 metadata（turnId / blockIndex / contextRole），重建时再从这些字段拼回 pi-ai 格式。

**重建方向**：`DisplayMessage → ContextMessage`（通过 `Session.getHistory()`），不是反过来。

### 2.2 Channel 分流

```
shouldStream = (message.channel === 'desktop')
```

| channel | LLM 调用方式 | 特点 |
|---------|-------------|------|
| `desktop` | `llm.stream()` + callbacks | 实时推送 thinking/tool/text 增量事件，驱动 TTS |
| 其他 (QQ 等) | `llm.complete()` | 一次性获取完整响应，工具参数等内部细节不泄漏 |

### 2.3 AbortController 是唯一的取消状态源

三种场景共用同一套中止逻辑：

1. 用户点击 stop 按钮 → `abortSession()`
2. 同一会话新消息到达 → `processTextMessage()` 内部 abort 上一轮
3. LLM 自身报错 → try/catch

流式回调也检查同一个 `signal`，abort 后只放行最终的 `error(aborted)` 事件（用于更新 UI 状态），途中其他 delta chunk 全部丢弃，避免"停止后还在长字"。

### 2.4 工具调用的 upsert 模式

工具卡片在桌面端展示时，使用**同一 id 做 upsert**：

```
onToolCallEnd(id="assistant-1:tool:2") → status: "calling"   (工具卡出现)
publishToolResult(id="assistant-1:tool:2") → status: "complete" (同一张卡更新结果)
```

JSONL 中也是同一条消息同时包含参数和结果，`Session.getHistory()` 从中重建 toolCall + toolResult。

---

## 3. 数据结构说明

### 3.1 ContextMessage（pi-ai 格式，给 LLM 用）

```ts
// 用户消息
{
  role: 'user',
  content: '帮我看看桌面有什么文件',
  timestamp: 1715000000000
}

// 助手消息（包含多种内容块）
{
  role: 'assistant',
  content: [
    { type: 'thinking', thinking: '用户想看桌面文件，我需要调用 list_files 工具...' },
    { type: 'toolCall', id: 'call_abc', name: 'list_files', arguments: { path: '/desktop' } },
    { type: 'text', text: '好的，让我来看看你的桌面...' }
  ],
  api: 'openai-completions',
  provider: 'openai',
  model: 'gpt-4o',
  usage: { inputTokens: 500, outputTokens: 200 },
  stopReason: 'tool_calls',
  timestamp: 1715000001000
}

// 工具结果（跟随在 assistant 之后）
{
  role: 'tool',
  content: [
    { type: 'toolResult', toolCallId: 'call_abc', result: 'file1.txt\nfile2.txt' }
  ],
  timestamp: 1715000002000
}
```

> 关键约束：toolResult 中的 `toolCallId` 必须和前面 assistant 中 toolCall 的 `id` 一致，pi-ai 才能正确拼接工具链。

### 3.2 DisplayMessage（JSONL 格式，给前端用）

一共 5 种类型：

```ts
type SessionDisplayMessageType = 'user' | 'assistant' | 'reasoning' | 'tool' | 'speech_text'
```

#### user — 用户消息
```json
{
  "id": "uuid-1",
  "type": "user",
  "content": "帮我看看桌面有什么文件",
  "status": "complete",
  "timestamp": 1715000000000,
  "metadata": {
    "turnId": "uuid-turn-1",
    "contextRole": "user"
  }
}
```

#### assistant — 助手文本
```json
{
  "id": "uuid-2",
  "type": "assistant",
  "content": "好的，让我来看看你的桌面...",
  "status": "complete",
  "timestamp": 1715000001000,
  "metadata": {
    "turnId": "uuid-turn-1",
    "contextRole": "assistant",
    "blockIndex": 2,
    "api": "openai-completions",
    "provider": "openai",
    "model": "gpt-4o",
    "usage": { "inputTokens": 500, "outputTokens": 200 },
    "stopReason": "tool_calls"
  }
}
```

#### reasoning — 模型思考
```json
{
  "id": "uuid-2:reasoning:0",
  "type": "reasoning",
  "content": "用户想看桌面文件，我需要调用 list_files 工具...",
  "status": "complete",
  "timestamp": 1715000000500,
  "metadata": {
    "turnId": "uuid-turn-1",
    "contextRole": "reasoning",
    "blockIndex": 0
  }
}
```

#### tool — 工具调用 + 结果（同一条消息 upsert）
```json
// 工具执行前（calling 态）
{
  "id": "uuid-2:tool:1",
  "type": "tool",
  "toolName": "list_files",
  "parameters": { "path": "/desktop" },
  "content": "Calling list_files",
  "status": "calling",
  "timestamp": 1715000000800,
  "metadata": {
    "turnId": "uuid-turn-1",
    "contextRole": "tool",
    "blockIndex": 1,
    "toolCallId": "call_abc",
    "toolName": "list_files"
  }
}

// 工具执行后（同一条消息被 upsert 为 complete）
{
  "id": "uuid-2:tool:1",
  "type": "tool",
  "toolName": "list_files",
  "parameters": { "path": "/desktop" },
  "result": "file1.txt\nfile2.txt",
  "content": "Tool list_files completed",
  "status": "complete",
  "timestamp": 1715000000800,        // ← 时间戳不变
  "metadata": {
    "turnId": "uuid-turn-1",
    "contextRole": "tool",
    "blockIndex": 1,
    "toolCallId": "call_abc",
    "toolName": "list_files",
    "isError": false
  }
}
```

### 3.3 展示消息的 id 命名规则

```
assistantId                           → "uuid-2"        (assistant 正文)
assistantId:reasoning:{blockIndex}     → "uuid-2:reasoning:0"  (思考)
assistantId:tool:{blockIndex}          → "uuid-2:tool:1"       (工具)
```

> `blockIndex` 对应 `assistantMessage.content` 数组的索引。因为一个 assistant 回复可能包含多项（思考 → 工具调用 → 文本），这几个 id 互不冲突，且后续工具结果能找到同 index 的工具卡做 upsert。

### 3.4 DisplayMessage 中的关键 Metadata 字段

| 字段 | 含义 | 为何需要 |
|------|------|----------|
| `turnId` | 标识当前这一"轮"（一次 while 迭代 = 一次 LLM 调用） | 重建 context 时，同 turnId 的 thinking + toolCall + text 合并回一条 assistantMessage |
| `contextRole` | 在 context 中的角色（user/assistant/reasoning/tool） | 决定重建时放入哪种 pi-ai role |
| `blockIndex` | 在 assistant.content 数组中的位置 | 重建时按索引排序，保证块顺序正确 |
| `toolCallId` | pi-ai 工具调用 id | toolResult 必须引用相同的 id，不然 pi-ai 无法回放工具链 |
| `api/provider/model/usage/stopReason` | assistant 整体元数据 | 只挂到同 turnId 第一条消息上，其他块只保留重组最小字段 |

---

## 4. 消息总线 (MessageBus) 通信协议

AgentLoop 通过 MessageBus 与其他模块通信，所有进出消息遵循统一格式。

### 4.1 入站消息（外部 → AgentLoop）

```
订阅者: 'agent'
消息类型: InboundMessage
```

```ts
{
  channel: 'desktop',       // 来源渠道
  chatId: 'chat-123',       // 会话 ID
  senderId: 'user',
  sendTo: 'agent',          // 路由目标
  type: 'text',
  content: '帮我看看桌面有什么文件'
}
```

`sessionKey = channel:chatId = "desktop:chat-123"`，这是会话隔离的唯一键。

### 4.2 出站消息（AgentLoop → 外部）

所有展示消息通过 `OutboundMessage` 发出，外层 type 统一为 `"text"`，真正的展示语义放在 **metadata** 中：

```ts
{
  channel: 'desktop',
  chatId: 'chat-123',
  senderId: 'agent',
  type: 'text',                    // ← 外层固定为 "text"，兼容已有通道
  content: '好的，让我来看看...',    // ← 增量文本（streaming 时是 delta）
  timestamp: 1715000001000,
  metadata: {
    id: 'uuid-2',                  // 消息唯一 id，UI 按此 upsert
    displayType: 'assistant',      // ← 真实展示类型：user | assistant | reasoning | tool
    displayStatus: 'streaming',    // ← 展示状态：pending | streaming | complete | error | aborted
    turnId: 'uuid-turn-1',
    contextRole: 'assistant',
    blockIndex: 2
  }
}
```

**为什么外层用 `type: "text"`？**

保持与旧有通道消费逻辑兼容。QQ 机器人等远程 channel 只消费 `type: "text"` 和 `content` 字段，不关心 metadata 中的展示细节。desktop 端根据 `metadata.displayType` 做精细化渲染。

### 4.3 TTS 通信（内部）

TTS 通过 bus 的 `InboundMessage` / `ConnectionStartMessage` / `ConnectionEndMessage` 路由到 `tts-manager`：

```
ConnectionStartMessage  →  启动 TTS 连接
InboundMessage(type: 'text')  →  逐条发送待播报文本
ConnectionEndMessage    →  提交或关闭 TTS 会话
```

> TTS 只在第一条**可播报文本**（非 thinking、非 tool）到达时才启动连接。

---

## 5. processTextMessage 的五个阶段

这是 loop 最核心的方法，按以下顺序执行：

```
阶段 1: 前置准备
  ├── 获取 Runtime / Session
  ├── 中止上一轮未完成的回复
  ├── 创建 AbortController
  ├── 构造用户消息的双重形态 (ContextMessage + DisplayMessage)
  └── 构建 LLM context

阶段 2: LLM 调用 + 工具循环 (while)
  ├── 调用 LLM (stream 或 complete)
  ├── error / aborted → 推送状态， break
  ├── 正常响应 → assistantMessage 写入 context
  ├── 无 toolCall → break
  ├── 工具轮次上限 → synthetic 消息，break
  └── 执行工具 → 结果写入 context + 推送展示 → 回到循环顶部

阶段 3: 收尾清理 (finally)
  ├── 从 activeResponses 注销
  └── 发送 TTS 结束信号

阶段 4: 空响应兜底
  └── LLM 返回空且未 abort → 生成兜底回复

阶段 5: 持久化
  ├── session.addMessages() → 写入 JSONL
  └── scheduleSessionSummary() → 异步检查是否需要记忆摘要
```

---

## 6. 流式回调详解（仅 desktop）

在 `desktop` channel 下，`createStreamCallbacks()` 返回 8 个回调，对应 pi-ai 的流式事件：

| 回调 | 触发时机 | 动作 |
|------|---------|------|
| `onTextDelta` | 助手逐字输出 | → 桌面展示 + TTS 播报 |
| `onTextEnd` | 文本输出完成 | → 标记 assistant 为 complete |
| `onThinkingDelta` | 模型思考过程 | → 独立 reasoning 消息（不入 TTS） |
| `onThinkingEnd` | 思考完成 | → 标记 reasoning 为 complete |
| `onToolCallStart` | 工具调用开始 | → 创建 "calling" 工具卡 |
| `onToolCallDelta` | 工具参数逐步补全 | → 更新工具卡内容 |
| `onToolCallEnd` | 工具调用完成 | → 最终工具卡（等待后续结果 upsert） |
| `onError` | LLM 异常/中断 | → 标记所有消息为 error/aborted |

**id 缓存机制**：reasoning 和 tool 的展示 id 首次创建后缓存到 Map 中，保证 delta → end 过程中同一 contentIndex 始终用同一 id。

**abort 过滤**：`skipIfAborted()` 检查 signal，只放行最终的 error 事件用于更新 UI 状态，丢弃途中的 delta chunk。

---

## 7. 完整流程示例

假设用户在桌面端说："帮我看看桌面有什么文件"，且模型决定使用 `list_files` 工具：

```
1. InboundMessage 到达 (type: 'text', content: '帮我看看桌面有什么文件')

2. 阶段 1: 构造双重形态
   ContextMessage:  { role: 'user', content: '帮我看看桌面有什么文件' }
   DisplayMessage:  { id: 'u1', type: 'user', content: '...', metadata: { turnId: 't1' }}

3. 构建 context: [system prompt, ...history, userMessage, tool definitions]

4. 阶段 2 — 第一次 while 循环:
   a. llm.stream() 被调用
   b. onThinkingDelta: reasoning 消息到桌面 (id: 'a1:reasoning:0')
   c. onToolCallStart/Delta/End: tool 卡片到桌面 (id: 'a1:tool:1', status: 'calling')
   d. llm.stream() 返回 assistantMessage (stopReason: 'tool_calls')

5. 检查 assistantMessage.content:
   - block[0]: thinking ('用户想看桌面...')
   - block[1]: toolCall (name: 'list_files', arguments: {path: '/desktop'}, id: 'call_abc')
   → 有 toolCall，不 break

6. 执行工具:
   a. toolRegistry.executeToolCall() → 返回 result: 'file1.txt\nfile2.txt'
   b. context.messages.push(toolResult, toolCallId: 'call_abc')
   c. publishToolResult: 桌面端收到 id='a1:tool:1' 的 upsert → status: 'complete'

7. 第二次 while 循环:
   a. 这回 context 中已包含工具结果
   b. llm.stream() 再次调用
   c. onTextDelta: '好的，你的桌面有以下文件：\n- file1.txt\n- file2.txt' → 桌面 + TTS
   d. llm.stream() 返回 assistantMessage (stopReason: 'stop')

8. 检查 assistantMessage.content:
   - block[0]: text ('好的，你的桌面有...')
   → 无 toolCall，break

9. 阶段 3: finally → TTS ConnectionEndMessage

10. 阶段 5: JSONL 写入
    [
      { id: 'u1', type: 'user', ... },
      { id: 'a1:reasoning:0', type: 'reasoning', ... },
      { id: 'a1:tool:1', type: 'tool', status: 'complete', result: 'file1.txt\nfile2.txt', ... },
      { id: 'a1', type: 'assistant', content: '好的，你的桌面有...', ... },
      { id: 'a2', type: 'assistant', content: '好的，你的桌面有以下文件...', ... }
    ]

11. 记忆摘要检查（异步，不阻塞本次响应）
```

---

## 8. 关键不变量与防御

| 机制 | 说明 |
|------|------|
| `activeResponses` Map | 同一 sessionKey 最多一个活跃回复，新消息到达时强制中止旧的 |
| `maxToolInteractions` | 防止模型陷入工具循环无限消耗 token |
| `finally` 中的 `controller ===` 比较 | 确保只有当前 controller 被清理，防止新的 controller 刚写入就被误删 |
| 空响应兜底 | LLM 返回空且未 abort 时，生成 synthetic 回复 |
| Synthetic 消息写入 context | 工具上限、兜底等内部消息也写入 context，让下一轮模型知道停止原因 |
| TTS 安全结束 | `finishSpeech` 在 finally 中保证执行，即使本轮未真正启动 TTS 也能安全发送 |
