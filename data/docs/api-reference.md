# API Reference CloudApp

## Обзор

CloudApp REST API позволяет управлять файлами, пользователями, рабочими пространствами и настройками программно. API следует принципам REST и возвращает JSON.

## Базовый URL

```
https://api.cloudapp.com/v1
```

Все запросы должны использовать HTTPS. HTTP-запросы перенаправляются на HTTPS.

## Аутентификация

### Bearer Token

```http
Authorization: Bearer sk_live_abc123...
```

### OAuth 2.0

Для веб-приложений используйте Authorization Code flow с PKCE:

1. Редирект на `/auth/authorize`
2. Пользователь авторизуется
3. Получение authorization code
4. Обмен code на access token через `/auth/token`

## Rate Limiting

| Тариф | Requests/min | Requests/month |
|---|---|---|
| Free | 20 | 1,000 |
| Basic | 100 | 10,000 |
| Pro | 500 | 100,000 |
| Enterprise | Custom | Unlimited |

Заголовки ответа:

```
X-RateLimit-Limit: 500
X-RateLimit-Remaining: 497
X-RateLimit-Reset: 1721155260
```

## Формат ответа

### Успешный ответ

```json
{
  "data": { ... },
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 150,
    "total_pages": 8
  }
}
```

### Ошибка

```json
{
  "error": {
    "code": "not_found",
    "message": "File not found",
    "details": {
      "file_id": "file_xyz789"
    }
  }
}
```

## Коды ответов

| Код | Описание |
|---|---|
| 200 | Успешный запрос |
| 201 | Ресурс создан |
| 204 | Успешное удаление (нет тела) |
| 400 | Невалидный запрос |
| 401 | Не авторизован |
| 403 | Доступ запрещён |
| 404 | Ресурс не найден |
| 409 | Конфликт (дубликат) |
| 422 | Невалидные данные |
| 429 | Превышен rate limit |
| 500 | Внутренняя ошибка сервера |

## Эндпоинты файлов

### Загрузка файла

```http
POST /v1/files
Content-Type: multipart/form-data

file: <binary>
path: /projects/docs/
name: document.pdf (optional)
```

**Ответ 201:**

```json
{
  "data": {
    "id": "file_abc123",
    "name": "document.pdf",
    "size": 1048576,
    "mime_type": "application/pdf",
    "path": "/projects/docs/",
    "url": "https://storage.cloudapp.com/file_abc123",
    "download_url": "https://storage.cloudapp.com/file_abc123?download=true",
    "checksum": "sha256:a1b2c3...",
    "created_at": "2026-07-16T10:00:00Z",
    "updated_at": "2026-07-16T10:00:00Z",
    "created_by": "usr_001"
  }
}
```

### Получение списка файлов

```http
GET /v1/files?path=/projects/&page=1&per_page=20&sort=name&order=asc
```

**Параметры:**

| Параметр | Тип | Описание |
|---|---|---|
| path | string | Путь для фильтрации |
| page | int | Номер страницы (default: 1) |
| per_page | int | Элементов на странице (default: 20, max: 100) |
| sort | string | Сортировка: name, size, created_at, updated_at |
| order | string | Порядок: asc, desc |
| type | string | Тип: file, folder |

**Ответ 200:**

```json
{
  "data": [
    {
      "id": "file_abc123",
      "name": "document.pdf",
      "type": "file",
      "size": 1048576,
      "path": "/projects/docs/",
      "mime_type": "application/pdf",
      "created_at": "2026-07-16T10:00:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 45
  }
}
```

### Получение информации о файле

```http
GET /v1/files/:file_id
```

### Обновление файла

```http
PATCH /v1/files/:file_id
Content-Type: application/json

{
  "name": "renamed_document.pdf",
  "path": "/archive/"
}
```

### Удаление файла

```http
DELETE /v1/files/:file_id
```

Файл перемещается в «Корзину» и удаляется окончательно через 30 дней (настройка тарифа).

### Скачивание файла

```http
GET /v1/files/:file_id/download
```

Возвращает бинарные данные файла. Используйте `Content-Disposition` для определения имени файла.

### Batch-загрузка

```http
POST /v1/files/batch
Content-Type: multipart/form-data

files[0]: <binary1>
files[1]: <binary2>
path: /bulk-import/
```

Максимум 10 файлов за один запрос.

## Эндпоинты папок

### Создание папки

