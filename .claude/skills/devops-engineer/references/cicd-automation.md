# CI/CD 自动化

## 目录
1. [部署到测试环境](#部署到测试环境)
2. [部署到生产环境](#部署到生产环境)
3. [回滚机制](#回滚机制)
4. [部署脚本](#部署脚本)
5. [数据库备份脚本](#数据库备份脚本)

## 部署到测试环境

```yaml
# .github/workflows/deploy-staging.yml
name: Deploy to Staging

on:
  push:
    branches: [develop]

env:
  REGISTRY: ghcr.io
  IMAGE_PREFIX: ${{ github.repository }}

jobs:
  test:
    uses: ./.github/workflows/backend-test.yml
    secrets: inherit

  build-and-deploy:
    needs: test
    runs-on: ubuntu-latest
    environment: staging

    steps:
      - uses: actions/checkout@v4

      - name: Login to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push backend
        uses: docker/build-push-action@v5
        with:
          context: .
          file: docker/backend/Dockerfile
          target: production
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_PREFIX }}/backend:staging
            ${{ env.REGISTRY }}/${{ env.IMAGE_PREFIX }}/backend:${{ github.sha }}

      - name: Build and push frontend
        uses: docker/build-push-action@v5
        with:
          context: .
          file: docker/frontend/Dockerfile
          target: production
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_PREFIX }}/frontend:staging
            ${{ env.REGISTRY }}/${{ env.IMAGE_PREFIX }}/frontend:${{ github.sha }}

      - name: Deploy to staging server
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.STAGING_HOST }}
          username: ${{ secrets.STAGING_USER }}
          key: ${{ secrets.STAGING_SSH_KEY }}
          script: |
            cd /opt/pet-companionship
            echo "${{ secrets.GITHUB_TOKEN }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin
            docker-compose -f docker-compose.prod.yml pull
            docker-compose -f docker-compose.prod.yml up -d
            docker-compose -f docker-compose.prod.yml exec -T backend python manage.py migrate --noinput
            docker system prune -f

      - name: Health check
        run: |
          sleep 15
          curl -f https://staging.petcompanionship.com/health || exit 1

      - name: Notify on failure
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {"text": "⚠️ Staging 部署失败: ${{ github.sha }}"}
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

## 部署到生产环境

```yaml
# .github/workflows/deploy-production.yml
name: Deploy to Production

on:
  push:
    tags: ['v*']

env:
  REGISTRY: ghcr.io
  IMAGE_PREFIX: ${{ github.repository }}

jobs:
  test:
    uses: ./.github/workflows/backend-test.yml
    secrets: inherit

  build-and-deploy:
    needs: test
    runs-on: ubuntu-latest
    environment: production

    steps:
      - uses: actions/checkout@v4

      - name: Get version from tag
        id: version
        run: echo "VERSION=${GITHUB_REF#refs/tags/}" >> $GITHUB_OUTPUT

      - name: Login to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push backend
        uses: docker/build-push-action@v5
        with:
          context: .
          file: docker/backend/Dockerfile
          target: production
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_PREFIX }}/backend:latest
            ${{ env.REGISTRY }}/${{ env.IMAGE_PREFIX }}/backend:${{ steps.version.outputs.VERSION }}

      - name: Build and push frontend
        uses: docker/build-push-action@v5
        with:
          context: .
          file: docker/frontend/Dockerfile
          target: production
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_PREFIX }}/frontend:latest
            ${{ env.REGISTRY }}/${{ env.IMAGE_PREFIX }}/frontend:${{ steps.version.outputs.VERSION }}

      - name: Backup database before deploy
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PROD_HOST }}
          username: ${{ secrets.PROD_USER }}
          key: ${{ secrets.PROD_SSH_KEY }}
          script: |
            cd /opt/pet-companionship
            bash scripts/backup-db.sh

      - name: Deploy to production
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PROD_HOST }}
          username: ${{ secrets.PROD_USER }}
          key: ${{ secrets.PROD_SSH_KEY }}
          script: |
            cd /opt/pet-companionship
            # 记录当前版本（用于回滚）
            docker-compose -f docker-compose.prod.yml ps --format json > /tmp/pre-deploy-state.json
            # 拉取新镜像
            echo "${{ secrets.GITHUB_TOKEN }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin
            docker-compose -f docker-compose.prod.yml pull
            # 滚动更新
            docker-compose -f docker-compose.prod.yml up -d --no-deps backend celery
            sleep 10
            docker-compose -f docker-compose.prod.yml up -d --no-deps nginx
            # 数据库迁移
            docker-compose -f docker-compose.prod.yml exec -T backend python manage.py migrate --noinput
            # 清理旧镜像
            docker system prune -f

      - name: Health check
        run: |
          for i in 1 2 3 4 5; do
            if curl -sf https://petcompanionship.com/health; then
              echo "Health check passed"
              exit 0
            fi
            echo "Attempt $i failed, retrying in 10s..."
            sleep 10
          done
          echo "Health check failed after 5 attempts"
          exit 1

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          generate_release_notes: true

      - name: Rollback on failure
        if: failure()
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PROD_HOST }}
          username: ${{ secrets.PROD_USER }}
          key: ${{ secrets.PROD_SSH_KEY }}
          script: |
            cd /opt/pet-companionship
            bash scripts/rollback.sh
