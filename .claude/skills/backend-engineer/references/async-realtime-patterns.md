# 异步任务与实时通信

## 目录
1. [Celery 配置](#celery-配置)
2. [异步任务模式](#异步任务模式)
3. [Django Channels WebSocket](#django-channels-websocket)
4. [任务监控](#任务监控)

## Celery 配置

### 安装
```bash
pip install celery redis django-celery-results django-celery-beat
```

### Celery 配置文件
```python
# config/celery.py
import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')

app = Celery('pet_companionship')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()
```

```python
# config/__init__.py
from .celery import app as celery_app
__all__ = ('celery_app',)
```

### Settings 配置
```python
# settings/base.py
CELERY_BROKER_URL = os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/1')
CELERY_RESULT_BACKEND = 'django-db'
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = 'Asia/Shanghai'

# 任务超时
CELERY_TASK_SOFT_TIME_LIMIT = 300   # 5 分钟软超时
CELERY_TASK_TIME_LIMIT = 600        # 10 分钟硬超时

# 定时任务
CELERY_BEAT_SCHEDULER = 'django_celery_beat.schedulers:DatabaseScheduler'
```

### 启动命令
```bash
# Worker
celery -A config worker -l info -P solo  # Windows 用 -P solo

# Beat（定时任务）
celery -A config beat -l info
```

## 异步任务模式

### 基本任务
```python
# apps/pets/tasks.py
from celery import shared_task
from django.core.mail import send_mail

@shared_task(bind=True, max_retries=3)
def generate_pet_animation(self, pet_id: int):
    """异步生成宠物 2D 动画"""
    try:
        pet = Pet.objects.get(id=pet_id)
        # 调用 AI API 生成动画
        from services.ai.animation import AnimationService
        result = AnimationService.generate(pet.avatar.url)

        PetAnimation.objects.update_or_create(
            pet=pet,
            defaults={'config': result, 'status': 'completed'},
        )
    except Exception as exc:
        # 自动重试，指数退避
        self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))
```

### 任务链
```python
from celery import chain

# 上传照片 → 生成缩略图 → 生成动画
task_chain = chain(
    process_photo.s(photo_id),
    generate_thumbnail.s(),
    generate_animation.s(),
)
task_chain.apply_async()
```

### 周期任务
```python
# apps/core/tasks.py
from celery import shared_task

@shared_task
def cleanup_soft_deleted():
    """定期清理已软删除超过 30 天的数据"""
    from django.utils import timezone
    threshold = timezone.now() - timezone.timedelta(days=30)

    Pet.objects.filter(is_deleted=True, deleted_at__lt=threshold).delete()
    Post.objects.filter(is_deleted=True, deleted_at__lt=threshold).delete()
```

### 在 ViewSet 中触发异步任务
```python
class PetViewSet(viewsets.ModelViewSet):
    def perform_create(self, serializer):
        pet = serializer.save(owner=self.request.user)
        # 异步生成动画
        generate_pet_animation.delay(pet.id)

    @action(detail=True, methods=['post'], url_path='regenerate-animation')
    def regenerate_animation(self, request, uuid=None):
        pet = self.get_object()
        task = generate_pet_animation.delay(pet.id)
        return ApiResponse.success({
            "task_id": task.id,
            "message": "动画生成已开始，请稍后查看",
        })
```

### 任务状态查询
```python
# apps/core/views.py
from celery.result import AsyncResult

class TaskStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, task_id):
        result = AsyncResult(task_id)
        return ApiResponse.success({
            "task_id": task_id,
            "status": result.status,
            "result": result.result if result.ready() else None,
        })
```

## Django Channels WebSocket

### 安装
```bash
pip install channels channels-redis
```

### ASGI 配置
```python
# config/asgi.py
import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')

django_asgi_app = get_asgi_application()

from apps.core.routing import websocket_urlpatterns

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": AuthMiddlewareStack(
        URLRouter(websocket_urlpatterns)
    ),
})
```

### Settings
```python
# settings/base.py
INSTALLED_APPS = [
    'daphne',
    'channels',
    ...
]

ASGI_APPLICATION = 'config.asgi.application'

CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            "hosts": [('127.0.0.1', 6379)],
        },
    },
}
```

### WebSocket 路由
```python
# apps/core/routing.py
from django.urls import re_path
from apps.pets import consumers

websocket_urlpatterns = [
    re_path(r'ws/pet/(?P<pet_uuid>[^/]+)/$', consumers.PetStatusConsumer.as_asgi()),
    re_path(r'ws/notifications/$', consumers.NotificationConsumer.as_asgi()),
]
```

### Consumer（WebSocket 处理器）
```python
# apps/pets/consumers.py
import json
from channels.generic.websocket import AsyncJsonWebsocketConsumer

class PetStatusConsumer(AsyncJsonWebsocketConsumer):
    """宠物实时状态推送（桌面宠物状态同步）"""

    async def connect(self):
        self.pet_uuid = self.scope['url_route']['kwargs']['pet_uuid']
        self.room_group = f'pet_{self.pet_uuid}'

        # 加入房间
        await self.channel_layer.group_add(self.room_group, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.room_group, self.channel_name)

    async def receive_json(self, content):
        """接收客户端消息"""
        action = content.get('action')

        if action == 'update_status':
            # 广播宠物状态更新给所有连接的客户端
            await self.channel_layer.group_send(
                self.room_group,
                {
                    'type': 'pet_status_update',
                    'status': content.get('status'),
                    'animation': content.get('animation'),
                }
            )

    async def pet_status_update(self, event):
        """发送给客户端"""
        await self.send_json({
            'type': 'status_update',
            'status': event['status'],
            'animation': event['animation'],
        })
```

### 通知 Consumer
```python
class NotificationConsumer(AsyncJsonWebsocketConsumer):
    """用户通知推送"""

    async def connect(self):
        user = self.scope['user']
        if user.is_anonymous:
            await self.close()
            return

        self.room_group = f'user_{user.id}'
        await self.channel_layer.group_add(self.room_group, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, 'room_group'):
            await self.channel_layer.group_discard(self.room_group, self.channel_name)

    async def notification(self, event):
        await self.send_json({
            'type': 'notification',
            'title': event['title'],
            'message': event['message'],
            'data': event.get('data'),
        })
```

### 从 Service/Task 推送 WebSocket 消息
```python
# 在任何后端代码中发送 WebSocket 消息
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

def send_notification(user_id, title, message, data=None):
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f'user_{user_id}',
        {
            'type': 'notification',
            'title': title,
            'message': message,
            'data': data,
        }
    )

# 在 Celery 任务完成后通知用户
@shared_task
def generate_pet_animation(pet_id):
    pet = Pet.objects.select_related('owner').get(id=pet_id)
    # ... 生成动画 ...
    send_notification(
        pet.owner.id,
        "动画生成完成",
        f"{pet.name} 的动画已生成",
        {"pet_uuid": str(pet.uuid)},
    )
```

## 任务监控

### Flower（Celery 监控 UI）
```bash
pip install flower
celery -A config flower --port=5555
# 访问 http://localhost:5555
```

### 日志配置
```python
# settings/base.py
LOGGING = {
    'version': 1,
    'handlers': {
        'console': {'class': 'logging.StreamHandler'},
        'file': {
            'class': 'logging.FileHandler',
            'filename': 'logs/celery.log',
        },
    },
    'loggers': {
        'celery': {
            'handlers': ['console', 'file'],
            'level': 'INFO',
        },
    },
}
```
