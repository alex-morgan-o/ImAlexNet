<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import Toolbar from './components/Toolbar.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import { sessionManager } from './services/sessionManager'

const router = useRouter()
const showSettings = ref(false)
const chatViewRef = ref<any>(null)

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
  </div>
</template>