```

## 回滚机制

### 回滚策略
```
当前版本: v1.2.0 (出问题)
      ↓ rollback
上一版本: v1.1.0 (回滚目标)

步骤:
1. 停止当前容器
2. 切换到上一版本镜像
3. 启动容器
4. 健康检查
5. 如果上一版本也有问题 → 人工介入
```

### 版本管理
```bash
# 每次部署前保存当前版本信息
echo "$(date +%Y%m%d_%H%M%S) $(git describe --tags)" >> /opt/pet-companionship/deploy-history.log

# 查看部署历史
cat /opt/pet-companionship/deploy-history.log
```

## 部署脚本

```bash
#!/bin/bash
# scripts/deploy.sh
set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
DEPLOY_LOG="/opt/pet-companionship/deploy-history.log"
HEALTH_URL="https://petcompanionship.com/health"

echo "===== 开始部署 $(date) ====="

# 1. 记录当前版本
CURRENT_VERSION=$(docker inspect --format='{{.Config.Image}}' $(docker-compose -f $COMPOSE_FILE ps -q backend) 2>/dev/null || echo "none")
echo "$(date +%Y%m%d_%H%M%S) BEFORE: $CURRENT_VERSION" >> $DEPLOY_LOG

# 2. 备份数据库
echo ">>> 备份数据库..."
bash scripts/backup-db.sh

# 3. 拉取新镜像
echo ">>> 拉取新镜像..."
docker-compose -f $COMPOSE_FILE pull

# 4. 滚动更新后端
echo ">>> 更新后端服务..."
docker-compose -f $COMPOSE_FILE up -d --no-deps backend celery celery-beat
sleep 10

# 5. 更新前端/Nginx
echo ">>> 更新前端..."
docker-compose -f $COMPOSE_FILE up -d --no-deps nginx

# 6. 数据库迁移
echo ">>> 运行迁移..."
docker-compose -f $COMPOSE_FILE exec -T backend python manage.py migrate --noinput

# 7. 健康检查
echo ">>> 健康检查..."
for i in $(seq 1 5); do
  if curl -sf "$HEALTH_URL" > /dev/null; then
    echo "✓ 部署成功!"
    NEW_VERSION=$(docker inspect --format='{{.Config.Image}}' $(docker-compose -f $COMPOSE_FILE ps -q backend))
    echo "$(date +%Y%m%d_%H%M%S) AFTER: $NEW_VERSION" >> $DEPLOY_LOG
    exit 0
  fi
  echo "  健康检查失败，重试 $i/5..."
  sleep 10
done

echo "✗ 部署失败，执行回滚..."
bash scripts/rollback.sh
exit 1
```

```bash
#!/bin/bash
# scripts/rollback.sh
set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
DEPLOY_LOG="/opt/pet-companionship/deploy-history.log"
HEALTH_URL="https://petcompanionship.com/health"

echo "===== 开始回滚 $(date) ====="

# 获取上一个版本的镜像 tag
PREV_TAG=$(tail -2 $DEPLOY_LOG | head -1 | awk '{print $NF}')

if [ -z "$PREV_TAG" ] || [ "$PREV_TAG" = "none" ]; then
  echo "✗ 无法找到上一个版本，需要人工介入"
  exit 1
fi

echo ">>> 回滚到: $PREV_TAG"

# 停止当前服务
docker-compose -f $COMPOSE_FILE stop backend celery celery-beat nginx

# 使用上一版本镜像启动
docker-compose -f $COMPOSE_FILE up -d

# 健康检查
sleep 15
if curl -sf "$HEALTH_URL" > /dev/null; then
  echo "✓ 回滚成功!"
  echo "$(date +%Y%m%d_%H%M%S) ROLLBACK: $PREV_TAG" >> $DEPLOY_LOG
else
  echo "✗ 回滚后健康检查仍失败，需要人工介入"
  exit 1
fi
```

## 数据库备份脚本

```bash
#!/bin/bash
# scripts/backup-db.sh
set -euo pipefail

BACKUP_DIR="/opt/pet-companionship/backups"
COMPOSE_FILE="docker-compose.prod.yml"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

echo ">>> 备份数据库..."

# pg_dump 通过 docker
docker-compose -f $COMPOSE_FILE exec -T db \
  pg_dump -U postgres -Fc pet_companionship \
  > "$BACKUP_DIR/db_${TIMESTAMP}.dump"

# 压缩
gzip "$BACKUP_DIR/db_${TIMESTAMP}.dump"

echo "✓ 备份完成: db_${TIMESTAMP}.dump.gz"

# 上传到对象存储（可选）
# aws s3 cp "$BACKUP_DIR/db_${TIMESTAMP}.dump.gz" s3://pet-backups/db/

# 清理旧备份
find "$BACKUP_DIR" -name "db_*.dump.gz" -mtime +$RETENTION_DAYS -delete
echo "✓ 已清理 ${RETENTION_DAYS} 天前的备份"

# 列出现有备份
echo ">>> 现有备份:"
ls -lh "$BACKUP_DIR"/db_*.dump.gz 2>/dev/null || echo "  (无)"
```

### 恢复数据库
```bash
# 从备份恢复
gunzip -k backups/db_20260318_120000.dump.gz
docker-compose -f docker-compose.prod.yml exec -T db \
  pg_restore -U postgres -d pet_companionship --clean --if-exists \
  < backups/db_20260318_120000.dump
```
