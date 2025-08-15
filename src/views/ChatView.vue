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
                    @command-executed="handleCommandExecuted"
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
// import {
//     CerebrasService,
//     type ChatMessage as CerebrasMessage,
// } from "../services/cerebras";
import {
    sessionManager,
    type FrontendMessage,
    type ChatSession,
    SessionManagerService,
    type ShellCommandResult
} from "../services/sessionManager";
import { ChainOfThoughtProcessor, type ChainOfThoughtResult } from "../services/chainOfThoughtProcessor";

// Use the FrontendMessage type from session manager (now includes command result)
type Message = FrontendMessage;

const messages = ref<Message[]>([]);
const isLoading = ref(false);
const inputText = ref("");
const inputRef = ref<HTMLInputElement>();
const messagesContainer = ref<HTMLElement>();
const currentSession = ref<ChatSession | null>(null);

// Model configuration (removed individual refs since handled in chain of thought processor)

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
        // Get recent messages for context (convert to simple format)
        const contextMessages = messages.value.slice(-4).map(msg => ({
            role: msg.role,
            content: msg.content || ''
        }));
        
        // Use chain-of-thought processing to determine actions
        const thoughtResult: ChainOfThoughtResult = await ChainOfThoughtProcessor.processUserMessage(
            messageData.text,
            contextMessages
        );

        // Create initial AI message with the reasoning response
        const aiMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: thoughtResult.final_response,
            timestamp: new Date(),
        };
        messages.value.push(aiMessage);

        // Auto-save initial AI message
        try {
            await sessionManager.saveMessage(aiMessage);
        } catch (error) {
            console.warn('Failed to save AI message:', error);
        }

        // Scroll to show AI response
        await smoothScrollToBottom();

        // Execute commands if any were determined
        if (thoughtResult.commands_to_execute && thoughtResult.commands_to_execute.length > 0) {
            console.log("🚀 About to execute commands:", thoughtResult.commands_to_execute);
            // Show that commands are being executed
            isLoading.value = true;
            
            const commandResults = await ChainOfThoughtProcessor.executeCommands(
                thoughtResult.commands_to_execute
            );
            console.log("✅ Command execution results:", commandResults);

            // Update the AI message with command results
            let updatedContent = thoughtResult.final_response;
            
            for (let i = 0; i < commandResults.length; i++) {
                const result = commandResults[i];
                
                updatedContent += `\n\n**${result.explanation}**\n`;
                
                if (result.success) {
                    updatedContent += `\`\`\`\n${result.output}\n\`\`\``;
                } else {
                    updatedContent += `❌ Error: ${result.error}`;
                }
            }

            // Update the message content reactively so Vue re-renders
            const aiIndex = messages.value.findIndex(m => m.id === aiMessage.id);
            if (aiIndex !== -1) {
                messages.value[aiIndex] = {
                    ...messages.value[aiIndex],
                    content: updatedContent
                };
            } else {
                // Fallback (shouldn't happen): mutate the object reference
                aiMessage.content = updatedContent;
            }
            
            // Save updated message
            try {
                await sessionManager.saveMessage(aiMessage);
            } catch (error) {
                console.warn('Failed to save updated AI message:', error);
            }

            // Scroll to show updated response
            await smoothScrollToBottom();
        }

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

// Handle shell command execution results
async function handleCommandExecuted(event: { messageId: string; result: ShellCommandResult }) {
    const messageIndex = messages.value.findIndex(m => m.id === event.messageId);
    if (messageIndex !== -1) {
        // Update the message with command result
        messages.value[messageIndex].commandResult = event.result;
        
        // Save the updated message to session
        try {
            await sessionManager.saveMessage(messages.value[messageIndex]);
        } catch (error) {
            console.warn('Failed to save command result:', error);
        }
        
        // Scroll to show the result
        await smoothScrollToBottom();
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
