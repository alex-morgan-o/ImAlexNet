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
                    <!-- Text content -->
                    <div
                        v-if="message.content"
                        class="prose prose-sm max-w-none"
                    >
                        <div v-html="formatMessage(message.content)"></div>
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

                    <!-- <button
                        @click="$emit('regenerate', message)"
                        class="flex items-center space-x-1 px-3 py-1 text-xs bg-dark-300 text-primary-fg rounded-lg hover:bg-dark-200 transition-colors duration-200"
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
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                        </svg>
                        <span>Regenerate</span>
                    </button> -->

                    <button
                        @click="copyMessage(message.content)"
                        class="flex items-center space-x-1 px-3 py-1 text-xs bg-dark-300 text-primary-fg rounded-lg hover:bg-dark-200 transition-colors duration-200"
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
                        <span>Copy</span>
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
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

defineProps<{
    message: Message;
}>();

defineEmits(["apply-changes", "regenerate"]);

function formatMessage(content: string): string {
    // Simple markdown-like formatting
    return content
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.*?)\*/g, "<em>$1</em>")
        .replace(
            /`(.*?)`/g,
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
</script>
