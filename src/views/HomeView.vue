<template>
  <HomeScreen @start-chat="handleStartChat" />
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import HomeScreen from '../components/HomeScreen.vue'

const router = useRouter()

async function handleStartChat(prompt: string) {
  // Store the initial prompt in session storage to be picked up by ChatView
  sessionStorage.setItem('initial-chat-prompt', prompt)
  router.push('/chat')
}
</script>