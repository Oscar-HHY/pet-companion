# Pet Companionship 设计系统

## 目录
1. [配色方案](#配色方案)
2. [字体系统](#字体系统)
3. [间距规则](#间距规则)
4. [圆角和阴影](#圆角和阴影)
5. [图标系统](#图标系统)
6. [组件库](#组件库)

## 配色方案

### 核心色
| 用途 | 颜色 | TailwindCSS |
|------|------|-------------|
| 主色 | `#ec3713` | `primary` |
| 浅色背景 | `#f8f6f6` | `background-light` |
| 深色背景 | `#221310` | `background-dark` |

### 语义色
| 用途 | Light Mode | Dark Mode |
|------|-----------|-----------|
| 文字主色 | `slate-900` | `slate-100` |
| 文字次要 | `slate-500` | `slate-400` |
| 文字辅助 | `slate-400` | `slate-500` |
| 成功 | `green-600` | `green-400` |
| 警告 | `orange-600` | `orange-400` |
| 错误 | `red-600` | `red-400` |
| 信息 | `blue-600` | `blue-400` |

### 透明度用法
- 主色背景: `bg-primary/10` (10% 透明度)
- 主色悬停: `hover:bg-primary/20`
- 边框: `border-primary/5`
- 阴影: `shadow-primary/30`

## 字体系统

### 字体族
- 主字体: `Plus Jakarta Sans` (通过 `font-display` class)

### 字号层级
| 用途 | Class | 示例 |
|------|-------|------|
| 页面大标题 | `text-3xl font-extrabold` | 宠物名字 |
| 区块标题 | `text-xl font-bold` | Health Summary |
| 卡片标题 | `text-lg font-bold` | Pet Profile |
| 正文 | `text-sm` | 描述内容 |
| 辅助文字 | `text-xs text-slate-400` | 标签、时间 |
| 超小文字 | `text-[10px]` | 统计数字副标题 |

### 字重
| 字重 | Class | 用途 |
|------|-------|------|
| 400 | `font-normal` | 正文 |
| 500 | `font-medium` | 强调正文 |
| 600 | `font-semibold` | 小标签 |
| 700 | `font-bold` | 标题、按钮 |
| 800 | `font-extrabold` | 大标题 |

### 字间距
- 标题: `tracking-tight`
- 标签: `tracking-wider`

## 间距规则

### 页面级
- 页面水平内边距: `px-6` (移动端) / `lg:px-40` (桌面端)
- 页面垂直内边距: `py-4` ~ `py-8`
- 区块间距: `mb-8` ~ `mb-10`

### 组件级
- 卡片内边距: `p-4` ~ `p-6`
- 元素间距: `gap-2` ~ `gap-4`
- 列表项间距: `space-y-3` ~ `space-y-4`

### 网格
- 两列网格: `grid grid-cols-2 gap-4`
- 三列网格: `grid grid-cols-1 md:grid-cols-3 gap-6`
- 最大宽度: `max-w-[960px]` (内容区)，`max-w-[480px]` (移动端模拟)

## 圆角和阴影

### 圆角
| 用途 | Class | 值 |
|------|-------|----|
| 默认 | `rounded` | 0.5rem |
| 大圆角 | `rounded-lg` | 1rem |
| 特大圆角 | `rounded-xl` | 1.5rem |
| 全圆 | `rounded-full` | 9999px |

### 阴影
| 用途 | Class |
|------|-------|
| 卡片 | `shadow-sm` |
| 按钮 | `shadow-lg shadow-primary/30` |
| 头像 | `shadow-xl` |

### 边框
- 卡片边框: `border border-primary/5`
- 分隔线: `border-b border-primary/10`
- 导航栏底边: `border-b border-primary/10`

## 图标系统

### 图标库
- Material Symbols Outlined
- CDN: `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined`

### 用法
```html
<!-- 默认图标 -->
<span class="material-symbols-outlined">pets</span>

<!-- 填充图标 -->
<span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1">star</span>
```

### 图标按钮
```html
<button class="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary/20">
  <span class="material-symbols-outlined">arrow_back</span>
</button>
```

### 常用图标映射
| 功能 | 图标名 |
|------|--------|
| 返回 | `arrow_back` |
| 设置 | `settings` |
| 编辑 | `edit` |
| 分享 | `share` |
| 宠物 | `pets` |
| 相机 | `photo_camera` |
| 收藏 | `favorite` |
| 主页 | `home` |
| 社区 | `groups` |
| 添加 | `add` |

## 组件库

### 导航栏 (Header)
```html
<header class="sticky top-0 z-10 flex items-center justify-between border-b border-primary/10 bg-background-light/80 dark:bg-background-dark/80 px-6 py-4 backdrop-blur-md lg:px-40">
  <!-- 左侧：返回按钮 + 标题 -->
  <!-- 右侧：操作按钮 -->
</header>
```

### 卡片 (Card)
```html
<div class="rounded-xl bg-white dark:bg-slate-900 p-5 shadow-sm border border-primary/5">
  <!-- 卡片内容 -->
</div>
```

### 主按钮 (Primary Button)
```html
<button class="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 text-white shadow-lg shadow-primary/30 transition-transform hover:scale-[1.02] active:scale-95">
  <span class="material-symbols-outlined">icon_name</span>
  <span class="font-bold">按钮文字</span>
</button>
```

### 标签 (Tag/Chip)
```html
<span class="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">标签文字</span>
```

### 进度条
```html
<div class="h-1.5 w-full overflow-hidden rounded-full bg-primary/5">
  <div class="h-full w-4/5 bg-primary rounded-full"></div>
</div>
```

### 列表项 (Record Item)
```html
<div class="flex items-center justify-between rounded-xl bg-white dark:bg-slate-900 p-4 shadow-sm border border-primary/5">
  <div class="flex items-center gap-4">
    <div class="flex size-12 items-center justify-center rounded-full bg-[color]-100 text-[color]-600">
      <span class="material-symbols-outlined">icon</span>
    </div>
    <div>
      <p class="font-bold">标题</p>
      <p class="text-sm text-slate-500">描述</p>
    </div>
  </div>
  <div class="text-right">
    <p class="text-sm font-bold">值</p>
    <p class="text-xs text-slate-400">副信息</p>
  </div>
</div>
```

### 头像
```html
<div class="size-32 rounded-full border-4 border-white dark:border-slate-800 bg-center bg-cover shadow-xl" style="background-image: url('...')"></div>
```

### 统计卡片
```html
<div class="flex flex-col gap-3 rounded-xl bg-white dark:bg-slate-900 p-5 shadow-sm border border-primary/5">
  <div class="flex items-center gap-3">
    <div class="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
      <span class="material-symbols-outlined">icon</span>
    </div>
    <div>
      <p class="text-sm text-slate-500">标签</p>
      <p class="text-lg font-bold">数值</p>
    </div>
  </div>
</div>
```
