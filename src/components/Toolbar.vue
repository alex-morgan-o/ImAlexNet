<template>
    <div class="relative">
        <!-- Sidebar Overlay -->
        <div
            v-if="showSidebar"
            class="fixed inset-0 z-50 flex"
            @click.self="hideSidebar"
        >
            <!-- Sidebar -->
            <div
                class="w-80 h-full bg-card border-r border-border shadow-2xl bg-slate-600"
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
            <div class="flex-1 bg-black bg-opacity-50"></div>
        </div>

        <!-- Main Toolbar -->
        <div
            class="flex items-center justify-between p-4 bg-dark-500 border-b border-dark-300"
        >
            <!-- Left section -->
            <div class="flex items-center space-x-3">
                <button
                    @click="toggleSidebar"
                    class="toolbar-icon hover:bg-muted rounded-lg transition-colors"
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
                <h1 class="text-lg font-semibold text-foreground">AlexNet</h1>
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

function loadSessions() {
    // Load all stored chat sessions from localStorage
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
                console.warn("Failed to parse session:", key, error);
            }
        }
    }

    // If no real sessions exist, add some sample sessions for demo
    if (sessions.length === 0) {
        sessions.push(
            {
                id: "sample-1",
                title: "Code Review Request",
                preview: "Can you review my React component?",
                timestamp: new Date(Date.now() - 1000 * 60 * 30), // 30 mins ago
            },
            {
                id: "sample-2",
                title: "Database Design Help",
                preview: "Need help designing a user schema...",
                timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
            },
            {
                id: "sample-3",
                title: "API Documentation",
                preview: "Generate docs for my REST API",
                timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24), // Yesterday
            },
            {
                id: "sample-4",
                title: "Bug Investigation",
                preview: "Strange behavior in production...",
                timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3), // 3 days ago
            },
        );
    }

    // Sort sessions by timestamp (newest first)
    allSessions.value = sessions.sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
    );
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
