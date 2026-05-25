# 响应式设计指南

## 目录
1. [断点系统](#断点系统)
2. [布局策略](#布局策略)
3. [组件适配](#组件适配)
4. [触控适配](#触控适配)

## 断点系统

使用 TailwindCSS 默认断点：

| 断点 | 最小宽度 | 目标设备 |
|------|----------|----------|
| (默认) | 0px | 手机 (竖屏) |
| `sm` | 640px | 手机 (横屏) |
| `md` | 768px | 平板 |
| `lg` | 1024px | 桌面 |
| `xl` | 1280px | 大屏桌面 |

### 设计优先级
**Mobile First** — 默认样式为移动端，用断点前缀向上适配。

```html
<!-- Mobile: 1列, Tablet: 2列, Desktop: 3列 -->
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
```

## 布局策略

### 移动端 (< 768px)
- 单列布局
- 全宽卡片
- 底部固定操作按钮
- 内边距: `px-4` ~ `px-6`
- 最大宽度: 不限制

### 平板端 (768px - 1023px)
- 两列网格
- 导航可折叠为汉堡菜单
- 内边距: `px-8`

### 桌面端 (≥ 1024px)
- 居中内容区 `max-w-[960px] mx-auto`
- 侧边导航
- 内边距: `px-10` ~ `px-40`
- 可使用悬停效果

### 常见布局模式
```html
<!-- 内容居中 + 响应式内边距 -->
<main class="mx-auto flex w-full max-w-[960px] flex-1 flex-col p-6 lg:px-10">

<!-- 导航栏响应式内边距 -->
<header class="px-6 py-4 lg:px-40">

<!-- 固定底部按钮 (移动端) -->
<div class="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-[960px] px-6">
```

## 组件适配

### 导航栏
- 移动端: 简化标题 + 图标按钮
- 桌面端: 完整导航菜单

### 网格
```html
<!-- 统计卡片: 移动端2列, 桌面端4列 -->
<div class="grid grid-cols-2 lg:grid-cols-4 gap-4">

<!-- 信息列表: 移动端1列, 桌面端3列 -->
<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
```

### 图片/头像
- 移动端: 较小尺寸 `size-24`
- 桌面端: 标准尺寸 `size-32`
```html
<div class="size-24 md:size-32 rounded-full ...">
```

### 文字
- 移动端: 适当缩小标题 `text-2xl`
- 桌面端: 标准大小 `text-3xl`
```html
<h1 class="text-2xl md:text-3xl font-extrabold">
```

### 截图轮播
- 移动端: 水平滚动 `overflow-x-auto`
- 桌面端: 可考虑网格展示

### 固定底部按钮
- 移动端: 固定在底部
- 桌面端: 可内联或固定

## 触控适配

### 最小触控目标
- 按钮/链接最小尺寸: 44x44px (`size-11`)
- 列表项最小高度: 48px

### 间距
- 可点击元素间距至少 8px，防止误触

### 输入框
- 移动端字号不小于 16px，防止 iOS 自动缩放
```html
<input class="text-base" />  <!-- 16px，不会触发 iOS 缩放 -->
```

### 滚动
- 移动端使用 `-webkit-overflow-scrolling: touch` 实现惯性滚动
- 隐藏滚动条: `scrollbar-hide` class
