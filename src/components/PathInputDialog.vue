<template>
  <div v-if="show" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
    <div class="bg-dark-400 border border-dark-300 rounded-lg w-[720px] shadow-xl flex flex-col max-h-[80vh]">
      <div class="p-4 pb-0">
        <div class="text-sm text-primary-fg mb-1 font-medium">
          Select a folder {{ access ? `(required: ${accessDisplay})` : '' }}
        </div>
        <div v-if="prompt" class="text-xs text-gray-400 mb-2">
          {{ prompt }}
        </div>
        <!-- Breadcrumbs -->
        <div class="flex items-center gap-1 text-xs text-gray-300 overflow-x-auto">
          <button class="px-2 py-1 bg-dark-600 rounded border border-dark-500 hover:bg-dark-500" @click="goUp" :disabled="!canGoUp">Up</button>
          <div class="flex items-center gap-1">
            <template v-for="(seg, idx) in breadcrumbs" :key="idx">
              <button class="px-1.5 py-0.5 hover:underline" @click="goTo(idx)" :disabled="idx === breadcrumbs.length - 1">{{ seg.name || '/' }}</button>
              <span v-if="idx < breadcrumbs.length - 1">/</span>
            </template>
          </div>
        </div>
      </div>
      <!-- Listing -->
      <div class="p-4 pt-2 flex-1 overflow-auto">
        <div v-if="error" class="text-sm text-red-400 mb-2">{{ error }}</div>
        <div v-if="loading" class="text-sm text-gray-400">Loading...</div>
        <div v-else class="grid grid-cols-2 gap-2">
          <button
            v-for="item in folders"
            :key="item.path"
            class="flex items-center gap-2 p-2 bg-dark-600 border border-dark-500 rounded hover:bg-dark-500 text-left"
            @click="enter(item)"
            :aria-label="`Open ${item.name}`"
          >
            <svg class="w-4 h-4 text-primary-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7h4l2 2h10a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
            </svg>
            <span class="truncate">{{ item.name }}</span>
          </button>
        </div>
        <div v-if="!loading && folders.length === 0" class="text-sm text-gray-400">No subfolders.</div>
      </div>
      <!-- Footer -->
      <div class="p-3 flex items-center justify-between border-t border-dark-500">
        <div class="text-xs text-gray-400 truncate">Current: {{ currentPath }}</div>
        <div class="flex gap-2">
          <button class="px-3 py-1 text-xs bg-dark-600 text-primary-fg rounded hover:bg-dark-500" @click="$emit('cancel')">Cancel</button>
          <button class="px-3 py-1 text-xs bg-primary-accent text-white rounded hover:bg-primary-accent/90" @click="onConfirm">Use This Folder</button>
        </div>
      </div>
    </div>
  </div>
  
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { fileManager, type DirectoryListing, type FileInfo } from '../services/fileManager'

const props = defineProps<{
  show: boolean
  value: string
  access?: 'read' | 'write' | 'read_write' | string | null
  prompt?: string | null
}>()

const emit = defineEmits<{
  (e: 'cancel'): void
  (e: 'confirm', value: string): void
}>()

const accessDisplay = computed(() => (props.access || '').toString().replace('_', '/'))

const currentPath = ref<string>('')
const listing = ref<DirectoryListing | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const folders = computed<FileInfo[]>(() => (listing.value?.items || []).filter(i => i.is_directory))

const breadcrumbs = computed(() => {
  const path = currentPath.value
  if (!path) return [] as Array<{ name: string; path: string }>
  const sep = path.includes('/') ? '/' : '\\'
  const parts = path.split(sep).filter(Boolean)
  const acc: Array<{ name: string; path: string }> = []
  let build = path.startsWith(sep) ? sep : ''
  for (const p of parts) {
    build = build ? (build.endsWith(sep) ? build + p : build + sep + p) : p
    acc.push({ name: p, path: build })
  }
  return acc
})

const canGoUp = computed(() => !!currentPath.value && currentPath.value !== '/' && currentPath.value !== '')

async function load(path: string) {
  try {
    loading.value = true
    error.value = null
    listing.value = await fileManager.listDirectory(path)
  } catch (e: any) {
    error.value = String(e?.message || e)
    listing.value = null
  } finally {
    loading.value = false
  }
}

async function init() {
  // prefer provided value; else use first safe directory (home)
  const val = (props.value || '').trim()
  if (val) {
    currentPath.value = val
  } else {
    try {
      const safe = await fileManager.getSafeDirectories()
      currentPath.value = safe[0] || '/'
    } catch {
      currentPath.value = '/'
    }
  }
  await load(currentPath.value)
}

function goUp() {
  if (!canGoUp.value) return
  const sep = currentPath.value.includes('/') ? '/' : '\\'
  const parts = currentPath.value.split(sep)
  parts.pop()
  let parent = parts.join(sep)
  if (!parent) parent = sep
  currentPath.value = parent
  void load(currentPath.value)
}

function goTo(idx: number) {
  const seg = breadcrumbs.value[idx]
  if (!seg) return
  currentPath.value = seg.path
  void load(currentPath.value)
}

function enter(item: FileInfo) {
  if (!item.is_directory) return
  currentPath.value = item.path
  void load(currentPath.value)
}

// Single click enters the folder; selection highlight could be added later

function onConfirm() {
  emit('confirm', currentPath.value)
}

watch(() => props.show, (v) => {
  if (v) {
    void init()
  }
})

onMounted(() => {
  if (props.show) void init()
})
</script>
