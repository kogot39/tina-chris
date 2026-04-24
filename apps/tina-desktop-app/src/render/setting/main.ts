import { createApp } from 'vue'
import App from './App.vue'
import '@tina-chris/tina-ui/style.css'
import { modalPlugin, toastPlugin } from '@tina-chris/tina-ui'
import router from './router'

createApp(App).use(router).use(toastPlugin).use(modalPlugin).mount('#app')
