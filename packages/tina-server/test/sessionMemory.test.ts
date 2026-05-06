import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Config } from '../src/config'
import { getAvailableLLMs, getLLMConfigFormByKey } from '../src/llm'
import { MemoryStore, SessionMemorySummarizer } from '../src/memory'
import {
  Session,
  type SessionDisplayMessage,
  SessionManager,
} from '../src/session'

import type { LLMCallArguments, LLMManager } from '../src/llm'
import type { AssistantMessage } from '@mariozechner/pi-ai'

const workspaces: string[] = []

const USAGE: AssistantMessage['usage'] = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  },
}

const createWorkspace = (): string => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tina-session-'))
  workspaces.push(workspace)
  return workspace
}

const asDisplayMessage = (
  id: string,
  type: 'user' | 'assistant',
  content: string,
  timestamp = Number(id) || 1
): SessionDisplayMessage => {
  if (type === 'assistant') {
    return {
      id,
      type,
      content,
      status: 'complete',
      timestamp,
      metadata: {
        turnId: `assistant-${id}`,
        contextRole: 'assistant',
        blockIndex: 0,
        api: 'openai-completions',
        provider: 'test',
        model: 'test',
        usage: USAGE,
        stopReason: 'stop',
      },
    }
  }

  return {
    id,
    type,
    content,
    status: 'complete',
    timestamp,
    metadata: {
      turnId: `user-${id}`,
      contextRole: 'user',
    },
  }
}

const createSummaryResponse = (content: string): AssistantMessage => ({
  role: 'assistant',
  content: [{ type: 'text', text: content }],
  api: 'openai-completions',
  provider: 'test',
  model: 'test',
  usage: USAGE,
  stopReason: 'stop',
  timestamp: 1,
})

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    fs.rmSync(workspace, { recursive: true, force: true })
  }
})

describe('LLM providers', () => {
  it('does not expose custom LLM while the implementation is disabled', () => {
    expect(getAvailableLLMs().map((item) => item.key)).not.toContain('custom')
    expect(getLLMConfigFormByKey('custom')).toBeNull()
  })
})

