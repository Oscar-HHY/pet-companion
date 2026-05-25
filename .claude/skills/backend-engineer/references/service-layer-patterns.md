# Service 层与中间件

## 目录
1. [Service 层设计](#service-层设计)
2. [Middleware 中间件](#middleware-中间件)
3. [信号与钩子](#信号与钩子)
4. [文件上传](#文件上传)
5. [通用 Mixin](#通用-mixin)

## Service 层设计

### 为什么需要 Service 层
- **ViewSet** 只负责 HTTP 请求/响应
- **Serializer** 只负责数据验证和序列化
- **Service** 负责业务逻辑（跨 Model 操作、外部调用、复杂校验）

### Service 基本模式
```python
# apps/users/services.py
from django.db import transaction
from django.contrib.auth import get_user_model
from apps.core.exceptions import BusinessError

User = get_user_model()

class UserService:
    @staticmethod
    def register(email: str, password: str, nickname: str) -> User:
        """用户注册"""
        if User.objects.filter(email=email).exists():
            raise BusinessError("该邮箱已被注册")

        user = User.objects.create_user(
            email=email,
            password=password,
            nickname=nickname,
        )
        # 创建关联的 Profile
        UserProfile.objects.create(user=user)
        return user

    @staticmethod
    @transaction.atomic
    def delete_account(user: User):
        """注销账号（软删除用户及其所有数据）"""
        from django.utils import timezone
        now = timezone.now()

        # 软删除宠物
        user.pets.update(is_deleted=True, deleted_at=now)
        # 软删除用户
        user.is_active = False
        user.deleted_at = now
        user.save(update_fields=['is_active', 'deleted_at'])
```

### 事务管理
```python
from django.db import transaction

class PetService:
    @staticmethod
    @transaction.atomic
    def create_pet_with_animation(user, pet_data, animation_config):
        """创建宠物同时创建动画配置（原子操作）"""
        pet = Pet.objects.create(owner=user, **pet_data)
        PetAnimation.objects.create(pet=pet, config=animation_config)
        # 更新用户宠物计数
        UserProfile.objects.filter(user=user).update(
            pet_count=models.F('pet_count') + 1
        )
        return pet

    @staticmethod
    @transaction.atomic
    def transfer_pet(pet, from_user, to_user):
        """转让宠物"""
        if pet.owner != from_user:
            raise BusinessError("只能转让自己的宠物")
        pet.owner = to_user
        pet.save(update_fields=['owner', 'updated_at'])
        # 更新双方计数
        UserProfile.objects.filter(user=from_user).update(pet_count=models.F('pet_count') - 1)
        UserProfile.objects.filter(user=to_user).update(pet_count=models.F('pet_count') + 1)
```

### Service 调用 Service
```python
class CommunityService:
    @staticmethod
    def create_post(user, content, images=None):
        """发布动态"""
        post = Post.objects.create(author=user, content=content)

        if images:
            for img in images:
                StorageService.upload(img, path=f'posts/{post.uuid}/')

        # 异步通知粉丝
        from apps.community.tasks import notify_followers
        notify_followers.delay(post.id)

        return post
```

## Middleware 中间件

### 请求日志中间件
```python
# apps/core/middleware.py
import time
import logging

logger = logging.getLogger('api')

class RequestLoggingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        start = time.time()

        response = self.get_response(request)

        duration = time.time() - start
        logger.info(
            f"{request.method} {request.path} "
            f"status={response.status_code} "
            f"duration={duration:.3f}s "
            f"user={getattr(request.user, 'id', 'anonymous')}"
        )

        return response
```

### API 限流中间件
```python
# 使用 DRF 内置限流
# settings.py
REST_FRAMEWORK = {
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '30/minute',
        'user': '100/minute',
    },
}

# 对特定 ViewSet 自定义限流
class LoginView(APIView):
    throttle_classes = [AnonRateThrottle]
    throttle_scope = 'login'  # 在 THROTTLE_RATES 中定义 'login': '5/minute'
```

### CORS 中间件
```python
# pip install django-cors-headers
# settings.py
INSTALLED_APPS = [
    'corsheaders',
    ...
]
MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    ...
]
CORS_ALLOWED_ORIGINS = [
    'http://localhost:3000',  # Vue dev server
]
CORS_ALLOW_CREDENTIALS = True
```

### Middleware 注册顺序
```python
# settings.py — 顺序很重要
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'apps.core.middleware.RequestLoggingMiddleware',  # 自定义
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]
```

## 信号与钩子

### 使用场景
- 创建用户后自动创建 Profile
- 宠物被删除后清理相关缓存
- 发布动态后通知关注者

### 示例
```python
# apps/users/signals.py
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.conf import settings

@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.create(user=instance)
```

```python
# apps/users/apps.py
class UsersConfig(AppConfig):
    name = 'apps.users'

    def ready(self):
        import apps.users.signals  # noqa
```

### 注意
- 优先在 Service 层显式调用，而非依赖信号
- 信号适合解耦的跨模块副作用
- 不要在信号中做耗时操作，用 Celery 代替

## 文件上传

### 基础文件上传
```python
# apps/core/storage.py
import uuid
from django.conf import settings

def pet_photo_path(instance, filename):
    """生成宠物照片存储路径"""
    ext = filename.split('.')[-1]
    new_filename = f"{uuid.uuid4().hex}.{ext}"
    return f"pets/{instance.pet.uuid}/photos/{new_filename}"

# Model 中使用
class PetPhoto(BaseModel):
    pet = models.ForeignKey(Pet, on_delete=models.CASCADE, related_name='photos')
    image = models.ImageField(upload_to=pet_photo_path)
    thumbnail = models.ImageField(upload_to='pets/thumbnails/', blank=True)
```

### 文件验证
```python
# apps/core/validators.py
from django.core.exceptions import ValidationError

def validate_image_size(value):
    limit = 5 * 1024 * 1024  # 5 MB
    if value.size > limit:
        raise ValidationError(f'文件大小不能超过 {limit // (1024*1024)} MB')

def validate_image_type(value):
    allowed_types = ['image/jpeg', 'image/png', 'image/webp']
    if value.content_type not in allowed_types:
        raise ValidationError(f'只支持 {", ".join(allowed_types)} 格式')
```

### 缩略图生成（Service 层）
```python
# apps/pets/services.py
from PIL import Image
from io import BytesIO
from django.core.files.uploadedfile import InMemoryUploadedFile

class PetPhotoService:
    @staticmethod
    def create_thumbnail(image_field, size=(200, 200)):
        img = Image.open(image_field)
        img.thumbnail(size)

        buffer = BytesIO()
        img.save(buffer, format='JPEG', quality=80)
        buffer.seek(0)

        return InMemoryUploadedFile(
            buffer, 'ImageField', f'thumb_{image_field.name}',
            'image/jpeg', buffer.getbuffer().nbytes, None,
        )
```

## 通用 Mixin

### 软删除 Mixin
```python
# apps/core/mixins.py
from django.utils import timezone
from rest_framework import status

class SoftDeleteMixin:
    """ViewSet 软删除 Mixin"""
    def perform_destroy(self, instance):
        instance.is_deleted = True
        instance.deleted_at = timezone.now()
        instance.save(update_fields=['is_deleted', 'deleted_at', 'updated_at'])
```

### 批量操作 Mixin
```python
class BulkDeleteMixin:
    @action(detail=False, methods=['post'], url_path='bulk-delete')
    def bulk_delete(self, request):
        uuids = request.data.get('uuids', [])
        if not uuids or len(uuids) > 50:
            return ApiResponse.error("请选择 1-50 条记录")
        count = self.get_queryset().filter(uuid__in=uuids).update(
            is_deleted=True, deleted_at=timezone.now()
        )
        return ApiResponse.success({"deleted": count})
```

### 导出 Mixin
```python
class ExportMixin:
    @action(detail=False, methods=['get'])
    def export(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        # 返回 CSV 或 JSON
        return ApiResponse.success(serializer.data)
```
