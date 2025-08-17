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

            <!-- Available Tools Panel -->
            <div class="w-full max-w-4xl mt-6">
                <div class="bg-card/70 border border-border rounded-lg p-4 backdrop-blur">
                    <div class="flex items-center justify-between mb-3">
                        <h2 class="text-sm font-semibold text-foreground/90">Available Tools</h2>
                        <button
                            class="text-xs px-3 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                            @click="refresh"
                        >
                            Rescan
                        </button>
                    </div>
                    <p class="text-xs text-muted-foreground mb-3">
                        AlexNet uses these local tools for complex or autonomous tasks when available.
                    </p>
                    <div class="flex flex-wrap gap-2">
                        <div
                            v-for="tool in tools"
                            :key="tool.key"
                            class="flex items-center gap-2 px-3 py-1 rounded-full ring-1"
                            :class="tool.available
                                ? 'bg-green-500/10 text-green-300 ring-green-500/30'
                                : 'bg-red-500/10 text-red-300 ring-red-500/30'"
                        >
                            <span
                                class="w-2 h-2 rounded-full"
                                :class="tool.available ? 'bg-green-400' : 'bg-red-400'"
                            />
                            <span class="text-xs font-medium">{{ tool.label }}</span>
                            <span class="text-[10px] opacity-70">{{ tool.available ? 'available' : 'missing' }}</span>
                        </div>
                    </div>

                    <div class="mt-4 pt-3 border-t border-border flex items-center gap-2 text-xs text-muted-foreground">
                        <span class="opacity-80">Workspace:</span>
                        <code class="text-foreground/90">{{ workspacePath }}</code>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import BlackHoleBackground from "./BlackHoleBackground.vue";
import ChatInput from "./ChatInput.vue";
import { toolAvailability, refreshToolAvailability } from "../services/tooling";
import { getWorkspaceStatus } from "../services/workspace";

const message = ref("");

const emit = defineEmits(["start-chat"]);

const tools = computed(() => [
    { key: 'claude', label: 'Claude', available: toolAvailability.value.claude },
    { key: 'codex', label: 'Codex', available: toolAvailability.value.codex },
    { key: 'gemini', label: 'Gemini', available: toolAvailability.value.gemini },
]);

async function refresh() {
    await refreshToolAvailability();
    await loadWorkspace();
}

const workspacePath = ref<string>("(checking...)");

async function loadWorkspace() {
    try {
        const status = await getWorkspaceStatus();
        workspacePath.value = status.path;
    } catch (e) {
        workspacePath.value = "Unavailable";
        console.warn('Failed to load workspace status:', e);
    }
}

onMounted(() => {
    loadWorkspace();
});

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
