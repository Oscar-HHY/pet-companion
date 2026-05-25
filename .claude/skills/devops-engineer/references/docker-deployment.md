# Docker 与部署配置

## 目录
1. [后端 Dockerfile](#后端-dockerfile)
2. [前端 Dockerfile](#前端-dockerfile)
3. [docker-compose 开发环境](#docker-compose-开发环境)
4. [docker-compose 生产环境](#docker-compose-生产环境)
5. [Nginx 配置](#nginx-配置)
6. [Gunicorn 配置](#gunicorn-配置)

## 后端 Dockerfile

```dockerfile
# docker/backend/Dockerfile
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# 系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc curl \
    && rm -rf /var/lib/apt/lists/*

# Python 依赖（利用缓存层）
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# --- 开发阶段 ---
FROM base AS development
COPY backend/ .
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]

# --- 生产阶段 ---
FROM base AS production
COPY backend/ .
RUN python manage.py collectstatic --noinput

# 非 root 用户
RUN adduser --disabled-password --no-create-home appuser
USER appuser

EXPOSE 8000
CMD ["gunicorn", "config.wsgi:application", "-c", "gunicorn.conf.py"]
```

### 构建命令
```bash
# 开发
docker build -f docker/backend/Dockerfile --target development -t pet-backend:dev .

# 生产
docker build -f docker/backend/Dockerfile --target production -t pet-backend:prod .
```

## 前端 Dockerfile

```dockerfile
# docker/frontend/Dockerfile

# --- 构建阶段 ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# --- 生产阶段（Nginx 托管静态文件）---
FROM nginx:alpine AS production
COPY --from=builder /app/dist /usr/share/nginx/html
COPY docker/nginx/conf.d/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### 构建命令
```bash
docker build -f docker/frontend/Dockerfile -t pet-frontend:prod .
```

## docker-compose 开发环境

```yaml
# docker-compose.yml
version: '3.8'

services:
  db:
    image: postgres:16
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: pet_companionship
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: .
      dockerfile: docker/backend/Dockerfile
      target: development
    volumes:
      - ./backend:/app
    ports:
      - "8000:8000"
    env_file:
      - .env.development
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    command: python manage.py runserver 0.0.0.0:8000

  celery:
    build:
      context: .
      dockerfile: docker/backend/Dockerfile
      target: development
    volumes:
      - ./backend:/app
    env_file:
      - .env.development
    depends_on:
      - redis
      - db
    command: celery -A config worker -l info

  frontend:
    image: node:20-alpine
    working_dir: /app
    volumes:
      - ./frontend:/app
      - frontend_node_modules:/app/node_modules
    ports:
      - "3000:3000"
    command: npm run dev -- --host 0.0.0.0
    depends_on:
      - backend

volumes:
  postgres_data:
  frontend_node_modules:
```

## docker-compose 生产环境

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  db:
    image: postgres:16
    volumes:
      - postgres_data:/var/lib/postgresql/data
    env_file:
      - .env
    environment:
      POSTGRES_DB: ${DB_NAME}
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: always

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: always

  backend:
    build:
      context: .
      dockerfile: docker/backend/Dockerfile
      target: production
    env_file:
      - .env
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: always
    expose:
      - "8000"

  celery:
    build:
      context: .
      dockerfile: docker/backend/Dockerfile
      target: production
    env_file:
      - .env
    depends_on:
      - redis
      - db
    command: celery -A config worker -l warning --concurrency=4
    restart: always

  celery-beat:
    build:
      context: .
      dockerfile: docker/backend/Dockerfile
      target: production
    env_file:
      - .env
    depends_on:
      - redis
      - db
    command: celery -A config beat -l warning
    restart: always

  nginx:
    build:
      context: .
      dockerfile: docker/frontend/Dockerfile
      target: production
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./docker/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./docker/nginx/conf.d:/etc/nginx/conf.d:ro
      - certbot_certs:/etc/letsencrypt:ro
      - certbot_www:/var/www/certbot:ro
      - static_files:/usr/share/nginx/static:ro
    depends_on:
      - backend
    restart: always

  certbot:
    image: certbot/certbot
    volumes:
      - certbot_certs:/etc/letsencrypt
      - certbot_www:/var/www/certbot
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h & wait $${!}; done;'"

volumes:
  postgres_data:
  redis_data:
  certbot_certs:
  certbot_www:
  static_files:
```

## Nginx 配置

### 主配置
```nginx
# docker/nginx/nginx.conf
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;
    sendfile on;
    tcp_nopush on;
    keepalive_timeout 65;

    # Gzip 压缩
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css application/json application/javascript
               text/xml application/xml application/xml+rss text/javascript
               image/svg+xml;

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # 限流
    limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;
    limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;

    include /etc/nginx/conf.d/*.conf;
}
```

### 站点配置
```nginx
# docker/nginx/conf.d/default.conf

# HTTP → HTTPS 重定向
server {
    listen 80;
    server_name petcompanionship.com www.petcompanionship.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS 主站点
server {
    listen 443 ssl http2;
    server_name petcompanionship.com www.petcompanionship.com;

    # SSL 证书
    ssl_certificate /etc/letsencrypt/live/petcompanionship.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/petcompanionship.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # 前端静态文件（Vue SPA）
    location / {
        root /usr/share/nginx/html;
        index index.html;
        try_files $uri $uri/ /index.html;

        # 静态资源长缓存
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Django API 反向代理
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 文件上传限制
        client_max_body_size 10M;
    }

    # Django Admin
    location /admin/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Django 静态文件
    location /static/ {
        alias /usr/share/nginx/static/;
        expires 30d;
    }

    # Django 媒体文件
    location /media/ {
        alias /usr/share/nginx/media/;
        expires 7d;
    }

    # WebSocket
    location /ws/ {
        proxy_pass http://backend:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }

    # 登录限流
    location /api/v1/auth/login/ {
        limit_req zone=login burst=3 nodelay;
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 健康检查
    location /health {
        access_log off;
        proxy_pass http://backend:8000/api/v1/health/;
    }
}
```

## Gunicorn 配置

```python
# backend/gunicorn.conf.py
import multiprocessing

# 绑定
bind = "0.0.0.0:8000"

# Worker
workers = multiprocessing.cpu_count() * 2 + 1
worker_class = "uvicorn.workers.UvicornWorker"  # 支持 ASGI (WebSocket)
worker_connections = 1000
timeout = 30
keepalive = 2

# 日志
accesslog = "-"
errorlog = "-"
loglevel = "warning"

# 进程管理
graceful_timeout = 30
max_requests = 1000
max_requests_jitter = 50
preload_app = True
```

### 开发环境快速启动
```bash
# 1. 复制环境变量
cp .env.example .env.development

# 2. 启动所有服务
docker-compose up -d

# 3. 运行数据库迁移
docker-compose exec backend python manage.py migrate

# 4. 创建超级用户
docker-compose exec backend python manage.py createsuperuser

# 5. 查看日志
docker-compose logs -f backend
```
