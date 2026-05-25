# E2E 与性能测试

## 目录
1. [Playwright E2E 测试](#playwright-e2e-测试)
2. [E2E 测试模式](#e2e-测试模式)
3. [性能测试 (Locust)](#性能测试-locust)
4. [前端性能 (Lighthouse)](#前端性能-lighthouse)

## Playwright E2E 测试

### 安装
```bash
npm install -D @playwright/test
npx playwright install
```

### 配置
```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html'], ['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
})
```

## E2E 测试模式

### 认证流程测试
```typescript
// e2e/auth.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Registration Flow', () => {
  test('can register with valid credentials', async ({ page }) => {
    await page.goto('/register')

    await page.fill('input[type="email"]', 'newuser@test.com')
    await page.fill('input[placeholder="请输入密码"]', 'StrongPass123!')
    await page.fill('input[placeholder="确认密码"]', 'StrongPass123!')
    await page.fill('input[placeholder="昵称"]', '测试用户')

    await page.click('button[type="submit"]')

    // 注册成功后跳转到首页
    await expect(page).toHaveURL('/')
    await expect(page.locator('text=测试用户')).toBeVisible()
  })

  test('shows error for duplicate email', async ({ page }) => {
    await page.goto('/register')

    await page.fill('input[type="email"]', 'existing@test.com')
    await page.fill('input[placeholder="请输入密码"]', 'StrongPass123!')
    await page.fill('input[placeholder="确认密码"]', 'StrongPass123!')
    await page.fill('input[placeholder="昵称"]', '重复用户')

    await page.click('button[type="submit"]')

    await expect(page.locator('text=该邮箱已被注册')).toBeVisible()
  })
})

test.describe('Login Flow', () => {
  test('can login and redirect to dashboard', async ({ page }) => {
    await page.goto('/login')

    await page.fill('input[type="email"]', 'user@test.com')
    await page.fill('input[type="password"]', 'password123')
    await page.click('button[type="submit"]')

    await expect(page).toHaveURL('/')
  })

  test('shows error for wrong password', async ({ page }) => {
    await page.goto('/login')

    await page.fill('input[type="email"]', 'user@test.com')
    await page.fill('input[type="password"]', 'wrongpassword')
    await page.click('button[type="submit"]')

    await expect(page.locator('text=邮箱或密码错误')).toBeVisible()
  })

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/pets')
    await expect(page).toHaveURL(/\/login/)
  })
})
```

### 宠物 CRUD E2E 测试
```typescript
// e2e/pet-crud.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Pet Management', () => {
  test.beforeEach(async ({ page }) => {
    // 先登录
    await page.goto('/login')
    await page.fill('input[type="email"]', 'user@test.com')
    await page.fill('input[type="password"]', 'password123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/')
  })

  test('can create a new pet', async ({ page }) => {
    await page.goto('/pets')
    await page.click('text=添加宠物')

    await page.fill('input[name="name"]', '小白')
    await page.fill('input[name="breed"]', '金毛')
    await page.selectOption('select[name="gender"]', 'male')

    await page.click('button[type="submit"]')

    await expect(page.locator('text=小白')).toBeVisible()
  })

  test('can view pet detail', async ({ page }) => {
    await page.goto('/pets')
    await page.click('text=小白')

    await expect(page.locator('h1')).toContainText('小白')
    await expect(page.locator('text=金毛')).toBeVisible()
  })

  test('can delete a pet', async ({ page }) => {
    await page.goto('/pets')
    await page.click('text=小白')
    await page.click('text=删除')
    await page.click('text=确定')  // 确认弹窗

    await expect(page.locator('text=小白')).not.toBeVisible()
  })
})
```

### Page Object 模式（推荐大型项目）
```typescript
// e2e/pages/LoginPage.ts
import { Page, Locator, expect } from '@playwright/test'

export class LoginPage {
  readonly page: Page
  readonly emailInput: Locator
  readonly passwordInput: Locator
  readonly submitButton: Locator

  constructor(page: Page) {
    this.page = page
    this.emailInput = page.locator('input[type="email"]')
    this.passwordInput = page.locator('input[type="password"]')
    this.submitButton = page.locator('button[type="submit"]')
  }

  async goto() {
    await this.page.goto('/login')
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email)
    await this.passwordInput.fill(password)
    await this.submitButton.click()
  }

  async expectError(message: string) {
    await expect(this.page.locator(`text=${message}`)).toBeVisible()
  }
}

// 使用
test('login with Page Object', async ({ page }) => {
  const loginPage = new LoginPage(page)
  await loginPage.goto()
  await loginPage.login('user@test.com', 'password123')
  await expect(page).toHaveURL('/')
})
```

### 响应式测试
```typescript
test('mobile layout shows hamburger menu', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')

  // 桌面导航隐藏
  await expect(page.locator('nav.hidden.md\\:flex')).not.toBeVisible()
  // 汉堡菜单可见
  await expect(page.locator('[data-testid="mobile-menu"]')).toBeVisible()
})
```

## 性能测试 (Locust)

### 安装
```bash
pip install locust
```

### API 压测脚本
```python
# tests/performance/locustfile.py
from locust import HttpUser, task, between

class PetUser(HttpUser):
    wait_time = between(1, 3)
    host = "http://localhost:8000"

    def on_start(self):
        """登录获取 Token"""
        response = self.client.post("/api/v1/auth/login/", json={
            "email": "loadtest@test.com",
            "password": "testpass123",
        })
        self.token = response.json()["data"]["access"]
        self.headers = {"Authorization": f"Bearer {self.token}"}

    @task(3)
    def list_pets(self):
        self.client.get("/api/v1/pets/", headers=self.headers)

    @task(1)
    def create_pet(self):
        self.client.post("/api/v1/pets/", json={
            "name": "压测宠物",
            "breed": "测试犬",
            "gender": "unknown",
        }, headers=self.headers)

    @task(2)
    def view_community(self):
        self.client.get("/api/v1/posts/", headers=self.headers)
```

### 运行
```bash
# Web UI 模式
locust -f tests/performance/locustfile.py

# 命令行模式
locust -f tests/performance/locustfile.py --headless -u 100 -r 10 --run-time 60s
```

### 性能基准

| 指标 | 目标 | 告警 |
|------|------|------|
| API 平均响应时间 | < 200ms | > 500ms |
| P95 响应时间 | < 500ms | > 1000ms |
| 错误率 | < 1% | > 5% |
| 并发用户 | 100+ | — |

## 前端性能 (Lighthouse)

### Lighthouse CI 配置
```json
// lighthouserc.json
{
  "ci": {
    "collect": {
      "url": ["http://localhost:3000/", "http://localhost:3000/login"],
      "numberOfRuns": 3
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.8 }],
        "categories:accessibility": ["warn", { "minScore": 0.9 }],
        "first-contentful-paint": ["error", { "maxNumericValue": 2000 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 3000 }]
      }
    }
  }
}
```

### 运行
```bash
npm install -g @lhci/cli
lhci autorun
```
