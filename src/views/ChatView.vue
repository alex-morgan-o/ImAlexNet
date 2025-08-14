<template>
    <div class="flex flex-1 overflow-hidden h-full">
        <!-- Sidebar -->
        <!-- <Sidebar @select-session="handleSelectSession" /> -->

        <!-- Chat Interface -->
        <div class="flex-1 flex flex-col h-full">
            <!-- Messages area -->
            <div ref="messagesContainer" class="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
                <ChatMessage
                    v-for="message in messages"
                    :key="message.id"
                    :message="message"
                    @apply-changes="handleApplyChanges"
                    @regenerate="handleRegenerateMessage"
                />


                <!-- Loading indicator -->
                <div v-if="isLoading" class="flex justify-start">
                    <div
                        class="flex items-center space-x-2 px-4 py-3 bg-dark-300 rounded-2xl"
                    >
                        <div
                            class="w-2 h-2 bg-primary-accent rounded-full animate-bounce"
                        ></div>
                        <div
                            class="w-2 h-2 bg-primary-accent rounded-full animate-bounce"
                            style="animation-delay: 0.1s"
                        ></div>
                        <div
                            class="w-2 h-2 bg-primary-accent rounded-full animate-bounce"
                            style="animation-delay: 0.2s"
                        ></div>
                        <span class="text-sm text-gray-400 ml-2"
                            >Thinking...</span
                        >
                    </div>
                </div>
            </div>

            <!-- Simple Chat Input - Fixed at bottom -->
            <div class="p-4">
                <div class="flex items-center space-x-2 p-4 rounded-lg">
                    <input
                        ref="inputRef"
                        v-model="inputText"
                        type="text"
                        placeholder=">"
                        class="flex-1 bg-transparent border-none outline-none text-white placeholder-gray-400"
                        @keyup.enter="handleSendMessage"
                    />
                    <button
                        @click="handleSendMessage"
                        :disabled="!inputText.trim()"
                        class="px-4 py-2 bg-primary-accent text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from "vue";
// import Sidebar from "../components/Sidebar.vue";
import ChatMessage from "../components/ChatMessage.vue";
import {
    CerebrasService,
    type ChatMessage as CerebrasMessage,
} from "../services/cerebras";

interface Message {
    id: string;
    role: "user" | "assistant";
    content?: string;
    code?: {
        language: string;
        content: string;
    };
    files?: File[];
    timestamp: Date;
    canApply?: boolean;
}

const messages = ref<Message[]>([]);
const isLoading = ref(false);
const inputText = ref("");
const inputRef = ref<HTMLInputElement>();
const messagesContainer = ref<HTMLElement>();

// Model configuration - these could be used for user settings later
// const currentModel = ref<string>("llama3.1-8b");
// const maxTokens = ref<number>(500);
// const temperature = ref<number>(0.7);

// Persistence key for this chat session
const CHAT_SESSION_KEY = "alexnet-chat-session";

function handleSendMessage() {
    const text = inputText.value.trim();
    if (text) {
        sendMessage({ text, files: [] });
        inputText.value = "";
    }
}

async function sendMessage(messageData: { text: string; files: File[] }) {
    if (!messageData.text.trim()) return;

    // Add user message
    const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: messageData.text,
        files: messageData.files,
        timestamp: new Date(),
    };
    messages.value.push(userMessage);

    // Scroll to show user message
    scrollToBottom();

    // Set loading state
    isLoading.value = true;

    try {
        // Get recent messages for context
        const contextMessages: CerebrasMessage[] = CerebrasService.formatMessages(
            messages.value.slice(-4), // Include recent messages for context
        );
        
        // Make direct API call to Cerebras
        const response = await CerebrasService.chat(contextMessages, {
            model: 'llama3.1-8b',
            max_tokens: 500,
            temperature: 0.7
        });

        // Extract response content
        const responseContent = response.success && response.data?.message
            ? response.data.message
            : "I'm here to help! Could you provide more details about what you'd like me to do?";

        // Add AI response message
        const aiMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: responseContent,
            timestamp: new Date(),
        };
        messages.value.push(aiMessage);

        // Scroll to show AI response
        await smoothScrollToBottom();

    } catch (error) {
        console.error("Error getting response from Cerebras:", error);

        // Add error message
        const errorMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content:
                "Sorry, I encountered an error processing your request. Please try again.",
            timestamp: new Date(),
        };
        messages.value.push(errorMessage);

        // Scroll to show error message
        await smoothScrollToBottom();
    } finally {
        isLoading.value = false;
    }
}

// Auto-scroll function
async function scrollToBottom() {
    await nextTick();
    if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
}

// Smooth auto-scroll function
async function smoothScrollToBottom() {
    await nextTick();
    if (messagesContainer.value) {
        messagesContainer.value.scrollTo({
            top: messagesContainer.value.scrollHeight,
            behavior: 'smooth'
        });
    }
}


function handleApplyChanges(message: Message) {
    console.log("Applying changes from message:", message.id);
}

async function handleRegenerateMessage(message: Message) {
    // Find and regenerate the AI message
    const index = messages.value.findIndex((m) => m.id === message.id);
    if (index > 0) {
        // Get the previous user message to regenerate response
        const userMessage = messages.value[index - 1];
        if (userMessage?.role === "user") {
            // Remove the current AI message and regenerate
            messages.value.splice(index, 1);
            await smoothScrollToBottom();
            sendMessage({
                text: userMessage.content || "",
                files: userMessage.files || [],
            });
        }
    }
}

// function handleSelectSession(sessionId: string) {
//     console.log("Loading session:", sessionId);
// }

function saveMessagesToStorage() {
    try {
        const messagesForStorage = messages.value.map((msg) => ({
            ...msg,
            timestamp: msg.timestamp.toISOString(),
            files: [],
        }));
        localStorage.setItem(
            CHAT_SESSION_KEY,
            JSON.stringify(messagesForStorage),
        );
    } catch (error) {
        console.warn("Failed to save chat session:", error);
    }
}


function loadMessagesFromStorage() {
    try {
        const saved = localStorage.getItem(CHAT_SESSION_KEY);
        if (saved) {
            const parsedMessages = JSON.parse(saved);
            messages.value = parsedMessages.map((msg: any) => ({
                ...msg,
                timestamp: new Date(msg.timestamp),
                files: msg.files || [],
            }));
        }
    } catch (error) {
        console.warn("Failed to load chat session:", error);
    }
}


// Watch messages, save to localStorage
watch(messages, saveMessagesToStorage, { deep: true });

onMounted(async () => {
    loadMessagesFromStorage();
    
    // Scroll to bottom after loading existing messages
    await nextTick();
    scrollToBottom();
    
    const initialPrompt = sessionStorage.getItem("initial-chat-prompt");
    if (initialPrompt) {
        sessionStorage.removeItem("initial-chat-prompt");
        sendMessage({ text: initialPrompt, files: [] });
    }
    
    // Focus the input field when component mounts
    inputRef.value?.focus();
});
</script>
