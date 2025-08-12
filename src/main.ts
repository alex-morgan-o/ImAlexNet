import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import "./style.css";

// Apply dark theme by default to match One Dark Pro
document.documentElement.classList.add('dark');

createApp(App).use(router).mount("#app");
