<template>
    <div class="relative flex-1 flex items-center justify-center">
        <!-- Full-page BlackHole Background -->
        <BlackHoleBackground class="absolute inset-0" />

        <!-- Content overlay -->
        <div class="absolute z-10 w-full max-w-4xl flex flex-col items-center">
            <!-- Greeting -->
            <div class="text-center mb-8">
                <h1 class="text-2xl text-primary-fg mb-4 font-extrabold">
                    I'm AlexNet<br />I can do anything
                </h1>
            </div>

            <!-- Chat Input -->
            <div class="relative w-full max-w-4xl">
                <ChatInput
                    v-model="message"
                    @keydown="handleKeydown"
                    class="w-full text-base min-h-[60px]"
                    container-class="w-full max-w-4xl"
                />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import BlackHoleBackground from "./BlackHoleBackground.vue";
import ChatInput from "./ChatInput.vue";

const message = ref("");

const emit = defineEmits(["start-chat"]);

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
}
</script>
