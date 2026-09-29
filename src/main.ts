import 'ant-design-vue/dist/reset.css';
import { createApp } from 'vue';
import Antd from 'ant-design-vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { i18n } from './i18n';
import { router } from './router';

createApp(App).use(createPinia()).use(router).use(i18n).use(Antd).mount('#app');
