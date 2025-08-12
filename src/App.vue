<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Toolbar from './components/Toolbar.vue'
import Sidebar from './components/Sidebar.vue'
import HomeScreen from './components/HomeScreen.vue'
import ChatMessage from './components/ChatMessage.vue'
import ChatInput from './components/ChatInput.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import { CerebrasService, type ChatMessage as CerebrasMessage } from './services/cerebras'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content?: string
  code?: {
    language: string
    content: string
  }
  files?: File[]
  timestamp: Date
  canApply?: boolean
}

const currentView = ref<'home' | 'chat'>('home')
const messages = ref<Message[]>([])
const isLoading = ref(false)
const chatInputRef = ref()
const showSettings = ref(false)

// Current AI model settings
const currentModel = ref<string>('llama3.1-8b')
const maxTokens = ref<number>(500)
const temperature = ref<number>(0.7)

async function handleStartChat(prompt: string) {
  currentView.value = 'chat'
  await sendMessage({ text: prompt, files: [] })
}

async function sendMessage(messageData: { text: string; files: File[] }) {
  if (!messageData.text.trim()) return
  
  // Add user message
  const userMessage: Message = {
    id: Date.now().toString(),
    role: 'user',
    content: messageData.text,
    files: messageData.files,
    timestamp: new Date()
  }
  messages.value.push(userMessage)
  
  // Set loading state
  isLoading.value = true
  chatInputRef.value?.setLoading(true)
  
  try {
    // Call Cerebras API
    const response = await getCerebrasResponse(messageData.text)
    
    const aiMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: response.content,
      code: response.code,
      timestamp: new Date(),
      canApply: response.canApply
    }
    
    messages.value.push(aiMessage)
  } catch (error) {
    console.error('Error getting AI response:', error)
    
    // Add error message
    const errorMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: 'Sorry, I encountered an error processing your request. Please try again.',
      timestamp: new Date()
    }
    messages.value.push(errorMessage)
  } finally {
    isLoading.value = false
    chatInputRef.value?.setLoading(false)
  }
}

async function getCerebrasResponse(userInput: string) {
  // Convert current messages to Cerebras format for context
  const contextMessages: CerebrasMessage[] = CerebrasService.formatMessages(
    messages.value.slice(-6) // Include last 6 messages for context
  )
  
  // Add the current user input
  contextMessages.push({
    role: 'user',
    content: userInput
  })
  
  // Call Cerebras chat API
  const response = await CerebrasService.chat(contextMessages, {
    model: currentModel.value,
    max_tokens: maxTokens.value,
    temperature: temperature.value
  })
  
  if (!response.success) {
    throw new Error(response.error || 'Failed to get response from Cerebras')
  }
  
  const content = response.data?.message || response.data?.text || 'No response received'
  
  // Detect if response contains code
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g
  const codeMatch = codeBlockRegex.exec(content)
  
  let code: { language: string; content: string } | undefined = undefined
  let canApply = false
  
  if (codeMatch) {
    code = {
      language: codeMatch[1] || 'text',
      content: codeMatch[2].trim()
    }
    canApply = true
  }
  
  return {
    content,
    code,
    canApply
  }
}

function handleApplyChanges(message: Message) {
  // In a real app, this would apply the changes to files
  console.log('Applying changes from message:', message.id)
  // TODO: Implement file system integration via Tauri
}

function handleRegenerateMessage(message: Message) {
  // Find and regenerate the AI message
  const index = messages.value.findIndex(m => m.id === message.id)
  if (index > 0) {
    // Get the previous user message to regenerate response
    const userMessage = messages.value[index - 1]
    if (userMessage?.role === 'user') {
      // Remove the current AI message and regenerate
      messages.value.splice(index, 1)
      sendMessage({ text: userMessage.content || '', files: userMessage.files || [] })
    }
  }
}

function handleNewSession() {
  messages.value = []
  currentView.value = 'home'
}

function handleSelectSession(sessionId: string) {
  // TODO: Load session messages
  console.log('Loading session:', sessionId)
}

function handleOpenSettings() {
  showSettings.value = true
}

function handleCloseSettings() {
  showSettings.value = false
}

// Mock Tauri integration
onMounted(() => {
  console.log('AlexNet initialized')
})
</script>

<template>
  <div class="h-screen bg-background text-foreground flex flex-col">
    <!-- Toolbar -->
    <Toolbar
      @new-session="handleNewSession"
      @toggle-os="() => console.log('Toggle OS integration')"
      @save="() => console.log('Save session')"
      @share="() => console.log('Share session')"
      @settings="handleOpenSettings"
    />
    
    <div class="flex flex-1 overflow-hidden">
      <!-- Sidebar -->
      <Sidebar
        v-if="currentView === 'chat'"
        @select-session="handleSelectSession"
      />
      
      <!-- Main content area -->
      <div class="flex-1 flex flex-col">
        <!-- Home Screen -->
        <HomeScreen
          v-if="currentView === 'home'"
          @start-chat="handleStartChat"
        />
        
        <!-- Chat Interface -->
        <div v-else class="flex-1 flex flex-col">
          <!-- Messages area -->
          <div class="flex-1 overflow-y-auto p-4 space-y-4">
            <div v-if="messages.length === 0" class="text-center text-gray-400 mt-8">
              <p>Start a conversation...</p>
            </div>
            <ChatMessage
              v-for="message in messages"
              :key="message.id"
              :message="message"
              @apply-changes="handleApplyChanges"
              @regenerate="handleRegenerateMessage"
            />
            
            <!-- Loading indicator -->
            <div v-if="isLoading" class="flex justify-start">
              <div class="flex items-center space-x-2 px-4 py-3 bg-dark-300 rounded-2xl">
                <div class="w-2 h-2 bg-primary-accent rounded-full animate-bounce"></div>
                <div class="w-2 h-2 bg-primary-accent rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
                <div class="w-2 h-2 bg-primary-accent rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
                <span class="text-sm text-gray-400 ml-2">Thinking...</span>
              </div>
            </div>
          </div>
          
          <!-- Chat Input -->
          <ChatInput
            ref="chatInputRef"
            @send-message="sendMessage"
          />
        </div>
      </div>
    </div>

    <!-- Settings Panel -->
    <SettingsPanel
      v-if="showSettings"
      @close="handleCloseSettings"
    />
  </div>
</template>