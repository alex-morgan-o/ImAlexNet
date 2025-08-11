<template>
    <div id="halo-search" :class="props.class">
        <div class="aurora-glow"></div>
        <div class="outer-ring"></div>
        <div class="outer-ring"></div>
        <div class="outer-ring"></div>

        <div class="inner-glow"></div>

        <div class="main-border"></div>

        <div id="search-wrapper">
            <input
                v-bind="$attrs"
                v-model="modelValue"
                :placeholder="currentPlaceholder"
                type="text"
                name="text"
                class="search-field"
            />
            <div class="search-btn-border"></div>
            <span
                :class="[
                    'absolute top-2 right-2 flex items-center justify-center z-[2] max-h-10 max-w-10 size-full isolate overflow-hidden rounded-lg border border-transparent border-solid',
                ]"
                style=""
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="text-white"
                >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                </svg>
            </span>
        </div>
    </div>
</template>

<script lang="ts" setup>
import type { HTMLAttributes } from "vue";
import { useVModel } from "@vueuse/core";
import { ref, onMounted, onUnmounted } from "vue";

defineOptions({
    inheritAttrs: false,
});

interface Props {
    defaultValue?: string | number;
    modelValue?: string | number;
    class?: HTMLAttributes["class"];
}

const props = defineProps<Props>();

const emits = defineEmits<{
    (e: "update:modelValue", payload: string | number): void;
}>();

const modelValue = useVModel(props, "modelValue", emits, {
    passive: true,
    defaultValue: props.defaultValue,
});

// Placeholder rotation functionality
const currentPlaceholder = ref("");
const placeholderIndex = ref(0);
let placeholderInterval: number | null = null;

const placeholders = [
    "ask me anything...",
    "awaiting orders...",
    "your wish is my command...",
    "make your wish...",
    "how can I help?...",
    "what shall we build?...",
    "ready for action...",
    "at your service...",
    "what's on your mind?...",
    "let's create something...",
    "what do you need?...",
    "I'm all ears...",
    "fire away...",
    "what's the mission?...",
];

function rotatePlaceholder() {
    placeholderIndex.value = (placeholderIndex.value + 1) % placeholders.length;
    currentPlaceholder.value = placeholders[placeholderIndex.value];
}

onMounted(() => {
    // Set initial placeholder
    currentPlaceholder.value = placeholders[0];

    // Start rotation every 2.5 seconds
    placeholderInterval = setInterval(rotatePlaceholder, 2500);
});

onUnmounted(() => {
    if (placeholderInterval) {
        clearInterval(placeholderInterval);
    }
});
</script>

<style scoped>
#halo-search {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
}

#search-wrapper {
    position: relative;
    width: 100%;
}

