import { Router } from 'express';
import { getDb, statements } from './storage/db.js';
import crmStore from './crm/store.js';
import { runPipeline } from './pipeline.js';
import { callTool, getToolDefinitions } from './mcp/server.js';
import config from './config.js';

const router = Router();

const rateLimitStore = new Map();

function rateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const windowStart = now - config.rateLimit.windowMs;

  if (!rateLimitStore.has(ip)) rateLimitStore.set(ip, []);
  const hits = rateLimitStore.get(ip).filter(t => t > windowStart);
  rateLimitStore.set(ip, hits);

  if (hits.length >= config.rateLimit.maxRequests) {
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }
  hits.push(now);
  next();
}

function validateMessage(message) {
  if (!message || typeof message !== 'string') return 'Message is required';
  if (message.length > 10000) return 'Message too long (max 10000 chars)';
  return null;
}

router.post('/chat', rateLimit, async (req, res, next) => {
  try {
    const { message, thread_id, user_id, ticket_id } = req.body;
    const msgError = validateMessage(message);
    if (msgError) return res.status(400).json({ error: msgError });

    const db = getDb();

    let resolvedThreadId = thread_id;
    if (!resolvedThreadId) {
      const result = statements.createThread(db).run(message.slice(0, 80));
      resolvedThreadId = Number(result.lastInsertRowid);
    }

    let history = statements.getThreadMessages(db).all(resolvedThreadId).map(m => ({
      role: m.role,
      content: m.content,
    }));

    const result = await runPipeline({
      message,
      threadId: resolvedThreadId,
      userId: user_id || null,
      ticketId: ticket_id || null,
      history,
    });

    result.thread_id = resolvedThreadId;
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/threads', (req, res) => {
  const db = getDb();
  const threads = statements.getThreads(db).all();
  res.json(threads);
});

router.post('/threads', (req, res) => {
  const { title } = req.body;
  const db = getDb();
  const result = statements.createThread(db).run(title || 'New conversation');
  const thread = statements.getThread(db).get(result.lastInsertRowid);
  res.status(201).json(thread);
});

router.delete('/threads/:id', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  statements.deleteThreadMessages(db).run(id);
  statements.deleteThread(db).run(id);
  res.json({ success: true });
});

router.get('/users', (req, res) => {
  res.json(crmStore.getAllUsers());
});

router.get('/users/:id', (req, res) => {
  const user = crmStore.getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

router.get('/tickets', (req, res) => {
  const { status } = req.query;
  res.json(crmStore.getAllTickets(status));
});

router.get('/tickets/:id', (req, res) => {
  const ticket = crmStore.getTicketById(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  res.json(ticket);
});

router.patch('/tickets/:id', (req, res) => {
  const { status, priority } = req.body;
  const updates = {};
  if (status) updates.status = status;
  if (priority) updates.priority = priority;
  const result = crmStore.updateTicket(req.params.id, updates);
  if (!result) return res.status(404).json({ error: 'Ticket not found' });
  res.json(result);
});

router.get('/mcp/tools', (req, res) => {
  res.json(getToolDefinitions());
});

router.post('/mcp/call', (req, res) => {
  const { tool, arguments: args } = req.body;
  if (!tool) return res.status(400).json({ error: 'Tool name required' });
  const result = callTool(tool, args || {});
  res.json(result);
});

router.get('/status', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

router.get('/stats', (req, res) => {
  const db = getDb();
  res.json({
    documents: statements.getDocumentCount(db).get().count,
    chunks: statements.getChunkCount(db).get().count,
    queries: statements.getQueryCount(db).get().count,
    users: crmStore.getAllUsers().length,
    tickets: crmStore.getAllTickets().length,
  });
});

export default router;
