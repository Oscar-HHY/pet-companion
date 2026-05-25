# 动画、国际化与性能优化

## 目录
1. [Vue Transition 动画](#vue-transition-动画)
2. [页面切换动画](#页面切换动画)
3. [国际化 (i18n)](#国际化-i18n)
4. [性能优化](#性能优化)

## Vue Transition 动画

### 基础过渡
```vue
<!-- 淡入淡出 -->
<Transition name="fade">
  <div v-if="show">内容</div>
</Transition>

<!-- 滑入 -->
<Transition name="slide-up">
  <div v-if="show">内容</div>
</Transition>
```

### 全局过渡样式
```css
/* src/styles/transitions.css — 在 main.css 中 @import */

/* 淡入淡出 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 从下方滑入 */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

/* Modal 动画 */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-active .relative,
.modal-leave-active .relative {
  transition: all 0.2s ease;
}
.modal-enter-from .relative,
.modal-leave-to .relative {
  opacity: 0;
  transform: scale(0.95);
}

/* Toast 动画 */
.toast-enter-active {
  transition: all 0.3s ease;
}
.toast-leave-active {
  transition: all 0.2s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(40px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(40px);
}

/* 列表动画 */
.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}
.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
.list-move {
  transition: transform 0.3s ease;
}
```

### 动画时间规范

| 类型 | 时长 | 缓动 |
|------|------|------|
| 微交互（hover、focus） | 150ms | ease |
| 组件出现/消失 | 200ms | ease |
| 页面切换 | 300ms | ease-in-out |
| 复杂动画 | 400-600ms | cubic-bezier |

## 页面切换动画

### 路由过渡
```vue
<!-- src/App.vue -->
<script setup lang="ts">
import AppHeader from '@/components/layout/AppHeader.vue'
import AppToast from '@/components/ui/AppToast.vue'
import { useAppStore } from '@/stores/app'
import { onMounted } from 'vue'

const appStore = useAppStore()

onMounted(() => {
  appStore.init()
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-dark-bg">
    <AppHeader />

    <RouterView v-slot="{ Component, route }">
      <Transition name="fade" mode="out-in">
        <component :is="Component" :key="route.path" />
      </Transition>
    </RouterView>

    <AppToast />
  </div>
</template>
```

## 国际化 (i18n)

### 配置
```typescript
// src/i18n/index.ts
import { createI18n } from 'vue-i18n'
import zhCN from './zh-CN'
import enUS from './en-US'

export const i18n = createI18n({
  legacy: false,
  locale: localStorage.getItem('locale') || 'zh-CN',
  fallbackLocale: 'en-US',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
})
```

### 语言文件
```typescript
// src/i18n/zh-CN.ts
export default {
  common: {
    confirm: '确定',
    cancel: '取消',
    save: '保存',
    delete: '删除',
    edit: '编辑',
    loading: '加载中...',
    noData: '暂无数据',
    search: '搜索',
  },
  auth: {
    login: '登录',
    register: '注册',
    email: '邮箱',
    password: '密码',
    confirmPassword: '确认密码',
    forgotPassword: '忘记密码？',
    noAccount: '还没有账号？',
    hasAccount: '已有账号？',
  },
  pet: {
    myPets: '我的宠物',
    addPet: '添加宠物',
    name: '名字',
    breed: '品种',
    gender: '性别',
    birthday: '生日',
    male: '男孩',
    female: '女孩',
    unknown: '未知',
  },
  nav: {
    home: '首页',
    pets: '宠物',
    memories: '记忆宫殿',
    community: '社区',
    profile: '个人中心',
  },
}

// src/i18n/en-US.ts
export default {
  common: {
    confirm: 'Confirm',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    loading: 'Loading...',
    noData: 'No data',
    search: 'Search',
  },
  auth: {
    login: 'Login',
    register: 'Register',
    email: 'Email',
    password: 'Password',
    confirmPassword: 'Confirm Password',
    forgotPassword: 'Forgot password?',
    noAccount: "Don't have an account?",
    hasAccount: 'Already have an account?',
  },
  pet: {
    myPets: 'My Pets',
    addPet: 'Add Pet',
    name: 'Name',
    breed: 'Breed',
    gender: 'Gender',
    birthday: 'Birthday',
    male: 'Male',
    female: 'Female',
    unknown: 'Unknown',
  },
  nav: {
    home: 'Home',
    pets: 'Pets',
    memories: 'Memory Palace',
    community: 'Community',
    profile: 'Profile',
  },
}
```

### 在组件中使用
```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <h1>{{ t('pet.myPets') }}</h1>
  <AppButton>{{ t('pet.addPet') }}</AppButton>
</template>
```

### 语言切换
```typescript
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'

const { locale } = useI18n()
const appStore = useAppStore()

function switchLanguage(lang: 'zh-CN' | 'en-US') {
  locale.value = lang
  appStore.setLocale(lang)
}
```

## 性能优化

### 路由懒加载（已内置）
```typescript
// 所有路由页面都使用动态 import
component: () => import('@/views/pet/PetListView.vue')
```

### 组件懒加载
```vue
<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

// 大型组件懒加载
const RichTextEditor = defineAsyncComponent(() =>
  import('@/components/ui/RichTextEditor.vue')
)
</script>
```

### 图片优化
```vue
<!-- 懒加载 + 响应式图片 -->
<img
  :src="pet.avatar"
  :alt="pet.name"
  loading="lazy"
  decoding="async"
  class="w-full h-full object-cover"
/>

<!-- 带占位符的图片组件 -->
<!-- src/components/ui/AppImage.vue -->
<script setup lang="ts">
import { ref } from 'vue'

interface Props {
  src: string
  alt?: string
  fallback?: string
}

const props = withDefaults(defineProps<Props>(), {
  alt: '',
  fallback: '',
})

const isLoaded = ref(false)
const hasError = ref(false)
</script>

<template>
  <div class="relative overflow-hidden bg-gray-100 dark:bg-dark-card">
    <!-- Skeleton -->
    <div
      v-if="!isLoaded && !hasError"
      class="absolute inset-0 animate-pulse bg-gray-200 dark:bg-dark-border"
    />

    <!-- Image -->
    <img
      :src="src"
      :alt="alt"
      loading="lazy"
      decoding="async"
      class="w-full h-full object-cover transition-opacity duration-300"
      :class="isLoaded ? 'opacity-100' : 'opacity-0'"
      @load="isLoaded = true"
      @error="hasError = true"
    />

    <!-- Error fallback -->
    <div v-if="hasError" class="absolute inset-0 flex items-center justify-center">
      <span class="material-symbols-outlined text-3xl text-gray-300">broken_image</span>
    </div>
  </div>
</template>
```

### 虚拟滚动（大列表）
```bash
# 如需要大量列表项，安装虚拟滚动
npm install @vueuse/core
```

```vue
<script setup lang="ts">
import { useVirtualList } from '@vueuse/core'

const { list, containerProps, wrapperProps } = useVirtualList(items, {
  itemHeight: 80,
})
</script>

<template>
  <div v-bind="containerProps" class="h-[600px] overflow-auto">
    <div v-bind="wrapperProps">
      <div v-for="{ data, index } in list" :key="index" class="h-20">
        {{ data }}
      </div>
    </div>
  </div>
</template>
```

### 防抖搜索
```typescript
// src/composables/useDebounce.ts
import { ref, watch } from 'vue'

export function useDebouncedRef<T>(initialValue: T, delay = 300) {
  const value = ref(initialValue) as Ref<T>
  const debouncedValue = ref(initialValue) as Ref<T>

  let timer: ReturnType<typeof setTimeout>

  watch(value, (newVal) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      debouncedValue.value = newVal
    }, delay)
  })

  return { value, debouncedValue }
}
```

### SEO 基础
```typescript
// 动态设置页面标题（已在路由守卫中实现）
// 如需更完整的 SEO，可使用 @unhead/vue

// 基本 meta 配置在 index.html
```

```html
<!-- index.html -->
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="Pet Companionship - 你的虚拟宠物伴侣" />
  <link rel="icon" href="/favicon.ico" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <title>Pet Companionship</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```