.grid {
    height: 800px;
    width: 800px;
    background-image:
        linear-gradient(to right, #0f0f10 1px, transparent 1px),
        linear-gradient(to bottom, #0f0f10 1px, transparent 1px);
    background-size: 1rem 1rem;
    background-position: center center;
    position: absolute;
    z-index: -1;
    filter: blur(1px);
}

.search-field {
    background-color: #010201;
    border: none;
    width: 100%;
    height: 56px;
    border-radius: 10px;
    color: white;
    padding-right: 60px;
    padding-left: 16px;
    font-size: 18px;
}

.search-field::placeholder {
    color: #c0b9c0;
}

.search-field:focus {
    outline: none;
}

.inner-glow,
.main-border,
.outer-ring,
.aurora-glow {
    max-height: 70px;
    height: 100%;
    width: 100%;
    position: absolute;
    overflow: hidden;
    z-index: -1;
    border-radius: 12px;
    filter: blur(3px);
}

.inner-glow {
    max-height: 63px;
    border-radius: 10px;
    filter: blur(2px);
}

.inner-glow::before {
    content: "";
    z-index: -2;
    text-align: center;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(83deg);
    position: absolute;
    width: 600px;
    height: 600px;
    background-repeat: no-repeat;
    background-position: 0 0;
    filter: brightness(1.4);
    background-image: conic-gradient(
        rgba(0, 0, 0, 0) 0%,
        #a099d8,
        rgba(0, 0, 0, 0) 8%,
        rgba(0, 0, 0, 0) 50%,
        #dfa2da,
        rgba(0, 0, 0, 0) 58%
    );
    transition: all 2s;
}

.main-border {
    max-height: 59px;
    border-radius: 11px;
    filter: blur(0.5px);
}

.main-border::before {
    content: "";
    z-index: -2;
    text-align: center;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(70deg);
    position: absolute;
    width: 600px;
    height: 600px;
    filter: brightness(1.3);
    background-repeat: no-repeat;
    background-position: 0 0;
    background-image: conic-gradient(
        #1c191c,
        #402fb5 5%,
        #1c191c 14%,
        #1c191c 50%,
        #cf30aa 60%,
        #1c191c 64%
    );
    transition: all 2s;
}

.outer-ring {
    max-height: 65px;
}

.outer-ring::before {
    content: "";
    z-index: -2;
    text-align: center;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(82deg);
    position: absolute;
    width: 600px;
    height: 600px;
    background-repeat: no-repeat;
    background-position: 0 0;
    background-image: conic-gradient(
        rgba(0, 0, 0, 0),
        #18116a,
        rgba(0, 0, 0, 0) 10%,
        rgba(0, 0, 0, 0) 50%,
        #6e1b60,
        rgba(0, 0, 0, 0) 60%
    );
    transition: all 2s;
}

.aurora-glow {
    overflow: hidden;
    filter: blur(30px);
    opacity: 0.4;
    max-height: 130px;
}

.aurora-glow:before {
    content: "";
    z-index: -2;
    text-align: center;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(60deg);
    position: absolute;
    width: 999px;
    height: 999px;
    background-repeat: no-repeat;
    background-position: 0 0;
    background-image: conic-gradient(
        #000,
        #402fb5 5%,
        #000 38%,
        #000 50%,
        #cf30aa 60%,
        #000 87%
    );
    transition: all 2s;
}

/* ===========================================
   INPUT OVERLAY & ACCENT EFFECTS
   =========================================== */

#text-mask {
    pointer-events: none;
    width: 100px;
    height: 20px;
    position: absolute;
    background: linear-gradient(90deg, transparent, black);
    top: 18px;
    left: 32px;
}

#accent-blur {
    pointer-events: none;
    width: 30px;
    height: 20px;
    position: absolute;
    background: #cf30aa;
    top: 10px;
    left: 5px;
    filter: blur(20px);
    opacity: 0.8;
    transition: all 2s;
}

.search-btn-border {
    height: 42px;
    width: 42px;
    position: absolute;
    overflow: hidden;
    top: 7px;
    right: 7px;
    border-radius: 12px;
}

.search-btn-border::before {
    content: "";
    text-align: center;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(90deg);
    position: absolute;
    width: 600px;
    height: 600px;
    background-repeat: no-repeat;
    background-position: 0 0;
    filter: brightness(1.35);
    background-image: conic-gradient(
        rgba(0, 0, 0, 0),
        #3d3a4f,
        rgba(0, 0, 0, 0) 50%,
        rgba(0, 0, 0, 0) 50%,
        #3d3a4f,
        rgba(0, 0, 0, 0) 100%
    );
    animation: rotate 4s linear infinite;
}

#halo-search:hover > .outer-ring::before {
    transform: translate(-50%, -50%) rotate(-98deg);
}

#halo-search:hover > .aurora-glow::before {
    transform: translate(-50%, -50%) rotate(-120deg);
}

#halo-search:hover > .inner-glow::before {
    transform: translate(-50%, -50%) rotate(-97deg);
}

#halo-search:hover > .main-border::before {
    transform: translate(-50%, -50%) rotate(-110deg);
}

#search-wrapper:hover > #accent-blur {
    opacity: 0;
}

#halo-search:focus-within > .outer-ring::before {
    transform: translate(-50%, -50%) rotate(442deg);
    transition: all 4s;
}

#halo-search:focus-within > .aurora-glow::before {
    transform: translate(-50%, -50%) rotate(420deg);
    transition: all 4s;
}

#halo-search:focus-within > .inner-glow::before {
    transform: translate(-50%, -50%) rotate(443deg);
    transition: all 4s;
}

#halo-search:focus-within > .main-border::before {
    transform: translate(-50%, -50%) rotate(430deg);
    transition: all 4s;
}

#search-wrapper:focus-within > #text-mask {
    display: none;
}

@keyframes rotate {
    100% {
        transform: translate(-50%, -50%) rotate(450deg);
    }
}

@keyframes leftright {
    0% {
        transform: translate(0px, 0px);
        opacity: 1;
    }
    49% {
        transform: translate(250px, 0px);
        opacity: 0;
    }
    80% {
        transform: translate(-40px, 0px);
        opacity: 0;
    }
    100% {
        transform: translate(0px, 0px);
        opacity: 1;
    }
}
</style>
