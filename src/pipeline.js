import { retrieve } from './retriever.js';
import { buildPrompt } from './augmenter.js';
import { chat } from './llm.js';
import { callTool } from './mcp/server.js';
import crmStore from './crm/store.js';
import { getDb, statements } from './storage/db.js';
import config from './config.js';

function parseToolCall(text) {
  const idx = text.indexOf('TOOL_CALL:');
  if (idx === -1) return null;
  const after = text.slice(idx + 'TOOL_CALL:'.length);
  let depth = 0;
  let start = -1;
  for (let i = 0; i < after.length; i++) {
    if (after[i] === '{') {
      if (start === -1) start = i;
      depth++;
    } else if (after[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          return JSON.parse(after.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function formatSources(results) {
  return results.map(r => {
    if (r.sourceType === 'faq') {
      const idMatch = r.source.match(/faq:(.+)/);
      return { type: 'FAQ', id: idMatch?.[1] || r.source, title: r.title, score: r.score };
    }
    return { type: 'Docs', file: r.title, heading: r.heading, score: r.score };
  });
}

export async function runPipeline({ message, threadId, userId, ticketId, history }) {
  const stages = [];
  const startTime = Date.now();

  stages.push({ name: 'context', start: Date.now() });

  let userContext = null;
  let ticketContext = null;

  if (userId) {
    userContext = crmStore.getUserById(userId);
  }
  if (ticketId) {
    ticketContext = crmStore.getTicketById(ticketId);
    if (!userContext && ticketContext) {
      userContext = crmStore.getUserById(ticketContext.user_id);
    }
  }

  stages[stages.length - 1].duration_ms = Date.now() - stages[stages.length - 1].start;

  stages.push({ name: 'retrieve', start: Date.now() });
  const ragResults = await retrieve(message);
  stages[stages.length - 1].duration_ms = Date.now() - stages[stages.length - 1].start;

  stages.push({ name: 'augment', start: Date.now() });
  const systemPrompt = buildPrompt({ ragResults, userContext, ticketContext, history: history || [] });
  stages[stages.length - 1].duration_ms = Date.now() - stages[stages.length - 1].start;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: message },
  ];

  let finalAnswer = '';
  let toolCalls = [];
  let lastLlmContent = '';

  for (let step = 0; step < config.pipeline.maxToolSteps; step++) {
    stages.push({ name: `llm_step_${step}`, start: Date.now() });
    const llmResponse = await chat(messages);
    stages[stages.length - 1].duration_ms = Date.now() - stages[stages.length - 1].start;

    lastLlmContent = llmResponse.content;

    const toolCall = parseToolCall(llmResponse.content);
    if (!toolCall) {
      finalAnswer = llmResponse.content;
      break;
    }

    toolCalls.push(toolCall);
    stages.push({ name: `tool_${step}`, start: Date.now() });
    const toolResult = callTool(toolCall.tool, toolCall.arguments);
    stages[stages.length - 1].duration_ms = Date.now() - stages[stages.length - 1].start;

    messages.push({ role: 'assistant', content: llmResponse.content });
    messages.push({
      role: 'user',
      content: `Результат вызова инструмента ${toolCall.tool}: ${JSON.stringify(toolResult, null, 2)}`,
    });
  }

  if (!finalAnswer) {
    finalAnswer = lastLlmContent || 'Не удалось сформировать ответ. Пожалуйста, попробуйте переформулировать вопрос.';
  }

  if (threadId) {
    try {
      const db = getDb();
      const saveMessages = db.transaction(() => {
        statements.insertMessage(db).run(threadId, 'user', message, '{}');
        statements.insertMessage(db).run(threadId, 'assistant', finalAnswer, JSON.stringify({ sources: formatSources(ragResults), toolCalls }));
        statements.updateThreadTimestamp(db).run(threadId);
      });
      saveMessages();
    } catch (err) {
      console.error('[PIPELINE] Failed to save messages:', err.message);
    }
  }

  const totalTiming = Date.now() - startTime;

  try {
    const db = getDb();
    statements.insertQuery(db).run(message, finalAnswer, JSON.stringify(formatSources(ragResults)), totalTiming);
  } catch (err) {
    console.error('[PIPELINE] Failed to save query log:', err.message);
  }

  return {
    answer: finalAnswer,
    sources: formatSources(ragResults),
    toolCalls,
    ticket_context: ticketContext,
    user_context: userContext,
    pipeline: {
      stages,
      timing_ms: totalTiming,
    },
  };
}
