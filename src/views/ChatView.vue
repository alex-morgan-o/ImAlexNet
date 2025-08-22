<template>
    <div class="relative flex-1 flex flex-col overflow-hidden h-full">
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
                    @request-folder="handleRequestFolder"
                    @approve-draft="handleApproveDraft"
                    @approve-draft-with-edits="handleApproveDraftWithEdits"
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
                        @click="showSecurity = true"
                        class="px-3 py-2 bg-dark-400 text-primary-fg rounded-lg"
                        title="Security & Capabilities"
                    >
                        ⚙️
                    </button>
                    <button
                        @click="handleSendMessage"
                        :disabled="!inputText.trim()"
                        class="px-4 py-2 bg-primary-accent text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Send
                    </button>
                </div>
            </div>
            <SecuritySettings v-if="showSecurity" @close="showSecurity = false" />
        </div>
        <!-- Toast Notification -->
        <div v-if="toast" :class="['toast',
                             toast.type === 'success' ? 'toast-success' : '',
                             toast.type === 'error' ? 'toast-error' : '',
                             toast.type === 'info' ? 'toast-info' : '']">
            <span>{{ toast.message }}</span>
        </div>
        <!-- Close the container started at line 3 -->
        </div>
        
        <PathInputDialog
            :show="pathInput.show"
            :value="pathInput.value"
            :access="pathInput.access || undefined"
            :prompt="pathInput.prompt || undefined"
            @cancel="cancelPathInput"
            @confirm="confirmPathInput"
        />
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from "vue";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
// import Sidebar from "../components/Sidebar.vue";
import ChatMessage from "../components/ChatMessage.vue";
import NewSessionPrompt from "../components/NewSessionPrompt.vue";
import PathInputDialog from "../components/PathInputDialog.vue";
import SecuritySettings from "../components/SecuritySettings.vue";
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
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { getWorkspaceStatus } from "../services/workspace";

// Use the FrontendMessage type from session manager (now includes command result)
type Message = FrontendMessage;

const messages = ref<Message[]>([]);
const isLoading = ref(false);
const inputText = ref("");
const inputRef = ref<HTMLInputElement>();
const messagesContainer = ref<HTMLElement>();
const currentSession = ref<ChatSession | null>(null);
const workingDirectory = ref<string | null>(null);
const workspacePath = ref<string | null>(null);
const showNewSessionPrompt = ref(false);
const showSecurity = ref(false);

// Simple toast notifications
const toast = ref<{ message: string; type: "success" | "error" | "info" } | null>(null);
let toastTimer: number | null = null;
function showToast(message: string, type: "success" | "error" | "info" = "info", duration = 2500) {
    toast.value = { message, type };
    if (toastTimer) {
        window.clearTimeout(toastTimer);
    }
    toastTimer = window.setTimeout(() => {
        toast.value = null;
        toastTimer = null;
    }, duration);
}

// Model configuration (removed individual refs since handled in chain of thought processor)

function handleSendMessage() {
    const text = inputText.value.trim();
    if (text) {
        sendMessage({ text, files: [] });
        inputText.value = "";
    }
}

// Helpers for CLI draft approval flow
const DRAFT_PROMPT_START = "--- AlexNet Drafted CLI Prompt (Tool:";
const DRAFT_PROMPT_END = "--- End Draft ---";

function replaceDraftBodyInMessageContent(
    content: string,
    newBody: string,
): string {
    const start = content.indexOf(DRAFT_PROMPT_START);
    if (start === -1) return content;
    const headerEnd = content.indexOf("\n", start);
    if (headerEnd === -1) return content;
    const end = content.indexOf(DRAFT_PROMPT_END, headerEnd + 1);
    if (end === -1) return content;
    const before = content.slice(0, headerEnd + 1);
    const after = content.slice(end);
    return `${before}${(newBody || "").trim()}\n${after}`;
}

async function handleApproveDraft(_message: Message) {
    // User wants to run the previously drafted prompt as-is
    await sendMessage({ text: "approve", files: [] });
}

