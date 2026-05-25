# 单元测试与集成测试

## 目录
1. [后端单元测试 (pytest)](#后端单元测试-pytest)
2. [后端集成测试](#后端集成测试)
3. [前端单元测试 (Vitest)](#前端单元测试-vitest)
4. [前端集成测试](#前端集成测试)
5. [Mock 策略](#mock-策略)
6. [Fixture 与工厂](#fixture-与工厂)

## 后端单元测试 (pytest)

### 安装
```bash
pip install pytest pytest-django factory_boy pytest-mock pytest-cov
```

### pytest 配置
```ini
# pytest.ini
[pytest]
DJANGO_SETTINGS_MODULE = config.settings.development
python_files = tests.py test_*.py
python_classes = Test*
python_functions = test_*
addopts = -v --tb=short --reuse-db
markers =
    slow: marks tests as slow
    integration: marks integration tests
```

### conftest.py
```python
# tests/conftest.py
import pytest
from rest_framework.test import APIClient
from tests.factories import UserFactory, PetFactory

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def user(db):
    return UserFactory()

@pytest.fixture
def auth_client(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client

@pytest.fixture
def pet(user):
    return PetFactory(owner=user)
```

### Service 单元测试
```python
# apps/pets/tests/test_services.py
import pytest
from apps.pets.services import PetService
from apps.core.exceptions import BusinessError
from tests.factories import UserFactory, PetFactory

@pytest.mark.django_db
class TestPetService:
    def test_create_pet_success(self):
        user = UserFactory()
        pet = PetService.create_pet(user, {'name': '小白', 'breed': '金毛'})
        assert pet.name == '小白'
        assert pet.owner == user

    def test_create_pet_exceeds_limit(self):
        user = UserFactory()
        PetFactory.create_batch(10, owner=user)
        with pytest.raises(BusinessError, match="最多"):
            PetService.create_pet(user, {'name': '第11只'})

    def test_create_pet_strips_whitespace(self):
        user = UserFactory()
        pet = PetService.create_pet(user, {'name': '  小白  ', 'breed': '金毛'})
        assert pet.name == '小白'
```

### Serializer 单元测试
```python
# apps/pets/tests/test_serializers.py
import pytest
from apps.pets.serializers import PetCreateSerializer
from tests.factories import UserFactory

@pytest.mark.django_db
class TestPetCreateSerializer:
    def test_valid_data(self):
        user = UserFactory()
        data = {'name': '小白', 'breed': '金毛', 'gender': 'male'}
        serializer = PetCreateSerializer(data=data, context={'request': MockRequest(user)})
        assert serializer.is_valid(), serializer.errors

    def test_empty_name_invalid(self):
        user = UserFactory()
        data = {'name': '', 'breed': '金毛'}
        serializer = PetCreateSerializer(data=data, context={'request': MockRequest(user)})
        assert not serializer.is_valid()
        assert 'name' in serializer.errors

    def test_duplicate_check(self):
        """验证同一用户不能超过 10 只宠物"""
        user = UserFactory()
        PetFactory.create_batch(10, owner=user)
        data = {'name': '新宠物', 'breed': '柴犬'}
        serializer = PetCreateSerializer(data=data, context={'request': MockRequest(user)})
        assert not serializer.is_valid()
```

### Task 单元测试
```python
# apps/pets/tests/test_tasks.py
import pytest
from unittest.mock import patch, MagicMock
from apps.pets.tasks import generate_pet_animation
from tests.factories import PetFactory

@pytest.mark.django_db
class TestGeneratePetAnimation:
    @patch('apps.pets.tasks.AIClient')
    def test_generates_animation_on_success(self, mock_ai_class):
        mock_ai = MagicMock()
        mock_ai.post.return_value = {'animation_config': {}, 'sprite_url': 'http://...'}
        mock_ai_class.return_value = mock_ai

        pet = PetFactory(avatar='path/to/avatar.jpg')
        generate_pet_animation(pet.id)

        pet.refresh_from_db()
        assert hasattr(pet, 'animation')
        assert pet.animation.status == 'completed'

    @patch('apps.pets.tasks.AIClient')
    def test_marks_failed_on_error(self, mock_ai_class):
        mock_ai_class.return_value.post.side_effect = Exception("API error")

        pet = PetFactory(avatar='path/to/avatar.jpg')
        with pytest.raises(Exception):
            generate_pet_animation(pet.id)
```

## 后端集成测试

### API 集成测试
```python
# apps/pets/tests/test_views.py
import pytest
from rest_framework import status
from tests.factories import UserFactory, PetFactory

@pytest.mark.django_db
class TestPetViewSet:
    # --- LIST ---
    def test_list_returns_own_pets(self, auth_client, user):
        PetFactory.create_batch(3, owner=user)
        PetFactory.create()  # 其他用户

        response = auth_client.get('/api/v1/pets/')

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['data']['results']) == 3

    def test_list_excludes_deleted_pets(self, auth_client, user):
        PetFactory.create(owner=user)
        PetFactory.create(owner=user, is_deleted=True)

        response = auth_client.get('/api/v1/pets/')

        assert len(response.data['data']['results']) == 1

    def test_list_unauthenticated(self, api_client):
        response = api_client.get('/api/v1/pets/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    # --- CREATE ---
    def test_create_pet(self, auth_client):
        data = {'name': '小白', 'breed': '金毛', 'gender': 'male'}
        response = auth_client.post('/api/v1/pets/', data, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['data']['name'] == '小白'

    def test_create_sets_owner_automatically(self, auth_client, user):
        data = {'name': '小白', 'breed': '金毛'}
        response = auth_client.post('/api/v1/pets/', data, format='json')
        assert response.status_code == status.HTTP_201_CREATED

    # --- UPDATE ---
    def test_update_own_pet(self, auth_client, user):
        pet = PetFactory(owner=user)
        response = auth_client.patch(f'/api/v1/pets/{pet.uuid}/', {'name': '新名字'}, format='json')
        assert response.status_code == status.HTTP_200_OK

    def test_cannot_update_others_pet(self, auth_client):
        pet = PetFactory()  # 别人的宠物
        response = auth_client.patch(f'/api/v1/pets/{pet.uuid}/', {'name': '新名字'}, format='json')
        assert response.status_code == status.HTTP_404_NOT_FOUND

    # --- DELETE ---
    def test_soft_delete(self, auth_client, user):
        pet = PetFactory(owner=user)
        response = auth_client.delete(f'/api/v1/pets/{pet.uuid}/')
        assert response.status_code == status.HTTP_204_NO_CONTENT
        pet.refresh_from_db()
        assert pet.is_deleted is True
        assert pet.deleted_at is not None

    # --- PAGINATION ---
    def test_pagination(self, auth_client, user):
        PetFactory.create_batch(25, owner=user)
        response = auth_client.get('/api/v1/pets/')
        assert response.data['data']['count'] == 25
        assert len(response.data['data']['results']) == 20  # page_size
```

### 权限测试
```python
# apps/users/tests/test_permissions.py
@pytest.mark.django_db
class TestPermissions:
    def test_owner_can_delete(self, auth_client, user):
        pet = PetFactory(owner=user)
        response = auth_client.delete(f'/api/v1/pets/{pet.uuid}/')
        assert response.status_code == 204

    def test_non_owner_cannot_delete(self, auth_client):
        pet = PetFactory()  # 别人的
        response = auth_client.delete(f'/api/v1/pets/{pet.uuid}/')
        assert response.status_code == 404
```

## 前端单元测试 (Vitest)

### 安装
```bash
npm install -D vitest @vue/test-utils @vitest/coverage-v8 happy-dom
```

### 配置
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,vue}'],
      exclude: ['src/**/*.test.ts', 'src/main.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
      },
    },
  },
})
```

### 组件测试
```typescript
// src/components/ui/__tests__/AppButton.test.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AppButton from '../AppButton.vue'

describe('AppButton', () => {
  it('renders slot content', () => {
    const wrapper = mount(AppButton, { slots: { default: '点击我' } })
    expect(wrapper.text()).toContain('点击我')
  })

  it('applies primary variant by default', () => {
    const wrapper = mount(AppButton)
    expect(wrapper.classes()).toContain('bg-primary')
  })

  it('shows loading spinner when loading', () => {
    const wrapper = mount(AppButton, { props: { loading: true } })
    expect(wrapper.find('.animate-spin').exists()).toBe(true)
    expect(wrapper.attributes('disabled')).toBeDefined()
  })

  it('is disabled when disabled prop is true', () => {
    const wrapper = mount(AppButton, { props: { disabled: true } })
    expect(wrapper.attributes('disabled')).toBeDefined()
  })

  it('emits click event', async () => {
    const wrapper = mount(AppButton)
    await wrapper.trigger('click')
    // button click is native, no emit needed
  })
})
```

### Composable 测试
```typescript
// src/composables/__tests__/useToast.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useToast } from '../useToast'

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('adds a toast', () => {
    const { toasts, success } = useToast()
    success('操作成功')
    expect(toasts.value).toHaveLength(1)
    expect(toasts.value[0].type).toBe('success')
  })

  it('removes toast after duration', () => {
    const { toasts, success } = useToast()
    success('操作成功')
    vi.advanceTimersByTime(3000)
    expect(toasts.value).toHaveLength(0)
  })

  it('supports manual removal', () => {
    const { toasts, success, removeToast } = useToast()
    success('消息')
    const id = toasts.value[0].id
    removeToast(id)
    expect(toasts.value).toHaveLength(0)
  })
})
```

### Store 测试
```typescript
// src/stores/__tests__/user.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useUserStore } from '../user'

