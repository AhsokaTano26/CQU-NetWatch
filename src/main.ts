import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import './style.css'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./pages/OverviewPage.vue') },
    { path: '/status', component: () => import('./pages/StatusPage.vue') },
    { path: '/monitoring', component: () => import('./pages/MonitoringPage.vue') },
    { path: '/buildings/:id', component: () => import('./pages/BuildingPage.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: (_, __, saved) => saved || { top: 0 },
})
createApp(App).use(router).mount('#app')