async function handleApproveDraftWithEdits(payload: {
    messageId: string;
    prompt: string;
    tool?: string;
}) {
    // Update the assistant draft message with the edited prompt, then send approval
    const idx = messages.value.findIndex((m) => m.id === payload.messageId);
    if (idx !== -1) {
        const msg = messages.value[idx];
        const updated = replaceDraftBodyInMessageContent(
            msg.content || "",
            payload.prompt || "",
        );
        messages.value[idx] = { ...msg, content: updated };
        try {
            await sessionManager.saveMessage(messages.value[idx]);
        } catch (e) {
            console.warn("Failed to save edited draft message:", e);
        }
    }
    await sendMessage({ text: "approve", files: [] });
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

        // Build full conversation history (exclude the just-created AI placeholder)
        const contextMessages = messages.value
            .filter((msg) => msg.id !== aiMessage.id)
            .slice(-12)
            .map((msg) => ({
                role: msg.role,
                content: msg.content || "",
            }));

        // Use chain-of-thought processing with streaming progress
        // Buffer to collect step-by-step logs (and streamed analysis)
        let logsBuffer = "";

        // Debug: Log the options being passed
        const processorOptions = { 
            workingDir: workingDirectory.value,
            workspacePath: workspacePath.value 
        };
        console.log('[ChatView] Passing options to chain of thought processor:', processorOptions);
        
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
                processorOptions,
            );

        // Replace the streaming analysis text with the final response
        const aiIndex = messages.value.findIndex((m) => m.id === aiMessage.id);
        if (aiIndex !== -1) {
            messages.value[aiIndex] = {
                ...messages.value[aiIndex],
                content: thoughtResult.final_response,
                // @ts-ignore
                isStreaming: false,
                // @ts-ignore - flag used by UI to show folder picker
                needsUserPath: !!thoughtResult.needs_user_path,
                // @ts-ignore - optional guidance for path request
                pathRequest: thoughtResult.path_request || undefined,
            } as Message & { isStreaming?: boolean };
        } else {
            aiMessage.content = thoughtResult.final_response;
            // @ts-ignore
            (aiMessage as any).isStreaming = false;
            // @ts-ignore
            (aiMessage as any).needsUserPath = !!thoughtResult.needs_user_path;
            // @ts-ignore
            (aiMessage as any).pathRequest = thoughtResult.path_request || undefined;
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

            // Stream each command and update the message in real-time
            for (let i = 0; i < commandsWithWD.length; i++) {
                const c = commandsWithWD[i];
                const execId = `${Date.now()}-${i}`;
                const header =
                    (c.explanation && c.explanation.trim()) ||
                    `Command: ${c.command} ${(c.args || []).join(" ")}`.trim();

                // Append header and open code block for live output
                let aiIdx = messages.value.findIndex((m) => m.id === aiMessage.id);
                const prefix = `\n\n**${header}**\n\n$ ${c.command} ${(c.args || []).join(" ")}` +
                    (c.working_dir ? `\n(wd: ${c.working_dir})` : "") +
                    `\n\n\`\`\``;
                if (aiIdx !== -1) {
                    messages.value[aiIdx].content += prefix;
                } else {
                    aiMessage.content += prefix;
                }
                await nextTick();

                const unsubs: Array<() => void> = [];
                const append = (line: string) => {
                    const idx2 = messages.value.findIndex((m) => m.id === aiMessage.id);
                    const targ = idx2 !== -1 ? messages.value[idx2] : aiMessage;
                    targ.content = (targ.content || "") + `\n${line}`;
                    if (idx2 !== -1) messages.value[idx2] = { ...targ };
                };

                // Listeners
                unsubs.push(
                    await listen<{ id: string; chunk: string }>(
                        "shell:exec:stdout",
                        (evt) => {
                            if ((evt.payload as any)?.id === execId) {
                                append((evt.payload as any).chunk || "");
                            }
                        },
                    ),
                );
                unsubs.push(
                    await listen<{ id: string; chunk: string }>(
                        "shell:exec:stderr",
                        (evt) => {
                            if ((evt.payload as any)?.id === execId) {
                                append((evt.payload as any).chunk || "");
                            }
                        },
                    ),
                );

                // Start
                await invoke("execute_shell_command_stream", {
                    id: execId,
                    command: c.command,
                    args: c.args,
                    workingDir: c.working_dir,
                });

                // Wait for exit
                const exitPromise = new Promise<{ success: boolean; code?: number }>(
                    async (resolve) => {
                        const un = await listen<{ id: string; success: boolean; exit_code?: number }>(
                            "shell:exec:exit",
                            (evt) => {
                                const p: any = evt.payload;
                                if (p?.id === execId) {
                                    resolve({ success: !!p.success, code: p.exit_code });
                                }
                            },
                        );
                        unsubs.push(un);
                    },
                );
                const result = await exitPromise;

                // Close code block and show status
                append("\n\`\`\`");
                append(result.success ? "✅ Completed" : `❌ Exit ${result.code ?? ""}`);

                // Cleanup listeners
                unsubs.forEach((u) => {
                    try {
                        u();
                    } catch (_) {}
                });
            }

            // Content is already updated incrementally above

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

// Load workspace status
async function loadWorkspaceStatus() {
    try {
        const status = await getWorkspaceStatus();
        workspacePath.value = status.exists ? status.path : null;
        console.log('[ChatView] Workspace status loaded:', { status, workspacePath: workspacePath.value });
    } catch (e) {
        console.warn('Failed to load workspace status:', e);
        workspacePath.value = null;
    }
}

onMounted(async () => {
    // Load workspace status first
    await loadWorkspaceStatus();
    
    // Listen for workspace changes
    try {
        await listen<string>('workspace:changed', (event) => {
            console.log('[ChatView] Received workspace changed event:', event.payload);
            workspacePath.value = event.payload;
        });
        console.log('[ChatView] Workspace change listener registered');
    } catch (e) {
        console.warn('[ChatView] Failed to register workspace change listener:', e);
    }
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

// Handle folder selection requests from assistant messages
async function handleRequestFolder(message: Message) {
    try {
        console.log('[ChatView] Handling request-folder for message:', message.id);
        let selected: string | null = null;
        try {
            // Attempt native folder picker via Tauri dialog API with a timeout fallback
            const timeoutMs = 1500;
            const openPromise = openDialog({ directory: true, multiple: false }) as Promise<string | string[] | null>;
            const timeoutPromise = new Promise<null>((resolve) => {
                setTimeout(() => resolve(null), timeoutMs);
            });
            const result = await Promise.race([openPromise, timeoutPromise]);
            if (Array.isArray(result)) {
                selected = result[0] || null;
            } else {
                selected = (result as string | null) || null;
            }
        } catch (e) {
            console.debug("Tauri dialog not available or blocked; falling back to manual input.");
            showToast(
                "Folder picker unavailable. Enter a path manually.",
                "info",
            );
        }

        if (!selected) {
            // Fallback: open manual input overlay
            const pr: any = (message as any).pathRequest || {};
            pathInput.value = {
                show: true,
                messageId: message.id,
                value: workingDirectory.value || "",
                access: pr.access || null,
                prompt: pr.prompt || null,
            };
            return;
        }

        if (!selected) {
            console.log('[ChatView] No folder selected or dialog unavailable. Aborting.');
            return;
        }

        // Safety check before applying
        const isSafe = await fileManager.checkPathSafety(selected);
        if (!isSafe) {
            showToast(
                "Selected path is unsafe or restricted. Choose a folder in your user directories.",
                "error",
            );
            return;
        }

        await handleSetWorkingDirectory(selected);
        showToast(`Folder selected: ${selected}`, "success");

        // After setting the working directory, try to continue the original task automatically
        // Find the user message that this assistant reply responded to (the previous message before it)
        const idx = messages.value.findIndex((m) => m.id === message.id);
        let priorUser: Message | undefined;
        for (let i = idx - 1; i >= 0; i--) {
            if (messages.value[i].role === "user") {
                priorUser = messages.value[i];
                break;
            }
        }
        if (priorUser?.content) {
            // Retry the user's request, explicitly providing the working directory context
            const combined = `${priorUser.content}\n\nUse this working directory: ${selected}`;
            await sendMessage({ text: combined, files: [] });
        }
    } catch (err) {
        console.error("Folder selection failed:", err);
    }
}

// Manual path input state (fallback when dialog is blocked)
const pathInput = ref<{
    show: boolean;
    messageId: string | null;
    value: string;
    access: string | null;
    prompt: string | null;
}>({
    show: false,
    messageId: null,
    value: "",
    access: null,
    prompt: null,
});

async function confirmPathInput(selectedValue?: string) {
    const selected = (selectedValue ?? pathInput.value.value).trim();
    if (!selected) {
        showToast("Please enter a folder path.", "error");
        return;
    }
    const isSafe = await fileManager.checkPathSafety(selected);
    if (!isSafe) {
        showToast("Selected path is unsafe or restricted.", "error");
        return;
    }
    await handleSetWorkingDirectory(selected);
    showToast(`Folder selected: ${selected}`, "success");
    const msgId = pathInput.value.messageId;
    pathInput.value = { show: false, messageId: null, value: "", access: null, prompt: null };
    // Continue original task
    if (msgId) {
        const idx = messages.value.findIndex((m) => m.id === msgId);
        let priorUser: Message | undefined;
        for (let i = idx - 1; i >= 0; i--) {
            if (messages.value[i].role === "user") { priorUser = messages.value[i]; break; }
        }
        if (priorUser?.content) {
            const combined = `${priorUser.content}\n\nUse this working directory: ${selected}`;
            await sendMessage({ text: combined, files: [] });
        }
    }
}

function cancelPathInput() {
    pathInput.value = { show: false, messageId: null, value: "", access: null, prompt: null };
}

function dismissNewSessionPrompt() {
    showNewSessionPrompt.value = false;
}
</script>

<style scoped>
.toast {
    position: fixed;
    right: 1.25rem; /* 20px */
    bottom: 1.25rem;
    z-index: 1000;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
}
.toast-info {
    background: #2d333b;
    color: #c9d1d9;
    border: 1px solid #444c56;
}
.toast-success {
    background: #1b472b;
    color: #a7f3d0;
    border: 1px solid #065f46;
}
.toast-error {
    background: #4c1d1d;
    color: #fecaca;
    border: 1px solid #7f1d1d;
}
</style>
