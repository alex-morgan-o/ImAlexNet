<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-dark-700 rounded-xl shadow-xl w-full max-w-md p-4 border border-dark-500">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-primary-fg text-sm font-semibold">Security & Capabilities</h3>
        <button @click="$emit('close')" class="text-gray-400 hover:text-white text-sm">✕</button>
      </div>
      <div class="space-y-3">
        <div v-for="item in items" :key="item.key" class="flex items-center justify-between">
          <div>
            <div class="text-primary-fg text-sm font-medium">{{ item.label }}</div>
            <div class="text-xs text-gray-400">{{ item.desc }}</div>
          </div>
          <label class="inline-flex items-center cursor-pointer">
            <input type="checkbox" class="sr-only peer" v-model="state[item.key as keyof Perms]" />
            <div class="w-9 h-5 bg-dark-500 rounded-full peer peer-checked:bg-primary-accent transition-colors"></div>
          </label>
        </div>
      </div>
      <div class="flex justify-end gap-2 mt-4">
        <button @click="$emit('close')" class="px-3 py-1 text-xs bg-dark-500 text-primary-fg rounded">Close</button>
        <button @click="apply" class="px-3 py-1 text-xs bg-primary-accent text-white rounded">Apply</button>
      </div>
    </div>
  </div>
  
</template>

<script setup lang="ts">
import { onMounted, reactive } from 'vue'
import { invoke } from '@tauri-apps/api/core'

type Perms = { tooling: boolean; shell: boolean; sessions: boolean; cerebras: boolean; workspace: boolean }

const state = reactive<Perms>({ tooling: true, shell: true, sessions: true, cerebras: true, workspace: true })

const items = [
  { key: 'tooling', label: 'Tooling', desc: 'Tool availability and snapshot commands' },
  { key: 'shell', label: 'Shell', desc: 'Command execution and path checks' },
  { key: 'sessions', label: 'Sessions', desc: 'Chat session CRUD and metadata' },
  { key: 'cerebras', label: 'Cerebras', desc: 'Cerebras API calls' },
  { key: 'workspace', label: 'Workspace', desc: 'Workspace status and init' },
]

onMounted(async () => {
  try {
    const perms = await invoke<Perms>('get_runtime_permissions')
    Object.assign(state, perms)
  } catch (e) {
    // ignore, keep defaults
  }
})

async function apply() {
  try {
    await invoke('set_runtime_permissions', { perms: { ...state } })
  } catch (e) {
    // noop
  }
}
</script>

<style scoped>
</style>

