# 组件设计模式

## 目录
1. [组件分类](#组件分类)
2. [基础 UI 组件](#基础-ui-组件)
3. [布局组件](#布局组件)
4. [业务组件](#业务组件)
5. [组合式函数](#组合式函数)
6. [Props 与 Emits 规范](#props-与-emits-规范)
7. [插槽模式](#插槽模式)

## 组件分类

| 分类 | 路径 | 说明 | 示例 |
|------|------|------|------|
| 基础 UI | `components/ui/` | 通用、无业务逻辑 | Button, Modal, Input, Toast |
| 布局 | `components/layout/` | 页面骨架 | AppHeader, AppSidebar, PageContainer |
| 业务 | `components/business/` | 包含业务逻辑 | PetCard, MemoryTimeline, PostItem |
| 页面 | `views/` | 路由对应的页面 | LoginView, DashboardView |

## 基础 UI 组件

### AppButton
```vue
<!-- src/components/ui/AppButton.vue -->
<script setup lang="ts">
interface Props {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  disabled?: boolean
  block?: boolean
}

withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  loading: false,
  disabled: false,
  block: false,
})

const variantClasses = {
  primary: 'bg-primary text-white hover:bg-primary-700 active:bg-primary-800',
  secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 dark:bg-dark-card dark:text-gray-100',
  outline: 'border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-dark-border dark:text-gray-300',
  ghost: 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-dark-card',
  danger: 'bg-red-500 text-white hover:bg-red-600',
}

const sizeClasses = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-4 py-2 text-sm rounded-xl',
  lg: 'px-6 py-3 text-base rounded-xl',
}
</script>

<template>
  <button
    :class="[
      'inline-flex items-center justify-center font-medium transition-all duration-200',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      variantClasses[variant],
      sizeClasses[size],
      block ? 'w-full' : '',
    ]"
    :disabled="disabled || loading"
  >
    <span v-if="loading" class="material-symbols-outlined animate-spin mr-2 text-[18px]">progress_activity</span>
    <slot />
  </button>
</template>
```

### AppModal
```vue
<!-- src/components/ui/AppModal.vue -->
<script setup lang="ts">
import { watch } from 'vue'

interface Props {
  show: boolean
  title?: string
  size?: 'sm' | 'md' | 'lg'
  closable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  closable: true,
})

const emit = defineEmits<{
  close: []
}>()

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
}

// 打开时禁止背景滚动
watch(() => props.show, (val) => {
  document.body.style.overflow = val ? 'hidden' : ''
})

function handleBackdropClick() {
  if (props.closable) emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/50" @click="handleBackdropClick" />

        <!-- Content -->
        <div
          :class="[
            'relative w-full bg-white dark:bg-dark-card rounded-2xl shadow-xl',
            sizeClasses[size],
          ]"
        >
          <!-- Header -->
          <div v-if="title || closable" class="flex items-center justify-between p-4 border-b dark:border-dark-border">
            <h3 v-if="title" class="text-lg font-semibold">{{ title }}</h3>
            <button
              v-if="closable"
              class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              @click="emit('close')"
            >
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>

          <!-- Body -->
          <div class="p-4">
            <slot />
          </div>

          <!-- Footer -->
          <div v-if="$slots.footer" class="p-4 border-t dark:border-dark-border">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
```

### AppInput
```vue
<!-- src/components/ui/AppInput.vue -->
<script setup lang="ts">
interface Props {
  modelValue: string
  label?: string
  placeholder?: string
  type?: string
  error?: string
  disabled?: boolean
  icon?: string
}

withDefaults(defineProps<Props>(), {
  type: 'text',
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <div class="space-y-1">
    <label v-if="label" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
      {{ label }}
    </label>
    <div class="relative">
      <span
        v-if="icon"
        class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]"
      >
        {{ icon }}
      </span>
      <input
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :class="[
          'w-full rounded-xl border bg-white px-4 py-2.5 text-sm transition-colors',
          'dark:bg-dark-card dark:text-gray-100',
          'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          error ? 'border-red-500' : 'border-gray-300 dark:border-dark-border',
          icon ? 'pl-10' : '',
        ]"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
    </div>
    <p v-if="error" class="text-sm text-red-500">{{ error }}</p>
  </div>
</template>
```

### AppToast（通过组合式函数调用）
```vue
<!-- src/components/ui/AppToast.vue -->
<script setup lang="ts">
import { useToast } from '@/composables/useToast'

const { toasts, removeToast } = useToast()

const iconMap = {
  success: 'check_circle',
  error: 'error',
  warning: 'warning',
  info: 'info',
}

const colorMap = {
  success: 'bg-green-500',
  error: 'bg-red-500',
  warning: 'bg-yellow-500',
  info: 'bg-blue-500',
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed top-4 right-4 z-[100] space-y-2">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="flex items-center gap-3 px-4 py-3 bg-white dark:bg-dark-card rounded-xl shadow-lg min-w-[300px]"
        >
          <span :class="['material-symbols-outlined text-white rounded-full p-1 text-[16px]', colorMap[toast.type]]">
            {{ iconMap[toast.type] }}
          </span>
          <p class="text-sm flex-1">{{ toast.message }}</p>
          <button class="text-gray-400 hover:text-gray-600" @click="removeToast(toast.id)">
            <span class="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
```

## 布局组件

### AppHeader
```vue
<!-- src/components/layout/AppHeader.vue -->
<script setup lang="ts">
import { useUserStore } from '@/stores/user'
import { useAppStore } from '@/stores/app'

const userStore = useUserStore()
const appStore = useAppStore()
</script>

<template>
  <header class="sticky top-0 z-40 bg-white/80 dark:bg-dark-bg/80 backdrop-blur-lg border-b dark:border-dark-border">
    <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
      <!-- Logo -->
      <RouterLink to="/" class="flex items-center gap-2">
        <span class="text-xl font-bold text-primary">Pet Companionship</span>
      </RouterLink>

      <!-- Navigation -->
      <nav class="hidden md:flex items-center gap-6">
        <slot name="nav" />
      </nav>

      <!-- Actions -->
      <div class="flex items-center gap-3">
        <!-- 主题切换 -->
        <button
          class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-card"
          @click="appStore.toggleTheme()"
        >
          <span class="material-symbols-outlined">
            {{ appStore.isDark ? 'light_mode' : 'dark_mode' }}
          </span>
        </button>

        <!-- 用户头像 -->
        <slot name="user" />
      </div>
    </div>
  </header>
</template>
```

### PageContainer
```vue
<!-- src/components/layout/PageContainer.vue -->
<script setup lang="ts">
interface Props {
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  padding?: boolean
}

withDefaults(defineProps<Props>(), {
  maxWidth: 'lg',
  padding: true,
})

const maxWidthClasses = {
  sm: 'max-w-2xl',
  md: 'max-w-4xl',
  lg: 'max-w-6xl',
  xl: 'max-w-7xl',
  full: 'max-w-full',
}
</script>

<template>
  <main :class="['mx-auto w-full', maxWidthClasses[maxWidth], padding ? 'px-4 py-6' : '']">
    <slot />
  </main>
</template>
```

## 业务组件

### PetCard 示例
```vue
<!-- src/components/business/PetCard.vue -->
<script setup lang="ts">
import type { Pet } from '@/types/models'

interface Props {
  pet: Pet
}

defineProps<Props>()
const emit = defineEmits<{
  click: [pet: Pet]
}>()
</script>

<template>
  <div
    class="bg-white dark:bg-dark-card rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer"
    @click="emit('click', pet)"
  >
    <div class="aspect-square bg-gray-100 dark:bg-dark-border">
      <img
        v-if="pet.avatar"
        :src="pet.avatar"
        :alt="pet.name"
        class="w-full h-full object-cover"
        loading="lazy"
      />
      <div v-else class="w-full h-full flex items-center justify-center">
        <span class="material-symbols-outlined text-4xl text-gray-300">pets</span>
      </div>
    </div>
    <div class="p-4">
      <h3 class="font-semibold text-lg">{{ pet.name }}</h3>
      <p class="text-sm text-gray-500 dark:text-gray-400">{{ pet.breed }}</p>
    </div>
  </div>
</template>
```

## 组合式函数

### useAuth
```typescript
// src/composables/useAuth.ts
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'

export function useAuth() {
  const router = useRouter()
  const userStore = useUserStore()

  const isAuthenticated = computed(() => !!userStore.token)
  const currentUser = computed(() => userStore.user)

  async function login(email: string, password: string) {
    await userStore.login(email, password)
    const redirect = router.currentRoute.value.query.redirect as string
    router.push(redirect || '/')
  }

  async function logout() {
    await userStore.logout()
    router.push('/login')
  }

  return { isAuthenticated, currentUser, login, logout }
}
```

### useTheme
```typescript
// src/composables/useTheme.ts
import { ref, watch, onMounted } from 'vue'

const isDark = ref(false)

export function useTheme() {
  function toggleTheme() {
    isDark.value = !isDark.value
  }

  function applyTheme() {
    if (isDark.value) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
  }

  onMounted(() => {
    const saved = localStorage.getItem('theme')
    isDark.value = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)
    applyTheme()
  })

  watch(isDark, applyTheme)

  return { isDark, toggleTheme }
}
```

### useToast
```typescript
// src/composables/useToast.ts
import { ref } from 'vue'

interface Toast {
  id: number
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
}

const toasts = ref<Toast[]>([])
let nextId = 0

export function useToast() {
  function addToast(type: Toast['type'], message: string, duration = 3000) {
    const id = nextId++
    toasts.value.push({ id, type, message })
    if (duration > 0) {
      setTimeout(() => removeToast(id), duration)
    }
  }

  function removeToast(id: number) {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  return {
    toasts,
    addToast,
    removeToast,
    success: (msg: string) => addToast('success', msg),
    error: (msg: string) => addToast('error', msg),
    warning: (msg: string) => addToast('warning', msg),
    info: (msg: string) => addToast('info', msg),
  }
}
```

## Props 与 Emits 规范

### Props 设计原则
1. **必填最少化** — 只有真正必须的字段才不设默认值
2. **类型联合** — 用字面量联合类型限制取值 (`'sm' | 'md' | 'lg'`)
3. **命名一致** — 布尔值用 `is/has/show` 前缀，事件用动词

### Emits 规范
```typescript
// ✅ 用类型化 emits
const emit = defineEmits<{
  'update:modelValue': [value: string]
  change: [value: string]
  submit: []
}>()

// ❌ 不用数组式
const emit = defineEmits(['update:modelValue', 'change'])
```

## 插槽模式

### 默认插槽 + 具名插槽
```vue
<template>
  <div class="card">
    <div v-if="$slots.header" class="card-header">
      <slot name="header" />
    </div>
    <div class="card-body">
      <slot />
    </div>
    <div v-if="$slots.footer" class="card-footer">
      <slot name="footer" />
    </div>
  </div>
</template>
```

### 作用域插槽（列表组件）
```vue
<!-- AppList.vue -->
<script setup lang="ts" generic="T">
interface Props {
  items: T[]
  loading?: boolean
}
defineProps<Props>()
</script>

<template>
  <div v-if="loading" class="flex justify-center py-8">
    <span class="material-symbols-outlined animate-spin text-primary">progress_activity</span>
  </div>
  <div v-else-if="items.length === 0" class="text-center py-8 text-gray-400">
    <slot name="empty">暂无数据</slot>
  </div>
  <div v-else>
    <div v-for="(item, index) in items" :key="index">
      <slot name="item" :item="item" :index="index" />
    </div>
  </div>
</template>
```
