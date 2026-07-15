import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import config from '../config.js';

class CrmStore {
  constructor() {
    this.users = [];
    this.tickets = [];
    this.usersPath = join(config.dataDir, 'users.json');
    this.ticketsPath = join(config.dataDir, 'tickets.json');
  }

  load() {
    if (existsSync(this.usersPath)) {
      this.users = JSON.parse(readFileSync(this.usersPath, 'utf-8'));
      console.log(`[CRM] Loaded ${this.users.length} users`);
    }
    if (existsSync(this.ticketsPath)) {
      this.tickets = JSON.parse(readFileSync(this.ticketsPath, 'utf-8'));
      console.log(`[CRM] Loaded ${this.tickets.length} tickets`);
    }
  }

  searchUser(query) {
    const q = query.toLowerCase();
    return this.users.filter(u =>
      u.id.toLowerCase().includes(q) ||
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    ).slice(0, 5);
  }

  getUserById(id) {
    return this.users.find(u => u.id === id) || null;
  }

  getUserTickets(userId) {
    return this.tickets
      .filter(t => t.user_id === userId)
      .map(t => ({
        id: t.id,
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        category: t.category,
        created_at: t.created_at,
      }));
  }

  getTicketById(id) {
    return this.tickets.find(t => t.id === id) || null;
  }

  getAllTickets(status) {
    if (status) {
      return this.tickets.filter(t => t.status === status);
    }
    return [...this.tickets];
  }

  getAllUsers() {
    return [...this.users];
  }

  updateTicket(id, updates) {
    const idx = this.tickets.findIndex(t => t.id === id);
    if (idx === -1) return null;
    Object.assign(this.tickets[idx], updates, { updated_at: new Date().toISOString() });
    writeFileSync(this.ticketsPath, JSON.stringify(this.tickets, null, 2), 'utf-8');
    return this.tickets[idx];
  }

  updateTicketStatus(id, status) {
    const allowed = ['open', 'in_progress', 'resolved', 'closed'];
    if (!allowed.includes(status)) return { error: `Invalid status. Allowed: ${allowed.join(', ')}` };
    return this.updateTicket(id, { status });
  }
}

export default new CrmStore();
