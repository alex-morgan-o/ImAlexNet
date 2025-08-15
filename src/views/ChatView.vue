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
import { ref, onMounted, nextTick } from "vue";
// import Sidebar from "../components/Sidebar.vue";
import ChatMessage from "../components/ChatMessage.vue";
import {
    CerebrasService,
    type ChatMessage as CerebrasMessage,
} from "../services/cerebras";
import {
    sessionManager,
    type FrontendMessage,
    type ChatSession,
    SessionManagerService
} from "../services/sessionManager";

// Use the FrontendMessage type from session manager
type Message = FrontendMessage;

const messages = ref<Message[]>([]);
const isLoading = ref(false);
const inputText = ref("");
const inputRef = ref<HTMLInputElement>();
const messagesContainer = ref<HTMLElement>();
const currentSession = ref<ChatSession | null>(null);

// Model configuration
const currentModel = ref<string>("llama3.1-8b");
const maxTokens = ref<number>(500);
const temperature = ref<number>(0.7);

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

    // Auto-save user message to session
    try {
        await sessionManager.autoSaveMessage(userMessage);
    } catch (error) {
        console.warn('Failed to save user message:', error);
    }

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
            model: currentModel.value,
            max_tokens: maxTokens.value,
            temperature: temperature.value
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

        // Auto-save AI message to session
        try {
            await sessionManager.saveMessage(aiMessage);
        } catch (error) {
            console.warn('Failed to save AI message:', error);
        }

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

        // Try to save error message too
        try {
            await sessionManager.saveMessage(errorMessage);
        } catch (saveError) {
            console.warn('Failed to save error message:', saveError);
        }

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

async function loadSessionFromId(sessionId: string) {
    try {
        const session = await sessionManager.loadSession(sessionId);
        currentSession.value = session;
        messages.value = SessionManagerService.convertToFrontendMessages(session.messages);
        console.log(`Loaded session: ${session.name} (${session.messages.length} messages)`);
    } catch (error) {
        console.error('Failed to load session:', error);
        // Create a new session if loading fails
        await createNewSession();
    }
}

async function createNewSession(sessionName?: string) {
    try {
        const name = sessionName || 'New Chat';
        const session = await sessionManager.createSession(name);
        currentSession.value = session;
        messages.value = [];
        console.log(`Created new session: ${session.name}`);
    } catch (error) {
        console.error('Failed to create new session:', error);
        // Fall back to localStorage for compatibility
        localStorage.removeItem('alexnet-chat-session');
    }
}

function clearCurrentSession() {
    sessionManager.clearCurrentSession();
    currentSession.value = null;
    messages.value = [];
}

// Legacy support - load from localStorage if no session system
function loadMessagesFromStorage() {
    try {
        const saved = localStorage.getItem('alexnet-chat-session');
        if (saved) {
            const parsedMessages = JSON.parse(saved);
            messages.value = parsedMessages.map((msg: any) => ({
                ...msg,
                timestamp: new Date(msg.timestamp),
                files: msg.files || [],
            }));
        }
    } catch (error) {
        console.warn('Failed to load legacy chat session:', error);
    }
}


// No longer need to watch messages for localStorage

// Expose functions for App.vue to call
defineExpose({
    loadSession: loadSessionFromId,
    createNewSession,
    clearCurrentSession,
    getCurrentSession: () => currentSession.value
});

onMounted(async () => {
    // Check if we should load a specific session from route params or storage
    const sessionId = sessionStorage.getItem('load-session-id');
    if (sessionId) {
        sessionStorage.removeItem('load-session-id');
        await loadSessionFromId(sessionId);
    } else {
        // Try to load from current session manager state or create new
        const currentSessionId = sessionManager.getCurrentSessionId();
        if (currentSessionId) {
            await loadSessionFromId(currentSessionId);
        } else {
            // Check for legacy localStorage data
            const hasLegacyData = localStorage.getItem('alexnet-chat-session');
            if (hasLegacyData) {
                loadMessagesFromStorage();
                // Migrate to new session system if there are messages
                if (messages.value.length > 0) {
                    try {
                        await createNewSession('Migrated Chat');
                        // Save existing messages to new session
                        for (const message of messages.value) {
                            await sessionManager.saveMessage(message);
                        }
                        localStorage.removeItem('alexnet-chat-session');
                    } catch (error) {
                        console.warn('Failed to migrate legacy session:', error);
                    }
                }
            }
        }
    }
    
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
