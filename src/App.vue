<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import Toolbar from './components/Toolbar.vue'
import SettingsPanel from './components/SettingsPanel.vue'

const router = useRouter()
const showSettings = ref(false)

function handleNewSession() {
  // Clear chat session storage and navigate to home
  localStorage.removeItem('alexnet-chat-session')
  router.push('/')
}

function handleSelectSession(sessionId: string) {
  // Load the selected session and navigate to chat
  console.log('Loading session:', sessionId)
  // The ChatView component will handle loading the session from localStorage
  router.push('/chat')
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
    <router-view class="flex-1 flex flex-col overflow-hidden" />

    <!-- Settings Panel -->
    <SettingsPanel
      v-if="showSettings"
      @close="handleCloseSettings"
    />
  </div>
</template>