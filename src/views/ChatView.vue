<template>
    <div class="flex flex-1 overflow-hidden h-full">
        <!-- Sidebar -->
        <!-- <Sidebar @select-session="handleSelectSession" /> -->

        <!-- Chat Interface -->
        <div class="flex-1 flex flex-col h-full">
            <!-- New session prompt -->
            <div v-if="showNewSessionPrompt" class="p-4">
                <NewSessionPrompt
                    @set-working-directory="handleSetWorkingDirectory"
                    @skip="dismissNewSessionPrompt"
                />
            </div>

            <!-- Messages area -->
            <div
                ref="messagesContainer"
                class="flex-1 overflow-y-auto p-4 space-y-4 min-h-0"
            >
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
import { ref, onMounted, nextTick, watch } from "vue";
// import Sidebar from "../components/Sidebar.vue";
import ChatMessage from "../components/ChatMessage.vue";
import NewSessionPrompt from "../components/NewSessionPrompt.vue";
// import {
//     CerebrasService,
//     type ChatMessage as CerebrasMessage,
// } from "../services/cerebras";
import {
    sessionManager,
    type FrontendMessage,
    type ChatSession,
    SessionManagerService,
    type ShellCommandResult,
} from "../services/sessionManager";
import {
    ChainOfThoughtProcessor,
    type ChainOfThoughtResult,
} from "../services/chainOfThoughtProcessor";
import { fileManager } from "../services/fileManager";

// Use the FrontendMessage type from session manager (now includes command result)
type Message = FrontendMessage;

