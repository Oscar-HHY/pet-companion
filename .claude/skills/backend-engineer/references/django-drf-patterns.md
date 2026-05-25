# DRF 开发模式

## 目录
1. [ViewSet 模式](#viewset-模式)
2. [Serializer 进阶](#serializer-进阶)
3. [权限控制](#权限控制)
4. [分页配置](#分页配置)
5. [过滤与搜索](#过滤与搜索)
6. [异常处理](#异常处理)
7. [URL 路由](#url-路由)

## ViewSet 模式

### 标准 ModelViewSet
```python
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from apps.core.response import ApiResponse

class PetViewSet(viewsets.ModelViewSet):
    serializer_class = PetSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardPagination
    lookup_field = 'uuid'

    def get_queryset(self):
        """用户只能看自己的宠物"""
        return Pet.objects.filter(
            owner=self.request.user,
            is_deleted=False,
        ).select_related('owner').order_by('-created_at')

    def get_serializer_class(self):
        """不同 action 使用不同 Serializer"""
        if self.action == 'list':
            return PetListSerializer
        if self.action == 'create':
            return PetCreateSerializer
        return PetSerializer

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    def perform_destroy(self, instance):
        """软删除"""
        from django.utils import timezone
        instance.is_deleted = True
        instance.deleted_at = timezone.now()
        instance.save(update_fields=['is_deleted', 'deleted_at', 'updated_at'])

    @action(detail=True, methods=['post'], url_path='upload-photo')
    def upload_photo(self, request, uuid=None):
        """上传宠物照片"""
        pet = self.get_object()
        serializer = PetPhotoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        photo = PetService.upload_photo(pet, request.FILES['photo'])
        return ApiResponse.created(PetPhotoSerializer(photo).data)
```

### 只读 ViewSet
```python
class PetPublicViewSet(viewsets.ReadOnlyModelViewSet):
    """公开的宠物列表（社区展示）"""
    serializer_class = PetPublicSerializer
    pagination_class = StandardPagination
    permission_classes = []

    def get_queryset(self):
        return Pet.objects.filter(
            is_deleted=False, is_public=True
        ).select_related('owner').only(
            'uuid', 'name', 'breed', 'avatar', 'owner__nickname'
        )
```

### 自定义 Action
```python
@action(detail=False, methods=['get'], url_path='my-pets')
def my_pets(self, request):
    """获取当前用户的宠物"""
    pets = self.get_queryset().filter(owner=request.user)
    serializer = self.get_serializer(pets, many=True)
    return ApiResponse.success(serializer.data)

@action(detail=True, methods=['post'])
def activate(self, request, uuid=None):
    """激活宠物"""
    pet = self.get_object()
    PetService.activate(pet)
    return ApiResponse.success(message="宠物已激活")
```

## Serializer 进阶

### 嵌套序列化
```python
class PetDetailSerializer(serializers.ModelSerializer):
    owner = UserBriefSerializer(read_only=True)
    photos = PetPhotoSerializer(many=True, read_only=True, source='photos_active')
    memory_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Pet
        fields = ['uuid', 'name', 'breed', 'gender', 'bio', 'owner', 'photos', 'memory_count', 'created_at']
```

### 写入 Serializer（Create/Update 分离）
```python
class PetCreateSerializer(serializers.ModelSerializer):
    owner = serializers.HiddenField(default=serializers.CurrentUserDefault())

    class Meta:
        model = Pet
        fields = ['owner', 'name', 'breed', 'gender', 'date_of_birth', 'bio']

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("名字不能为空")
        return value

    def validate(self, attrs):
        """跨字段验证"""
        user = attrs['owner']
        if Pet.objects.filter(owner=user, is_deleted=False).count() >= 10:
            raise serializers.ValidationError("每人最多 10 只宠物")
        return attrs
```

### 动态字段
```python
class PetListSerializer(serializers.ModelSerializer):
    """列表只返回关键字段"""
    class Meta:
        model = Pet
        fields = ['uuid', 'name', 'breed', 'avatar', 'created_at']
```

### 文件上传 Serializer
```python
class PetPhotoUploadSerializer(serializers.Serializer):
    photo = serializers.ImageField(required=True)

    def validate_photo(self, value):
        # 限制文件大小 5MB
        if value.size > 5 * 1024 * 1024:
            raise serializers.ValidationError("图片不能超过 5MB")
        # 限制文件类型
        allowed = ['image/jpeg', 'image/png', 'image/webp']
        if value.content_type not in allowed:
            raise serializers.ValidationError("只支持 JPG/PNG/WebP 格式")
        return value
```

## 权限控制

### 内置权限类
```python
from rest_framework.permissions import (
    IsAuthenticated,        # 已登录
    IsAdminUser,            # 管理员
    AllowAny,               # 任何人
    IsAuthenticatedOrReadOnly,  # 登录可写，匿名只读
)
```

### 自定义权限 — 对象级别
```python
# apps/core/permissions.py
from rest_framework.permissions import BasePermission

class IsOwner(BasePermission):
    """只有对象拥有者可以操作"""
    def has_object_permission(self, request, view, obj):
        return obj.owner == request.user

class IsOwnerOrReadOnly(BasePermission):
    """拥有者可写，其他人只读"""
    def has_object_permission(self, request, view, obj):
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return True
        return obj.owner == request.user
```

### 按 Action 分权限
```python
class PetViewSet(viewsets.ModelViewSet):
    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [IsAuthenticated()]
        if self.action == 'create':
            return [IsAuthenticated()]
        # update, destroy 需要是拥有者
        return [IsAuthenticated(), IsOwner()]
```

### JWT 认证配置
```python
# settings/base.py
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
}
```

## 分页配置

```python
# apps/core/pagination.py
from rest_framework.pagination import PageNumberPagination, CursorPagination

class StandardPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100

class CursorTimePagination(CursorPagination):
    """游标分页 — 适合时间线数据"""
    page_size = 20
    ordering = '-created_at'
    cursor_query_param = 'cursor'
```

## 过滤与搜索

```python
# 安装: pip install django-filter
# settings.py
REST_FRAMEWORK = {
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
}

# views.py
class PetViewSet(viewsets.ModelViewSet):
    filterset_fields = ['gender', 'breed']
    search_fields = ['name', 'bio']
    ordering_fields = ['created_at', 'name']
    ordering = ['-created_at']
```

### 自定义 FilterSet
```python
import django_filters

class PetFilter(django_filters.FilterSet):
    name = django_filters.CharFilter(lookup_expr='icontains')
    created_after = django_filters.DateFilter(field_name='created_at', lookup_expr='gte')
    created_before = django_filters.DateFilter(field_name='created_at', lookup_expr='lte')

    class Meta:
        model = Pet
        fields = ['gender', 'breed', 'name', 'created_after', 'created_before']
```

## 异常处理

### 自定义异常处理器
```python
# apps/core/exceptions.py
from rest_framework.views import exception_handler
from rest_framework.exceptions import ValidationError, NotFound, PermissionDenied
from apps.core.response import ApiResponse

def custom_exception_handler(exc, context):
    if isinstance(exc, ValidationError):
        return ApiResponse.error(
            message="参数验证失败",
            errors=exc.detail,
            status=422,
        )

    if isinstance(exc, NotFound):
        return ApiResponse.error(message="资源不存在", status=404)

    if isinstance(exc, PermissionDenied):
        return ApiResponse.error(message="没有权限", status=403)

    # 调用默认处理器处理其他异常
    response = exception_handler(exc, context)
    if response is not None:
        return ApiResponse.error(
            message=str(exc.detail) if hasattr(exc, 'detail') else "请求失败",
            status=response.status_code,
        )

    # 未处理的异常（500）
    return ApiResponse.error(message="服务器内部错误", status=500)
```

```python
# settings.py
REST_FRAMEWORK = {
    'EXCEPTION_HANDLER': 'apps.core.exceptions.custom_exception_handler',
}
```

### 业务异常
```python
# apps/core/exceptions.py
class BusinessError(Exception):
    def __init__(self, message, code=400):
        self.message = message
        self.code = code
```

## URL 路由

### 使用 DefaultRouter
```python
# apps/pets/urls.py
from rest_framework.routers import DefaultRouter
from .views import PetViewSet

router = DefaultRouter()
router.register('pets', PetViewSet, basename='pet')

urlpatterns = router.urls

# config/urls.py
from django.urls import path, include

urlpatterns = [
    path('api/v1/', include('apps.users.urls')),
    path('api/v1/', include('apps.pets.urls')),
    path('api/v1/', include('apps.memories.urls')),
    path('api/v1/', include('apps.community.urls')),

    # JWT Token
    path('api/v1/auth/token/', TokenObtainPairView.as_view(), name='token_obtain'),
    path('api/v1/auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # API 文档
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger'),
]
```
