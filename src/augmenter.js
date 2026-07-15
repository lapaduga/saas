import { getToolDefinitions } from './mcp/server.js';

const SYSTEM_PROMPT = `Ты — AI-ассистент поддержки пользователей продукта "CloudApp".
Твоя роль — помогать решать проблемы пользователей и отвечать на вопросы.

ДОСТУПНАЯ ИНФОРМАЦИЯ О ТЕКУЩЕМ ПОЛЬЗОВАТЕЛЕ:
{user_context}

ИНФОРМАЦИЯ О ТЕКУЩЕМ ТИКЕТЕ:
{ticket_context}

FAQ (релевантные записи из базы знаний):
{rag_faq_results}

ДОКУМЕНТАЦИЯ (релевантные фрагменты):
{rag_doc_results}

ИСТОРИЯ ДИАЛОГА:
{conversation_history}

ДОСТУПНЫЕ ИНСТРУМЕНТЫ (вызывай через TOOL_CALL):
{mcp_tool_definitions}

ФОРМАТ ВЫЗОВА ИНСТРУМЕНТА:
TOOL_CALL: {"tool": "имя_инструмента", "arguments": {"параметр": "значение"}}

ПРАВИЛА:
1. Всегда отвечай на языке пользователя (русский по умолчанию)
2. Опирайся ТОЛЬКО на данные из FAQ, документации и CRM — не выдумывай информацию
3. При ответе указывай источники: [FAQ: id] или [Документация: имя_файла]
4. Если проблема требует эскалации — предложи повысить приоритет тикета
5. Если в тикете уже есть переписка — учти контекст предыдущих сообщений
6. Используй инструменты когда нужна дополнительная информация о пользователе/тикете
7. Будь дружелюбен, но профессионален. Краткость — сестра таланта
8. Не отвечай на вопросы, не связанные с продуктом CloudApp
9. Формат ответа:
   - Краткий ответ на вопрос
   - Конкретные шаги (если применимо)
   - Источники: [FAQ: faq_001] или [Документация: auth-guide.md]`;

function escapeForPrompt(text) {
  if (!text) return 'Нет данных';
  return String(text)
    .replace(/\{/g, '〔')
    .replace(/\}/g, '〕')
    .slice(0, 2000);
}

export function buildPrompt({ ragResults, userContext, ticketContext, history }) {
  const faqResults = ragResults
    .filter(r => r.sourceType === 'faq')
    .map(r => `[${r.source}] ${r.content}`)
    .join('\n\n');

  const docResults = ragResults
    .filter(r => r.sourceType === 'markdown')
    .map(r => `[Документация: ${r.title}] (${r.heading})\n${r.content}`)
    .join('\n\n');

  const userCtx = userContext
    ? `ID: ${escapeForPrompt(userContext.id)}\nИмя: ${escapeForPrompt(userContext.name)}\nEmail: ${escapeForPrompt(userContext.email)}\nТариф: ${escapeForPrompt(userContext.plan)}\nСтатус: ${escapeForPrompt(userContext.status)}\nКомпания: ${escapeForPrompt(userContext.company)}\nЗаметки: ${escapeForPrompt(userContext.notes || 'нет')}`
    : 'Нет данных о пользователе';

  const ticketCtx = ticketContext
    ? `ID: ${escapeForPrompt(ticketContext.id)}\nТема: ${escapeForPrompt(ticketContext.subject)}\nОписание: ${escapeForPrompt(ticketContext.description)}\nСтатус: ${escapeForPrompt(ticketContext.status)}\nПриоритет: ${escapeForPrompt(ticketContext.priority)}\nКатегория: ${escapeForPrompt(ticketContext.category)}\nСоздан: ${escapeForPrompt(ticketContext.created_at)}`
    : 'Нет данных о тикете';

  const historyText = history && history.length > 0
    ? history.map(m => `${m.role === 'user' ? 'Пользователь' : 'AI'}: ${escapeForPrompt(m.content)}`).join('\n')
    : 'Нет предыдущих сообщений';

  const toolDefs = getToolDefinitions().map(t =>
    `- ${t.name}: ${t.description}\n  Аргументы: ${JSON.stringify(t.parameters)}`
  ).join('\n');

  const systemPrompt = SYSTEM_PROMPT
    .replace('{user_context}', userCtx)
    .replace('{ticket_context}', ticketCtx)
    .replace('{rag_faq_results}', faqResults || 'Нет релевантных записей')
    .replace('{rag_doc_results}', docResults || 'Нет релевантных фрагментов')
    .replace('{conversation_history}', historyText)
    .replace('{mcp_tool_definitions}', toolDefs);

  return systemPrompt;
}
