<template>
    <div class="fixed inset-0 z-50 flex items-center justify-center">
        <div
            class="w-full max-w-md bg-card border border-border rounded-xl shadow-xl p-5 bg-slate-700"
        >
            <h2 class="text-lg font-semibold text-foreground mb-2">
                Create AlexNet Workspace?
            </h2>
            <p class="text-sm text-muted-foreground mb-4">
                AlexNet needs to create a workspace at
                <span class="font-mono text-foreground/90">{{
                    workspacePath
                }}</span>
                to store projects, tasks, and files.
            </p>
            <div class="flex items-center justify-end gap-2">
                <button
                    @click="$emit('skip')"
                    class="px-3 py-2 text-sm rounded-md bg-muted hover:bg-muted/80 text-foreground"
                >
                    Not now
                </button>
                <button
                    @click="$emit('create')"
                    class="px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                >
                    Approve
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
defineProps<{ workspacePath: string }>();
defineEmits<{ (e: "create"): void; (e: "skip"): void }>();
</script>
