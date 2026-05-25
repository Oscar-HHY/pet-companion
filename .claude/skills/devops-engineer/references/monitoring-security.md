# 监控与安全

## 目录
1. [Sentry 错误追踪](#sentry-错误追踪)
2. [日志管理](#日志管理)
3. [健康检查](#健康检查)
4. [Prometheus + Grafana](#prometheus--grafana)
5. [安全加固](#安全加固)
6. [多环境管理](#多环境管理)

## Sentry 错误追踪

### 后端集成
```python
# pip install sentry-sdk[django]

# config/settings/production.py
import sentry_sdk
from sentry_sdk.integrations.django import DjangoIntegration
from sentry_sdk.integrations.celery import CeleryIntegration
from sentry_sdk.integrations.redis import RedisIntegration

sentry_sdk.init(
    dsn=env('SENTRY_DSN'),
    integrations=[
        DjangoIntegration(),
        CeleryIntegration(),
        RedisIntegration(),
    ],
    traces_sample_rate=0.1,  # 10% 性能追踪
    send_default_pii=False,  # 不发送用户隐私数据
    environment=env('DJANGO_ENV', default='production'),
    release=env('GIT_SHA', default='unknown'),
)
```

### 前端集成
```typescript
// npm install @sentry/vue

// src/main.ts
import * as Sentry from '@sentry/vue'

Sentry.init({
  app,
  dsn: import.meta.env.VITE_SENTRY_DSN,
  integrations: [
    Sentry.browserTracingIntegration({ router }),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.05,
  replaysOnErrorSampleRate: 1.0,
  environment: import.meta.env.MODE,
})
```

### Sentry 告警规则
```
规则 1: 5 分钟内同一错误出现 10+ 次 → 发送通知
规则 2: 出现 P0 级别错误（500 Internal Server Error）→ 立即通知
规则 3: 新错误首次出现 → 发送通知
```

## 日志管理

### Django 日志配置
```python
# config/settings/base.py
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{asctime} {levelname} {name} {message}',
            'style': '{',
        },
        'json': {
            'class': 'pythonjsonlogger.jsonlogger.JsonFormatter',
            'format': '%(asctime)s %(levelname)s %(name)s %(message)s',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
        'file': {
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': '/var/log/pet-app/django.log',
            'maxBytes': 10 * 1024 * 1024,  # 10MB
            'backupCount': 5,
            'formatter': 'json',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': 'WARNING',
        },
        'apps': {
            'handlers': ['console', 'file'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}
```

### Docker 日志
```yaml
# docker-compose.prod.yml 中为每个服务配置日志
services:
  backend:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### 日志查看命令
```bash
# 查看所有服务日志
docker-compose logs -f --tail=100

# 查看特定服务
docker-compose logs -f backend

# 搜索错误
docker-compose logs backend 2>&1 | grep -i error

# 导出日志
docker-compose logs --no-color backend > backend.log
```

## 健康检查

### Django 健康检查端点
```python
# apps/core/views.py
from django.http import JsonResponse
from django.db import connection
from django.core.cache import cache

def health_check(request):
    status = {'status': 'ok', 'checks': {}}

    # 数据库检查
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        status['checks']['database'] = 'ok'
    except Exception as e:
        status['checks']['database'] = str(e)
        status['status'] = 'error'

    # Redis 检查
    try:
        cache.set('health_check', 'ok', 10)
        assert cache.get('health_check') == 'ok'
        status['checks']['redis'] = 'ok'
    except Exception as e:
        status['checks']['redis'] = str(e)
        status['status'] = 'error'

    code = 200 if status['status'] == 'ok' else 503
    return JsonResponse(status, status=code)
```

```python
# config/urls.py
from apps.core.views import health_check
urlpatterns = [
    path('api/v1/health/', health_check),
    # ...
]
```

### Docker 健康检查
```yaml
# docker-compose.prod.yml
services:
  backend:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/v1/health/"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

## Prometheus + Grafana

### Prometheus 配置
```yaml
# docker/prometheus/prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'django'
    metrics_path: '/metrics'
    static_configs:
      - targets: ['backend:8000']

  - job_name: 'nginx'
    static_configs:
      - targets: ['nginx-exporter:9113']

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']

  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']
```

### 监控服务（加入 docker-compose.prod.yml）
```yaml
  prometheus:
    image: prom/prometheus
    volumes:
      - ./docker/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    ports:
      - "9090:9090"
    restart: always

  grafana:
    image: grafana/grafana
    volumes:
      - grafana_data:/var/lib/grafana
    ports:
      - "3001:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD}
    restart: always
```

### Django Prometheus 集成
```python
# pip install django-prometheus

# config/settings/production.py
INSTALLED_APPS += ['django_prometheus']
MIDDLEWARE = [
    'django_prometheus.middleware.PrometheusBeforeMiddleware',
    # ... 其他中间件 ...
    'django_prometheus.middleware.PrometheusAfterMiddleware',
]

# 数据库使用 Prometheus 包装
DATABASES = {
    'default': {
        'ENGINE': 'django_prometheus.db.backends.postgresql',
        # ...
    }
}
```

### 关键告警规则
```yaml
# docker/prometheus/alerts.yml
groups:
  - name: pet-app
    rules:
      - alert: HighErrorRate
        expr: rate(django_http_responses_total_by_status_total{status=~"5.."}[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High 5xx error rate"

      - alert: HighResponseTime
        expr: histogram_quantile(0.95, rate(django_http_requests_latency_seconds_bucket[5m])) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "P95 latency exceeds 1s"

      - alert: DatabaseDown
        expr: pg_up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "PostgreSQL is down"
```

## 安全加固

### Django 生产安全设置
```python
# config/settings/production.py
DEBUG = False
ALLOWED_HOSTS = env.list('DJANGO_ALLOWED_HOSTS')
SECRET_KEY = env('DJANGO_SECRET_KEY')

# HTTPS
SECURE_SSL_REDIRECT = True
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# CORS
CORS_ALLOWED_ORIGINS = [
    'https://petcompanionship.com',
    'https://www.petcompanionship.com',
]

# 限流
REST_FRAMEWORK = {
    'DEFAULT_THROTTLE_RATES': {
        'anon': '30/minute',
        'user': '100/minute',
        'login': '5/minute',
    }
}
```

### Docker 安全
```dockerfile
# 非 root 用户运行
RUN adduser --disabled-password --no-create-home appuser
USER appuser

# 只读文件系统（docker-compose）
services:
  backend:
    read_only: true
    tmpfs:
      - /tmp
```

### 密钥管理
```
开发环境: .env.development（本地文件，不提交）
测试环境: GitHub Secrets → CI/CD 注入
生产环境: GitHub Secrets → CI/CD 注入

必须保护的密钥:
- DJANGO_SECRET_KEY
- DB_PASSWORD
- REDIS_PASSWORD
- AWS_SECRET_ACCESS_KEY
- AI_API_KEY
- SENTRY_DSN
```

### 安全检查清单
```markdown
- [ ] DEBUG = False
- [ ] SECRET_KEY 使用强随机值（50+ 字符）
- [ ] 数据库密码强度足够
- [ ] SSL/HTTPS 已启用
- [ ] CORS 限制到允许的域名
- [ ] API 限流已配置
- [ ] 文件上传大小限制（10MB）
- [ ] SQL 注入防护（ORM 参数化查询）
- [ ] XSS 防护（模板自动转义）
- [ ] CSRF 防护已启用
- [ ] 敏感信息不在日志中输出
- [ ] Docker 容器使用非 root 用户
- [ ] SSH 禁用密码登录
- [ ] 防火墙只开放必要端口
```

## 多环境管理

### 环境变量文件
```bash
# .env.development（本地开发）
DJANGO_DEBUG=true
DJANGO_SECRET_KEY=dev-secret-key-not-for-production
DB_NAME=pet_companionship
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=localhost
DB_PORT=5432
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/1

# .env.staging（测试环境 - 通过 CI/CD Secrets 注入）
DJANGO_DEBUG=false
DJANGO_ALLOWED_HOSTS=staging.petcompanionship.com
# ... 其他生产级配置

# .env（生产环境 - 通过 CI/CD Secrets 注入）
DJANGO_DEBUG=false
DJANGO_ALLOWED_HOSTS=petcompanionship.com,www.petcompanionship.com
# ... 生产配置
```

### Django Settings 分环境
```
config/settings/
├── __init__.py
├── base.py          # 通用配置
├── development.py   # 开发环境（DEBUG=True，SQLite 可选）
├── staging.py       # 测试环境
└── production.py    # 生产环境
```

```python
# config/settings/development.py
from .base import *

DEBUG = True
ALLOWED_HOSTS = ['*']

# 开发工具
INSTALLED_APPS += ['debug_toolbar']
MIDDLEWARE += ['debug_toolbar.middleware.DebugToolbarMiddleware']
INTERNAL_IPS = ['127.0.0.1']
```

```python
# config/settings/production.py
from .base import *
import sentry_sdk

DEBUG = False
ALLOWED_HOSTS = env.list('DJANGO_ALLOWED_HOSTS')

# 安全设置（见上方安全加固部分）
# Sentry（见上方 Sentry 部分）
# 对象存储（见 infrastructure-guide.md）
```

### 环境切换
```bash
# 开发
DJANGO_SETTINGS_MODULE=config.settings.development python manage.py runserver

# 生产（Docker 中通过环境变量设置）
DJANGO_SETTINGS_MODULE=config.settings.production
```
