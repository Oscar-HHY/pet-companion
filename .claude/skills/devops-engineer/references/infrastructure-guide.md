# 基础设施指南

## 目录
1. [云服务器选择](#云服务器选择)
2. [服务器初始化](#服务器初始化)
3. [域名与 SSL](#域名与-ssl)
4. [CDN 配置](#cdn-配置)
5. [对象存储](#对象存储)

## 云服务器选择

### 推荐方案对比

| 方案 | 适合场景 | 月费 | 说明 |
|------|----------|------|------|
| **阿里云 ECS** | 国内访问 | ¥50-200 | 2核4G 起步，需备案 |
| **AWS EC2** | 海外访问 | $10-50 | t3.small 起步，免备案 |
| **Vercel + Railway** | 快速上线 | 免费-$20 | 前端 Vercel + 后端 Railway |
| **DigitalOcean** | 性价比 | $12-24 | 2GB Droplet 起步 |

### 最低配置要求
```
CPU:    2 核
内存:   4 GB（PostgreSQL + Django + Redis + Nginx）
磁盘:   40 GB SSD
带宽:   5 Mbps+
系统:   Ubuntu 22.04 LTS
```

### Vercel + Railway 方案（推荐入门）
```
前端: Vercel（免费额度充足）
  - 自动部署 Vue SPA
  - 全球 CDN
  - 自定义域名 + 免费 SSL

后端: Railway（$5/月起）
  - 部署 Django + Celery
  - PostgreSQL + Redis 插件
  - 自定义域名
```

## 服务器初始化

### Ubuntu 22.04 初始化脚本
```bash
#!/bin/bash
# scripts/server-init.sh
set -euo pipefail

# 1. 系统更新
apt update && apt upgrade -y

# 2. 安装 Docker
curl -fsSL https://get.docker.com | sh
usermod -aG docker $USER

# 3. 安装 Docker Compose
apt install -y docker-compose-plugin

# 4. 安装基础工具
apt install -y curl git htop ufw fail2ban

# 5. 防火墙
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# 6. SSH 安全加固
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart sshd

# 7. 创建部署用户
adduser --disabled-password deploy
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh

# 8. 创建项目目录
mkdir -p /opt/pet-companionship
chown deploy:deploy /opt/pet-companionship

echo "✓ 服务器初始化完成"
```

### 项目部署目录结构
```
/opt/pet-companionship/
├── docker-compose.prod.yml
├── .env                    # 生产环境变量（手动创建）
├── docker/
│   ├── backend/
│   ├── frontend/
│   └── nginx/
├── scripts/
├── backups/               # 数据库备份
└── deploy-history.log     # 部署历史记录
```

## 域名与 SSL

### 域名配置
```
DNS 记录:
A    petcompanionship.com        → [服务器IP]
A    www.petcompanionship.com    → [服务器IP]
A    staging.petcompanionship.com → [测试服务器IP]
A    api.petcompanionship.com    → [服务器IP]（可选，前后端分离时用）
```

### Let's Encrypt SSL 证书

#### 首次申请
```bash
# 先确保 Nginx 容器正在运行且 80 端口可访问
docker run --rm \
  -v certbot_certs:/etc/letsencrypt \
  -v certbot_www:/var/www/certbot \
  certbot/certbot certonly \
  --webroot -w /var/www/certbot \
  -d petcompanionship.com \
  -d www.petcompanionship.com \
  --email your@email.com \
  --agree-tos \
  --no-eff-email
```

#### 自动续期
```bash
# docker-compose.prod.yml 中的 certbot 服务已配置自动续期
# 也可以添加 crontab
0 0 1 * * docker-compose -f /opt/pet-companionship/docker-compose.prod.yml run --rm certbot renew && docker-compose -f /opt/pet-companionship/docker-compose.prod.yml exec nginx nginx -s reload
```

### Vercel 方案（无需手动配置 SSL）
```bash
# Vercel 自动提供 SSL
# 只需在 Vercel Dashboard 添加自定义域名
vercel domains add petcompanionship.com
```

## CDN 配置

### CloudFront（AWS）
```json
{
  "Origins": [{
    "DomainName": "petcompanionship.com",
    "OriginPath": "",
    "CustomOriginConfig": {
      "HTTPPort": 80,
      "HTTPSPort": 443,
      "OriginProtocolPolicy": "https-only"
    }
  }],
  "DefaultCacheBehavior": {
    "ViewerProtocolPolicy": "redirect-to-https",
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
    "Compress": true
  },
  "CacheBehaviors": [
    {
      "PathPattern": "/api/*",
      "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
      "ViewerProtocolPolicy": "https-only"
    },
    {
      "PathPattern": "/assets/*",
      "DefaultTTL": 86400,
      "MaxTTL": 31536000
    }
  ]
}
```

### 阿里云 CDN
```
加速域名: cdn.petcompanionship.com
源站:     petcompanionship.com
回源协议: HTTPS
缓存规则:
  - /assets/*  → 缓存 365 天
  - /api/*     → 不缓存
  - *.html     → 缓存 10 分钟
```

### Vercel CDN（自带）
Vercel 部署自动包含全球 CDN，无需额外配置。

## 对象存储

### AWS S3 配置
```python
# Django settings
# pip install django-storages boto3

# config/settings/production.py
DEFAULT_FILE_STORAGE = 'storages.backends.s3boto3.S3Boto3Storage'
AWS_ACCESS_KEY_ID = env('AWS_ACCESS_KEY_ID')
AWS_SECRET_ACCESS_KEY = env('AWS_SECRET_ACCESS_KEY')
AWS_STORAGE_BUCKET_NAME = env('AWS_STORAGE_BUCKET_NAME')
AWS_S3_REGION_NAME = 'ap-northeast-1'
AWS_S3_CUSTOM_DOMAIN = f'{AWS_STORAGE_BUCKET_NAME}.s3.amazonaws.com'
AWS_DEFAULT_ACL = 'private'
AWS_S3_FILE_OVERWRITE = False
AWS_QUERYSTRING_AUTH = True
AWS_QUERYSTRING_EXPIRE = 3600  # 签名 URL 1小时过期
```

### 阿里云 OSS 配置
```python
# pip install django-storages[aliyun-oss]
DEFAULT_FILE_STORAGE = 'storages.backends.alicloud.AliyunMediaStorage'
ALIYUN_OSS_ACCESS_KEY_ID = env('ALIYUN_OSS_ACCESS_KEY_ID')
ALIYUN_OSS_ACCESS_KEY_SECRET = env('ALIYUN_OSS_ACCESS_KEY_SECRET')
ALIYUN_OSS_BUCKET_NAME = env('ALIYUN_OSS_BUCKET_NAME')
ALIYUN_OSS_ENDPOINT = 'oss-cn-shanghai.aliyuncs.com'
```

### MinIO（自托管，开发/测试用）
```yaml
# 加入 docker-compose.yml
minio:
  image: minio/minio
  command: server /data --console-address ":9001"
  ports:
    - "9000:9000"
    - "9001:9001"
  environment:
    MINIO_ROOT_USER: minioadmin
    MINIO_ROOT_PASSWORD: minioadmin
  volumes:
    - minio_data:/data
```

```python
# 本地开发使用 MinIO
AWS_ACCESS_KEY_ID = 'minioadmin'
AWS_SECRET_ACCESS_KEY = 'minioadmin'
AWS_STORAGE_BUCKET_NAME = 'pet-uploads'
AWS_S3_ENDPOINT_URL = 'http://minio:9000'
AWS_S3_USE_SSL = False
```

### S3 Bucket 策略（生产）
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowAppAccess",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::ACCOUNT_ID:role/pet-app-role"
      },
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::pet-uploads/*"
    }
  ]
}
```
