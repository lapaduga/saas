const API = '/api';

let currentThreadId = null;
let currentUserId = null;
let currentTicketId = null;
let allTickets = [];

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

async function loadTickets(filter = 'all') {
  const tickets = await api('/tickets');
  allTickets = tickets;
  renderTickets(filter);
}

function renderTickets(filter = 'all') {
  const list = document.getElementById('ticket-list');
  const filtered = filter === 'all' ? allTickets : allTickets.filter(t => t.status === filter);
  list.innerHTML = filtered.map(t => `
    <div class="ticket-item ${t.id === currentTicketId ? 'active' : ''}" data-id="${t.id}">
      <div class="ticket-id">${escapeHtml(t.id)}</div>
      <div class="ticket-subject">${escapeHtml(t.subject)}</div>
      <div class="ticket-meta">
        <span class="priority-badge priority-${t.priority}">${escapeHtml(t.priority)}</span>
        <span class="status-badge status-${t.status}">${escapeHtml(t.status)}</span>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.ticket-item').forEach(el => {
    el.addEventListener('click', () => selectTicket(el.dataset.id));
  });
}

async function selectTicket(ticketId) {
  const ticket = await api(`/tickets/${ticketId}`);
  const user = await api(`/users/${ticket.user_id}`);

  currentTicketId = ticketId;
  currentUserId = ticket.user_id;

  document.getElementById('panel-empty').style.display = 'none';
  document.getElementById('panel-content').style.display = 'block';

  document.getElementById('user-info').innerHTML = `
    <div class="info-row"><span class="info-label">Name</span><span class="info-value">${escapeHtml(user.name)}</span></div>
    <div class="info-row"><span class="info-label">Email</span><span class="info-value">${escapeHtml(user.email)}</span></div>
    <div class="info-row"><span class="info-label">Plan</span><span class="info-value">${escapeHtml(user.plan)}</span></div>
    <div class="info-row"><span class="info-label">Status</span><span class="info-value">${escapeHtml(user.status)}</span></div>
    <div class="info-row"><span class="info-label">Company</span><span class="info-value">${escapeHtml(user.company)}</span></div>
    ${user.notes ? `<div class="info-row"><span class="info-label">Notes</span><span class="info-value">${escapeHtml(user.notes)}</span></div>` : ''}
  `;

  document.getElementById('ticket-info').innerHTML = `
    <div class="info-row"><span class="info-label">ID</span><span class="info-value">${escapeHtml(ticket.id)}</span></div>
    <div class="info-row"><span class="info-label">Subject</span><span class="info-value">${escapeHtml(ticket.subject)}</span></div>
    <div class="info-row"><span class="info-label">Status</span><span class="info-value"><span class="status-badge status-${ticket.status}">${escapeHtml(ticket.status)}</span></span></div>
    <div class="info-row"><span class="info-label">Priority</span><span class="info-value"><span class="priority-badge priority-${ticket.priority}">${escapeHtml(ticket.priority)}</span></span></div>
    <div class="info-row"><span class="info-label">Category</span><span class="info-value">${escapeHtml(ticket.category)}</span></div>
    <div class="info-row"><span class="info-label">Created</span><span class="info-value">${new Date(ticket.created_at).toLocaleDateString('ru')}</span></div>
  `;

  const msgs = ticket.messages || [];
  document.getElementById('ticket-messages').innerHTML = msgs.length > 0
    ? msgs.map(m => `
      <div class="ticket-msg">
        <div class="ticket-msg-role ${m.role}">${m.role === 'operator' ? 'Operator' : 'User'}</div>
        <div>${escapeHtml(m.content)}</div>
      </div>
    `).join('')
    : '<div style="color:#6b7280;font-size:12px;">No messages yet</div>';

  const statusSelect = document.createElement('div');
  statusSelect.className = 'status-select';
  statusSelect.innerHTML = `
    <label class="info-label">Change status:</label>
    <select id="ticket-status-select">
      <option value="open" ${ticket.status === 'open' ? 'selected' : ''}>Open</option>
      <option value="in_progress" ${ticket.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
      <option value="resolved" ${ticket.status === 'resolved' ? 'selected' : ''}>Resolved</option>
      <option value="closed" ${ticket.status === 'closed' ? 'selected' : ''}>Closed</option>
    </select>
  `;
  document.getElementById('ticket-info').appendChild(statusSelect);

  document.getElementById('ticket-status-select').addEventListener('change', async (e) => {
    await api(`/tickets/${ticketId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: e.target.value }),
    });
    loadTickets();
  });

  const chatArea = document.querySelector('.chat-area');
  chatArea.setAttribute('data-ticket', ticketId);

  renderTickets(document.querySelector('.tab.active')?.dataset.filter || 'all');
}

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message) return;

  input.value = '';
  input.style.height = 'auto';
  document.getElementById('send-btn').disabled = true;

  addMessage('user', message);
  showTyping();

  try {
    const result = await api('/chat', {
      method: 'POST',
      body: JSON.stringify({
        message,
        thread_id: currentThreadId,
        user_id: currentUserId,
        ticket_id: currentTicketId,
      }),
    });

    if (result.thread_id && !currentThreadId) {
      currentThreadId = result.thread_id;
    }

    hideTyping();
    addMessage('ai', result.answer, result.sources, result.toolCalls, result.pipeline);
  } catch (err) {
    hideTyping();
    const errorMsg = err.message?.includes('429')
      ? 'Превышен лимит запросов. Подождите минуту.'
      : 'Ошибка при обращении к серверу. Попробуйте позже.';
    addMessage('ai', errorMsg);
  }
}

