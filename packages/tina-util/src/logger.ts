import path from 'node:path'
import pino from 'pino'

const logFilePath = path.resolve(process.cwd(), 'logs', 'tina-chris.log')

// 控制台保留彩色可读输出，同时落盘到日志文件，便于在独立终端观察
export const logger = pino(
  {
    level: 'info',
  },
  pino.multistream([
    // {
    // 	stream: pretty({
    // 		colorize: true,
    // 		translateTime: 'yyyy-mm-dd HH:MM:ss',
    // 		ignore: 'pid,hostname',
    // 	}),
    // },
    {
      stream: pino.destination({
        dest: logFilePath,
        mkdir: true,
        sync: false,
      }),
    },
  ])
)
