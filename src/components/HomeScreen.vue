<template>
    <div
        class="flex-1 flex flex-col items-center justify-center bg-primary-bg px-6"
    >
        <div class="w-full max-w-2xl">
            <BlackHoleBackground
                class="absolute inset-0 flex items-center justify-center rounded-xl"
            />
            <!-- Greeting -->
            <div class="text-center mb-8">
                <h1 class="text-2xl text-primary-fg mb-4">
                    I'm AlexNet<br />I can do anything
                </h1>
            </div>

            <!-- Chat Input -->
            <div class="relative">
                <textarea
                    ref="textareaRef"
                    v-model="message"
                    @keydown="handleKeydown"
                    @input="adjustHeight"
                    :placeholder="currentPlaceholder"
                    class="input-field w-full resize-none overflow-hidden min-h-[60px] max-h-32 pr-12 text-base placeholder-transition"
                    rows="1"
                />
                <button
                    @click="sendMessage"
                    :disabled="!message.trim()"
                    class="absolute right-3 top-1/2 transform -translate-y-1/2 p-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    :class="
                        message.trim()
                            ? 'text-primary-accent hover:bg-dark-200'
                            : 'text-gray-400'
                    "
                >
                    <svg
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        class="w-6 h-6"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                        />
                    </svg>
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from "vue";

const message = ref("");
const textareaRef = ref<HTMLTextAreaElement>();
const currentPlaceholder = ref("");
const placeholderIndex = ref(0);
let placeholderInterval: number | null = null;

const placeholders = [
    "ask me anything...",
    "awaiting orders...",
    "your wish is my command...",
    "make your wish...",
    "how can I help?...",
    "what shall we build?...",
    "ready for action...",
    "at your service...",
    "what's on your mind?...",
    "let's create something...",
    "what do you need?...",
    "I'm all ears...",
    "fire away...",
    "what's the mission?...",
];

const emit = defineEmits(["start-chat"]);

async function adjustHeight() {
    await nextTick();
    if (textareaRef.value) {
        textareaRef.value.style.height = "auto";
        textareaRef.value.style.height = `${textareaRef.value.scrollHeight}px`;
    }
}

function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

function sendMessage() {
    if (!message.value.trim()) return;

    emit("start-chat", message.value.trim());
    message.value = "";
    adjustHeight();
}

function rotatePlaceholder() {
    placeholderIndex.value = (placeholderIndex.value + 1) % placeholders.length;
    currentPlaceholder.value = placeholders[placeholderIndex.value];
}

onMounted(() => {
    // Set initial placeholder
    currentPlaceholder.value = placeholders[0];

    // Start rotation every 2.5 seconds
    placeholderInterval = setInterval(rotatePlaceholder, 2500);
});

onUnmounted(() => {
    if (placeholderInterval) {
        clearInterval(placeholderInterval);
    }
});
</script>

<style scoped>
.placeholder-transition::placeholder {
    transition: opacity 0.3s ease-in-out;
}

.placeholder-transition:focus::placeholder {
    opacity: 0.6;
}
</style>
