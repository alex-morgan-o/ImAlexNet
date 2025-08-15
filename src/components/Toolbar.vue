<template>
    <div class="relative">
        <!-- Sidebar Overlay -->
        <Transition name="sidebar" appear>
            <div
                v-if="showSidebar"
                class="fixed inset-0 z-50 flex"
                @click.self="hideSidebar"
            >
                <!-- Sidebar -->
                <div
                    class="sidebar-panel w-80 h-full bg-card border-r border-border shadow-2xl bg-slate-600"
                >
                    <div
                        class="flex items-center justify-between p-4 border-b border-border"
                    >
                        <h2 class="text-lg font-semibold text-foreground">
                            Chat Sessions
                        </h2>
                        <button
                            @click="hideSidebar"
                            class="hover:bg-muted rounded-lg transition-colors"
                        >
                            <svg
                                class="w-5 h-5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M6 18L18 6M6 6l12 12"
                                />
                            </svg>
                        </button>
                    </div>

                    <!-- Session list -->
                    <div class="flex-1 overflow-y-auto px-2 pb-4">
                        <!-- New Session Button -->
                        <div class="mb-4 px-2">
                            <button
                                @click="handleNewSession"
                                class="w-full flex items-center justify-center space-x-2 p-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                            >
                                <svg
                                    class="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M12 4v16m8-8H4"
                                    />
                                </svg>
                                <span class="font-medium">New Session</span>
                            </button>
                        </div>

                        <div v-if="todaySessions.length > 0" class="mb-4">
                            <h3
                                class="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-2"
                            >
                                Today
                            </h3>
                            <div
                                v-for="session in todaySessions"
                                :key="session.id"
                                :class="[
                                    'sidebar-item',
                                    { active: session.id === activeSessionId },
                                ]"
                                @click="handleSelectSession(session.id)"
                            >
                                <div class="flex-1 min-w-0">
                                    <p
                                        class="text-sm font-medium truncate text-foreground"
                                    >
                                        {{ session.title }}
                                    </p>
                                    <p
                                        class="text-xs text-muted-foreground truncate"
                                    >
                                        {{ session.preview }}
                                    </p>
                                </div>
                                <span class="text-xs text-muted-foreground">{{
                                    formatTime(session.timestamp)
                                }}</span>
                            </div>
                        </div>

                        <div v-if="yesterdaySessions.length > 0" class="mb-4">
                            <h3
                                class="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-2"
                            >
                                Yesterday
                            </h3>
                            <div
                                v-for="session in yesterdaySessions"
                                :key="session.id"
                                :class="[
                                    'sidebar-item',
                                    { active: session.id === activeSessionId },
                                ]"
                                @click="handleSelectSession(session.id)"
                            >
                                <div class="flex-1 min-w-0">
                                    <p
                                        class="text-sm font-medium truncate text-foreground"
                                    >
                                        {{ session.title }}
                                    </p>
                                    <p
                                        class="text-xs text-muted-foreground truncate"
                                    >
                                        {{ session.preview }}
                                    </p>
                                </div>
                                <span class="text-xs text-muted-foreground">{{
                                    formatTime(session.timestamp)
                                }}</span>
                            </div>
                        </div>

                        <div v-if="weekSessions.length > 0" class="mb-4">
                            <h3
                                class="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-2"
                            >
                                Previous 7 days
                            </h3>
                            <div
                                v-for="session in weekSessions"
                                :key="session.id"
                                :class="[
                                    'sidebar-item',
                                    { active: session.id === activeSessionId },
                                ]"
                                @click="handleSelectSession(session.id)"
                            >
                                <div class="flex-1 min-w-0">
                                    <p
                                        class="text-sm font-medium truncate text-foreground"
                                    >
                                        {{ session.title }}
                                    </p>
                                    <p
                                        class="text-xs text-muted-foreground truncate"
                                    >
                                        {{ session.preview }}
                                    </p>
                                </div>
                                <span class="text-xs text-muted-foreground">{{
                                    formatDate(session.timestamp)
                                }}</span>
                            </div>
                        </div>

                        <div
                            v-if="filteredSessions.length === 0"
                            class="text-center py-8"
                        >
                            <p class="text-muted-foreground text-sm">
                                No sessions found
                            </p>
                        </div>
                    </div>
                </div>

                <!-- Backdrop -->
                <div
                    class="sidebar-backdrop flex-1 bg-black bg-opacity-50"
                ></div>
            </div>
        </Transition>

        <!-- Main Toolbar -->
        <div
            class="flex items-center justify-between p-4 bg-dark-500 border-b border-dark-300"
        >
            <!-- Left section -->
            <div class="flex items-center space-x-3">
                <button
                    @click="toggleSidebar"
                    class="hover:bg-muted transition-colors"
                >
                    <svg
                        class="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M4 6h16M4 12h16M4 18h16"
                        />
                    </svg>
                </button>
                <h1 class="text-md font-semibold text-foreground">AlexNet</h1>
            </div>

            <!-- Center section -->
            <div class="flex items-center space-x-2">
                <!-- Space for future features -->
            </div>

            <!-- Right section -->
            <div class="flex items-center space-x-3">
                <button
                    @click="$emit('toggle-os')"
                    class="toolbar-icon"
                    title="OS Integration"
                >
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                        />
                    </svg>
                </button>
                <button
                    @click="$emit('save')"
                    class="toolbar-icon"
                    title="Save Session"
                >
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                        />
                    </svg>
                </button>
                <button
                    @click="$emit('share')"
                    class="toolbar-icon"
                    title="Share"
                >
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
                        />
                    </svg>
                </button>
                <button
                    @click="$emit('settings')"
                    class="toolbar-icon"
                    title="Settings"
                >
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                        />
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                    </svg>
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { SessionManagerService } from "../services/sessionManager";

