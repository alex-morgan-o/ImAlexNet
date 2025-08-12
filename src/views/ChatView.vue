<template>
  <div class="flex flex-1 overflow-hidden">
    <!-- Sidebar -->
    <Sidebar @select-session="handleSelectSession" />
    
    <!-- Chat Interface -->
    <div class="flex-1 flex flex-col">
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
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import Sidebar from '../components/Sidebar.vue'
import ChatMessage from '../components/ChatMessage.vue'
import ChatInput from '../components/ChatInput.vue'
import { CerebrasService, type ChatMessage as CerebrasMessage } from '../services/cerebras'

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

const messages = ref<Message[]>([])
const isLoading = ref(false)
const chatInputRef = ref()

// Current AI model settings - these could be moved to a global store
const currentModel = ref<string>('llama3.1-8b')
const maxTokens = ref<number>(500)
const temperature = ref<number>(0.7)

// Persistence key for this chat session
const CHAT_SESSION_KEY = 'alexnet-chat-session'

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

function handleSelectSession(sessionId: string) {
  // TODO: Load session messages
  console.log('Loading session:', sessionId)
}

function saveMessagesToStorage() {
  try {
    const messagesForStorage = messages.value.map(msg => ({
      ...msg,
      timestamp: msg.timestamp.toISOString(),
      files: [] // Don't persist files for now
    }))
    localStorage.setItem(CHAT_SESSION_KEY, JSON.stringify(messagesForStorage))
  } catch (error) {
    console.warn('Failed to save chat session:', error)
  }
}

function loadMessagesFromStorage() {
  try {
    const saved = localStorage.getItem(CHAT_SESSION_KEY)
    if (saved) {
      const parsedMessages = JSON.parse(saved)
      messages.value = parsedMessages.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
        files: msg.files || []
      }))
    }
  } catch (error) {
    console.warn('Failed to load chat session:', error)
  }
}

// Watch messages and save to localStorage
watch(messages, saveMessagesToStorage, { deep: true })

onMounted(() => {
  // Load existing messages
  loadMessagesFromStorage()
  
  // Check for initial prompt from HomeView
  const initialPrompt = sessionStorage.getItem('initial-chat-prompt')
  if (initialPrompt) {
    sessionStorage.removeItem('initial-chat-prompt')
    sendMessage({ text: initialPrompt, files: [] })
  }
})
</script>