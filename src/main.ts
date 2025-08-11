import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";

// Apply dark theme by default to match One Dark Pro
document.documentElement.classList.add('dark');

createApp(App).mount("#app");
