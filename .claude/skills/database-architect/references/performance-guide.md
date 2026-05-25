# 数据库性能优化指南

## 目录
1. [索引策略](#索引策略)
2. [查询优化](#查询优化)
3. [分页方案](#分页方案)
4. [缓存策略](#缓存策略)
5. [PostgreSQL 特有优化](#postgresql-特有优化)

## 索引策略

### 必须建索引的场景
- 外键字段（Django 自动建）
- WHERE 条件高频字段
- ORDER BY 字段
- UNIQUE 约束字段
- JOIN 条件字段

### Django 索引定义
```python
class Meta:
    indexes = [
        # 单字段索引
        models.Index(fields=['owner'], name='idx_pet_owner'),

        # 复合索引（顺序重要：高选择性在前）
        models.Index(fields=['owner', '-created_at'], name='idx_pet_owner_created'),

        # 条件索引（PostgreSQL 部分索引）
        models.Index(
            fields=['owner'],
            condition=models.Q(is_deleted=False),
            name='idx_pet_owner_active',
        ),
    ]
    constraints = [
        # 唯一约束
        models.UniqueConstraint(
            fields=['owner', 'name'],
            condition=models.Q(is_deleted=False),
            name='uniq_pet_owner_name_active',
        ),
    ]
```

### 索引选择决策

| 查询模式 | 推荐索引 |
|----------|----------|
| `WHERE field = value` | B-tree 索引（默认） |
| `WHERE field LIKE 'abc%'` | B-tree 索引 |
| `WHERE field LIKE '%abc%'` | GIN + pg_trgm 扩展 |
| `WHERE field @> '{"key": "value"}'` | GIN 索引（JSONB） |
| `ORDER BY field` | B-tree 索引 |
| `WHERE field IN (...)` | B-tree 索引 |
| 全文搜索 | GIN 索引 + tsvector |

### 不要过度索引
- 写多读少的表（如日志），索引会拖慢写入
- 低基数字段（如 `gender` 只有 3 个值），单独索引收益小
- 已有复合索引覆盖的字段，不需要单独索引

## 查询优化

### 常见反模式

```python
# ❌ 循环中查询数据库
for pet in pets:
    records = MedicalRecord.objects.filter(pet=pet)

# ✅ 批量查询
pet_ids = [pet.id for pet in pets]
records = MedicalRecord.objects.filter(pet_id__in=pet_ids)

# ❌ 查全部字段
Pet.objects.all()

# ✅ 只查需要的字段
Pet.objects.values('id', 'name', 'breed')

# ❌ 使用 count() 后再取数据
count = Pet.objects.count()
pets = Pet.objects.all()[:10]

# ✅ 用一次查询完成
pets = Pet.objects.all()[:10]
count = Pet.objects.count()  # 或用 paginator

# ❌ 在 Python 中过滤
all_pets = list(Pet.objects.all())
active_pets = [p for p in all_pets if not p.is_deleted]

# ✅ 在数据库中过滤
active_pets = Pet.objects.filter(is_deleted=False)
```

### 批量操作
```python
# 批量创建
Pet.objects.bulk_create([Pet(name='A', owner=user), Pet(name='B', owner=user)])

# 批量更新
Pet.objects.filter(owner=user).update(is_active=True)

# 批量删除
Pet.objects.filter(is_deleted=True, deleted_at__lt=threshold).delete()
```

### F 表达式（避免竞态条件）
```python
from django.db.models import F

# ❌ 读-改-写，有并发问题
profile = UserProfile.objects.get(user=user)
profile.pet_count += 1
profile.save()

# ✅ 数据库层面的原子操作
UserProfile.objects.filter(user=user).update(pet_count=F('pet_count') + 1)
```

## 分页方案

### 方案对比

| 方案 | 适用场景 | 优点 | 缺点 |
|------|----------|------|------|
| OFFSET/LIMIT | 小数据量 (<10万) | 简单，支持跳页 | 大 offset 性能差 |
| 游标分页 | 大数据量、无限滚动 | 性能恒定 | 不能跳页 |
| Keyset 分页 | 时间线、有序数据 | 性能好 | 需要唯一排序键 |

### OFFSET/LIMIT（Django Paginator）
```python
from django.core.paginator import Paginator

paginator = Paginator(Pet.objects.all(), 20)  # 每页 20 条
page = paginator.page(1)
```

### 游标分页（推荐大数据量）
```python
# 基于最后一条记录的 ID 分页
last_id = request.query_params.get('cursor')
queryset = Pet.objects.filter(is_deleted=False).order_by('-id')
if last_id:
    queryset = queryset.filter(id__lt=last_id)
pets = queryset[:20]
```

### DRF 分页配置
```python
# settings.py
REST_FRAMEWORK = {
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
}

# 自定义分页
class StandardPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100
```

## 缓存策略

### 缓存层级
1. **查询缓存**: Django QuerySet 缓存（同一 QuerySet 不重复查询）
2. **应用缓存**: Redis/Memcached 缓存热点数据
3. **数据库缓存**: PostgreSQL shared_buffers

### 适合缓存的数据
- 变化不频繁的配置数据
- 计算成本高的聚合结果
- 热点查询结果（如首页数据）

### 不适合缓存的数据
- 实时性要求高的数据
- 用户个性化数据（缓存命中率低）
- 频繁变化的数据

## PostgreSQL 特有优化

### JSONB 索引
```python
# 对 JSONB 字段建 GIN 索引
class Meta:
    indexes = [
        models.Index(
            fields=['config'],
            name='idx_animation_config',
            opclasses=['jsonb_path_ops'],
        ),
    ]
```

### 数组字段
```python
from django.contrib.postgres.fields import ArrayField

class Pet(BaseModel):
    personality_tags = ArrayField(
        models.CharField(max_length=50),
        default=list,
        blank=True,
    )

# 查询包含某个标签的宠物
Pet.objects.filter(personality_tags__contains=['friendly'])
```

### 全文搜索
```python
from django.contrib.postgres.search import SearchVector, SearchQuery

# 全文搜索
Pet.objects.annotate(
    search=SearchVector('name', 'bio')
).filter(search=SearchQuery('golden'))
```

### EXPLAIN ANALYZE
```python
# 分析查询计划
print(Pet.objects.filter(owner=user).query)
# 在 psql 中运行 EXPLAIN ANALYZE
```
