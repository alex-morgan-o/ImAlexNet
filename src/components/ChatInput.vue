<template>
  <div class="border-t border-dark-300 bg-dark-400 p-4">
    <div class="max-w-4xl mx-auto">
      <div class="relative">
        <textarea
          ref="textareaRef"
          v-model="message"
          @keydown="handleKeydown"
          @input="adjustHeight"
          placeholder="Ask AlexNet anything..."
          class="input-field w-full resize-none overflow-hidden min-h-[44px] max-h-32 pr-12"
          rows="1"
        />
        <button
          @click="sendMessage"
          :disabled="!message.trim() || isLoading"
          class="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          :class="message.trim() && !isLoading ? 'text-primary-accent hover:bg-dark-200' : 'text-gray-400'"
        >
          <svg v-if="!isLoading" fill="none" stroke="currentColor" viewBox="0 0 24 24" class="w-5 h-5">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
          <svg v-else class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </button>
      </div>
      
      <!-- Quick actions -->
      <div v-if="!message" class="flex flex-wrap gap-2 mt-3">
        <button
          v-for="suggestion in quickSuggestions"
          :key="suggestion"
          @click="message = suggestion"
          class="px-3 py-1 text-sm bg-dark-300 text-primary-fg rounded-full hover:bg-dark-200 transition-colors duration-200"
        >
          {{ suggestion }}
        </button>
      </div>
      
      <!-- File upload area -->
      <div v-if="message" class="mt-3 flex items-center space-x-2">
        <button
          @click="fileInput?.click()"
          class="flex items-center space-x-1 px-3 py-1 text-sm bg-dark-300 text-primary-fg rounded-lg hover:bg-dark-200 transition-colors duration-200"
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="w-4 h-4">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
          <span>Attach files</span>
        </button>
        <input
          ref="fileInput"
          type="file"
          multiple
          class="hidden"
          @change="handleFileUpload"
        />
      </div>
      
      <!-- Uploaded files preview -->
      <div v-if="uploadedFiles.length" class="mt-2 flex flex-wrap gap-2">
        <div
          v-for="(file, index) in uploadedFiles"
          :key="index"
          class="flex items-center space-x-2 px-2 py-1 bg-dark-300 rounded-lg text-sm"
        >
          <span class="text-primary-fg">{{ file.name }}</span>
          <button
            @click="removeFile(index)"
            class="text-gray-400 hover:text-primary-error"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'

const message = ref('')
const textareaRef = ref<HTMLTextAreaElement>()
const fileInput = ref<HTMLInputElement>()
const uploadedFiles = ref<File[]>([])
const isLoading = ref(false)

const quickSuggestions = [
  'Help me debug this code',
  'Explain this concept',
  'Write a function for...',
  'Review my architecture',
  'Generate documentation'
]

const emit = defineEmits(['send-message'])

async function adjustHeight() {
  await nextTick()
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto'
    textareaRef.value.style.height = `${textareaRef.value.scrollHeight}px`
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    sendMessage()
  }
}

function sendMessage() {
  if (!message.value.trim() || isLoading.value) return
  
  emit('send-message', {
    text: message.value.trim(),
    files: [...uploadedFiles.value]
  })
  
  message.value = ''
  uploadedFiles.value = []
  adjustHeight()
}

function handleFileUpload(event: Event) {
  const files = (event.target as HTMLInputElement).files
  if (files) {
    uploadedFiles.value.push(...Array.from(files))
  }
}

function removeFile(index: number) {
  uploadedFiles.value.splice(index, 1)
}

defineExpose({
  setLoading: (loading: boolean) => {
    isLoading.value = loading
  }
})
</script>