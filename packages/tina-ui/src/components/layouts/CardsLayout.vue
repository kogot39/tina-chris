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
        :data-card-path="item.path"
        class="card-item"
        :style="{
          '--enter-delay': `${index * 100}ms`,
          '--leave-delay': getLeaveDelay(item, index),
          '--leave-duration': getLeaveDuration(item),
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
const leavingAnimatedPaths = ref(new Set<string>())
const leavingDelayByPath = ref(new Map<string, number>())

const LEAVE_DURATION_MS = 400
const LEAVE_STAGGER_MS = 100

watch(
  () => props.items,
  (next) => {
    // 避免离场动画中被外部数据覆盖，导致动画中断。
    if (isNavigating.value) return
    displayItems.value = [...next]
  },
  { deep: true }
)

const getScrollableViewport = (
  element: HTMLElement
): { top: number; bottom: number } => {
  let current = element.parentElement

  while (current) {
    const style = window.getComputedStyle(current)
    const overflowY = style.overflowY
    const canScroll =
      (overflowY === 'auto' ||
        overflowY === 'scroll' ||
        overflowY === 'overlay') &&
      current.scrollHeight > current.clientHeight

    if (canScroll) {
      const rect = current.getBoundingClientRect()
      return {
        top: rect.top,
        bottom: rect.bottom,
      }
    }

    current = current.parentElement
  }

  return {
    top: 0,
    bottom: window.innerHeight,
  }
}

const getVisibleCardPaths = (fallbackPath: string): string[] => {
  const container = cardsContainer.value
  if (!container) {
    return [fallbackPath]
  }

  const viewport = getScrollableViewport(container)
  const cards = Array.from(
    container.querySelectorAll<HTMLElement>('[data-card-path]')
  )
  const visiblePaths = cards
    .filter((card) => {
      const rect = card.getBoundingClientRect()
      return rect.bottom > viewport.top && rect.top < viewport.bottom
    })
    .map((card) => card.dataset.cardPath)
    .filter((path): path is string => Boolean(path))

  // 理论上点击来源一定在视口中；这里保底把被点击卡片纳入动画集合，
  // 防止边界测量失败时完全没有离场反馈。
  if (visiblePaths.length === 0) {
    return [fallbackPath]
  }

  return visiblePaths
}

const prepareLeaveAnimation = async (path: string): Promise<number> => {
  const visiblePaths = getVisibleCardPaths(path)
  const visiblePathSet = new Set(visiblePaths)
  const delayByPath = new Map<string, number>()

  visiblePaths.forEach((visiblePath, index) => {
    delayByPath.set(
      visiblePath,
      Math.max(visiblePaths.length - 1 - index, 0) * LEAVE_STAGGER_MS
    )
  })

  leavingAnimatedPaths.value = visiblePathSet
  leavingDelayByPath.value = delayByPath

  // 先让“哪些卡片要离场动画、各自延迟多少”刷新到 DOM，再真正移除列表。
  // TransitionGroup 会复用移除前最后一次渲染的 inline style 来执行 leave。
  await nextTick()

  return (
    LEAVE_DURATION_MS + Math.max(visiblePaths.length - 1, 0) * LEAVE_STAGGER_MS
  )
}

const getLeaveDelay = (item: CardItem, index: number): string => {
  if (!isNavigating.value) {
    return `${(displayItems.value.length - 1 - index) * LEAVE_STAGGER_MS}ms`
  }

  return `${leavingDelayByPath.value.get(item.path) ?? 0}ms`
}

const getLeaveDuration = (item: CardItem): string => {
  if (!isNavigating.value || leavingAnimatedPaths.value.has(item.path)) {
    return `${LEAVE_DURATION_MS}ms`
  }

  return '0ms'
}

const toPage = async (path: string) => {
  if (isNavigating.value) return

  isNavigating.value = true
  const totalLeaveMs = await prepareLeaveAnimation(path)

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
