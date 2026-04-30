<template>
  <main class="h-full transition-colors duration-300">
    <TopBar icon="/favicon.ico" :items="breadcrumbItems" :can-back="false" />
    <CardsLayout :items="cards" show-switch-button @on-switch="handleSwitch" />
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
import { inject, ref } from 'vue'
import { TopBar } from './components/bars'
import {
  CardsLayout,
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

const cards = ref([
  {
    path: '/',
    title: '聊天通道列表',
    description: '查看和管理所有已配置的聊天通道',
    buttonText: '查看',
    state: true,
  },
])

const handleSwitch = (path: string, checked: boolean) => {
  // cards.value = cards.value.map((card) =>
  //   card.path === path ? { ...card, state: checked } : card
  // )
  toast.info(`路径：${path}，状态：${checked ? '开启' : '关闭'}`)
}
</script>

<style>
body,
#app {
  overflow: hidden;
  height: 100vh;
}
</style>