// Use the SessionListItem type from session manager, but adapt it
interface Session {
    id: string;
    title: string;
    preview: string;
    timestamp: Date;
}

const emit = defineEmits([
    "new-session",
    "toggle-os",
    "save",
    "share",
    "settings",
    "select-session",
]);

const showSidebar = ref(false);
const searchQuery = ref("");
const activeSessionId = ref("");
const allSessions = ref<Session[]>([]);

// Computed properties for filtering sessions by time periods
const filteredSessions = computed(() => {
    if (!searchQuery.value) return allSessions.value;
    return allSessions.value.filter(
        (session) =>
            session.title
                .toLowerCase()
                .includes(searchQuery.value.toLowerCase()) ||
            session.preview
                .toLowerCase()
                .includes(searchQuery.value.toLowerCase()),
    );
});

const todaySessions = computed(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return filteredSessions.value.filter(
        (session) => session.timestamp >= today,
    );
});

const yesterdaySessions = computed(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    return filteredSessions.value.filter(
        (session) =>
            session.timestamp >= yesterday && session.timestamp < today,
    );
});

const weekSessions = computed(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const weekAgo = new Date(yesterday.getTime() - 6 * 24 * 60 * 60 * 1000);
    return filteredSessions.value.filter(
        (session) =>
            session.timestamp >= weekAgo && session.timestamp < yesterday,
    );
});

// Functions
function toggleSidebar() {
    showSidebar.value = !showSidebar.value;
    if (showSidebar.value) {
        loadSessions();
    }
}

function hideSidebar() {
    showSidebar.value = false;
}

function handleNewSession() {
    hideSidebar();
    emit("new-session");
}

function handleSelectSession(sessionId: string) {
    activeSessionId.value = sessionId;
    hideSidebar();
    emit("select-session", sessionId);
}

