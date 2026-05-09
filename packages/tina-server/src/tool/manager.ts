import {
  DeleteFileTool,
  EditFileTool,
  ListDirTool,
  ReadFileTool,
  WriteFileTool,
} from './filesystem'
import { MessageTool } from './message'
import { ToolRegistry } from './registry'
import { RunShellTool } from './shell'
import { WebFetchTool } from './web'
import { ReadMemoryTool, UpdateMemoryTool } from './memory'

import type { MessageBus } from '@tina-chris/tina-bus'

import type { MemoryStore } from '@/memory'

export type ToolRuntimeContext = {
  workspacePath: string
  bus: MessageBus
  memoryStore: MemoryStore
}

export const createDefaultToolRegistry = ({
  workspacePath,
  bus,
  memoryStore,
}: ToolRuntimeContext): ToolRegistry => {
  const registry = new ToolRegistry()

  registry.register(new ReadFileTool(workspacePath))
  registry.register(new ListDirTool(workspacePath))
  registry.register(new WriteFileTool(workspacePath))
  registry.register(new EditFileTool(workspacePath))
  registry.register(new DeleteFileTool(workspacePath))
  registry.register(new RunShellTool(workspacePath))
  registry.register(new WebFetchTool())
  registry.register(new ReadMemoryTool(memoryStore))
  registry.register(new UpdateMemoryTool(memoryStore))
  registry.register(new MessageTool(bus))

  return registry
}