function addMessage(role, content, sources, toolCalls, pipeline) {
  const messages = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = `message ${role === 'user' ? 'user-message' : 'ai-message'}`;

  let html = `<div class="message-avatar">${role === 'user' ? 'U' : 'AI'}</div>`;
  html += '<div class="message-content">';
  html += `<p>${escapeHtml(content)}</p>`;

  if (sources && sources.length > 0) {
    html += '<div class="sources">';
    for (const s of sources) {
      if (s.type === 'FAQ') {
        html += `<span class="source-badge faq">[FAQ: ${escapeHtml(s.id)}]</span>`;
      } else {
        html += `<span class="source-badge docs">[Docs: ${escapeHtml(s.file)}]</span>`;
      }
    }
    html += '</div>';
  }

  if (toolCalls && toolCalls.length > 0) {
    for (const tc of toolCalls) {
      html += `<div class="tool-call" onclick="this.classList.toggle('expanded')">`;
      html += `<div class="tool-call-header">&#9881; ${escapeHtml(tc.tool)}</div>`;
      html += `<div class="tool-call-body">${escapeHtml(JSON.stringify(tc.arguments, null, 2))}</div>`;
      html += '</div>';
    }
  }

  if (pipeline) {
    const stages = pipeline.stages.map(s => `${s.name}: ${s.duration_ms}ms`).join(' | ');
    html += `<div class="pipeline-info">Pipeline: ${pipeline.timing_ms}ms (${escapeHtml(stages)})</div>`;
  }

  html += '</div>';
  div.innerHTML = html;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function showTyping() {
  const messages = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'message ai-message';
  div.id = 'typing';
  div.innerHTML = `
    <div class="message-avatar">AI</div>
    <div class="typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function hideTyping() {
  const el = document.getElementById('typing');
  if (el) el.remove();
}

async function createNewThread() {
  const result = await api('/threads', { method: 'POST', body: '{}' });
  currentThreadId = result.id;
  currentUserId = null;
  currentTicketId = null;
  document.getElementById('panel-empty').style.display = 'flex';
  document.getElementById('panel-content').style.display = 'none';
  document.getElementById('messages').innerHTML = '';
  document.querySelector('.chat-area').removeAttribute('data-ticket');
  addMessage('ai', 'Новый диалог создан. Задайте вопрос или выберите тикет.');
  renderTickets(document.querySelector('.tab.active')?.dataset.filter || 'all');
}

async function showStats() {
  const stats = await api('/stats');
  document.getElementById('stats-body').innerHTML = `
    <div class="stat-row"><span class="stat-label">Documents</span><span class="stat-value">${stats.documents}</span></div>
    <div class="stat-row"><span class="stat-label">Chunks</span><span class="stat-value">${stats.chunks}</span></div>
    <div class="stat-row"><span class="stat-label">Queries</span><span class="stat-value">${stats.queries}</span></div>
    <div class="stat-row"><span class="stat-label">Users</span><span class="stat-value">${stats.users}</span></div>
    <div class="stat-row"><span class="stat-label">Tickets</span><span class="stat-value">${stats.tickets}</span></div>
  `;
  document.getElementById('stats-modal').style.display = 'flex';
}

document.addEventListener('DOMContentLoaded', () => {
  loadTickets();

  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');

  input.addEventListener('input', () => {
    sendBtn.disabled = !input.value.trim();
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn.addEventListener('click', sendMessage);

  document.getElementById('new-chat-btn').addEventListener('click', createNewThread);
  document.getElementById('stats-btn').addEventListener('click', showStats);
  document.getElementById('stats-close').addEventListener('click', () => {
    document.getElementById('stats-modal').style.display = 'none';
  });

  document.getElementById('filter-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    renderTickets(tab.dataset.filter);
  });
});
