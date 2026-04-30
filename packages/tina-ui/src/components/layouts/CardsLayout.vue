<template>
  <div
    ref="cardsContainer"
    class="w-full"
    :style="{
      height: lockedHeight !== null ? `${lockedHeight}px` : 'auto',
    }"
  >
    <TransitionGroup
      name="card"
      tag="div"
      class="flex flex-col gap-4 w-full p-4 overscroll-y-auto overflow-x-hidden"
      appear
    >
      <SettingCard
        v-for="(item, index) in displayItems"
        :key="item.path"
        :title="item.title"
        :description="item.description"
        :button-text="item.buttonText"
        :show-switch-button="props.showSwitchButton"
        :checked="item.state"
        class="card-item"
        :style="{
          '--enter-delay': `${index * 100}ms`,
          '--leave-delay': `${(displayItems.length - 1 - index) * 100}ms`,
        }"
        @to-page="toPage(item.path)"
        @switch="(checked) => handleStateSwitch(item.path, checked)"
      />
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
import { SettingCard } from '../cards'
import { useRouter } from 'vue-router'

const router = useRouter()
const cardsContainer = useTemplateRef('cardsContainer')
const lockedHeight = ref<number | null>(null)

type CardItem = {
  title: string
  description: string
  buttonText: string
  path: string
  state?: boolean
}

const props = defineProps<{
  items: CardItem[]
  showSwitchButton?: boolean
}>()

const emit = defineEmits<{
  onSwitch: [path: string, checked: boolean]
}>()

const displayItems = ref<CardItem[]>([...props.items])
const isNavigating = ref(false)

watch(
  () => props.items,
  (next) => {
    // 避免离场动画中被外部数据覆盖，导致动画中断。
    if (isNavigating.value) return
    displayItems.value = [...next]
  },
  { deep: true }
)

const toPage = (path: string) => {
  if (isNavigating.value) return

  isNavigating.value = true

  const leaveBaseMs = 400
  const leaveDelayMs = Math.max(displayItems.value.length - 1, 0) * 100
  const totalLeaveMs = leaveBaseMs + leaveDelayMs

  displayItems.value = []

  window.setTimeout(() => {
    router.push(path)
  }, totalLeaveMs)
}

const handleStateSwitch = (path: string, checked: boolean) => {
  emit('onSwitch', path, checked)
}

onMounted(async () => {
  await nextTick()
  if (cardsContainer.value) {
    lockedHeight.value = cardsContainer.value.offsetHeight
  }
})
</script>

<style scoped>
/* 进入时的初始状态和动画配置 */
.card-enter-active {
  opacity: 0; /* 在延迟期间保持隐藏 */
  animation: fadeInLeft 0.4s ease-out forwards;
  animation-delay: var(--enter-delay);
}

/* 离开时的动画配置 */
.card-leave-active {
  animation: fadeOutRight 0.4s ease-in forwards;
  animation-delay: var(--leave-delay);
}

@keyframes fadeInLeft {
  from {
    opacity: 0;
    transform: translateX(-30px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes fadeOutRight {
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(30px);
  }
}
</style>
