import { readFileSync } from 'fs';
import { join } from 'path';
import crmStore from '../crm/store.js';
import config from '../config.js';

const faqCache = (() => {
  try {
    return JSON.parse(readFileSync(join(config.dataDir, 'faq.json'), 'utf-8'));
  } catch {
    return [];
  }
})();

const tools = [
  {
    name: 'search_user',
    description: 'Поиск пользователя по email, имени или ID',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Email, имя или ID пользователя' },
      },
      required: ['query'],
    },
    execute(args) {
      const { query } = args;
      if (!query || query.length > 500) return { error: 'Invalid query' };
      return crmStore.searchUser(query);
    },
  },
  {
    name: 'get_user_tickets',
    description: 'Получить все тикеты пользователя',
    parameters: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: 'ID пользователя (usr_XXX)' },
      },
      required: ['user_id'],
    },
    execute(args) {
      const { user_id } = args;
      if (!user_id || !/^usr_\d{3}$/.test(user_id)) return { error: 'Invalid user_id format' };
      return crmStore.getUserTickets(user_id);
    },
  },
  {
    name: 'get_ticket',
    description: 'Получить полные детали тикета включая историю сообщений',
    parameters: {
      type: 'object',
      properties: {
        ticket_id: { type: 'string', description: 'ID тикета (tkt_XXX)' },
      },
      required: ['ticket_id'],
    },
    execute(args) {
      const { ticket_id } = args;
      if (!ticket_id || !/^tkt_\d{3}$/.test(ticket_id)) return { error: 'Invalid ticket_id format' };
      return crmStore.getTicketById(ticket_id) || { error: 'Ticket not found' };
    },
  },
  {
    name: 'update_ticket_status',
    description: 'Обновить статус тикета',
    parameters: {
      type: 'object',
      properties: {
        ticket_id: { type: 'string', description: 'ID тикета (tkt_XXX)' },
        status: { type: 'string', enum: ['open', 'in_progress', 'resolved', 'closed'], description: 'Новый статус' },
      },
      required: ['ticket_id', 'status'],
    },
    execute(args) {
      const { ticket_id, status } = args;
      if (!ticket_id || !/^tkt_\d{3}$/.test(ticket_id)) return { error: 'Invalid ticket_id format' };
      return crmStore.updateTicketStatus(ticket_id, status);
    },
  },
  {
    name: 'search_faq',
    description: 'Прямой поиск по FAQ (allback для случаев когда RAG не дал результатов)',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Поисковый запрос' },
        category: { type: 'string', description: 'Категория для фильтрации' },
      },
      required: ['query'],
    },
    execute(args) {
      const { query, category } = args;
      if (!query || query.length > 1000) return { error: 'Invalid query' };
      const q = query.toLowerCase();
      let results = faqCache.filter(f =>
        f.question.toLowerCase().includes(q) ||
        f.answer.toLowerCase().includes(q) ||
        f.tags.some(t => t.includes(q))
      );
      if (category) results = results.filter(f => f.category === category);
      return results.slice(0, 5);
    },
  },
];

export function getToolDefinitions() {
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

export function callTool(name, args) {
  const tool = tools.find(t => t.name === name);
  if (!tool) return { error: `Tool not found: ${name}` };
  try {
    return tool.execute(args);
  } catch (err) {
    console.error(`[MCP] Tool ${name} error:`, err.message);
    return { error: err.message };
  }
}
