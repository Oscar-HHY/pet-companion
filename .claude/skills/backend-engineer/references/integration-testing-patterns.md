# 第三方集成与测试规范

## 目录
1. [OAuth 社交登录](#oauth-社交登录)
2. [AI API 集成](#ai-api-集成)
3. [邮件服务](#邮件服务)
4. [测试规范](#测试规范)
5. [API 文档](#api-文档)

## OAuth 社交登录

### 架构设计
```
前端 → OAuth Provider (Google/Apple) → 获取 authorization code
前端 → 后端 /api/v1/auth/oauth/{provider}/ → 验证 code → 创建/关联用户 → 返回 JWT
```

### OAuth Service
```python
# services/oauth/base.py
from abc import ABC, abstractmethod

class OAuthProvider(ABC):
    @abstractmethod
    def get_user_info(self, code: str) -> dict:
        """用 authorization code 换取用户信息"""
        pass

# services/oauth/google.py
import requests
from django.conf import settings

class GoogleOAuth(OAuthProvider):
    def get_user_info(self, code: str) -> dict:
        # 1. 用 code 换 access_token
        token_resp = requests.post('https://oauth2.googleapis.com/token', data={
            'code': code,
            'client_id': settings.GOOGLE_CLIENT_ID,
            'client_secret': settings.GOOGLE_CLIENT_SECRET,
            'redirect_uri': settings.GOOGLE_REDIRECT_URI,
            'grant_type': 'authorization_code',
        })
        token_data = token_resp.json()

        # 2. 用 access_token 获取用户信息
        user_resp = requests.get('https://www.googleapis.com/oauth2/v2/userinfo', headers={
            'Authorization': f'Bearer {token_data["access_token"]}',
        })
        return user_resp.json()  # {id, email, name, picture}
```

### OAuth ViewSet
```python
# apps/users/views.py
class OAuthLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, provider):
        code = request.data.get('code')
        if not code:
            return ApiResponse.error("缺少 authorization code")

        # 获取 OAuth Provider
        providers = {
            'google': GoogleOAuth(),
            'apple': AppleOAuth(),
        }
        oauth = providers.get(provider)
        if not oauth:
            return ApiResponse.error("不支持的登录方式")

        # 获取用户信息
        user_info = oauth.get_user_info(code)

        # 查找或创建用户
        user = UserService.get_or_create_oauth_user(provider, user_info)

        # 生成 JWT
        from rest_framework_simplejwt.tokens import RefreshToken
        refresh = RefreshToken.for_user(user)
        return ApiResponse.success({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': UserSerializer(user).data,
        })
```

### OAuth 用户关联
```python
# apps/users/services.py
class UserService:
    @staticmethod
    def get_or_create_oauth_user(provider: str, user_info: dict) -> User:
        """OAuth 登录：查找已关联用户或创建新用户"""
        from apps.users.models import OAuthAccount

        # 查找已关联的 OAuth 账号
        try:
            oauth = OAuthAccount.objects.select_related('user').get(
                provider=provider,
                provider_user_id=str(user_info['id']),
            )
            return oauth.user
        except OAuthAccount.DoesNotExist:
            pass

        # 查找相同邮箱的用户并关联
        email = user_info.get('email')
        user = User.objects.filter(email=email).first() if email else None

        if not user:
            # 创建新用户
            user = User.objects.create_user(
                email=email or f'{provider}_{user_info["id"]}@oauth.local',
                nickname=user_info.get('name', ''),
            )

        # 关联 OAuth 账号
        OAuthAccount.objects.create(
            user=user,
            provider=provider,
            provider_user_id=str(user_info['id']),
            extra_data=user_info,
        )
        return user
```

## AI API 集成

### AI 服务封装
```python
# services/ai/base.py
from abc import ABC, abstractmethod

class AIService(ABC):
    @abstractmethod
    def generate_image(self, prompt: str, **kwargs) -> str:
        """生成图片，返回 URL"""
        pass

    @abstractmethod
    def generate_animation(self, image_url: str, **kwargs) -> dict:
        """根据图片生成动画配置"""
        pass

# services/ai/client.py
import httpx
from django.conf import settings

class AIClient:
    """AI API HTTP 客户端"""
    def __init__(self):
        self.api_key = settings.AI_API_KEY
        self.base_url = settings.AI_API_BASE_URL
        self.client = httpx.Client(
            base_url=self.base_url,
            headers={'Authorization': f'Bearer {self.api_key}'},
            timeout=60.0,
        )

    def post(self, endpoint: str, data: dict) -> dict:
        response = self.client.post(endpoint, json=data)
        response.raise_for_status()
        return response.json()
```

### 在任务中调用 AI API
```python
# apps/pets/tasks.py
@shared_task(bind=True, max_retries=3)
def generate_pet_animation(self, pet_id: int):
    """异步生成宠物动画"""
    from services.ai.client import AIClient

    pet = Pet.objects.get(id=pet_id)
    ai = AIClient()

    try:
        # 调用 AI 生成动画配置
        result = ai.post('/generate-animation', {
            'image_url': pet.avatar.url,
            'style': '2d_cartoon',
            'actions': ['idle', 'sleep', 'eat', 'walk'],
        })

        PetAnimation.objects.update_or_create(
            pet=pet,
            defaults={
                'config': result['animation_config'],
                'sprite_url': result['sprite_url'],
                'status': 'completed',
            }
        )

        # WebSocket 通知用户
        send_notification(pet.owner_id, "动画生成完成", f"{pet.name} 的动画已就绪")

    except Exception as exc:
        PetAnimation.objects.update_or_create(
            pet=pet, defaults={'status': 'failed'}
        )
        self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))
```

### AI API Key 管理
```python
# .env（不提交 git）
AI_API_KEY=sk-xxx
AI_API_BASE_URL=https://api.example.com/v1

# settings/base.py
AI_API_KEY = os.environ.get('AI_API_KEY', '')
AI_API_BASE_URL = os.environ.get('AI_API_BASE_URL', '')
```

**重要**：需要 AI API 时必须先告知用户，等待用户提供 API Key。

## 邮件服务

### 配置
```python
# settings/base.py
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = os.environ.get('EMAIL_HOST', 'smtp.gmail.com')
EMAIL_PORT = int(os.environ.get('EMAIL_PORT', 587))
EMAIL_USE_TLS = True
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', 'noreply@petcompanionship.com')

# 开发环境用控制台输出
# settings/development.py
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
```

### 邮件 Service
```python
# services/email/service.py
from django.core.mail import send_mail
from django.template.loader import render_to_string

class EmailService:
    @staticmethod
    def send_verification_email(user, token: str):
        html = render_to_string('emails/verification.html', {
            'user': user,
            'verification_url': f'{settings.FRONTEND_URL}/verify?token={token}',
        })
        send_mail(
            subject='验证您的邮箱 - Pet Companionship',
            message='',
            html_message=html,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
        )

    @staticmethod
    def send_password_reset(user, token: str):
        html = render_to_string('emails/password_reset.html', {
            'user': user,
            'reset_url': f'{settings.FRONTEND_URL}/reset-password?token={token}',
        })
        send_mail(
            subject='重置密码 - Pet Companionship',
            message='',
            html_message=html,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
        )
```

### 异步发送邮件
```python
@shared_task
def send_email_task(template, context, to_email, subject):
    from django.core.mail import send_mail
    from django.template.loader import render_to_string

    html = render_to_string(template, context)
    send_mail(subject, '', html, settings.DEFAULT_FROM_EMAIL, [to_email])
```

## 测试规范

### 安装
```bash
pip install pytest pytest-django factory_boy
```

### pytest 配置
```ini
# pytest.ini
[pytest]
DJANGO_SETTINGS_MODULE = config.settings.development
python_files = tests.py test_*.py *_tests.py
python_classes = Test*
python_functions = test_*
addopts = -v --tb=short --reuse-db
```

### 测试数据工厂
```python
# tests/factories.py
import factory
from django.contrib.auth import get_user_model
from apps.pets.models import Pet

User = get_user_model()

class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User

    email = factory.Sequence(lambda n: f'user{n}@test.com')
    nickname = factory.Faker('name')
    password = factory.PostGenerationMethodCall('set_password', 'testpass123')

class PetFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Pet

    owner = factory.SubFactory(UserFactory)
    name = factory.Faker('first_name')
    breed = factory.Faker('word')
    gender = 'unknown'
```

### conftest.py
```python
# tests/conftest.py
import pytest
from rest_framework.test import APIClient
from tests.factories import UserFactory

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def user():
    return UserFactory()

@pytest.fixture
def auth_client(api_client, user):
    """已认证的 API 客户端"""
    api_client.force_authenticate(user=user)
    return api_client
```

### API 测试示例
```python
# apps/pets/tests/test_views.py
import pytest
from rest_framework import status
from tests.factories import PetFactory

@pytest.mark.django_db
class TestPetViewSet:
    def test_list_pets(self, auth_client, user):
        PetFactory.create_batch(3, owner=user)
        PetFactory.create()  # 其他用户的宠物

        response = auth_client.get('/api/v1/pets/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['code'] == 200
        assert len(response.data['data']['results']) == 3

    def test_create_pet(self, auth_client):
        data = {'name': '小白', 'breed': '金毛', 'gender': 'male'}

        response = auth_client.post('/api/v1/pets/', data, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['data']['name'] == '小白'

    def test_create_pet_unauthenticated(self, api_client):
        data = {'name': '小白'}

        response = api_client.post('/api/v1/pets/', data, format='json')

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_cannot_see_other_users_pets(self, auth_client):
        PetFactory.create()  # 其他用户的宠物

        response = auth_client.get('/api/v1/pets/')

        assert len(response.data['data']['results']) == 0

    def test_soft_delete(self, auth_client, user):
        pet = PetFactory.create(owner=user)

        response = auth_client.delete(f'/api/v1/pets/{pet.uuid}/')

        assert response.status_code == status.HTTP_204_NO_CONTENT
        pet.refresh_from_db()
        assert pet.is_deleted is True
```

### Service 测试
```python
# apps/pets/tests/test_services.py
import pytest
from apps.pets.services import PetService
from apps.core.exceptions import BusinessError
from tests.factories import UserFactory, PetFactory

@pytest.mark.django_db
class TestPetService:
    def test_create_pet(self):
        user = UserFactory()
        pet = PetService.create_pet(user, {'name': '小白', 'breed': '金毛'})
        assert pet.owner == user
        assert pet.name == '小白'

    def test_max_pets_limit(self):
        user = UserFactory()
        PetFactory.create_batch(10, owner=user)

        with pytest.raises(BusinessError, match="最多"):
            PetService.create_pet(user, {'name': '第11只'})
```

### 运行测试
```bash
# 运行全部测试
pytest

# 运行特定文件
pytest apps/pets/tests/test_views.py

# 运行特定测试
pytest apps/pets/tests/test_views.py::TestPetViewSet::test_create_pet

# 带覆盖率
pytest --cov=apps --cov-report=term-missing
```

## API 文档

### drf-spectacular 配置
```python
# pip install drf-spectacular
# settings.py
INSTALLED_APPS = [
    'drf_spectacular',
    ...
]

REST_FRAMEWORK = {
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
}

SPECTACULAR_SETTINGS = {
    'TITLE': 'Pet Companionship API',
    'DESCRIPTION': '虚拟宠物伴侣应用 API 文档',
    'VERSION': '1.0.0',
}
```

### 访问文档
- Schema: `GET /api/schema/`
- Swagger UI: `GET /api/docs/`
