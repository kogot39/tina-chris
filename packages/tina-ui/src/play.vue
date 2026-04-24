<template>
  <main class="h-full transition-colors duration-300">
    <TopBar icon="/favicon.ico" :items="breadcrumbItems" :can-back="false" />
    <SettingCard
      button-text="设置角色"
      description="配置角色信息"
      title="角色"
    />
    <FieldsetLayout>
      <Form :legend="'角色信息'">
        <InputFieldItem
          name="ttsModel"
          label="语音合成模型"
          disabled
          hint="暂时只支持阿里百炼平台下的该模型"
        />
        <InputFieldItem
          name="apiKey"
          label="API Key"
          placeholder="请输入API Key"
          prefix="Bear"
          required
        />
        <UploadFieldItem
          name="avatar"
          label="角色头像"
          :file-list="[]"
          :disabled="true"
          hint="上传功能尚未实现，敬请期待！"
        />
        <SelectFieldItem
          name="personality"
          label="角色性格"
          :options="[
            { label: '友好', value: 'friendly' },
            { label: '专业', value: 'professional' },
            { label: '幽默', value: 'humorous' },
          ]"
          hint="选择功能尚未实现，敬请期待！"
        />
      </Form>
    </FieldsetLayout>
  </main>
</template>

<script setup lang="ts">
import { inject } from 'vue'
import { TopBar } from './components/bars'
import { SettingCard } from './components/cards'
import {
  FieldsetLayout,
  Form,
  // IconButton,
  InputFieldItem,
  SelectFieldItem,
  UploadFieldItem,
} from './components'

const toast: any = inject('toast')
const modal: any = inject('modal')

modal.warning('欢迎使用 Tina UI！', {
  confirmText: '知道了',
})

toast.success('欢迎使用 Tina UI！', 3000)

setTimeout(() => {
  toast.info('这是一个信息提示', 3000)
}, 1000)

const breadcrumbItems = [
  { title: 'Home', path: '/' },
  { title: 'About', path: '/about' },
  { title: 'Contact' },
]
</script>

<style>
body,
#app {
  overflow: hidden;
  height: 100vh;
}
</style>
