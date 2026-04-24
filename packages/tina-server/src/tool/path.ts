import path from 'path'

// 解析并验证输入的文件路径，确保它位于 agent 工作空间内，防止路径穿越攻击
// 暂时写到这里，后续如果有更多路径相关的工具函数可以一起放进来
export const resolveWorkspaceChildPath = (
  workspacePath: string,
  inputPath: string
): { ok: true; path: string } | { ok: false; error: string } => {
  const normalizedInput = inputPath.trim()
  if (!normalizedInput) {
    return { ok: false, error: 'path is required.' }
  }

  const workspace = path.resolve(workspacePath)
  const resolved = path.isAbsolute(normalizedInput)
    ? path.resolve(normalizedInput)
    : path.resolve(workspace, normalizedInput)
  const relative = path.relative(workspace, resolved)
  // 确保 resolved 路径在 workspace 内，防止路径穿越攻击
  const insideWorkspace =
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))

  if (!insideWorkspace) {
    return {
      ok: false,
      error: `Access denied: ${normalizedInput} is outside the agent workspace.`,
    }
  }

  return { ok: true, path: resolved }
}
