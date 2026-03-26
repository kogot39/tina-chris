<template>
  <main class="h-full w-full text-text transition-colors duration-300">
    <section class="mx-auto w-full h-full">
      <div
        class="group relative w-full h-full rounded-xl border border-transparent bg-transparent transition-colors duration-200 hover:border-primary focus-within:border-primary overflow-hidden"
      >
        <div
          class="pointer-events-none absolute right-0 h-10 w-10 rounded-bl-xl border-l border-b border-r-none border-t-none border-primary opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 overflow-hidden"
        >
          <div
            class="pointer-events-auto flex h-full w-full items-center justify-center text-text"
          >
            <slot name="top-right" />
          </div>
        </div>

        <div
          class="min-w-4 max-w-12 min-h-4 max-h-4 pointer-events-none absolute rounded-br-xl border-r border-b border-l-none border-t-none border-primary bg-primary opacity-0 shadow-sm transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 overflow-hidden"
        >
          <div class="pointer-events-auto text-xs text-text-muted">
            <slot name="top-left" />
          </div>
        </div>

        <div class="flex h-full w-full items-center justify-center p-4 sm:p-6">
          <slot />
        </div>
      </div>
    </section>
  </main>
</template>
