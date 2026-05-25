# 数据安全与备份指南

## 目录
1. [数据安全](#数据安全)
2. [备份策略](#备份策略)
3. [数据库监控](#数据库监控)
4. [迁移安全](#迁移安全)

## 数据安全

### 敏感数据分类

| 级别 | 数据类型 | 处理方式 |
|------|----------|----------|
| 高敏感 | 密码、Token、API Key | 哈希存储（永不明文） |
| 中敏感 | 邮箱、手机号、真实姓名 | 加密存储或脱敏展示 |
| 低敏感 | 宠物名字、偏好 | 正常存储 |

### 密码处理
- Django 默认使用 PBKDF2 哈希，足够安全
- 不要自行实现密码哈希
- `settings.py` 中的 `SECRET_KEY` 必须保密

### 数据脱敏
```python
# 展示邮箱时脱敏
def mask_email(email):
    name, domain = email.split('@')
    return f"{name[:2]}***@{domain}"

# 展示手机号时脱敏
def mask_phone(phone):
    return f"{phone[:3]}****{phone[-4:]}"
```

### 访问控制
```python
# Django DRF 权限控制
from rest_framework.permissions import IsAuthenticated

class PetViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # 用户只能看自己的宠物
        return Pet.objects.filter(owner=self.request.user, is_deleted=False)
```

### SQL 注入防护
- 始终使用 Django ORM 或参数化查询
- 避免字符串拼接 SQL
```python
# ❌ 危险
Pet.objects.raw(f"SELECT * FROM pets WHERE name = '{name}'")

# ✅ 安全
Pet.objects.raw("SELECT * FROM pets WHERE name = %s", [name])

# ✅ 最佳：使用 ORM
Pet.objects.filter(name=name)
```

### 环境变量管理
```python
# .env 文件（不提交到 git）
DATABASE_URL=postgresql://user:pass@localhost:5432/pet_companionship
SECRET_KEY=your-secret-key

# settings.py
import os
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('DB_NAME', 'pet_companionship'),
        'USER': os.environ.get('DB_USER', 'postgres'),
        'PASSWORD': os.environ.get('DB_PASSWORD', ''),
        'HOST': os.environ.get('DB_HOST', 'localhost'),
        'PORT': os.environ.get('DB_PORT', '5432'),
    }
}
```

## 备份策略

### 本地开发备份

```bash
# 手动备份
pg_dump -U postgres pet_companionship > backup_$(date +%Y%m%d).sql

# 恢复
psql -U postgres pet_companionship < backup_20260318.sql
```

### 自动备份脚本
```bash
#!/bin/bash
# backup.sh
BACKUP_DIR="D:/develop/Pet_Companionship/backups"
DB_NAME="pet_companionship"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

pg_dump -U postgres -Fc $DB_NAME > "$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.dump"

# 保留最近 7 天的备份
find "$BACKUP_DIR" -name "*.dump" -mtime +7 -delete
```

### 备份频率建议

| 阶段 | 频率 | 方式 |
|------|------|------|
| 开发期 | 每次重大改动前 | 手动 pg_dump |
| 测试期 | 每天 | 自动脚本 |
| 生产环境 | 每小时增量 + 每天全量 | pg_basebackup + WAL 归档 |

### Docker 环境备份
```bash
# docker-compose 中的 PostgreSQL 备份
docker exec <container> pg_dump -U postgres pet_companionship > backup.sql
```

## 数据库监控

### 慢查询检测

```sql
-- 在 postgresql.conf 中开启慢查询日志
log_min_duration_statement = 500  -- 记录超过 500ms 的查询
```

### Django 中的查询监控
```python
# settings.py (开发环境)
LOGGING = {
    'loggers': {
        'django.db.backends': {
            'level': 'DEBUG',
            'handlers': ['console'],
        },
    },
}
```

### 关键监控指标

| 指标 | 正常范围 | 告警 |
|------|----------|------|
| 活跃连接数 | < max_connections 的 80% | > 80% |
| 平均查询时间 | < 100ms | > 500ms |
| 缓存命中率 | > 95% | < 90% |
| 死锁次数 | 0 | > 0 |
| 表膨胀率 | < 20% | > 50% |

### 连接池
```python
# 推荐使用 django-db-connection-pool 或 pgbouncer
# settings.py
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'CONN_MAX_AGE': 600,  # 连接保活 10 分钟
        # ...
    }
}
```

## 迁移安全

### 迁移前检查清单
- [ ] 备份当前数据库
- [ ] 检查迁移文件内容是否符合预期
- [ ] 在测试环境先跑一遍
- [ ] 评估是否需要停机

### 零停机迁移原则
1. **添加字段**: 用 `null=True` 或 `default` 值，不会锁表
2. **删除字段**: 先在代码中停止使用，再删除字段
3. **重命名字段**: 分三步——添加新字段、迁移数据、删除旧字段
4. **修改字段类型**: 慎重，可能需要锁表
5. **添加索引**: PostgreSQL 支持 `CREATE INDEX CONCURRENTLY`

### Django 迁移命令
```bash
# 生成迁移文件
python manage.py makemigrations

# 查看迁移 SQL（不执行）
python manage.py sqlmigrate app_name 0001

# 执行迁移
python manage.py migrate

# 回滚到指定迁移
python manage.py migrate app_name 0001

# 查看迁移状态
python manage.py showmigrations
```

### 数据迁移（RunPython）
```python
from django.db import migrations

def forward_migration(apps, schema_editor):
    Pet = apps.get_model('pets', 'Pet')
    for pet in Pet.objects.filter(gender='').iterator():
        pet.gender = 'unknown'
        pet.save(update_fields=['gender'])

def reverse_migration(apps, schema_editor):
    pass  # 可选：反向迁移逻辑

class Migration(migrations.Migration):
    dependencies = [('pets', '0001_initial')]
    operations = [
        migrations.RunPython(forward_migration, reverse_migration),
    ]
```
