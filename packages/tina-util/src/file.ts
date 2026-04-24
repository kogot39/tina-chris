import path from 'path'
import os from 'os'
// import fs from 'fs'

// 扩展路径，支持 ~ 和 ~/ 开头的路径
export function expandHomePath(inputPath: string): string {
  if (inputPath === '~') {
    return os.homedir()
  }
  if (inputPath.startsWith('~/') || inputPath.startsWith('~\\')) {
    return path.join(os.homedir(), inputPath.slice(2))
  }

  return inputPath
}

// 构造安全文件名
export function safeFilename(name: string): string {
  const safeName = name.replace(/[^a-z0-9_]/gi, '').toLowerCase()
  return safeName.length > 255 ? safeName.slice(0, 255) : safeName
}

// 获取应用路径
export function getRootPath(): string {
  const rootPath = path.join(os.homedir(), '.tina-chris')
  return rootPath
}

export function getRootFilePath(filename: string): string {
  const fileDir = path.join(os.homedir(), '.tina-chris', filename)
  return fileDir
}