async function loadSessions() {
    try {
        // Load sessions from the new session management system
        const sessionItems = await SessionManagerService.listSessions();

        const sessions: Session[] = sessionItems.map((item) => ({
            id: item.id,
            title: item.name,
            preview: item.preview || "No messages yet",
            timestamp: new Date(item.last_modified),
        }));

        // If no sessions exist, try to load legacy localStorage sessions
        if (sessions.length === 0) {
            const legacySessions = await loadLegacySessions();
            sessions.push(...legacySessions);
        }

        // Sort sessions by timestamp (newest first)
        allSessions.value = sessions.sort(
            (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
        );
    } catch (error) {
        console.error("Failed to load sessions:", error);
        // Fallback to legacy loading
        allSessions.value = await loadLegacySessions();
    }
}

// Legacy session loading for backwards compatibility
async function loadLegacySessions(): Promise<Session[]> {
    const sessions: Session[] = [];

    // Get all localStorage keys that might be chat sessions
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
            key &&
            (key.startsWith("alexnet-chat-session") ||
                key === "alexnet-chat-session")
        ) {
            try {
                const sessionData = localStorage.getItem(key);
                if (sessionData) {
                    const messages = JSON.parse(sessionData);
                    if (Array.isArray(messages) && messages.length > 0) {
                        // Create session from first user message
                        const firstUserMessage = messages.find(
                            (msg) => msg.role === "user",
                        );
                        if (firstUserMessage) {
                            sessions.push({
                                id: key,
                                title:
                                    firstUserMessage.content?.substring(0, 50) +
                                        (firstUserMessage.content?.length > 50
                                            ? "..."
                                            : "") || "Untitled Session",
                                preview:
                                    firstUserMessage.content?.substring(
                                        0,
                                        100,
                                    ) +
                                        (firstUserMessage.content?.length > 100
                                            ? "..."
                                            : "") || "",
                                timestamp: new Date(
                                    messages[0].timestamp || Date.now(),
                                ),
                            });
                        }
                    }
                }
            } catch (error) {
                console.warn("Failed to parse legacy session:", key, error);
            }
        }
    }

    return sessions;
}

function formatTime(timestamp: Date) {
    return timestamp.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    });
}

function formatDate(timestamp: Date) {
    return timestamp.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
    });
}

onMounted(() => {
    loadSessions();
});
</script>

<style scoped>
.toolbar-icon {
    @apply p-2 text-foreground hover:bg-muted rounded-lg transition-colors;
}

.toolbar-icon svg {
    @apply w-5 h-5;
}

.sidebar-item {
    @apply flex items-center justify-between p-3 mx-2 mb-1 rounded-lg cursor-pointer hover:bg-muted transition-colors;
}

.sidebar-item.active {
    @apply bg-blue-500/10 border-l-2 border-blue-500;
}

/* Enhanced sidebar transition animations */
.sidebar-enter-active,
.sidebar-leave-active {
    transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.sidebar-enter-from,
.sidebar-leave-to {
    opacity: 0;
}

.sidebar-enter-to,
.sidebar-leave-from {
    opacity: 1;
}

/* Sidebar panel smooth slide animation */
.sidebar-panel {
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    transform: translateX(0);
}

.sidebar-enter-active .sidebar-panel {
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.sidebar-leave-active .sidebar-panel {
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.6, 1);
}

.sidebar-enter-from .sidebar-panel,
.sidebar-leave-to .sidebar-panel {
    transform: translateX(-100%);
}

/* Backdrop smooth fade animation */
.sidebar-backdrop {
    transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.sidebar-enter-active .sidebar-backdrop {
    transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1) 0.05s;
}

.sidebar-leave-active .sidebar-backdrop {
    transition: opacity 0.2s cubic-bezier(0.4, 0, 0.6, 1);
}

.sidebar-enter-from .sidebar-backdrop,
.sidebar-leave-to .sidebar-backdrop {
    opacity: 0;
}

/* Add subtle shadow animation */
.sidebar-panel {
    box-shadow:
        0 10px 25px -5px rgba(0, 0, 0, 0.1),
        0 10px 10px -5px rgba(0, 0, 0, 0.04);
    transition:
        transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
        box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.sidebar-enter-from .sidebar-panel {
    box-shadow: none;
}

/* Smooth scrolling for session list */
.sidebar-panel {
    scroll-behavior: smooth;
}

/* Optimize for performance */
.sidebar-panel,
.sidebar-backdrop {
    will-change: transform, opacity;
}

.sidebar-leave-active .sidebar-panel,
.sidebar-leave-active .sidebar-backdrop {
    will-change: auto;
}
</style>
