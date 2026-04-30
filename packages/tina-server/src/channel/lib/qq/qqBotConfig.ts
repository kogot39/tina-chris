import type { DynamicFormSchema } from '@tina-chris/tina-ui'

// QQ 官方机器人通道的持久化配置。
// enabled 由设置页卡片上的开关控制，动态表单只展示连接所需的业务字段，
// 避免同一个启停状态同时出现在卡片和表单两个入口里。
export class QQBotChannelConfig {
  enabled: boolean = false
  appID: string = ''
  secret: string = ''
  sandbox: boolean = false
}

export function getQQBotConfigForm(): DynamicFormSchema {
  return {
    key: 'channel-qq',
    legend: 'QQ 机器人配置',
    saveText: '保存配置',
    fields: [
      {
        name: 'appID',
        type: 'input',
        label: 'App ID',
        hint: 'QQ 开放平台中的机器人 App ID。',
        required: true,
        valueType: 'string',
        rules: [{ type: 'required', message: '请输入 QQ 机器人 App ID' }],
        componentProps: {
          autocomplete: 'off',
          placeholder: '例如：1020xxxxxx',
        },
      },
      {
        name: 'secret',
        type: 'input',
        label: 'App Secret',
        hint: 'QQ 开放平台中的机器人 App Secret。',
        required: true,
        valueType: 'string',
        rules: [{ type: 'required', message: '请输入 QQ 机器人 App Secret' }],
        componentProps: {
          type: 'password',
          autocomplete: 'off',
          placeholder: '机器人 App Secret',
        },
      },
      {
        name: 'sandbox',
        type: 'switch',
        label: '沙箱环境',
        hint: '开启后连接 QQ 机器人沙箱环境，用于开发调试。',
        valueType: 'boolean',
        defaultValue: false,
      },
    ],
  }
}