const messages = ref<Message[]>([]);
const isLoading = ref(false);
const inputText = ref("");
const inputRef = ref<HTMLInputElement>();
const messagesContainer = ref<HTMLElement>();
const currentSession = ref<ChatSession | null>(null);
const workingDirectory = ref<string | null>(null);
const showNewSessionPrompt = ref(false);

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
        console.warn("Failed to save user message:", error);
    }

    // Scroll to show user message
    scrollToBottom();

    // Set loading state
    isLoading.value = true;

    try {
        // Prepare a placeholder AI message that will stream the chain-of-thought
        const aiMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: "",
            timestamp: new Date(),
        };
        messages.value.push(aiMessage);

        // Get recent messages for context (convert to simple format)
        const contextMessages = messages.value.slice(-4).map((msg) => ({
            role: msg.role,
            content: msg.content || "",
        }));

        // Use chain-of-thought processing with streaming progress
        // Buffer to collect step-by-step logs (and streamed analysis)
        let logsBuffer = "";

        const thoughtResult: ChainOfThoughtResult =
            await ChainOfThoughtProcessor.processUserMessage(
                messageData.text,
                contextMessages,
                (evt) => {
                    const idx = messages.value.findIndex(
                        (m) => m.id === aiMessage.id,
                    );
                    const current =
                        idx !== -1 ? messages.value[idx] : aiMessage;

                    // Build log lines into a separate buffer we expose via a transient field
                    if (evt.phase === "analysis_chunk" && evt.chunk) {
                        logsBuffer += evt.chunk;
                        (current as any).debugLogs = logsBuffer;
                        // @ts-ignore
                        (current as any).isStreaming = true;
                        if (idx !== -1)
                            messages.value[idx] = { ...(current as any) };
                        void scrollToBottom();
                    } else if (evt.phase === "log") {
                        const line = (evt as any).text || "";
                        logsBuffer +=
                            (logsBuffer && !logsBuffer.endsWith("\n")
                                ? "\n"
                                : "") +
                            line +
                            "\n";
                        (current as any).debugLogs = logsBuffer;
                        // @ts-ignore
                        (current as any).isStreaming = true;
                        if (idx !== -1)
                            messages.value[idx] = { ...(current as any) };
                        void scrollToBottom();
                    } else if (evt.phase === "analysis_start") {
                        logsBuffer +=
                            (logsBuffer ? "\n" : "") +
                            (evt.message || "Analyzing...") +
                            "\n";
                        (current as any).debugLogs = logsBuffer;
                        // @ts-ignore
                        (current as any).isStreaming = true;
                        if (idx !== -1)
                            messages.value[idx] = { ...(current as any) };
                    } else if (evt.phase === "format_start") {
                        logsBuffer +=
                            (logsBuffer ? "\n" : "") +
                            "--- Formatting plan ---\n";
                        (current as any).debugLogs = logsBuffer;
                        // @ts-ignore
                        (current as any).isStreaming = true;
                        if (idx !== -1)
                            messages.value[idx] = { ...(current as any) };
                    } else if (evt.phase === "format_done") {
                        // @ts-ignore
                        (current as any).isStreaming = false;
                        if (idx !== -1)
                            messages.value[idx] = { ...(current as any) };
                    } else if (evt.phase === "error") {
                        logsBuffer +=
                            (logsBuffer ? "\n" : "") +
                            "Error: " +
                            evt.message +
                            "\n";
                        (current as any).debugLogs = logsBuffer;
                        // @ts-ignore
                        (current as any).isStreaming = false;
                        if (idx !== -1)
                            messages.value[idx] = { ...(current as any) };
                    }
                },
            );

        // Replace the streaming analysis text with the final response
        const aiIndex = messages.value.findIndex((m) => m.id === aiMessage.id);
        if (aiIndex !== -1) {
            messages.value[aiIndex] = {
                ...messages.value[aiIndex],
                content: thoughtResult.final_response,
                // @ts-ignore
                isStreaming: false,
            } as Message & { isStreaming?: boolean };
        } else {
            aiMessage.content = thoughtResult.final_response;
            // @ts-ignore
            (aiMessage as any).isStreaming = false;
        }

        // Save the final AI message
        try {
            await sessionManager.saveMessage(
                messages.value[aiIndex] || aiMessage,
            );
        } catch (error) {
            console.warn("Failed to save AI message:", error);
        }

        // Scroll to show AI response
        await smoothScrollToBottom();

        // Execute commands if any were determined
        if (
            thoughtResult.commands_to_execute &&
            thoughtResult.commands_to_execute.length > 0
        ) {
            console.log(
                "🚀 About to execute commands:",
                thoughtResult.commands_to_execute,
            );
            // Show that commands are being executed
            isLoading.value = true;
            // Apply default working directory if any command is missing it
            const commandsWithWD = thoughtResult.commands_to_execute.map(
                (c) => ({
                    ...c,
                    working_dir:
                        c.working_dir || workingDirectory.value || undefined,
                }),
            );
            const commandResults =
                await ChainOfThoughtProcessor.executeCommands(commandsWithWD);
            console.log("✅ Command execution results:", commandResults);

            // Update the AI message with command results
            let updatedContent = thoughtResult.final_response;

            for (let i = 0; i < commandResults.length; i++) {
                const result = commandResults[i];
                const header =
                    (result.explanation && result.explanation.trim()) ||
                    (result.command
                        ? `Command: ${result.command} ${(result.args || []).join(" ")}`.trim()
                        : "Command execution");

                updatedContent += `\n\n**${header}**\n`;

                if (result.success) {
                    const stdout = (result.output || "").trim();
                    if (stdout) {
                        updatedContent += `\`\`\`\n${stdout}\n\`\`\``;
                    } else {
                        updatedContent += `✅ Completed (no output)`;
                    }
                } else {
                    const errText = (result.error || "Unknown error").trim();
                    const exitInfo =
                        typeof result.exit_code === "number"
                            ? ` (exit ${result.exit_code})`
                            : "";
                    updatedContent += `❌ Error${exitInfo}:\n\`\`\`\n${errText}\n\`\`\``;
                }
            }

            // Update the message content reactively so Vue re-renders
            const aiIndex2 = messages.value.findIndex(
                (m) => m.id === aiMessage.id,
            );
            if (aiIndex2 !== -1) {
                messages.value[aiIndex2] = {
                    ...messages.value[aiIndex2],
                    content: updatedContent,
                };
            } else {
                // Fallback (shouldn't happen): mutate the object reference
                aiMessage.content = updatedContent;
            }

            // Save updated message
            try {
                await sessionManager.saveMessage(aiMessage);
            } catch (error) {
                console.warn("Failed to save updated AI message:", error);
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
            console.warn("Failed to save error message:", saveError);
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
        messagesContainer.value.scrollTop =
            messagesContainer.value.scrollHeight;
    }
}

