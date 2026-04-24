import type { DynamicFormValues } from '@tina-chris/tina-ui'

// 将从主进程获取的当前配置项值转换成 DynamicFormValues 类型
export const toValues = (
  source: Record<string, unknown> | null
): DynamicFormValues => {
  if (!source) {
    return {}
  }
  // 这里简单地使用 Object.entries 和 Object.fromEntries 来创建一个新的对象
  return Object.fromEntries(Object.entries(source))
}

export const fileToBase64 = async (
  file: File,
  errorMessage: string
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const [, base64 = ''] = result.split(',')
      resolve(base64)
    }
    reader.onerror = () => {
      reject(reader.error || new Error(errorMessage))
    }
    reader.readAsDataURL(file)
  })
}
