<template>
  <div class="w-64 bg-dark-500 border-r border-dark-300 flex flex-col h-full">
    <!-- Search bar -->
    <div class="p-4">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search sessions..."
        class="input-field w-full text-sm"
      />
    </div>

    <!-- Session list -->
    <div class="flex-1 overflow-y-auto px-2">
      <div class="mb-4">
        <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-2">Today</h3>
        <div
          v-for="session in todaySessions"
          :key="session.id"
          :class="['sidebar-item', { active: session.id === activeSessionId }]"
          @click="$emit('select-session', session.id)"
        >
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">{{ session.title }}</p>
            <p class="text-xs text-gray-400 truncate">{{ session.preview }}</p>
          </div>
          <span class="text-xs text-gray-400">{{ formatTime(session.timestamp) }}</span>
        </div>
      </div>

      <div class="mb-4">
        <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-2">Yesterday</h3>
        <div
          v-for="session in yesterdaySessions"
          :key="session.id"
          :class="['sidebar-item', { active: session.id === activeSessionId }]"
          @click="$emit('select-session', session.id)"
        >
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">{{ session.title }}</p>
            <p class="text-xs text-gray-400 truncate">{{ session.preview }}</p>
          </div>
          <span class="text-xs text-gray-400">{{ formatTime(session.timestamp) }}</span>
        </div>
      </div>

      <div class="mb-4">
        <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-2">Previous 7 days</h3>
        <div
          v-for="session in weekSessions"
          :key="session.id"
          :class="['sidebar-item', { active: session.id === activeSessionId }]"
          @click="$emit('select-session', session.id)"
        >
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">{{ session.title }}</p>
            <p class="text-xs text-gray-400 truncate">{{ session.preview }}</p>
          </div>
          <span class="text-xs text-gray-400">{{ formatDate(session.timestamp) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

interface Session {
  id: string
  title: string
  preview: string
  timestamp: Date
}

const searchQuery = ref('')
const activeSessionId = ref('1')

// Mock session data
const allSessions = ref<Session[]>([
  {
    id: '1',
    title: 'Code Review Request',
    preview: 'Can you review my React component?',
    timestamp: new Date(Date.now() - 1000 * 60 * 30), // 30 mins ago
  },
  {
    id: '2', 
    title: 'Database Design Help',
    preview: 'Need help designing a user schema...',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
  },
  {
    id: '3',
    title: 'API Documentation',
    preview: 'Generate docs for my REST API',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24), // Yesterday
  },
  {
    id: '4',
    title: 'Bug Investigation',
    preview: 'Strange behavior in production...',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3), // 3 days ago
  }
])

const todaySessions = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return filteredSessions.value.filter(session => session.timestamp >= today)
})

const yesterdaySessions = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
  return filteredSessions.value.filter(session => 
    session.timestamp >= yesterday && session.timestamp < today
  )
})

const weekSessions = computed(() => {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)
  const weekAgo = new Date(yesterday.getTime() - 6 * 24 * 60 * 60 * 1000)
  return filteredSessions.value.filter(session => 
    session.timestamp >= weekAgo && session.timestamp < yesterday
  )
})

const filteredSessions = computed(() => {
  if (!searchQuery.value) return allSessions.value
  return allSessions.value.filter(session => 
    session.title.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
    session.preview.toLowerCase().includes(searchQuery.value.toLowerCase())
  )
})

function formatTime(timestamp: Date) {
  return timestamp.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

function formatDate(timestamp: Date) {
  return timestamp.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  })
}

defineEmits(['select-session'])
</script>