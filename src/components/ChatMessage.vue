<template>
    <div class="">
        <div class="flex flex-col max-w-4xl">
            <!-- Avatar -->
            <div class="">
                <div class="flex items-center text-white text-sm font-medium">
                    {{ message.role === "user" ? "You" : "AlexNet" }}
                </div>
            </div>

            <!-- Message content -->
            <div class="min-w-0">
                <div class="">
                    <!-- Collapsible Logs -->
                    <div v-if="hasLogs" class="mt-2">
                        <button
                            type="button"
                            class="text-xs text-gray-400 hover:text-primary-accent transition-colors"
                            @click="logsOpen = !logsOpen"
                        >
                            {{ logsOpen ? "Hide Logs" : "Show Logs" }}
                        </button>
                        <div
                            v-show="logsOpen"
                            class="mt-2 rounded-lg bg-dark-700 p-3"
                        >
                            <div class="mb-2 flex items-center gap-2">
                                <button
                                    type="button"
                                    class="text-xs text-gray-400 hover:text-primary-accent transition-colors"
                                    @click="contextOpen = !contextOpen"
                                >
                                    {{ contextOpen ? "Hide Context" : `Show Context (${contextMessageCount} messages)` }}
                                </button>
                            </div>
                            <div
                                v-if="contextOpen && (contextJson || props.context)"
                                class="text-xs text-primary-fg mb-3 border border-dark-500 rounded p-2 bg-dark-800"
                            >
                                <!-- Pretty formatted context display -->
                                <div v-if="props.context && props.context.length > 0" class="space-y-2">
                                    <div
                                        v-for="(ctx, idx) in props.context"
                                        :key="idx"
                                        class="border-l-2 pl-2"
                                        :class="ctx.role === 'user' ? 'border-blue-400' : 'border-green-400'"
                                    >
                                        <div class="font-medium text-gray-300">
                                            {{ ctx.role === 'user' ? 'User' : 'Assistant' }}
                                            <span v-if="ctx.timestamp" class="text-gray-500 font-normal ml-2">
                                                {{ formatTime(ctx.timestamp) }}
                                            </span>
                                        </div>
                                        <div class="text-gray-400 mt-1 whitespace-pre-wrap">{{ (ctx.content || '').slice(0, 200) }}{{ (ctx.content || '').length > 200 ? '...' : '' }}</div>
                                    </div>
                                </div>
                                <!-- Fallback raw JSON display -->
                                <pre v-else-if="contextJson" class="whitespace-pre-wrap"><code>{{ contextJson }}</code></pre>
                            </div>
                            <pre
                                class="text-xs text-primary-fg whitespace-pre-wrap"
                            ><code>{{ (message as any).debugLogs }}</code></pre>
                            <span
                                v-if="(message as any).isStreaming"
                                class="inline-block align-baseline ml-1 w-2 h-4 bg-primary-accent animate-pulse rounded-sm"
                                aria-hidden="true"
                            ></span>
                        </div>
                    </div>

                    <!-- Text content -->
                    <div
                        v-if="message.content"
                        class="prose prose-sm max-w-none"
                    >
                        <div v-html="formatMessage(filteredContent)"></div>
                        <!-- Blinking caret while streaming chain-of-thought -->
                        <span
                            v-if="(message as any).isStreaming"
                            class="inline-block align-baseline ml-1 w-2 h-4 bg-primary-accent animate-pulse rounded-sm"
                            aria-hidden="true"
                        ></span>
                    </div>

                    <!-- Prompt Review Card for local CLI tool runs -->
                    <div
                        v-if="showPromptReview"
                        class="mt-3 border border-dark-500 rounded-lg overflow-hidden"
                    >
                        <div
                            class="px-3 py-2 bg-dark-600 text-xs text-gray-300 flex items-center justify-between"
                        >
                            <div>
                                <span class="opacity-70">Prompt Review</span>
                                <span v-if="draftTool" class="ml-2 opacity-60">— Tool: {{ draftTool }}</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <button
                                    @click="copyDraft"
                                    class="text-gray-300 hover:text-primary-accent transition-colors text-xs"
                                >
                                    Copy
                                </button>
                            </div>
                        </div>
                        <div class="p-3 bg-dark-700">
                            <textarea
                                v-model="editedPrompt"
                                class="w-full bg-dark-800 text-primary-fg text-sm p-2 rounded border border-dark-500 focus:outline-none focus:border-primary-accent min-h-[160px]"
                                spellcheck="false"
                            />
                            <div class="mt-2 flex gap-2">
                                <button
                                    @click="approveDraft(false)"
                                    class="px-3 py-1 text-xs bg-primary-success text-white rounded hover:bg-green-600"
                                >
                                    Approve
                                </button>
                                <button
                                    @click="approveDraft(true)"
                                    class="px-3 py-1 text-xs bg-primary-accent text-white rounded hover:bg-primary-accent/90"
                                >
                                    Approve with edits
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Code blocks -->
                    <div v-if="message.code" class="mt-3">
                        <div class="bg-dark-700 rounded-lg overflow-hidden">
                            <div
                                class="flex items-center justify-between px-4 py-2 bg-dark-600 border-b border-dark-500"
                            >
                                <span class="text-xs text-gray-400">{{
                                    message.code.language || "code"
                                }}</span>
                                <button
                                    @click="copyCode(message.code.content)"
                                    class="text-xs text-gray-400 hover:text-primary-accent transition-colors duration-200"
                                >
                                    Copy
                                </button>
                            </div>
                            <pre
                                class="p-4 text-sm font-mono text-primary-fg overflow-x-auto"
                            ><code>{{ message.code.content }}</code></pre>
                        </div>
                    </div>

                    <!-- File attachments -->
                    <div
                        v-if="message.files && message.files.length"
                        class="mt-3 space-y-2"
                    >
                        <div
                            v-for="file in message.files"
                            :key="file.name"
                            class="flex items-center space-x-2 p-2 bg-dark-600 rounded-lg"
                        >
                            <svg
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                class="w-4 h-4 text-gray-400"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                />
                            </svg>
                            <span class="text-sm text-primary-fg">{{
                                file.name
                            }}</span>
                        </div>
                    </div>

                    <!-- Timestamp -->
                    <div class="text-xs mt-2 opacity-70">
                        {{ formatTime(message.timestamp) }}
                    </div>
                </div>

                <!-- Action buttons for AI messages -->
                <div
                    v-if="message.role === 'assistant'"
                    class="flex items-center space-x-2 mt-2 ml-2"
                >
                    <button
                        v-if="message.canApply"
                        @click="$emit('apply-changes', message)"
                        class="flex items-center space-x-1 px-3 py-1 text-xs bg-primary-success text-white rounded-lg hover:bg-green-600 transition-colors duration-200"
                    >
                        <svg
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            class="w-3 h-3"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M5 13l4 4L19 7"
                            />
                        </svg>
                        <span>Apply</span>
                    </button>

                    <!-- Inline folder picker affordance when assistant asks for a path -->
                    <button
                        v-if="showsFolderButton"
                        @click="requestFolderPicker"
                        class="flex items-center space-x-1 px-2 py-1 text-xs bg-primary-accent text-white rounded-lg hover:bg-primary-accent/90 transition-colors duration-200"
                        title="Select a folder to grant access"
                    >
                        <svg
                            class="w-3 h-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M3 7h4l2 2h10a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
                            />
                        </svg>
                        <span>{{ buttonLabel }}</span>
                    </button>
                    <span v-if="pathGuidance" class="text-xs text-gray-400">{{
                        pathGuidance
                    }}</span>

                    <button
                        @click="copyMessage(message.content)"
                        class="flex items-center space-x-1 px-1 py-1 text-xs bg-dark-300 text-primary-fg rounded-lg hover:bg-dark-200 transition-colors duration-200"
                    >
                        <svg
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            class="w-3 h-3"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                            />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from "vue";
import type { FrontendMessage } from "../services/sessionManager";

