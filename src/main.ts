import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import "./style.css";
import { initToolingListener, refreshToolAvailability } from './services/tooling'

// Apply dark theme by default to match One Dark Pro
document.documentElement.classList.add('dark');

// Initialize tooling listener and fetch initial availability
initToolingListener();
refreshToolAvailability();

createApp(App).use(router).mount("#app");
