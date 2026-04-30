# Tina Chris

Tina Chris 是一个桌面 AI 伙伴实验项目：它把 Live2D 桌宠、可配置的 Agent 运行时、语音交互、长期记忆、工具调用和远程聊天通道组合在一起，让一个角色可以常驻桌面，也可以逐步接入你常用的聊天场景。

项目的 Agent 架构设计参考了 [HKUDS/nanobot](https://github.com/HKUDS/nanobot)。在此基础上，Tina Chris 更关注桌面端的陪伴式交互：你可以直接对角色说话，让它记住有用的信息，也可以通过消息总线把 Agent 连接到更多输入、输出和工具能力。

## 当前支持功能

- 基于 Electron、Vue、electron-vite 的桌面 Live2D 外壳。
- 本地 Live2D 模型管理能力，支持内置模型资源随应用打包。
- 可配置的 LLM Provider，目前主要面向 OpenAI 兼容的 Chat 接口。
- Qwen 实时 STT 语音识别，用于语音输入。
- Qwen 实时 TTS 语音合成，支持语音克隆相关配置。
- 基于 MessageBus 的消息路由，串联桌面 UI、STT、TTS、AgentLoop、工具和聊天通道。
- 按 `channel/chatId` 持久化 Agent 会话，桌面聊天和远程聊天可以拥有独立上下文。
- 分层记忆模块：
  - 长期记忆
  - 每日记忆
  - 当前会话摘要
  - 受控的记忆读取与写入工具
- 异步 subagent 工具，可用于有边界的后台调查任务。
- Agent 工具系统，已包含文件读取、目录列表、网页获取、网页搜索、消息发送、记忆访问和 subagent 启动等能力。
- QQ 官方机器人聊天通道，基于 `qq-official-bot` 接入，支持配置卡片启用/停用和动态配置表单。
- 设置界面支持 Agent、LLM、STT、TTS、工具、聊天通道和模型管理等配置。
- 已接入 `electron-builder`，可生成桌面应用安装包。

## 待优化与待开发方向

- 更多聊天通道：微信、Telegram、Discord、Matrix，或企业内部 IM 适配器。
- 更完整的远程通道体验：连接诊断、通道日志、重连策略和按通道配置权限。
- 更丰富的多模态输入：图片、文件、远程语音消息，以及屏幕或窗口上下文感知。
- 更安全的工具权限：可编辑工具白名单、写文件/编辑文件工作流，以及高影响操作的用户确认。
- 记忆管理界面：查看、编辑、合并、清理长期记忆、每日记忆和会话摘要。
- Agent 技能和插件加载机制，用于沉淀可复用工作流。
- 代码签名、自动更新、崩溃上报和发布自动化。
- 更完整的测试覆盖，尤其是 AgentLoop、MessageBus 集成、聊天通道和桌面 IPC。
- 更友好的首次启动流程：Provider 凭据检查、示例 workspace 和配置向导。

## 项目结构

- `apps/tina-desktop-app`：Electron 桌面应用、preload API、设置页渲染层和安装包配置。
- `packages/tina-server`：Agent 运行时、LLM/STT/TTS 管理器、记忆、工具、聊天通道管理和会话处理。
- `packages/tina-bus`：入站/出站消息结构与消息分发循环。
- `packages/tina-ui`：共享 Vue UI 组件和动态表单渲染器。
- `packages/live2d-model`：Live2D 渲染和本地模型存储工具。
- `packages/tina-util`：日志、路径、字符串、日期和异步工具等通用能力。

## 快速开始

环境要求：

- Node.js 22+
- pnpm 10.20+

安装依赖：

```bash
pnpm install
```

启动桌面端开发环境：

```bash
pnpm dev:desktop
```

构建桌面端：

```bash
pnpm build:desktop
```

执行类型检查：

```bash
pnpm check-types
```

## 打包桌面应用

桌面端使用 `electron-builder` 打包。在 Windows 上，默认会生成 NSIS 安装程序。

生成未打包安装器的应用目录，适合快速检查打包结果：

```bash
pnpm pack:desktop
```

生成 Windows 安装包：

```bash
pnpm dist:desktop:win
```

为当前系统生成对应安装包：

```bash
pnpm dist:desktop
```

打包产物输出到：

```text
apps/tina-desktop-app/release
```

注意事项：

- 当前应用还没有配置代码签名证书，Windows 或 macOS 可能会显示安全提示。
- 内置 Live2D 资源会随应用打包，并在首次启动时复制到本地模型目录。
- 运行时配置存储在用户主目录下，目前为 `~/.tina-chris/config.json`。

## 配置说明

可以从托盘菜单打开设置窗口。当前可配置内容包括：

- Agent workspace、身份设定、回复行为和提示词来源。
- LLM Provider、模型和生成参数。
- Qwen STT 凭据和 VAD 参数。
- Qwen TTS 凭据、音色参数和语音克隆工具。
- 工具 Provider，例如网页搜索。
- 聊天通道 Provider，例如 QQ 机器人。

QQ 机器人接入方式：在 QQ 开放平台申请 App Id 与 App Secret ，完成设置中的配置并启用即可。

## 开发说明

项目刻意保持模块化：

- 聊天通道 Provider 将第三方聊天事件转换为 `InboundMessage(channel=<providerKey>)`。
- Agent 回复会发布为 `OutboundMessage`，再通过同一个 provider key 路由回对应聊天通道。
- STT/TTS 管理器和远程聊天通道使用同一套消息总线契约。
- 记忆只作用于配置的 workspace，并以保守方式注入到每一轮上下文中。
- Subagent 有工具范围和轮次限制，任务完成后把结果交还给主 AgentLoop，由主 Agent 负责组织最终回复。

这种结构让新增 Provider 更轻量：通常只需要增加一个 provider 模块、一个配置表单和一次 manager 注册，不需要改写 AgentLoop。

## 参与贡献

欢迎一起参与开发，尤其是 Provider 接入、Agent 工具、测试、打包发布和用户体验相关方向。如果你对桌面原生 Agent、记忆系统、Live2D 交互或基于消息总线的 Agent 架构感兴趣，这个项目会是一个很适合实验和共建的地方。

适合作为起点的方向：

- 新增一个聊天通道 Provider。
- 改进设置表单校验和连接诊断体验。
- 为记忆工具或聊天通道路由补充测试。
- 完善首次启动流程和打包元数据。
- 编写示例 workspace 和 Provider 配置文档。
- 完善当前 Agent 功能
