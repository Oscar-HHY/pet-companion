# 数据建模指南

## 目录
1. [命名规范](#命名规范)
2. [字段类型选择](#字段类型选择)
3. [关系设计](#关系设计)
4. [范式与反范式](#范式与反范式)
5. [通用字段](#通用字段)
6. [ER 图描述规范](#er-图描述规范)

## 命名规范

| 对象 | 规范 | 示例 |
|------|------|------|
| 表名（Django Model） | PascalCase 单数 | `Pet`, `UserProfile` |
| 表名（数据库） | snake_case 复数（Django 自动） | `pets_pet`, `users_userprofile` |
| 字段名 | snake_case | `created_at`, `pet_name` |
| 外键字段 | `{关联模型小写}_id`（Django 自动） | `owner_id`, `pet_id` |
| 布尔字段 | `is_` 或 `has_` 前缀 | `is_active`, `has_avatar` |
| 时间字段 | `_at` 后缀 | `created_at`, `deleted_at` |
| 关系反向名 | `related_name` 用复数 | `pets`, `memories` |

## 字段类型选择

### Django Field → PostgreSQL 映射

| 数据类型 | Django Field | PostgreSQL | 使用场景 |
|----------|-------------|------------|----------|
| 短文本 | `CharField(max_length=N)` | `varchar(N)` | 名字、标题 |
| 长文本 | `TextField` | `text` | 描述、文章 |
| 整数 | `IntegerField` | `integer` | 计数、年龄 |
| 大整数 | `BigIntegerField` | `bigint` | 主键（BigAutoField） |
| 小数 | `DecimalField(max_digits, decimal_places)` | `numeric` | 金额、体重 |
| 布尔 | `BooleanField` | `boolean` | 开关、状态 |
| 日期时间 | `DateTimeField` | `timestamp with tz` | 创建时间 |
| 日期 | `DateField` | `date` | 出生日期 |
| JSON | `JSONField` | `jsonb` | 灵活结构数据 |
| UUID | `UUIDField` | `uuid` | 对外暴露的 ID |
| 文件 | `FileField` | `varchar(100)` | 文件路径 |
| 图片 | `ImageField` | `varchar(100)` | 图片路径 |
| 邮箱 | `EmailField` | `varchar(254)` | 邮箱地址 |
| URL | `URLField` | `varchar(200)` | 链接 |
| 枚举 | `CharField + choices` | `varchar(N)` | 状态、类型 |

### 不要使用
- ❌ `FloatField` 存储金额 → 用 `DecimalField`
- ❌ `CharField` 存储大段文本 → 用 `TextField`
- ❌ `NullBooleanField`（已废弃）→ 用 `BooleanField(null=True)`

## 关系设计

### 一对一 (OneToOneField)
```python
class UserProfile(models.Model):
    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name='profile'
    )
```
**使用场景：** 扩展用户信息、拆分大表

### 一对多 (ForeignKey)
```python
class Pet(models.Model):
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='pets'
    )
```
**使用场景：** 用户拥有多个宠物、宠物有多条医疗记录

### 多对多 (ManyToManyField)
```python
# 简单多对多
class Pet(models.Model):
    tags = models.ManyToManyField(Tag, related_name='pets', blank=True)

# 带额外字段的多对多（through 模型）
class Pet(models.Model):
    friends = models.ManyToManyField(
        'self', through='PetFriendship', symmetrical=False
    )

class PetFriendship(models.Model):
    from_pet = models.ForeignKey(Pet, on_delete=models.CASCADE, related_name='friendships_from')
    to_pet = models.ForeignKey(Pet, on_delete=models.CASCADE, related_name='friendships_to')
    created_at = models.DateTimeField(auto_now_add=True)
```

### on_delete 策略选择

| 策略 | 含义 | 使用场景 |
|------|------|----------|
| `CASCADE` | 级联删除 | 删除用户时删除其宠物 |
| `PROTECT` | 阻止删除 | 有宠物时不允许删除用户 |
| `SET_NULL` | 置空（需 `null=True`） | 删除分类时，宠物分类字段置空 |
| `SET_DEFAULT` | 设默认值 | 删除标签时，设为默认标签 |

### 选择建议
- 核心关系（用户-宠物）：`CASCADE`
- 弱引用（标签、分类）：`SET_NULL` 或 `PROTECT`
- 审计数据：`PROTECT`（防止误删丢失记录）

## 范式与反范式

### 遵循第三范式 (3NF)
- 每个字段只存储原子值
- 非主键字段完全依赖主键
- 消除传递依赖

### 适当反范式化的场景
- **计数缓存**: 在父表上存子表计数（如 `pet_count`），避免频繁 COUNT 查询
- **冗余字段**: 高频查询的跨表字段可冗余存储（需保证一致性）
- **JSON 字段**: 结构不固定的数据用 `JSONField`（如宠物自定义属性）

### 反范式化原则
1. 只在性能确实需要时才做
2. 记录哪些数据是冗余的
3. 维护冗余数据的一致性（signal 或手动同步）

## 通用字段

### 每张表必须包含
```python
class BaseModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
```

### 软删除（推荐）
```python
class SoftDeleteModel(BaseModel):
    is_deleted = models.BooleanField(default=False, db_index=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        abstract = True
```

### 对外暴露 ID
```python
import uuid

class PublicIDModel(BaseModel):
    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)

    class Meta:
        abstract = True
```

## ER 图描述规范

用文字描述 ER 关系时的格式：

```
[User] 1 ──── N [Pet]          用户拥有多个宠物
[Pet]  1 ──── N [MedicalRecord] 宠物有多条医疗记录
[Pet]  1 ──── 1 [PetAnimation]  宠物对应一个动画配置
[Pet]  N ──── M [Tag]           宠物可有多个标签
[User] 1 ──── N [Post]          用户发布多条动态
[Post] 1 ──── N [Comment]       动态有多条评论
[User] N ──── M [Post] (likes)  用户可点赞多条动态
```
