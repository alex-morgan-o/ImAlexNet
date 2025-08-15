<template>
    <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div class="bg-dark-800 rounded-lg shadow-xl max-w-md w-full">
            <!-- Header -->
            <div class="flex items-center justify-between p-6 border-b border-dark-600">
                <div class="flex items-center space-x-3">
                    <div class="w-10 h-10 bg-yellow-500 rounded-full flex items-center justify-center">
                        <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                        </svg>
                    </div>
                    <h3 class="text-lg font-semibold text-white">Command Execution Permission</h3>
                </div>
                <button 
                    @click="$emit('deny')"
                    class="text-gray-400 hover:text-white transition-colors duration-200"
                >
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            <!-- Content -->
            <div class="p-6">
                <!-- User's original message -->
                <div class="mb-4">
                    <label class="text-sm font-medium text-gray-400 mb-2 block">Your Message:</label>
                    <div class="bg-dark-900 rounded-lg p-3 text-sm text-gray-300">
                        "{{ userMessage }}"
                    </div>
                </div>

                <!-- AI Analysis -->
                <div class="mb-4">
                    <label class="text-sm font-medium text-gray-400 mb-2 block">AlexNet Analysis:</label>
                    <div class="bg-dark-900 rounded-lg p-3 text-sm text-gray-300">
                        {{ command.explanation }}
                    </div>
                </div>

                <!-- Command to execute -->
                <div class="mb-6">
                    <label class="text-sm font-medium text-gray-400 mb-2 block">Command to Execute:</label>
                    <div class="bg-black rounded-lg p-3 font-mono">
                        <span class="text-green-400">$</span>
                        <span class="text-blue-400 ml-2">{{ command.command }}</span>
                        <span class="text-yellow-400 ml-1">{{ command.args.join(' ') }}</span>
                    </div>
                </div>

                <!-- Confidence indicator -->
                <div class="mb-6">
                    <div class="flex items-center justify-between mb-2">
                        <label class="text-sm font-medium text-gray-400">AI Confidence:</label>
                        <span class="text-sm text-gray-300">{{ Math.round(command.confidence * 100) }}%</span>
                    </div>
                    <div class="w-full bg-gray-700 rounded-full h-2">
                        <div 
                            class="h-2 rounded-full transition-all duration-300"
                            :class="getConfidenceColor(command.confidence)"
                            :style="{ width: `${command.confidence * 100}%` }"
                        ></div>
                    </div>
                </div>

                <!-- Security notice -->
                <div class="bg-dark-600 border border-yellow-600 rounded-lg p-3 mb-6">
                    <div class="flex items-start space-x-3">
                        <svg class="w-5 h-5 text-yellow-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
                        </svg>
                        <div class="flex-1">
                            <h4 class="text-sm font-medium text-yellow-400 mb-1">Security Notice</h4>
                            <p class="text-xs text-gray-300">
                                This command will be executed in your system's safe directories only. 
                                AlexNet restricts access to system files and sensitive locations for your security.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Actions -->
            <div class="flex items-center justify-end space-x-3 p-6 bg-dark-900 rounded-b-lg">
                <button 
                    @click="$emit('deny')"
                    class="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors duration-200"
                >
                    Cancel
                </button>
                <button 
                    @click="$emit('approve')"
                    class="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors duration-200 flex items-center space-x-2"
                >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Execute Command</span>
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import type { AnalyzedCommand } from '../types/commands';

defineProps<{
    command: AnalyzedCommand;
    userMessage: string;
}>();

const emits = defineEmits<{
    approve: [];
    deny: [];
}>();

function getConfidenceColor(confidence: number): string {
    if (confidence >= 0.8) return 'bg-green-500';
    if (confidence >= 0.6) return 'bg-yellow-500';
    return 'bg-red-500';
}

// Handle escape key to close dialog
function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
        emits('deny');
    }
}

// Add event listener when component mounts
import { onMounted, onUnmounted } from 'vue';

onMounted(() => {
    document.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown);
});
</script>