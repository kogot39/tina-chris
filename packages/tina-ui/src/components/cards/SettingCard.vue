<template>
  <div
    class="card w-full bg-base-100 card-sm shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300"
  >
    <div class="card-body">
      <div class="w-full flex items-center justify-between">
        <h2 class="card-title text-xl">
          {{ title }}
        </h2>
        <input
          v-if="showSwitchButton && checked !== undefined"
          :checked="props.checked"
          type="checkbox"
          class="toggle toggle-primary"
          @change="handleSwitch"
        />
      </div>
      <p class="whitespace-pre-line text-lg">
        {{ description }}
      </p>
      <div class="justify-end card-actions">
        <button class="btn btn-primary btn-soft" @click="emit('toPage')">
          {{ buttonText }}
          <iconpark-icon name="arrow-right" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  title?: string
  description?: string
  buttonText?: string
  showSwitchButton?: boolean
  checked?: boolean
}>()

const emit = defineEmits<{
  toPage: []
  switch: [checked: boolean]
}>()

const handleSwitch = (event: Event) => {
  event.stopPropagation()
  const target = event.target as HTMLInputElement
  // 如果父组件没有更新状态，强制恢复为当前的 prop 状态
  target.checked = props.checked || false
  emit('switch', !props.checked)
}
</script>
