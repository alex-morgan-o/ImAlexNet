<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Toolbar from './components/Toolbar.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import { sessionManager } from './services/sessionManager'
import WorkspacePrompt from './components/WorkspacePrompt.vue'
import { getWorkspaceStatus, createWorkspace } from './services/workspace'

const router = useRouter()
const showSettings = ref(false)
const chatViewRef = ref<any>(null)
const showWorkspacePrompt = ref(false)
const workspacePath = ref('~/AlexNet')

async function handleNewSession() {
  try {
    // Clear current session and create new one
    sessionManager.clearCurrentSession()
    
    // If we're already on chat view, tell it to create a new session
    if (router.currentRoute.value.path === '/chat' && chatViewRef.value) {
      await chatViewRef.value.createNewSession()
    } else {
      // Navigate to chat view which will create a new session
      router.push('/chat')
    }
  } catch (error) {
    console.error('Failed to create new session:', error)
    // Fallback to legacy behavior
    localStorage.removeItem('alexnet-chat-session')
    router.push('/')
  }
}

async function handleSelectSession(sessionId: string) {
  try {
    console.log('Loading session:', sessionId)
    
    // Store session ID for ChatView to load
    sessionStorage.setItem('load-session-id', sessionId)
    
    // If we're already on chat view, tell it to load the session
    if (router.currentRoute.value.path === '/chat' && chatViewRef.value) {
      await chatViewRef.value.loadSession(sessionId)
    } else {
      // Navigate to chat view which will load the session
      router.push('/chat')
    }
  } catch (error) {
    console.error('Failed to load session:', error)
  }
}

function handleOpenSettings() {
  showSettings.value = true
}

function handleCloseSettings() {
  showSettings.value = false
}

onMounted(async () => {
  try {
    const status = await getWorkspaceStatus()
    workspacePath.value = status.path
    if (!status.exists) {
      showWorkspacePrompt.value = true
    }
  } catch (e) {
    console.warn('Workspace status check failed:', e)
  }
})

async function handleCreateWorkspace() {
  try {
    await createWorkspace()
  } catch (e) {
    console.error('Failed to create workspace:', e)
  } finally {
    showWorkspacePrompt.value = false
  }
}

function handleSkipWorkspace() {
  showWorkspacePrompt.value = false
}
</script>

<template>
  <div class="h-screen bg-background text-foreground flex flex-col">
    <!-- Toolbar -->
    <Toolbar
      @new-session="handleNewSession"
      @select-session="handleSelectSession"
      @toggle-os="() => console.log('Toggle OS integration')"
      @save="() => console.log('Save session')"
      @share="() => console.log('Share session')"
      @settings="handleOpenSettings"
    />
    
    <!-- Main content area with router view -->
    <router-view ref="chatViewRef" class="flex-1 flex flex-col overflow-hidden" />

    <!-- Settings Panel -->
    <SettingsPanel
      v-if="showSettings"
      @close="handleCloseSettings"
    />

    <!-- Workspace Prompt -->
    <WorkspacePrompt
      v-if="showWorkspacePrompt"
      :workspacePath="workspacePath"
      @create="handleCreateWorkspace"
      @skip="handleSkipWorkspace"
    />
  </div>
</template>