type Message = FrontendMessage & { debugLogs?: string; isStreaming?: boolean };

const props = defineProps<{
    message: Message;
    context?: Array<{ role: string; content: string; timestamp?: Date }>;
}>();

const emit = defineEmits([
    "apply-changes",
    "regenerate",
    "request-folder",
    "approve-draft",
    "approve-draft-with-edits",
]);

const logsOpen = ref(false);
const contextOpen = ref(false);
const hasLogs = computed(
    () => !!props.message?.debugLogs && props.message.debugLogs.length > 0,
);

const contextJson = computed(() => {
    // First try to use the passed context prop
    if (props.context && props.context.length > 0) {
        return JSON.stringify(props.context, null, 2);
    }
    
    // Fallback to extracting from debug logs (for backward compatibility)
    const logs = ((props.message as any)?.debugLogs || "") as string;
    const marker = "Conversation history JSON:";
    const idx = logs.indexOf(marker);
    if (idx === -1) return "";
    return logs.slice(idx + marker.length).trim();
});

const contextMessageCount = computed(() => {
    if (props.context && props.context.length > 0) {
        return props.context.length;
    }
    
    // Try to count from debug logs as fallback
    const json = contextJson.value;
    if (json) {
        try {
            const parsed = JSON.parse(json);
            return Array.isArray(parsed) ? parsed.length : 0;
        } catch {
            return 0;
        }
    }
    return 0;
});

onMounted(() => {
    logsOpen.value = !!props.message?.isStreaming || false;
});

watch(
    () => props.message?.isStreaming,
    (val) => {
        if (val) logsOpen.value = true; // auto-open when streaming starts
    },
);

