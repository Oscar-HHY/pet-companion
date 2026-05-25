# 状态管理与 API 调用

## 目录
1. [Pinia Store 模式](#pinia-store-模式)
2. [Axios 封装](#axios-封装)
3. [API 层设计](#api-层设计)
4. [Loading 与错误处理](#loading-与错误处理)
5. [认证流程](#认证流程)
6. [数据类型定义](#数据类型定义)

## Pinia Store 模式

### 基本结构
```typescript
// src/stores/user.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { userApi } from '@/api/user'
import type { User } from '@/types/models'

export const useUserStore = defineStore('user', () => {
  // State
  const user = ref<User | null>(null)
  const token = ref<string | null>(localStorage.getItem('access_token'))

  // Getters
  const isAuthenticated = computed(() => !!token.value)
  const displayName = computed(() => user.value?.nickname || user.value?.email || '')

  // Actions
  async function login(email: string, password: string) {
    const res = await userApi.login({ email, password })
    token.value = res.data.access
    localStorage.setItem('access_token', res.data.access)
    localStorage.setItem('refresh_token', res.data.refresh)
    await fetchProfile()
  }

  async function logout() {
    token.value = null
    user.value = null
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
  }

  async function fetchProfile() {
    const res = await userApi.getProfile()
    user.value = res.data
  }

  return { user, token, isAuthenticated, displayName, login, logout, fetchProfile }
})
```

### Pet Store
```typescript
// src/stores/pet.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { petApi } from '@/api/pet'
import type { Pet } from '@/types/models'

export const usePetStore = defineStore('pet', () => {
  const pets = ref<Pet[]>([])
  const currentPet = ref<Pet | null>(null)
  const isLoading = ref(false)

  async function fetchPets() {
    isLoading.value = true
    try {
      const res = await petApi.list()
      pets.value = res.data.results
    } finally {
      isLoading.value = false
    }
  }

  async function fetchPet(id: string) {
    isLoading.value = true
    try {
      const res = await petApi.get(id)
      currentPet.value = res.data
    } finally {
      isLoading.value = false
    }
  }

  async function createPet(data: Partial<Pet>) {
    const res = await petApi.create(data)
    pets.value.unshift(res.data)
    return res.data
  }

  async function updatePet(id: string, data: Partial<Pet>) {
    const res = await petApi.update(id, data)
    const index = pets.value.findIndex(p => p.uuid === id)
    if (index !== -1) pets.value[index] = res.data
    if (currentPet.value?.uuid === id) currentPet.value = res.data
    return res.data
  }

  async function deletePet(id: string) {
    await petApi.delete(id)
    pets.value = pets.value.filter(p => p.uuid !== id)
    if (currentPet.value?.uuid === id) currentPet.value = null
  }

  return { pets, currentPet, isLoading, fetchPets, fetchPet, createPet, updatePet, deletePet }
})
```

### App Store（全局状态）
```typescript
// src/stores/app.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAppStore = defineStore('app', () => {
  const isDark = ref(false)
  const locale = ref<'zh-CN' | 'en-US'>('zh-CN')
  const sidebarOpen = ref(true)

  function toggleTheme() {
    isDark.value = !isDark.value
    document.documentElement.classList.toggle('dark', isDark.value)
    localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
  }

  function setLocale(lang: 'zh-CN' | 'en-US') {
    locale.value = lang
    localStorage.setItem('locale', lang)
  }

  function init() {
    // 初始化主题
    const savedTheme = localStorage.getItem('theme')
    isDark.value = savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', isDark.value)

    // 初始化语言
    const savedLocale = localStorage.getItem('locale') as 'zh-CN' | 'en-US' | null
    if (savedLocale) locale.value = savedLocale
  }

  return { isDark, locale, sidebarOpen, toggleTheme, setLocale, init }
})
```

## Axios 封装

```typescript
// src/api/client.ts
import axios from 'axios'
import type { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse, AxiosError } from 'axios'
import { useToast } from '@/composables/useToast'

const client: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器：自动带 Token
client.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// 响应拦截器：统一错误处理
client.interceptors.response.use(
  (response: AxiosResponse) => response.data,
  async (error: AxiosError<ApiErrorResponse>) => {
    const { error: showError } = useToast()

    if (error.response) {
      const { status, data } = error.response

      switch (status) {
        case 401:
          // Token 过期，尝试刷新
          const refreshed = await tryRefreshToken()
          if (refreshed && error.config) {
            return client(error.config)
          }
          // 刷新失败，跳转登录
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
          window.location.href = '/login'
          break

        case 403:
          showError('没有权限执行此操作')
          break

        case 404:
          showError('请求的资源不存在')
          break

        case 422:
          // 表单验证错误，由调用方处理
          break

        case 500:
          showError('服务器错误，请稍后重试')
          break

        default:
          showError(data?.message || '请求失败')
      }
    } else if (error.code === 'ECONNABORTED') {
      showError('请求超时，请检查网络')
    } else {
      showError('网络连接失败')
    }

    return Promise.reject(error)
  },
)

// Token 刷新逻辑
let isRefreshing = false
let refreshSubscribers: ((token: string) => void)[] = []

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem('refresh_token')
  if (!refreshToken) return false

  if (isRefreshing) {
    return new Promise((resolve) => {
      refreshSubscribers.push(() => resolve(true))
    })
  }

  isRefreshing = true
  try {
    const res = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/auth/token/refresh/`, {
      refresh: refreshToken,
    })
    const newToken = res.data.access
    localStorage.setItem('access_token', newToken)
    refreshSubscribers.forEach(cb => cb(newToken))
    return true
  } catch {
    return false
  } finally {
    isRefreshing = false
    refreshSubscribers = []
  }
}

export default client

// API 错误响应类型
interface ApiErrorResponse {
  message?: string
  errors?: Record<string, string[]>
}
```

## API 层设计

### 统一响应类型
```typescript
// src/api/types.ts

// 后端统一响应格式（与架构师 API 规范一致）
interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

// 分页响应
interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

// 登录响应
interface LoginResponse {
  access: string
  refresh: string
}

export type { ApiResponse, PaginatedResponse, LoginResponse }
```

### User API
```typescript
// src/api/user.ts
import client from './client'
import type { LoginResponse } from './types'
import type { User } from '@/types/models'

interface LoginParams {
  email: string
  password: string
}

interface RegisterParams {
  email: string
  password: string
  nickname: string
}

export const userApi = {
  login: (data: LoginParams) =>
    client.post<LoginResponse>('/auth/login/', data),

  register: (data: RegisterParams) =>
    client.post<User>('/auth/register/', data),

  getProfile: () =>
    client.get<User>('/users/me/'),

  updateProfile: (data: Partial<User>) =>
    client.patch<User>('/users/me/', data),

  uploadAvatar: (file: File) => {
    const formData = new FormData()
    formData.append('avatar', file)
    return client.patch<User>('/users/me/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}
```

### Pet API
```typescript
// src/api/pet.ts
import client from './client'
import type { PaginatedResponse } from './types'
import type { Pet } from '@/types/models'

export const petApi = {
  list: (params?: { page?: number; page_size?: number }) =>
    client.get<PaginatedResponse<Pet>>('/pets/', { params }),

  get: (uuid: string) =>
    client.get<Pet>(`/pets/${uuid}/`),

  create: (data: Partial<Pet>) =>
    client.post<Pet>('/pets/', data),

  update: (uuid: string, data: Partial<Pet>) =>
    client.patch<Pet>(`/pets/${uuid}/`, data),

  delete: (uuid: string) =>
    client.delete(`/pets/${uuid}/`),

  uploadPhoto: (uuid: string, file: File) => {
    const formData = new FormData()
    formData.append('photo', file)
    return client.post<Pet>(`/pets/${uuid}/photos/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}
```

## Loading 与错误处理

### useApi 组合式函数
```typescript
// src/composables/useApi.ts
import { ref } from 'vue'
import { useToast } from './useToast'

export function useApi<T, P extends any[]>(
  apiFn: (...args: P) => Promise<T>,
) {
  const data = ref<T | null>(null) as Ref<T | null>
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const toast = useToast()

  async function execute(...args: P): Promise<T | null> {
    isLoading.value = true
    error.value = null
    try {
      const result = await apiFn(...args)
      data.value = result
      return result
    } catch (e: any) {
      error.value = e.response?.data?.message || '请求失败'
      return null
    } finally {
      isLoading.value = false
    }
  }

  return { data, isLoading, error, execute }
}
```

### 在页面中使用
```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { usePetStore } from '@/stores/pet'

const petStore = usePetStore()

onMounted(() => {
  petStore.fetchPets()
})
</script>

<template>
  <!-- Loading 状态 -->
  <div v-if="petStore.isLoading" class="flex justify-center py-12">
    <span class="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
  </div>

  <!-- 空状态 -->
  <div v-else-if="petStore.pets.length === 0" class="text-center py-12">
    <span class="material-symbols-outlined text-5xl text-gray-300 mb-4">pets</span>
    <p class="text-gray-400">还没有宠物，添加一只吧！</p>
    <AppButton class="mt-4" @click="openCreateModal">添加宠物</AppButton>
  </div>

  <!-- 数据列表 -->
  <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    <PetCard
      v-for="pet in petStore.pets"
      :key="pet.uuid"
      :pet="pet"
      @click="router.push(`/pets/${pet.uuid}`)"
    />
  </div>
</template>
```

## 认证流程

### JWT 认证流程
```
1. 用户登录 → POST /api/v1/auth/login/ → 获取 access + refresh token
2. 存储 token → localStorage
3. 每次请求 → Axios 拦截器自动带 Authorization: Bearer {access}
4. access 过期 (401) → 自动用 refresh token 刷新
5. refresh 也过期 → 跳转登录页
6. 退出登录 → 清除 localStorage + 重置 Store
```

### 路由守卫认证
```typescript
// 已在 router/index.ts 中配置
// requiresAuth: true 的路由 → 检查 token
// requiresAuth: false 的路由（登录/注册）→ 已登录则跳转首页
```

## 数据类型定义

```typescript
// src/types/models.ts

export interface User {
  uuid: string
  email: string
  nickname: string
  avatar: string | null
  bio: string
  created_at: string
}

export interface Pet {
  uuid: string
  name: string
  breed: string
  gender: 'male' | 'female' | 'unknown'
  date_of_birth: string | null
  bio: string
  avatar: string | null
  photos: PetPhoto[]
  created_at: string
}

export interface PetPhoto {
  uuid: string
  url: string
  thumbnail_url: string
  created_at: string
}

export interface Memory {
  uuid: string
  pet_uuid: string
  title: string
  content: string
  event_date: string
  photos: string[]
  created_at: string
}

export interface Post {
  uuid: string
  author: User
  content: string
  images: string[]
  likes_count: number
  comments_count: number
  is_liked: boolean
  created_at: string
}

export interface Comment {
  uuid: string
  author: User
  content: string
  parent_uuid: string | null
  replies: Comment[]
  created_at: string
}
```

```typescript
// src/types/common.ts

// 分页参数
export interface PaginationParams {
  page?: number
  page_size?: number
}

// 表单验证错误
export interface FormErrors {
  [field: string]: string[]
}
```
