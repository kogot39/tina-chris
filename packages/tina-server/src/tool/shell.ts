import { execSync, spawn } from 'child_process'
import { Type } from '@mariozechner/pi-ai'
import { Tool, type ToolParameters } from './base'
import { resolveWorkspaceChildPath } from './path'

const DEFAULT_TIMEOUT_SEC = 60
const MAX_OUTPUT_BYTES = 10_000

type ShellResult = {
  exitCode: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  truncated: { stdout: boolean; stderr: boolean }
}

const killProcessTree = (pid: number): void => {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' })
    } else {
      process.kill(-pid, 'SIGKILL')
    }
  } catch {
    // 进程可能已经退出，忽略
  }
}

const collectOutput = (
  child: ReturnType<typeof spawn>,
  timeoutMs: number
): Promise<ShellResult> => {
  return new Promise((resolve) => {
    const chunks: { stdout: Buffer[]; stderr: Buffer[] } = {
      stdout: [],
      stderr: [],
    }
    let timedOut = false
    let stdoutTruncated = false
    let stderrTruncated = false
    let stdoutSize = 0
    let stderrSize = 0

    const timer = setTimeout(() => {
      timedOut = true
      if (child.pid) {
        killProcessTree(child.pid)
      }
    }, timeoutMs)

    const onData = (stream: 'stdout' | 'stderr', data: Buffer) => {
      const sizes = { stdout: stdoutSize, stderr: stderrSize }
      sizes[stream] += data.length

      if (sizes[stream] <= MAX_OUTPUT_BYTES) {
        chunks[stream].push(data)
      }

      if (stream === 'stdout') {
        stdoutSize = sizes.stdout
        if (stdoutSize > MAX_OUTPUT_BYTES && !stdoutTruncated) {
          stdoutTruncated = true
        }
      } else {
        stderrSize = sizes.stderr
        if (stderrSize > MAX_OUTPUT_BYTES && !stderrTruncated) {
          stderrTruncated = true
        }
      }
    }

    child.stdout?.on('data', (data: Buffer) => onData('stdout', data))
    child.stderr?.on('data', (data: Buffer) => onData('stderr', data))

    child.on('close', (exitCode) => {
      clearTimeout(timer)
      const stdout = Buffer.concat(chunks.stdout)
        .toString('utf-8')
        .slice(0, MAX_OUTPUT_BYTES)
      const stderr = Buffer.concat(chunks.stderr)
        .toString('utf-8')
        .slice(0, MAX_OUTPUT_BYTES)
      resolve({
        exitCode,
        stdout,
        stderr,
        timedOut,
        truncated: {
          stdout: stdoutTruncated,
          stderr: stderrTruncated,
        },
      })
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({
        exitCode: null,
        stdout: '',
        stderr: err.message,
        timedOut: false,
        truncated: { stdout: false, stderr: false },
      })
    })
  })
}

export class RunShellTool extends Tool {
  constructor(private workspacePath: string) {
    super()
  }

  get name(): string {
    return 'run_shell'
  }

  get description(): string {
    return `Run a shell command inside the agent workspace. Default timeout is ${DEFAULT_TIMEOUT_SEC} seconds. On Windows the shell is PowerShell; on Linux/macOS it's bash.`
  }

  get parameters(): ToolParameters {
    return Type.Object({
      command: Type.String({
        description: 'Shell command to execute.',
      }),
      cwd: Type.Optional(
        Type.String({
          description:
            'Working directory relative to the workspace root. Defaults to the workspace root.',
        })
      ),
      timeout: Type.Optional(
        Type.Integer({
          description: `Timeout in seconds, from 1 to 300. Defaults to ${DEFAULT_TIMEOUT_SEC}.`,
          minimum: 1,
          maximum: 300,
        })
      ),
    })
  }

  async execute(params: Record<string, unknown>): Promise<string> {
    const command =
      typeof params.command === 'string' ? params.command.trim() : ''
    if (!command) {
      return 'Error: command is required.'
    }

    const cwdInput = typeof params.cwd === 'string' ? params.cwd.trim() : ''
    const resolvedCwd = resolveWorkspaceChildPath(
      this.workspacePath,
      cwdInput || '.'
    )
    if (!resolvedCwd.ok) {
      return `Error: ${resolvedCwd.error}`
    }

    const timeoutSec =
      typeof params.timeout === 'number' ? params.timeout : DEFAULT_TIMEOUT_SEC
    const timeoutMs = Math.min(Math.max(timeoutSec, 1), 300) * 1000

    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash'
    const shellFlag = process.platform === 'win32' ? '-Command' : '-c'

    const child = spawn(shell, [shellFlag, command], {
      cwd: resolvedCwd.path,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const result = await collectOutput(child, timeoutMs)

    const parts: string[] = []
    if (result.timedOut) {
      parts.push(`Command timed out after ${timeoutSec}s.`)
    }
    if (result.exitCode !== null) {
      parts.push(`Exit code: ${result.exitCode}`)
    }
    if (result.stdout) {
      const suffix = result.truncated.stdout ? '...(truncated)' : ''
      parts.push(`stdout:\n${result.stdout}${suffix}`)
    }
    if (result.stderr) {
      const suffix = result.truncated.stderr ? '...(truncated)' : ''
      parts.push(`stderr:\n${result.stderr}${suffix}`)
    }
    if (
      !result.timedOut &&
      result.exitCode === null &&
      !result.stdout &&
      !result.stderr
    ) {
      parts.push('(no output)')
    }

    return parts.join('\n') || '(no output)'
  }
}
