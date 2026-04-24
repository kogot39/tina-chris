import { createApp } from 'vue'
import Play from './src/play.vue'
import { modalPlugin, toastPlugin } from './src/plugins'

const app = createApp(Play)
app.use(toastPlugin)
app.use(modalPlugin)
app.mount('#app')