// Smooth auto-scroll function
async function smoothScrollToBottom() {
    await nextTick();
    if (messagesContainer.value) {
        messagesContainer.value.scrollTo({
            top: messagesContainer.value.scrollHeight,
            behavior: "smooth",
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
async function handleCommandExecuted(event: {
    messageId: string;
    result: ShellCommandResult;
}) {
    const messageIndex = messages.value.findIndex(
        (m) => m.id === event.messageId,
    );
    if (messageIndex !== -1) {
        // Update the message with command result
        messages.value[messageIndex].commandResult = event.result;

        // Save the updated message to session
        try {
            await sessionManager.saveMessage(messages.value[messageIndex]);
        } catch (error) {
            console.warn("Failed to save command result:", error);
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
        messages.value = SessionManagerService.convertToFrontendMessages(
            session.messages,
        );
        console.log(
            `Loaded session: ${session.name} (${session.messages.length} messages)`,
        );
    } catch (error) {
        console.error("Failed to load session:", error);
        // Create a new session if loading fails
        await createNewSession();
    }
}

async function createNewSession(sessionName?: string) {
    try {
        const name = sessionName || "New Chat";
        const session = await sessionManager.createSession(name);
        currentSession.value = session;
        messages.value = [];
        console.log(`Created new session: ${session.name}`);

        // Reset working directory and show welcome prompt
        workingDirectory.value = null;
        saveWorkingDirectory();
        showNewSessionPrompt.value = true;

        // Add an initial assistant message asking the user what to do
        const welcomeMessage: Message = {
            id: (Date.now() + 2).toString(),
            role: "assistant",
            content:
                "What would you like to do? If you need to work with files or code, set a working directory. I recommend using ~/AlexNet/{projectName}.",
            timestamp: new Date(),
        };
        messages.value.push(welcomeMessage);
        try {
            await sessionManager.saveMessage(welcomeMessage);
        } catch (error) {
            console.warn("Failed to save welcome message:", error);
        }
    } catch (error) {
        console.error("Failed to create new session:", error);
        // Fall back to localStorage for compatibility
        localStorage.removeItem("alexnet-chat-session");
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
        const saved = localStorage.getItem("alexnet-chat-session");
        if (saved) {
            const parsedMessages = JSON.parse(saved);
            messages.value = parsedMessages.map((msg: any) => ({
                ...msg,
                timestamp: new Date(msg.timestamp),
                files: msg.files || [],
            }));
        }
    } catch (error) {
        console.warn("Failed to load legacy chat session:", error);
    }
}

// No longer need to watch messages for localStorage

// Expose functions for App.vue to call
defineExpose({
    loadSession: loadSessionFromId,
    createNewSession,
    clearCurrentSession,
    getCurrentSession: () => currentSession.value,
});

onMounted(async () => {
    // Check if we should load a specific session from route params or storage
    const sessionId = sessionStorage.getItem("load-session-id");
    if (sessionId) {
        sessionStorage.removeItem("load-session-id");
        await loadSessionFromId(sessionId);
    } else {
        // Try to load from current session manager state or create new
        const currentSessionId = sessionManager.getCurrentSessionId();
        if (currentSessionId) {
            await loadSessionFromId(currentSessionId);
        } else {
            // Check for legacy localStorage data
            const hasLegacyData = localStorage.getItem("alexnet-chat-session");
            if (hasLegacyData) {
                loadMessagesFromStorage();
                // Migrate to new session system if there are messages
                if (messages.value.length > 0) {
                    try {
                        await createNewSession("Migrated Chat");
                        // Save existing messages to new session
                        for (const message of messages.value) {
                            await sessionManager.saveMessage(message);
                        }
                        localStorage.removeItem("alexnet-chat-session");
                    } catch (error) {
                        console.warn(
                            "Failed to migrate legacy session:",
                            error,
                        );
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

// Working directory helpers
function storageKeyForWD() {
    const id = currentSession.value?.id || "global";
    return `alexnet:session:${id}:wd`;
}

function loadWorkingDirectory() {
    const key = storageKeyForWD();
    const stored = localStorage.getItem(key);
    workingDirectory.value = stored || null;
}

function saveWorkingDirectory() {
    const key = storageKeyForWD();
    if (workingDirectory.value) {
        localStorage.setItem(key, workingDirectory.value);
    } else {
        localStorage.removeItem(key);
    }
}

watch(currentSession, () => {
    loadWorkingDirectory();
});

async function handleSetWorkingDirectory(path: string) {
    try {
        // Ensure suggested path exists if using our template
        await fileManager.createDirectory(path);
    } catch (e) {
        console.warn(
            "Could not ensure directory exists (may already exist):",
            e,
        );
    }
    workingDirectory.value = path;
    saveWorkingDirectory();
    showNewSessionPrompt.value = false;

    // Inform in chat
    const infoMessage: Message = {
        id: (Date.now() + 3).toString(),
        role: "assistant",
        content: `Working directory set to: ${path}`,
        timestamp: new Date(),
    };
    messages.value.push(infoMessage);
    try {
        await sessionManager.saveMessage(infoMessage);
    } catch {}
}

function dismissNewSessionPrompt() {
    showNewSessionPrompt.value = false;
}
</script>
