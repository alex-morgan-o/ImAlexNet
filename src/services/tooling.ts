import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export interface ToolAvailability {
  claude: boolean
  codex: boolean
  gemini: boolean
}

// Reactive state for tool availability
export const toolAvailability = ref<ToolAvailability>({
  claude: false,
  codex: false,
  gemini: false,
})

let hasListener = false

export async function initToolingListener() {
  if (hasListener) return
  hasListener = true

  // Listen for startup event from backend
  await listen<ToolAvailability>('tools:availability', (event) => {
    if (event?.payload) {
      toolAvailability.value = event.payload
    }
  })
}

export async function refreshToolAvailability() {
  try {
    const result = await invoke<ToolAvailability>('get_tool_availability')
    toolAvailability.value = result
  } catch (err) {
    console.warn('Failed to refresh tool availability:', err)
  }
}

