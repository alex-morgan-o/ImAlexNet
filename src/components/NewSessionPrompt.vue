<template>
  <div class="p-6 rounded-xl bg-dark-300 border border-dark-200 text-foreground">
    <h2 class="text-xl font-semibold mb-2">Welcome! What would you like to do?</h2>
    <p class="text-sm text-gray-400 mb-4">
      Describe your goal. If you plan to work with files or code, set a working directory so I can manage files safely.
    </p>

    <div class="mt-4">
      <label class="block text-sm text-gray-300 mb-1">Project name (optional)</label>
      <input
        v-model="projectName"
        type="text"
        placeholder="my-app"
        class="w-full px-3 py-2 rounded-lg bg-dark-200 text-foreground placeholder-gray-500 outline-none border border-dark-100 focus:border-primary-accent"
      />
    </div>

    <div class="mt-3 text-sm text-gray-400">
      Suggested directory: <span class="text-gray-200">{{ suggestedPath }}</span>
    </div>

    <div class="mt-4 flex items-center gap-2 flex-wrap">
      <button
        class="px-3 py-2 rounded-md bg-primary-accent text-white"
        @click="useSuggested"
      >Use Suggested</button>
      <button
        class="px-3 py-2 rounded-md text-gray-300 hover:text-white"
        @click="$emit('skip')"
      >Skip for now</button>
    </div>

    <div class="mt-4">
      <label class="block text-sm text-gray-300 mb-1">Or set a custom path</label>
      <div class="flex gap-2 flex-wrap">
        <input
          v-model="customPath"
          type="text"
          :placeholder="suggestedPath"
          class="flex-1 min-w-[240px] px-3 py-2 rounded-lg bg-dark-200 text-foreground placeholder-gray-500 outline-none border border-dark-100 focus:border-primary-accent"
        />
        <button
          class="px-3 py-2 rounded-md bg-dark-100 text-foreground border border-dark-200"
          @click="useCustom"
        >Set Path</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

const emit = defineEmits<{
  (e: 'set-working-directory', path: string): void
  (e: 'skip'): void
}>()

const projectName = ref('')
const customPath = ref('')
const suggestedPath = computed(() => {
  const name = projectName.value?.trim() || 'project'
  return `~/AlexNet/${name}`
})

function useSuggested() {
  emit('set-working-directory', suggestedPath.value)
}

function useCustom() {
  const value = (customPath.value || '').trim()
  if (value.length > 0) emit('set-working-directory', value)
}
</script>

<style scoped>
.bg-dark-300 { background-color: #2c313a; }
.bg-dark-200 { background-color: #2a2f38; }
.bg-dark-100 { background-color: #282c34; }
.border-dark-200 { border-color: #3a3f4b; }
.border-dark-100 { border-color: #333844; }
.text-foreground { color: #abb2bf; }
.text-primary { color: #61afef; }
.bg-primary-accent { background-color: #61afef; }
</style>