describe('Session history', () => {
  it('returns only unsummarized messages', () => {
    const session = new Session('desktop:chat')
    session.addMessage(asDisplayMessage('1', 'user', 'summarized user'))
    session.addMessage(
      asDisplayMessage('2', 'assistant', 'summarized assistant')
    )
    session.addMessage(asDisplayMessage('3', 'user', 'fresh user'))
    session.addMessage(asDisplayMessage('4', 'assistant', 'fresh assistant'))
    session.metadata.memorySummaryMessageCount = 2

    expect(session.getHistory()).toEqual([
      expect.objectContaining({ role: 'user', content: 'fresh user' }),
      expect.objectContaining({ role: 'assistant' }),
    ])
  })

  it('rebuilds assistant thinking, tool call, and tool result from minimal metadata', () => {
    const session = new Session('desktop:chat')
    session.addMessages([
      asDisplayMessage('u1', 'user', 'find memory', 1),
      {
        id: 'a1:reasoning:0',
        type: 'reasoning',
        content: 'Need to inspect memory.',
        status: 'complete',
        timestamp: 2,
        metadata: {
          turnId: 'a1',
          contextRole: 'reasoning',
          blockIndex: 0,
          api: 'openai-completions',
          provider: 'test',
          model: 'test',
          usage: USAGE,
          stopReason: 'toolUse',
        },
      },
      {
        id: 'a1',
        type: 'assistant',
        content: 'I will check it.',
        status: 'complete',
        timestamp: 3,
        metadata: {
          turnId: 'a1',
          contextRole: 'assistant',
          blockIndex: 1,
        },
      },
      {
        id: 'a1:tool:2',
        type: 'tool',
        toolName: 'read_memory',
        parameters: { path: ['User'] },
        result: 'memory body',
        content: 'Tool read_memory completed',
        status: 'complete',
        timestamp: 4,
        metadata: {
          turnId: 'a1',
          contextRole: 'tool',
          blockIndex: 2,
          toolCallId: 'tool-1',
          toolName: 'read_memory',
          isError: false,
        },
      },
    ])

    const history = session.getHistory()
    expect(history).toHaveLength(3)
    expect(history[1]).toMatchObject({
      role: 'assistant',
      stopReason: 'toolUse',
      content: [
        { type: 'thinking', thinking: 'Need to inspect memory.' },
        { type: 'text', text: 'I will check it.' },
        {
          type: 'toolCall',
          id: 'tool-1',
          name: 'read_memory',
          arguments: { path: ['User'] },
        },
      ],
    })
    expect(history[2]).toMatchObject({
      role: 'toolResult',
      toolCallId: 'tool-1',
      toolName: 'read_memory',
      content: [{ type: 'text', text: 'memory body' }],
      isError: false,
    })
  })

  it('saves display messages without full contextMessages metadata', () => {
    const workspace = createWorkspace()
    const manager = new SessionManager(workspace)
    const session = manager.getOrCreate('desktop:default')
    session.addMessage(asDisplayMessage('1', 'user', 'hello'))
    session.addMessage(asDisplayMessage('2', 'assistant', 'hi'))

    manager.save(session)

    const saved = fs.readFileSync(
      path.join(workspace, 'sessions', 'desktop_default.jsonl'),
      'utf-8'
    )
    expect(saved).not.toContain('contextMessages')
  })

  it('paginates messages by sequence cursor from newest to oldest', () => {
    const session = new Session('desktop:chat')
    for (let index = 0; index < 55; index += 1) {
      session.addMessage(
        asDisplayMessage(String(index + 1), 'user', `message ${index + 1}`)
      )
    }

    const latest = session.getMessagesPage(undefined, 50)
    expect(latest.items[0].content).toBe('message 6')
    expect(latest.items.at(-1)?.content).toBe('message 55')
    expect(latest.nextCursor).toBe(5)

    const older = session.getMessagesPage(latest.nextCursor, 50)
    expect(older.items.map((message) => message.content)).toEqual([
      'message 1',
      'message 2',
      'message 3',
      'message 4',
      'message 5',
    ])
    expect(older.nextCursor).toBeNull()
  })
})

describe('SessionMemorySummarizer', () => {
  it('summarizes only unsummarized messages and advances the summary cursor', async () => {
    const store = new MemoryStore(createWorkspace())
    const session = new Session('desktop:chat')
    for (let index = 0; index < 12; index += 1) {
      session.addMessage(
        asDisplayMessage(
          String(index),
          index % 2 === 0 ? 'user' : 'assistant',
          `message ${index}`
        )
      )
    }
    session.metadata.memorySummaryMessageCount = 2

    let userPrompt = ''
    const complete = vi.fn(async (args: LLMCallArguments) => {
      userPrompt = String(args.context.messages[0]?.content ?? '')
      return createSummaryResponse('updated summary')
    })
    const llm = { complete } as unknown as LLMManager
    const summarizer = new SessionMemorySummarizer(store, llm, new Config())

    await expect(summarizer.summarizeIfNeeded(session)).resolves.toBe(true)

    expect(complete).toHaveBeenCalledTimes(1)
    expect(userPrompt).not.toMatch(/(?:^|\n)user: message 0(?:\n|$)/)
    expect(userPrompt).not.toMatch(/(?:^|\n)assistant: message 1(?:\n|$)/)
    expect(userPrompt).toMatch(/(?:^|\n)user: message 2(?:\n|$)/)
    expect(userPrompt).toMatch(/(?:^|\n)assistant: message 11(?:\n|$)/)
    expect(session.metadata.memorySummaryMessageCount).toBe(12)
    expect(store.readSessionSummary('desktop:chat')).toContain(
      'updated summary'
    )
  })
})
