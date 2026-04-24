import { createApp } from 'vue'
import App from './App.vue'
import '@tina-chris/tina-ui/style.css'
import { toastPlugin } from '@tina-chris/tina-ui'

const app = createApp(App)
app.use(toastPlugin).mount('#app')
