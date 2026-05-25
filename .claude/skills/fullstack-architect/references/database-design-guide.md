# 数据库设计规范

## 目录
1. [命名规范](#命名规范)
2. [字段规范](#字段规范)
3. [索引策略](#索引策略)
4. [关系设计](#关系设计)
5. [数据库表设计模板](#数据库表设计模板)
6. [迁移规范](#迁移规范)

## 命名规范

| 对象 | 规范 | 示例 |
|------|------|------|
| 表名 | 小写复数，snake_case | `pets`, `user_profiles` |
| 字段名 | 小写，snake_case | `created_at`, `pet_name` |
| 外键 | `{关联表单数}_id` | `user_id`, `pet_id` |
| 布尔字段 | `is_` 或 `has_` 前缀 | `is_active`, `has_avatar` |
| 时间字段 | `_at` 后缀 | `created_at`, `deleted_at` |
| 索引 | `idx_{表名}_{字段名}` | `idx_pets_user_id` |
| 唯一约束 | `uniq_{表名}_{字段名}` | `uniq_users_email` |

## 字段规范

### 必备字段（每张表都应包含）

```
id          — 主键 (BigAutoField 或 UUIDField)
created_at  — 创建时间 (auto_now_add=True)
updated_at  — 更新时间 (auto_now=True)
```

### 软删除（推荐）

```
is_deleted  — 是否已删除 (BooleanField, default=False)
deleted_at  — 删除时间 (DateTimeField, null=True)
```

使用软删除而非硬删除，防止数据丢失。查询时默认过滤 `is_deleted=False`。

### 主键选择

| 方案 | 适用场景 | 优缺点 |
|------|----------|--------|
| BigAutoField | 内部系统、不暴露 ID | 简单高效，但可被猜测 |
| UUIDField | 暴露给前端的资源 | 安全不可猜测，但索引稍慢 |

**推荐**: 内部关联用自增 ID，对外暴露用 UUID。

### 字段类型选择

| 数据 | Django Field | 说明 |
|------|-------------|------|
| 短文本 (<256字符) | CharField(max_length=N) | |
| 长文本 | TextField | |
| 整数 | IntegerField / BigIntegerField | |
| 小数/金额 | DecimalField(max_digits, decimal_places) | 不用 FloatField |
| 布尔 | BooleanField | |
| 日期时间 | DateTimeField | 存 UTC |
| JSON 数据 | JSONField | PostgreSQL 原生支持 |
| 文件路径 | FileField / ImageField | 文件存文件系统，路径存数据库 |
| 枚举 | CharField + choices | |

## 索引策略

### 必须建索引
- 外键字段（Django 自动建）
- 经常用于 WHERE 条件的字段
- 经常用于 ORDER BY 的字段
- 唯一约束字段

### 复合索引
- 经常一起查询的字段组合
- 顺序：高选择性字段在前

### 不要过度索引
- 写多读少的表，索引会拖慢写入
- 低基数字段（如 `gender`）单独索引收益小

## 关系设计

### 一对多 (ForeignKey)
```python
class Pet(models.Model):
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='pets')
```

### 多对多 (ManyToManyField)
```python
class Pet(models.Model):
    tags = models.ManyToManyField(Tag, related_name='pets', blank=True)
```

### 一对一 (OneToOneField)
```python
class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
```

### on_delete 策略
| 选项 | 含义 | 使用场景 |
|------|------|----------|
| CASCADE | 级联删除 | 父记录删除时，子记录也删除 |
| PROTECT | 阻止删除 | 有关联记录时不允许删除父记录 |
| SET_NULL | 置空 | 父记录删除时，外键设为 NULL |
| SET_DEFAULT | 设默认值 | 父记录删除时，外键设为默认值 |

## 数据库表设计模板

```markdown
### [表名] (`table_name`)

**描述:** [这张表存什么数据]

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BigAutoField | PK | 主键 |
| ... | ... | ... | ... |
| created_at | DateTimeField | NOT NULL | 创建时间 |
| updated_at | DateTimeField | NOT NULL | 更新时间 |

**索引:**
- `idx_table_field` on (field) — [索引用途说明]

**关系:**
- `field_id` → `other_table.id` (FK, CASCADE)

**约束:**
- UNIQUE (field1, field2) — [约束说明]
```

## 迁移规范

### 迁移操作清单
1. 修改 Model 后运行 `python manage.py makemigrations`
2. 检查生成的迁移文件是否符合预期
3. 在开发环境运行 `python manage.py migrate`
4. 测试回滚: `python manage.py migrate app_name 0001`

### 危险操作
以下操作需特别注意：
- **删除表/字段**: 先确认没有代码引用
- **重命名字段**: 使用 `RenameField` 而非删除再创建
- **修改字段类型**: 可能导致数据丢失
- **添加 NOT NULL 字段**: 必须提供 default 值

### 数据迁移
当需要迁移数据时，使用 `RunPython`：
```python
from django.db import migrations

def migrate_data(apps, schema_editor):
    Model = apps.get_model('app_name', 'ModelName')
    # 数据迁移逻辑

class Migration(migrations.Migration):
    operations = [
        migrations.RunPython(migrate_data, reverse_code=migrations.RunPython.noop),
    ]
```
