<template>
  <div class="w-full max-w-4xl mt-4">
    <div class="bg-card/70 border border-border rounded-lg p-4 backdrop-blur">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-semibold text-foreground/90">Workspace</h2>
        <div class="flex items-center gap-2">
          <button
            v-if="!workspaceExists"
            @click="createWorkspace"
            class="text-xs px-3 py-1 rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors"
            :disabled="isCreating"
          >
            {{ isCreating ? 'Creating...' : 'Create' }}
          </button>
          <button
            @click="selectFolder"
            class="text-xs px-3 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            :disabled="isSelecting"
          >
            {{ isSelecting ? 'Selecting...' : 'Select Folder' }}
          </button>
        </div>
      </div>
      
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2">
          <span
            class="w-2 h-2 rounded-full"
            :class="workspaceExists ? 'bg-green-400' : 'bg-orange-400'"
          />
          <span class="text-xs font-medium text-foreground/80">
            {{ workspaceExists ? 'Active' : 'Not Set' }}
          </span>
        </div>
        
        <div class="flex-1">
          <code class="text-xs text-foreground/90 bg-muted px-2 py-1 rounded">
            {{ displayPath }}
          </code>
        </div>
      </div>
      
      <p class="text-xs text-muted-foreground mt-2">
        {{ workspaceExists 
          ? 'AlexNet will use this workspace for file operations and project management.'
          : 'Select a workspace folder where AlexNet can create and manage files for your projects.'
        }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { getWorkspaceStatus, createWorkspace as createWorkspaceService, setWorkspacePath } from '../services/workspace'

const emit = defineEmits<{
  workspaceChanged: [path: string]
}>()

const workspacePath = ref<string>('')
const workspaceExists = ref<boolean>(false)
const isCreating = ref<boolean>(false)
const isSelecting = ref<boolean>(false)

const displayPath = computed(() => {
  if (!workspacePath.value) return 'No workspace selected'
  return workspacePath.value
})

async function loadWorkspace() {
  try {
    // console.log('Loading workspace status...')
    const status = await getWorkspaceStatus()
    // console.log('Workspace status received:', status)
    workspacePath.value = status.path
    workspaceExists.value = status.exists
    // console.log('UI updated - Path:', workspacePath.value, 'Exists:', workspaceExists.value)
  } catch (e) {
    console.warn('Failed to load workspace status:', e)
    workspacePath.value = ''
    workspaceExists.value = false
  }
}

async function createWorkspace() {
  if (isCreating.value) return
  
  try {
    isCreating.value = true
    await createWorkspaceService()
    await loadWorkspace()
    emit('workspaceChanged', workspacePath.value)
  } catch (error) {
    console.error('Failed to create workspace:', error)
  } finally {
    isCreating.value = false
  }
}

async function selectFolder() {
  if (isSelecting.value) return
  
  try {
    isSelecting.value = true
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: 'Select Workspace Folder'
    })
    
    if (selected) {
      // Set the workspace path through the backend
      try {
        await setWorkspacePath(selected)
        await loadWorkspace()
        emit('workspaceChanged', selected)
      } catch (error) {
        console.error('Failed to set workspace path:', error)
        // Temporary fallback - manually update the UI
        workspacePath.value = selected
        workspaceExists.value = true
        emit('workspaceChanged', selected)
      }
    }
  } catch (error) {
    console.error('Failed to open folder dialog:', error)
  } finally {
    isSelecting.value = false
  }
}

onMounted(() => {
  loadWorkspace()
})

// Expose refresh function for parent components
defineExpose({
  refresh: loadWorkspace
})
</script>