# API 设计规范

## 目录
1. [URL 规范](#url-规范)
2. [HTTP 方法](#http-方法)
3. [请求与响应格式](#请求与响应格式)
4. [认证与授权](#认证与授权)
5. [错误处理](#错误处理)
6. [分页与过滤](#分页与过滤)
7. [版本管理](#版本管理)
8. [API 文档模板](#api-文档模板)

## URL 规范

### 基本规则
- 基础路径: `/api/v1/`
- 资源用**名词复数**: `/api/v1/pets/`, `/api/v1/users/`
- 嵌套资源最多两层: `/api/v1/pets/{id}/memories/`
- 使用 kebab-case: `/api/v1/pet-profiles/`（不用 camelCase 或 snake_case）
- 不要在 URL 中暴露动词: ❌ `/api/v1/getPets` ✅ `/api/v1/pets/`

### 特殊操作
当 CRUD 不够表达时，用子资源：
- `POST /api/v1/pets/{id}/activate` — 激活宠物
- `POST /api/v1/users/{id}/verify-email` — 验证邮箱

## HTTP 方法

| 方法 | 用途 | 幂等 | 示例 |
|------|------|------|------|
| GET | 读取资源 | 是 | `GET /api/v1/pets/` |
| POST | 创建资源 | 否 | `POST /api/v1/pets/` |
| PUT | 全量更新 | 是 | `PUT /api/v1/pets/1/` |
| PATCH | 部分更新 | 是 | `PATCH /api/v1/pets/1/` |
| DELETE | 删除资源 | 是 | `DELETE /api/v1/pets/1/` |

## 请求与响应格式

### 统一响应结构

**成功响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": {
    // 实际数据
  }
}
```

**列表响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "items": [],
    "pagination": {
      "page": 1,
      "page_size": 20,
      "total": 100,
      "total_pages": 5
    }
  }
}
```

**错误响应:**
```json
{
  "code": 400,
  "message": "Validation error",
  "errors": [
    {
      "field": "name",
      "message": "This field is required"
    }
  ]
}
```

### 请求体规范
- Content-Type: `application/json`（默认）
- 文件上传: `multipart/form-data`
- 字段命名: snake_case

## 认证与授权

### JWT 认证流程
1. `POST /api/v1/auth/login/` → 获取 access + refresh token
2. 请求头: `Authorization: Bearer <access_token>`
3. `POST /api/v1/auth/refresh/` → 刷新 access token
4. `POST /api/v1/auth/logout/` → 注销（可选：黑名单 refresh token）

### Token 有效期建议
- Access Token: 15 分钟
- Refresh Token: 7 天

## 错误处理

### HTTP 状态码使用

| 状态码 | 含义 | 使用场景 |
|--------|------|----------|
| 200 | OK | GET/PUT/PATCH 成功 |
| 201 | Created | POST 创建成功 |
| 204 | No Content | DELETE 成功 |
| 400 | Bad Request | 请求参数错误 |
| 401 | Unauthorized | 未认证 |
| 403 | Forbidden | 无权限 |
| 404 | Not Found | 资源不存在 |
| 409 | Conflict | 资源冲突（如重复创建） |
| 422 | Unprocessable Entity | 验证错误 |
| 500 | Internal Server Error | 服务器内部错误 |

## 分页与过滤

### 分页参数
- `?page=1&page_size=20`
- 默认 page_size: 20，最大: 100

### 过滤参数
- 精确匹配: `?breed=golden_retriever`
- 搜索: `?search=buddy`
- 排序: `?ordering=-created_at` (负号表示降序)
- 日期范围: `?created_after=2026-01-01&created_before=2026-12-31`

## 版本管理

- URL 路径版本: `/api/v1/`, `/api/v2/`
- 新版本发布时保持旧版本可用至少 3 个月
- 重大破坏性变更才需要升版本号

## API 文档模板

设计新 API 时使用此模板：

```markdown
### [资源名称]

#### 列表
`GET /api/v1/[resources]/`

**查询参数:**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|

**响应 200:**
| 字段 | 类型 | 说明 |
|------|------|------|

---

#### 详情
`GET /api/v1/[resources]/{id}/`

**响应 200:**
| 字段 | 类型 | 说明 |
|------|------|------|

---

#### 创建
`POST /api/v1/[resources]/`

**请求体:**
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|

**响应 201:**
[同详情]

---

#### 更新
`PATCH /api/v1/[resources]/{id}/`

**请求体:** [可更新的字段]

**响应 200:** [同详情]

---

#### 删除
`DELETE /api/v1/[resources]/{id}/`

**响应 204:** 无内容
```