vi.mock('@/api/user', () => ({
  userApi: {
    login: vi.fn().mockResolvedValue({ data: { access: 'token', refresh: 'refresh' } }),
    getProfile: vi.fn().mockResolvedValue({ data: { uuid: '1', email: 'a@b.com', nickname: 'test' } }),
  },
}))

describe('useUserStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('is not authenticated initially', () => {
    const store = useUserStore()
    expect(store.isAuthenticated).toBe(false)
  })

  it('sets token on login', async () => {
    const store = useUserStore()
    await store.login('a@b.com', 'password')
    expect(store.token).toBe('token')
    expect(store.isAuthenticated).toBe(true)
  })

  it('clears state on logout', async () => {
    const store = useUserStore()
    await store.login('a@b.com', 'password')
    await store.logout()
    expect(store.token).toBeNull()
    expect(store.user).toBeNull()
  })
})
```

## 前端集成测试

### MSW (Mock Service Worker) 配置
```typescript
// src/__mocks__/handlers.ts
import { http, HttpResponse } from 'msw'

export const handlers = [
  http.post('/api/v1/auth/login/', () => {
    return HttpResponse.json({
      code: 200,
      data: { access: 'mock-token', refresh: 'mock-refresh' },
    })
  }),

  http.get('/api/v1/pets/', () => {
    return HttpResponse.json({
      code: 200,
      data: {
        count: 1,
        results: [{ uuid: '1', name: '小白', breed: '金毛' }],
      },
    })
  }),
]
```

## Mock 策略

### 什么时候 Mock
| 场景 | Mock？ | 说明 |
|------|--------|------|
| 外部 API（AI、OAuth） | ✅ 必须 Mock | 不依赖第三方服务 |
| 数据库 | ❌ 用真实 DB | pytest 有事务回滚 |
| Celery 任务 | ✅ Mock delay() | 避免依赖 Redis |
| 文件系统 | ⚠️ 视情况 | 小文件可真实，大文件 Mock |
| 时间 | ✅ freeze_time | 确保时间相关逻辑可测 |

### pytest Mock 示例
```python
from unittest.mock import patch