```http
POST /v1/folders
Content-Type: application/json

{
  "name": "New Project",
  "path": "/workspace/"
}
```

### Список папок

```http
GET /v1/folders?path=/workspace/
```

### Переименование папки

```http
PATCH /v1/folders/:folder_id
Content-Type: application/json

{
  "name": "Renamed Project"
}
```

### Удаление папки

```http
DELETE /v1/folders/:folder_id
```

Все содержимое папки перемещается в «Корзину».

## Эндпоинты шаринга

### Создание ссылки

```http
POST /v1/files/:file_id/share
Content-Type: application/json

{
  "type": "link",
  "access": "view",
  "expires_at": "2026-08-16T00:00:00Z",
  "password": "secret123"
}
```

**Типы доступа:**

- `view` — просмотр и скачивание
- `edit` — просмотр, скачивание, редактирование
- `download` — только скачивание

**Ответ 201:**

```json
{
  "data": {
    "id": "share_xyz",
    "url": "https://share.cloudapp.com/s/abc123",
    "access": "view",
    "expires_at": "2026-08-16T00:00:00Z",
    "password_protected": true,
    "created_at": "2026-07-16T10:00:00Z"
  }
}
```

### Приглашение по email

```http
POST /v1/files/:file_id/invite
Content-Type: application/json

{
  "email": "colleague@company.com",
  "role": "editor",
  "message": "Посмотри этот документ"
}
```

### Список приглашений

```http
GET /v1/files/:file_id/shares
```

### Отзыв приглашения

```http
DELETE /v1/files/:file_id/shares/:share_id
```

## Эндпоинты пользователей

### Текущий пользователь

```http
GET /v1/users/me
```

**Ответ 200:**

```json
{
  "data": {
    "id": "usr_001",
    "email": "user@example.com",
    "name": "Иван Петров",
    "plan": "pro",
    "storage_used": 15728640,
    "storage_limit": 214748364800,
    "api_usage": 45230,
    "api_limit": 100000,
    "created_at": "2025-03-15T00:00:00Z"
  }
}
```

### Список пользователей workspace

```http
GET /v1/workspace/users?page=1&per_page=20
```

### Обновление профиля

```http
PATCH /v1/users/me
Content-Type: application/json

{
  "name": "Иван Иванов",
  "phone": "+7 (999) 999-99-99"
}
```

## Эндпоинты вебхуков

### Создание вебхука

```http
POST /v1/webhooks
Content-Type: application/json

{
  "url": "https://my-app.com/webhook",
  "events": ["file.created", "file.deleted", "user.invited"],
  "secret": "webhook_secret_abc"
}
```

**Поддерживаемые события:**

- `file.created` — загрузка нового файла
- `file.updated` — обновление файла
- `file.deleted` — удаление файла
- `file.shared` — создание шаринга
- `folder.created` — создание папки
- `folder.deleted` — удаление папки
- `user.invited` — приглашение пользователя
- `user.removed` — удаление пользователя

### Список вебхуков

```http
GET /v1/webhooks
```

### Удаление вебхука

```http
DELETE /v1/webhooks/:webhook_id
```

### Проверка подписи

Каждый вебхук-запрос включает заголовок:

```http
X-CloudApp-Signature: sha256=abc123...
```

Для верификации:

```javascript
const crypto = require('crypto');

function verifySignature(payload, signature, secret) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

## Эндпоинты поиска

### Поиск файлов

```http
GET /v1/search?q=document&path=/projects/&type=file&page=1&per_page=20
```

**Ответ 200:**

```json
{
  "data": [
    {
      "id": "file_abc123",
      "name": "project-document.pdf",
      "highlight": "...<em>document</em>...",
      "score": 0.95,
      "path": "/projects/"
    }
  ],
  "meta": {
    "total": 12,
    "query_time_ms": 45
  }
}
```

## Эндпоинты аналитики

### Использование хранилища

```http
GET /v1/analytics/storage
```

### Использование API

```http
GET /v1/analytics/api?period=30d
```

### Активность пользователей

```http
GET /v1/analytics/activity?period=7d
```

## Версионирование API

API-версия указывается в URL: `/v1/`, `/v2/`

При deprecated-статусе версии:

- Заголовок `Sunset: Sat, 01 Jan 2028 00:00:00 GMT`
- Заголовок `Deprecation: true`
- Рекомендация миграции в документации
