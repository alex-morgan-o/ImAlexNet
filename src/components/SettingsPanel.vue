<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" @click.self="$emit('close')">
    <div class="bg-dark-400 rounded-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto m-4">
      <!-- Header -->
      <div class="flex items-center justify-between p-6 border-b border-dark-300">
        <h2 class="text-xl font-semibold text-primary-fg">Settings</h2>
        <button @click="$emit('close')" class="text-gray-400 hover:text-primary-fg">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="w-6 h-6">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="p-6 space-y-8">
        <!-- Theme Settings -->
        <div class="space-y-4">
          <h3 class="text-lg font-medium text-primary-fg">Appearance</h3>
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-primary-fg">Theme</span>
              <select v-model="settings.theme" class="input-field">
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="auto">Auto (System)</option>
              </select>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-primary-fg">Font Size</span>
              <select v-model="settings.fontSize" class="input-field">
                <option value="sm">Small</option>
                <option value="md">Medium</option>
                <option value="lg">Large</option>
              </select>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-primary-fg">Code Theme</span>
              <select v-model="settings.codeTheme" class="input-field">
                <option value="one-dark">One Dark Pro</option>
                <option value="github">GitHub</option>
                <option value="monokai">Monokai</option>
              </select>
            </div>
          </div>
        </div>


        <!-- API Keys -->
        <div class="space-y-4">
          <h3 class="text-lg font-medium text-primary-fg">API Keys</h3>
          <p class="text-sm text-gray-400">API keys are stored securely and never shared.</p>
          <div class="space-y-3">
            <div>
              <label class="block text-sm font-medium text-primary-fg mb-2">OpenAI API Key</label>
              <input
                v-model="apiKeys.openai"
                type="password"
                placeholder="sk-..."
                class="input-field w-full"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-primary-fg mb-2">Anthropic API Key</label>
              <input
                v-model="apiKeys.anthropic"
                type="password"
                placeholder="sk-ant-..."
                class="input-field w-full"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-primary-fg mb-2">Google API Key</label>
              <input
                v-model="apiKeys.google"
                type="password"
                placeholder="AI..."
                class="input-field w-full"
              />
            </div>
          </div>
        </div>

        <!-- Behavior Settings -->
        <div class="space-y-4">
          <h3 class="text-lg font-medium text-primary-fg">Behavior</h3>
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <div>
                <span class="text-primary-fg">Auto-save Sessions</span>
                <p class="text-sm text-gray-400">Automatically save chat sessions</p>
              </div>
              <label class="relative inline-flex items-center cursor-pointer">
                <input v-model="settings.autoSave" type="checkbox" class="sr-only peer">
                <div class="w-11 h-6 bg-dark-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-accent/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-accent"></div>
              </label>
            </div>
            <div class="flex items-center justify-between">
              <div>
                <span class="text-primary-fg">Streaming Responses</span>
                <p class="text-sm text-gray-400">Show responses as they're generated</p>
              </div>
              <label class="relative inline-flex items-center cursor-pointer">
                <input v-model="settings.streaming" type="checkbox" class="sr-only peer">
                <div class="w-11 h-6 bg-dark-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-accent/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-accent"></div>
              </label>
            </div>
            <div class="flex items-center justify-between">
              <div>
                <span class="text-primary-fg">Auto-apply Safe Changes</span>
                <p class="text-sm text-gray-400">Automatically apply low-risk code changes</p>
              </div>
              <label class="relative inline-flex items-center cursor-pointer">
                <input v-model="settings.autoApply" type="checkbox" class="sr-only peer">
                <div class="w-11 h-6 bg-dark-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-accent/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-accent"></div>
              </label>
            </div>
          </div>
        </div>

        <!-- Privacy & Security -->
        <div class="space-y-4">
          <h3 class="text-lg font-medium text-primary-fg">Privacy & Security</h3>
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <div>
                <span class="text-primary-fg">Send Usage Analytics</span>
                <p class="text-sm text-gray-400">Help improve AlexNet (anonymous)</p>
              </div>
              <label class="relative inline-flex items-center cursor-pointer">
                <input v-model="settings.analytics" type="checkbox" class="sr-only peer">
                <div class="w-11 h-6 bg-dark-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-accent/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-accent"></div>
              </label>
            </div>
            <div>
              <button
                @click="clearAllData"
                class="px-4 py-2 bg-primary-error text-white rounded-lg hover:bg-red-600 transition-colors duration-200"
              >
                Clear All Data
              </button>
              <p class="text-sm text-gray-400 mt-2">This will delete all sessions, settings, and API keys.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-between p-6 border-t border-dark-300">
        <div class="text-sm text-gray-400">
          AlexNet v1.0.0
        </div>
        <div class="flex space-x-3">
          <button
            @click="resetToDefaults"
            class="px-4 py-2 bg-dark-300 text-primary-fg rounded-lg hover:bg-dark-200 transition-colors duration-200"
          >
            Reset to Defaults
          </button>
          <button
            @click="saveSettings"
            class="btn-primary"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'

const settings = reactive({
  theme: 'dark',
  fontSize: 'md',
  codeTheme: 'one-dark',
  autoSave: true,
  streaming: true,
  autoApply: false,
  analytics: false
})

const apiKeys = reactive({
  openai: '',
  anthropic: '',
  google: ''
})

defineEmits(['close'])

function saveSettings() {
  // In a real app, this would save to local storage or backend
  console.log('Saving settings:', settings)
  console.log('Saving API keys:', { ...apiKeys, openai: '***', anthropic: '***', google: '***' })
  // TODO: Implement settings persistence
}

function resetToDefaults() {
  Object.assign(settings, {
    theme: 'dark',
    fontSize: 'md',
    codeTheme: 'one-dark',
    autoSave: true,
    streaming: true,
    autoApply: false,
    analytics: false
  })
}

function clearAllData() {
  if (confirm('Are you sure you want to clear all data? This action cannot be undone.')) {
    // TODO: Clear all stored data
    console.log('Clearing all data...')
  }
}
</script>