import fs from 'fs'
import path from 'path'
import os from 'os'
import { Config } from './schema'

// 配置路径
export function getConfigPath(): string {
  return path.join(os.homedir(), '.tina-chris', 'config.json')
}

// 加载配置
export function loadConfig(): Config {
  const configPath = getConfigPath()
  if (!fs.existsSync(configPath)) {
    return new Config()
  }
  const rawData = fs.readFileSync(configPath, 'utf-8')
  const data = JSON.parse(rawData)
  return Config.createConfig(data)
}

// 保存配置
export function saveConfig(config: Config): void {
  const configPath = getConfigPath()
  const rawData = JSON.stringify(config, null, 2)
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(configPath, rawData, 'utf-8')
}
