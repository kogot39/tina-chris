<template>
  <div
    class="flex items-center justify-between w-full min-h-12 p-2 bg-base-100"
  >
    <div class="flex items-center gap-4">
      <div v-if="!canBack" class="avatar">
        <div class="mask mask-squircle w-8">
          <img v-if="icon" :src="icon" />
        </div>
      </div>
      <button
        v-else
        class="btn btn-soft btn-primary btn-square btn-sm text-lg"
        @click="emit('back')"
      >
        <iconpark-icon name="arrow-left" />
      </button>

      <div v-if="items && items.length > 0" class="breadcrumbs">
        <ul>
          <li v-for="(item, index) in items" :key="index">
            <router-link
              v-if="item.path"
              :to="item.path"
              class="hover-nav-link relative inline-block transition-all"
            >
              {{ item.title }}
            </router-link>
            <template v-else>{{ item.title }}</template>
          </li>
        </ul>
      </div>
    </div>

    <div class="join">
      <button
        class="btn btn-ghost btn-primary btn-square join-item btn-sm text-lg"
        @click="emit('hide')"
      >
        <iconpark-icon name="minus" />
      </button>
      <button
        class="btn btn-ghost btn-error btn-square join-item btn-sm text-lg"
        @click="emit('close')"
      >
        <iconpark-icon name="close" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
export interface BreadcrumbItem {
  title: string
  path?: string
}

withDefaults(
  defineProps<{
    icon?: string
    canBack?: boolean
    items?: BreadcrumbItem[]
  }>(),
  {
    canBack: false,
    items: () => [],
  }
)

const emit = defineEmits<{
  close: []
  hide: []
  back: []
}>()
</script>

<style scoped>
.hover-nav-link {
  text-decoration: none;
  color: currentColor;
  transition: color 0.3s ease-out;
}

.hover-nav-link:hover {
  color: var(--color-primary);
}

.hover-nav-link::after {
  content: '';
  position: absolute;
  left: 0;
  bottom: -2px;
  width: 0;
  height: 2px;
  background-color: var(--color-primary);
  transition: width 0.2s ease-out;
}

.hover-nav-link:hover::after {
  width: 100%;
}

li:not(:last-child) {
  color: var(--color-neutral-content);
}
</style>
