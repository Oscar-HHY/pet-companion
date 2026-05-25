# CI/CD 与覆盖率

## 目录
1. [GitHub Actions 测试流水线](#github-actions-测试流水线)
2. [覆盖率配置](#覆盖率配置)
3. [PR 测试检查](#pr-测试检查)
4. [测试运行命令](#测试运行命令)

## GitHub Actions 测试流水线

### 后端测试 CI
```yaml
# .github/workflows/backend-test.yml
name: Backend Tests

on:
  push:
    branches: [main, develop]
    paths: ['backend/**']
  pull_request:
    branches: [main, develop]
    paths: ['backend/**']

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: pet_companionship_test
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7
        ports: ['6379:6379']

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'
          cache: 'pip'

      - name: Install dependencies
        run: |
          cd backend
          pip install -r requirements.txt
          pip install pytest-cov

      - name: Run tests with coverage
        env:
          DATABASE_URL: postgres://postgres:postgres@localhost:5432/pet_companionship_test
          CELERY_BROKER_URL: redis://localhost:6379/1
        run: |
          cd backend
          pytest --cov=apps --cov-report=xml --cov-report=term-missing

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          file: backend/coverage.xml
          flags: backend

      - name: Check coverage threshold
        run: |
          cd backend
          pytest --cov=apps --cov-fail-under=80
```

### 前端测试 CI
```yaml
# .github/workflows/frontend-test.yml
name: Frontend Tests

on:
  push:
    branches: [main, develop]
    paths: ['frontend/**']
  pull_request:
    branches: [main, develop]
    paths: ['frontend/**']

jobs:
  unit-test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        run: |
          cd frontend
          npm ci

      - name: Run unit tests
        run: |
          cd frontend
          npx vitest run --coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          file: frontend/coverage/lcov.info
          flags: frontend

  e2e-test:
    runs-on: ubuntu-latest
    needs: unit-test

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        run: |
          cd frontend
          npm ci
          npx playwright install --with-deps chromium

      - name: Run E2E tests
        run: |
          cd frontend
          npx playwright test --project=chromium

      - name: Upload test results
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: frontend/playwright-report/
```

### 全量测试（发版前）
```yaml
# .github/workflows/release-test.yml
name: Release Tests

on:
  push:
    tags: ['v*']

jobs:
  full-test:
    runs-on: ubuntu-latest
    steps:
      # 后端测试 + 前端单元测试 + E2E + Lighthouse
      - name: Run all tests
        run: |
          # 后端
          cd backend && pytest --cov=apps --cov-fail-under=80
          # 前端单元
          cd ../frontend && npx vitest run --coverage
          # E2E
          npx playwright test
          # Lighthouse
          npx lhci autorun
```

## 覆盖率配置

### 后端覆盖率 (pytest-cov)
```ini
# backend/.coveragerc
[run]
source = apps
omit =
    */migrations/*
    */tests/*
    */admin.py
    manage.py

[report]
fail_under = 80
show_missing = true
exclude_lines =
    pragma: no cover
    def __repr__
    if settings.DEBUG
    raise NotImplementedError
```

### 前端覆盖率 (Vitest)
```typescript
// vitest.config.ts 中已配置
// coverage.thresholds.lines: 80
// coverage.thresholds.functions: 80
// coverage.thresholds.branches: 75
```

### 覆盖率报告解读

```
Name                          Stmts   Miss  Cover   Missing
------------------------------------------------------------
apps/users/services.py           45      3    93%   67-69
apps/users/views.py              38      5    87%   42, 55-58
apps/pets/services.py            62      8    87%   34-36, 78-82
apps/pets/views.py               55     12    78%   45-50, 88-94
apps/core/response.py            15      0   100%
------------------------------------------------------------
TOTAL                           215     28    87%
```

**关注点：**
- `Missing` 列标注了未覆盖的行号
- Service 层低于 90% → 需要补充测试
- View 层低于 80% → 需要补充 API 测试
- 100% 不是目标，关注关键分支和边界条件

## PR 测试检查

### 必须通过的检查
- [ ] 所有单元测试通过
- [ ] 所有集成测试通过
- [ ] 覆盖率不低于门槛（后端 80%，前端 80%）
- [ ] 新代码有对应测试
- [ ] 无 lint 错误

### PR 测试评审要点
```markdown
## QA Review Checklist

### 测试覆盖
- [ ] 新功能有单元测试
- [ ] API 变更有集成测试
- [ ] 边界条件已测试（空值、超限、权限）
- [ ] 错误路径已测试（400/401/403/404/500）

### 代码质量
- [ ] 测试命名清晰描述行为
- [ ] 无硬编码测试数据（使用 Factory）
- [ ] Mock 范围最小化
- [ ] 无 sleep/wait 等不稳定操作
```

## 测试运行命令

### 后端
```bash
# 运行全部测试
cd backend && pytest

# 运行特定模块
pytest apps/pets/tests/

# 运行特定测试
pytest apps/pets/tests/test_views.py::TestPetViewSet::test_create_pet

# 带覆盖率
pytest --cov=apps --cov-report=term-missing

# 只运行标记的测试
pytest -m "not slow"

# 并行运行（需要 pytest-xdist）
pytest -n auto
```

### 前端
```bash
# 运行单元测试
cd frontend && npx vitest run

# Watch 模式
npx vitest

# 带覆盖率
npx vitest run --coverage

# 运行特定文件
npx vitest run src/components/ui/__tests__/AppButton.test.ts

# E2E 测试
npx playwright test

# E2E 带 UI
npx playwright test --ui

# E2E 特定文件
npx playwright test e2e/auth.spec.ts

# 生成 E2E 报告
npx playwright show-report
```

### 性能测试
```bash
# Locust Web UI
locust -f tests/performance/locustfile.py

# Locust 命令行
locust -f tests/performance/locustfile.py --headless -u 50 -r 5 --run-time 30s

# Lighthouse
npx lhci autorun
```
