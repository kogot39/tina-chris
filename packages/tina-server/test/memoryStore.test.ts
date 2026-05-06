import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryStore } from '../src/memory/store'
import { ReadMemoryTool, UpdateMemoryTool } from '../src/tool/memory'

const workspaces: string[] = []

const createWorkspace = (): string => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tina-memory-'))
  workspaces.push(workspace)
  return workspace
}

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    fs.rmSync(workspace, { recursive: true, force: true })
  }
})

describe('MemoryStore', () => {
  it('creates an empty directory document when MEMORY.md is missing', () => {
    const workspace = createWorkspace()
    const store = new MemoryStore(workspace)
    const memoryPath = path.join(workspace, 'memory', 'MEMORY.md')

    expect(fs.readFileSync(memoryPath, 'utf-8')).toContain(
      '## Directory\n\nNo long-term memory entries.'
    )
    expect(store.readLongTermDirectory()).toBe('No long-term memory entries.')
  })

  it('cleans old daily memory files without deleting MEMORY.md or sessions', () => {
    const workspace = createWorkspace()
    const memoryDir = path.join(workspace, 'memory')
    const sessionsDir = path.join(memoryDir, 'sessions')
    fs.mkdirSync(sessionsDir, { recursive: true })
    fs.writeFileSync(path.join(memoryDir, 'MEMORY.md'), '# Long-term Memory\n')
    fs.writeFileSync(path.join(memoryDir, '2026-05-03.md'), '# old daily\n')
    fs.writeFileSync(path.join(memoryDir, 'notes.md'), '# notes\n')
    fs.writeFileSync(path.join(sessionsDir, 'session.md'), '# session\n')

    new MemoryStore(workspace)

    expect(fs.existsSync(path.join(memoryDir, '2026-05-03.md'))).toBe(false)
    expect(fs.existsSync(path.join(memoryDir, 'MEMORY.md'))).toBe(true)
    expect(fs.existsSync(path.join(memoryDir, 'notes.md'))).toBe(true)
    expect(fs.existsSync(path.join(sessionsDir, 'session.md'))).toBe(true)
  })

  it('builds context from long-term directory and current session summary only', () => {
    const store = new MemoryStore(createWorkspace())
    store.updateLongTermMemory({
      operation: 'set',
      path: ['User'],
      content: 'This body should stay behind the read_memory tool.',
    })
    store.writeSessionSummary('desktop:chat', 'The current session summary.')

    const context = store.buildMemoryContext('desktop:chat')

    expect(context).toContain('## Long-term Memory Directory')
    expect(context).toContain('- [User](#user)')
    expect(context).toContain('## Current Session Summary')
    expect(context).toContain('The current session summary.')
    expect(context).not.toContain(
      'This body should stay behind the read_memory tool.'
    )
  })

  it('updates memory nodes and regenerates the directory', () => {
    const store = new MemoryStore(createWorkspace())

    store.updateLongTermMemory({
      operation: 'set',
      path: ['Projects', 'Tina'],
      content: 'Initial project memory.',
    })
    store.updateLongTermMemory({
      operation: 'append',
      path: ['Projects', 'Tina'],
      content: 'Second project memory.',
    })
    store.updateLongTermMemory({
      operation: 'rename',
      path: ['Projects', 'Tina'],
      title: 'Tina Chris',
    })

    expect(store.readLongTermDirectory()).toContain(
      '  - [Tina Chris](#tina-chris)'
    )
    expect(store.readLongTermMemory(['Projects', 'Tina Chris'])).toContain(
      'Initial project memory.\n\nSecond project memory.'
    )

    store.updateLongTermMemory({
      operation: 'delete',
      path: ['Projects'],
    })

    expect(store.readLongTermDirectory()).not.toContain('Projects')
  })
})

describe('memory tools', () => {
  it('read and update long-term memory by directory path', async () => {
    const store = new MemoryStore(createWorkspace())
    const readTool = new ReadMemoryTool(store)
    const updateTool = new UpdateMemoryTool(store)

    await updateTool.execute({
      operation: 'set',
      path: ['User', 'Preferences'],
      content: 'Prefers concise answers.',
    })

    expect(await readTool.execute({})).toContain(
      '  - [Preferences](#preferences)'
    )
    expect(await readTool.execute({ path: ['User', 'Preferences'] })).toContain(
      'Prefers concise answers.'
    )
  })
})