@patch('apps.pets.tasks.generate_pet_animation.delay')
def test_create_triggers_animation(mock_task, auth_client):
    data = {'name': '小白', 'breed': '金毛'}
    auth_client.post('/api/v1/pets/', data, format='json')
    mock_task.assert_called_once()
```

## Fixture 与工厂

### factory_boy 工厂
```python
# tests/factories.py
import factory
from django.contrib.auth import get_user_model

User = get_user_model()

class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User
    email = factory.Sequence(lambda n: f'user{n}@test.com')
    nickname = factory.Faker('name')
    password = factory.PostGenerationMethodCall('set_password', 'testpass123')

class PetFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = 'pets.Pet'
    owner = factory.SubFactory(UserFactory)
    name = factory.Faker('first_name')
    breed = factory.Faker('word')
    gender = 'unknown'

class PostFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = 'community.Post'
    author = factory.SubFactory(UserFactory)
    content = factory.Faker('paragraph')
```

### 使用 Trait 创建变体
```python
class PetFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = 'pets.Pet'

    class Params:
        deleted = factory.Trait(
            is_deleted=True,
            deleted_at=factory.LazyFunction(timezone.now),
        )
        with_avatar = factory.Trait(
            avatar='pets/test-avatar.jpg',
        )

# 使用
PetFactory(deleted=True)       # 已删除的宠物
PetFactory(with_avatar=True)   # 有头像的宠物
```