function formatMessage(content: string): string {
    // Enhanced markdown-like formatting with better code block handling
    return content
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.*?)\*/g, "<em>$1</em>")
        .replace(/\n/g, "<br/>")
        .replace(/```[\s\S]*?```/g, (match) => {
            // Handle multi-line code blocks
            const codeContent = match
                .replace(/```(\w+)?\n?/, "")
                .replace(/```$/, "");
            return `<pre class="bg-dark-700 rounded-lg p-4 mt-2 mb-2 overflow-x-auto"><code class="text-sm font-mono text-primary-fg">${codeContent}</code></pre>`;
        })
        .replace(
            /`([^`]+)`/g,
            '<code class="bg-dark-600 px-1 py-0.5 rounded text-sm">$1</code>',
        )
        .replace(/\n/g, "<br>");
}

function formatTime(timestamp: Date): string {
    return timestamp.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    });
}

async function copyCode(content: string) {
    try {
        await navigator.clipboard.writeText(content);
        // TODO: Show toast notification
    } catch (err) {
        console.error("Failed to copy code:", err);
    }
}

async function copyMessage(content: string | undefined) {
    if (!content) return;
    try {
        await navigator.clipboard.writeText(content);
        // TODO: Show toast notification
    } catch (err) {
        console.error("Failed to copy message:", err);
    }
}

// Heuristic: detect when assistant is asking for a folder/path
const asksForPath = computed(() => {
    if (props.message.role !== "assistant" || !props.message.content)
        return false;
    const text = props.message.content.toLowerCase();
    const keywords = [
        "provide the exact folder path",
        "provide the folder path",
        "provide the path",
        "folder path",
        "directory path",
        "working directory",
        "path to your project",
        "select a folder",
        "choose a folder",
        "grant access to a folder",
    ];
    return keywords.some((k) => text.includes(k));
});

function requestFolderPicker() {
    console.log(
        "[ChatMessage] Select Folder clicked for message:",
        props.message.id,
    );
    emit("request-folder", props.message);
}

const showsFolderButton = computed(() => {
    return asksForPath.value || (props.message as any)?.needsUserPath === true;
});

const pathGuidance = computed(() => {
    const pr = (props.message as any)?.pathRequest;
    return pr?.prompt || "";
});

const buttonLabel = computed(() => {
    const pr = (props.message as any)?.pathRequest;
    const access = (pr?.access || "").toString();
    const suffix = access ? ` (${access.replace("_", "/")})` : "";
    // Use a more descriptive label if guidance includes 'project'
    const guidance: string = (pr?.prompt || "").toLowerCase();
    const base = guidance.includes("project")
        ? "Select project folder"
        : "Select folder";
    return base + suffix;
});

// Prompt review detection and helpers
const DRAFT_PROMPT_START = "--- AlexNet Drafted CLI Prompt (Tool:";
const DRAFT_PROMPT_END = "--- End Draft ---";

const showPromptReview = computed(() => {
    if (props.message.role !== "assistant" || !props.message.content) return false;
    const c = props.message.content;
    return c.includes(DRAFT_PROMPT_START) && c.includes(DRAFT_PROMPT_END);
});

const draftTool = computed(() => {
    if (!showPromptReview.value || !props.message.content) return "";
    const content = props.message.content;
    const headerIdx = content.indexOf(DRAFT_PROMPT_START);
    if (headerIdx === -1) return "";
    const headerLine = content.slice(headerIdx).split("\n")[0];
    const m = headerLine.match(/Tool:\s*(claude|codex|gemini)\)/i);
    return (m?.[1] || "").toLowerCase();
});

function extractDraftBody(): string {
    const content = props.message.content || "";
    const start = content.indexOf(DRAFT_PROMPT_START);
    if (start === -1) return "";
    const headerEnd = content.indexOf("\n", start);
    if (headerEnd === -1) return "";
    const end = content.indexOf(DRAFT_PROMPT_END, headerEnd + 1);
    if (end === -1) return "";
    return content.slice(headerEnd + 1, end).trim();
}

const editedPrompt = ref<string>("");

const filteredContent = computed(() => {
    const content = props.message.content || "";
    if (!showPromptReview.value) return content;
    const start = content.indexOf(DRAFT_PROMPT_START);
    if (start === -1) return content;
    const endBlockStart = content.indexOf(DRAFT_PROMPT_END, start);
    if (endBlockStart === -1) return content;
    const endBlockEnd = endBlockStart + DRAFT_PROMPT_END.length;
    // Remove from header line start through end marker line
    const before = content.slice(0, start).trimEnd();
    const after = content.slice(endBlockEnd).trimStart();
    const combined = [before, after].filter(Boolean).join("\n\n");
    return combined || "";
});

watch(
    () => props.message.content,
    () => {
        if (showPromptReview.value) {
            editedPrompt.value = extractDraftBody();
        }
    },
    { immediate: true },
);

function copyDraft() {
    const text = extractDraftBody();
    if (text) navigator.clipboard?.writeText(text).catch(() => {});
}

function approveDraft(withEdits: boolean) {
    if (withEdits) {
        emit("approve-draft-with-edits", {
            messageId: props.message.id,
            prompt: editedPrompt.value || extractDraftBody(),
            tool: draftTool.value || undefined,
        });
    } else {
        emit("approve-draft", props.message);
    }
}
</script>
