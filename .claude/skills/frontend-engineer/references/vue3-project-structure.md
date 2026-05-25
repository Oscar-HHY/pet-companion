# Vue 3 项目结构与工程化

## 目录
1. [项目初始化](#项目初始化)
2. [Vite 配置](#vite-配置)
3. [TailwindCSS 配置](#tailwindcss-配置)
4. [TypeScript 配置](#typescript-配置)
5. [环境变量](#环境变量)
6. [路由配置](#路由配置)
7. [构建优化](#构建优化)

## 项目初始化

### 创建项目
```bash
npm create vite@latest frontend -- --template vue-ts
cd frontend
npm install
```

### 核心依赖安装
```bash
# 路由 + 状态管理
npm install vue-router@4 pinia

# HTTP 请求
npm install axios

# 国际化
npm install vue-i18n@9

# 开发依赖
npm install -D tailwindcss @tailwindcss/vite
npm install -D @types/node
```

## Vite 配置

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-vue': ['vue', 'vue-router', 'pinia'],
          'vendor-utils': ['axios', 'vue-i18n'],
        },
      },
    },
  },
})
```

## TailwindCSS 配置

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#ec3713',
          50: '#fef3f2',
          100: '#fee4e2',
          200: '#fecdca',
          300: '#fca9a4',
          400: '#f87a6f',
          500: '#ec3713',
          600: '#dc3410',
          700: '#b92a0e',
          800: '#992613',
          900: '#7f2516',
        },
        dark: {
          bg: '#111111',
          card: '#1a1a1a',
          border: '#2a2a2a',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
        '3xl': '24px',
      },
    },
  },
  plugins: [],
} satisfies Config
```

### 全局样式入口
```css
/* src/styles/main.css */
@import "tailwindcss";

/* Plus Jakarta Sans 字体 */
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');

/* Material Symbols 图标 */
@import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200');

/* 自定义基础样式 */
@layer base {
  body {
    @apply font-sans text-gray-900 dark:text-gray-100 bg-white dark:bg-dark-bg;
  }
}
```

## TypeScript 配置

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "preserve",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "noEmit": true,
    "paths": {
      "@/*": ["./src/*"]
    },
    "types": ["vite/client"]
  },
  "include": ["src/**/*.ts", "src/**/*.d.ts", "src/**/*.tsx", "src/**/*.vue"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### Vue 类型声明
```typescript
// src/env.d.ts
/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_APP_TITLE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

## 环境变量

```bash
# .env.development
VITE_API_BASE_URL=http://localhost:8000/api/v1
VITE_APP_TITLE=Pet Companionship (Dev)

# .env.production
VITE_API_BASE_URL=/api/v1
VITE_APP_TITLE=Pet Companionship
```

### 使用方式
```typescript
const apiUrl = import.meta.env.VITE_API_BASE_URL
```

**注意**: 只有 `VITE_` 前缀的变量才会暴露给前端代码。敏感信息（API Key 等）不要用 `VITE_` 前缀。

## 路由配置

```typescript
// src/router/index.ts
import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  // 公开页面
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/auth/LoginView.vue'),
    meta: { requiresAuth: false, title: '登录' },
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('@/views/auth/RegisterView.vue'),
    meta: { requiresAuth: false, title: '注册' },
  },

  // 需要认证的页面
  {
    path: '/',
    name: 'Dashboard',
    component: () => import('@/views/dashboard/DashboardView.vue'),
    meta: { requiresAuth: true, title: '首页' },
  },
  {
    path: '/pets',
    name: 'PetList',
    component: () => import('@/views/pet/PetListView.vue'),
    meta: { requiresAuth: true, title: '我的宠物' },
  },
  {
    path: '/pets/:id',
    name: 'PetDetail',
    component: () => import('@/views/pet/PetDetailView.vue'),
    meta: { requiresAuth: true, title: '宠物详情' },
  },
  {
    path: '/memories',
    name: 'MemoryPalace',
    component: () => import('@/views/memory/MemoryPalaceView.vue'),
    meta: { requiresAuth: true, title: '记忆宫殿' },
  },
  {
    path: '/community',
    name: 'Community',
    component: () => import('@/views/community/CommunityView.vue'),
    meta: { requiresAuth: true, title: '社区' },
  },
  {
    path: '/profile',
    name: 'UserProfile',
    component: () => import('@/views/user/ProfileView.vue'),
    meta: { requiresAuth: true, title: '个人中心' },
  },

  // 404
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/NotFoundView.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    return { top: 0 }
  },
})

// 路由守卫
router.beforeEach((to, from, next) => {
  // 设置页面标题
  document.title = to.meta.title
    ? `${to.meta.title} - Pet Companionship`
    : 'Pet Companionship'

  // 认证检查
  const token = localStorage.getItem('access_token')
  if (to.meta.requiresAuth && !token) {
    next({ name: 'Login', query: { redirect: to.fullPath } })
  } else if (!to.meta.requiresAuth && token && (to.name === 'Login' || to.name === 'Register')) {
    next({ name: 'Dashboard' })
  } else {
    next()
  }
})

export default router
```

### 入口文件
```typescript
// src/main.ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { i18n } from './i18n'
import './styles/main.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(i18n)

app.mount('#app')
```

## 构建优化

### 代码分割策略
- 路由级别：每个路由懒加载（`() => import(...)`）
- 第三方库：vue 生态和工具库分开打包
- 大型组件：按需加载（如富文本编辑器）

### 图片优化
```typescript
// 使用 vite-plugin-imagemin（可选）
// 或在组件中使用 loading="lazy"
<img :src="url" loading="lazy" decoding="async" />
```

### 预加载关键资源
```html
<!-- index.html -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
```
