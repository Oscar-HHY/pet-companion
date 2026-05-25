# Django ORM 最佳实践

## 目录
1. [Model 定义规范](#model-定义规范)
2. [QuerySet 优化](#queryset-优化)
3. [N+1 问题防治](#n1-问题防治)
4. [自定义 Manager](#自定义-manager)
5. [信号与钩子](#信号与钩子)
6. [常见模式](#常见模式)

## Model 定义规范

### 标准 Model 结构
```python
import uuid
from django.db import models
from django.conf import settings


class BaseModel(models.Model):
    """所有 Model 的基类"""
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
        ordering = ['-created_at']


class Pet(BaseModel):
    # 对外 ID
    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True, db_index=True)

    # 关系
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='pets',
    )

    # 字段
    name = models.CharField(max_length=100)
    breed = models.CharField(max_length=100, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(
        max_length=10,
        choices=[('male', 'Male'), ('female', 'Female'), ('unknown', 'Unknown')],
        default='unknown',
    )
    bio = models.TextField(blank=True)

    # 软删除
    is_deleted = models.BooleanField(default=False, db_index=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'pets'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['owner', '-created_at'], name='idx_pet_owner_created'),
        ]

    def __str__(self):
        return f"{self.name} ({self.breed})"
```

### Meta 选项规范
```python
class Meta:
    db_table = 'table_name'          # 显式指定表名
    ordering = ['-created_at']        # 默认排序
    indexes = [...]                   # 索引定义
    constraints = [...]               # 约束定义
    verbose_name = '宠物'
    verbose_name_plural = '宠物'
```

### 字段顺序
1. UUID / 对外 ID
2. 外键关系
3. 核心业务字段
4. 状态/标记字段
5. 软删除字段
6. （inherited: created_at, updated_at）

## QuerySet 优化

### select_related — 外键预加载
```python
# ❌ 每次访问 pet.owner 都会触发一次查询
pets = Pet.objects.all()
for pet in pets:
    print(pet.owner.username)  # N 次额外查询

# ✅ 一次 JOIN 查询
pets = Pet.objects.select_related('owner').all()
for pet in pets:
    print(pet.owner.username)  # 无额外查询
```

### prefetch_related — 反向关系/多对多预加载
```python
# ❌ 每个用户的宠物列表都触发查询
users = User.objects.all()
for user in users:
    print(user.pets.all())  # N 次额外查询

# ✅ 两次查询：一次 User，一次 Pet
users = User.objects.prefetch_related('pets').all()
```

### only / defer — 只取需要的字段
```python
# 只取 name 和 breed
pets = Pet.objects.only('name', 'breed')

# 排除大字段
pets = Pet.objects.defer('bio')
```

### values / values_list — 返回字典/元组
```python
# 返回字典列表（不创建 Model 实例，更快）
names = Pet.objects.values('name', 'breed')

# 返回扁平列表
names = Pet.objects.values_list('name', flat=True)
```

### 聚合与注解
```python
from django.db.models import Count, Avg, Q

# 每个用户的宠物数量
users = User.objects.annotate(pet_count=Count('pets'))

# 条件计数
users = User.objects.annotate(
    active_pet_count=Count('pets', filter=Q(pets__is_deleted=False))
)
```

## N+1 问题防治

### 检测方法
```python
# 开发环境安装 django-debug-toolbar 或 django-querycount
# 查看每个请求的 SQL 查询数量
```

### 常见 N+1 场景
| 场景 | 解决方案 |
|------|----------|
| 遍历列表访问外键 | `select_related()` |
| 遍历列表访问反向关系 | `prefetch_related()` |
| 序列化嵌套对象 | 在 ViewSet 中加 `select_related` |
| 模板中访问关联对象 | 在 View 中预加载 |

### Prefetch 对象（高级）
```python
from django.db.models import Prefetch

# 只预加载未删除的医疗记录，并按日期排序
pets = Pet.objects.prefetch_related(
    Prefetch(
        'medical_records',
        queryset=MedicalRecord.objects.filter(is_deleted=False).order_by('-date'),
    )
)
```

## 自定义 Manager

```python
class ActiveManager(models.Manager):
    """只返回未删除的记录"""
    def get_queryset(self):
        return super().get_queryset().filter(is_deleted=False)


class Pet(BaseModel):
    # ...
    objects = models.Manager()      # 默认 Manager（包含所有记录）
    active = ActiveManager()        # 只返回活跃记录

# 使用
Pet.objects.all()   # 所有记录
Pet.active.all()    # 只有未删除的
```

## 信号与钩子

### 使用场景
- 自动更新计数缓存
- 创建关联记录
- 清理缓存

### 示例
```python
from django.db.models.signals import post_save, pre_delete
from django.dispatch import receiver

@receiver(post_save, sender=Pet)
def update_pet_count(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.filter(user=instance.owner).update(
            pet_count=models.F('pet_count') + 1
        )
```

### 注意事项
- 信号在事务中执行，失败会导致事务回滚
- 大量信号会让代码流程难以追踪
- 优先考虑在 View/Serializer 中显式处理

## 常见模式

### 枚举字段
```python
class Pet(BaseModel):
    class Gender(models.TextChoices):
        MALE = 'male', 'Male'
        FEMALE = 'female', 'Female'
        UNKNOWN = 'unknown', 'Unknown'

    gender = models.CharField(
        max_length=10, choices=Gender.choices, default=Gender.UNKNOWN
    )
```

### 多态（使用 JSONField）
```python
class PetAnimation(BaseModel):
    pet = models.OneToOneField(Pet, on_delete=models.CASCADE, related_name='animation')
    animation_type = models.CharField(max_length=20)  # 'sprite', 'skeleton'
    config = models.JSONField(default=dict)  # 不同类型的配置存 JSON
```

### 树形结构（评论回复）
```python
class Comment(BaseModel):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey(User, on_delete=models.CASCADE)
    parent = models.ForeignKey(
        'self', null=True, blank=True, on_delete=models.CASCADE, related_name='replies'
    )
    content = models.TextField()
```

### 时间线排序
```python
class Memory(BaseModel):
    pet = models.ForeignKey(Pet, on_delete=models.CASCADE, related_name='memories')
    title = models.CharField(max_length=200)
    event_date = models.DateField()

    class Meta:
        ordering = ['-event_date']
        indexes = [
            models.Index(fields=['pet', '-event_date'], name='idx_memory_pet_date'),
        ]
```
