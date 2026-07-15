import Database from 'better-sqlite3';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import config from '../config.js';

let db = null;

export function getDb() {
  if (!db) {
    db = new Database(config.dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    console.log('[DB] Connected to', config.dbPath);
  }
  return db;
}

export function migrate() {
  const d = getDb();
  const migrationsDir = join(config.rootDir, 'src', 'storage', 'migrations');
  const files = ['001_init.sql', '002_threads.sql'];

  d.exec('BEGIN');
  try {
    for (const file of files) {
      const path = join(migrationsDir, file);
      if (existsSync(path)) {
        const sql = readFileSync(path, 'utf-8');
        d.exec(sql);
        console.log('[DB] Applied migration:', file);
      }
    }
    d.exec('COMMIT');
  } catch (err) {
    d.exec('ROLLBACK');
    throw err;
  }
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
    console.log('[DB] Connection closed');
  }
}

export const statements = {
  insertDocument: (d) => d.prepare(
    'INSERT INTO documents (source, source_type, title, content, metadata) VALUES (?, ?, ?, ?, ?)'
  ),
  insertChunk: (d) => d.prepare(
    'INSERT INTO chunks (document_id, chunk_index, content, heading, embedding, metadata) VALUES (?, ?, ?, ?, ?, ?)'
  ),
  getAllChunks: (d) => d.prepare(
    `SELECT c.id, c.content, c.heading, c.metadata, d.source, d.source_type, d.title
     FROM chunks c JOIN documents d ON c.document_id = d.id`
  ),
  getDocumentCount: (d) => d.prepare('SELECT COUNT(*) as count FROM documents'),
  getChunkCount: (d) => d.prepare('SELECT COUNT(*) as count FROM chunks'),
  getQueryCount: (d) => d.prepare('SELECT COUNT(*) as count FROM queries'),
  insertQuery: (d) => d.prepare(
    'INSERT INTO queries (question, answer, sources, timing_ms) VALUES (?, ?, ?, ?)'
  ),

  createThread: (d) => d.prepare(
    'INSERT INTO threads (title) VALUES (?)'
  ),
  getThreads: (d) => d.prepare(
    'SELECT * FROM threads ORDER BY updated_at DESC'
  ),
  getThread: (d) => d.prepare(
    'SELECT * FROM threads WHERE id = ?'
  ),
  deleteThread: (d) => d.prepare(
    'DELETE FROM threads WHERE id = ?'
  ),
  updateThreadTimestamp: (d) => d.prepare(
    'UPDATE threads SET updated_at = datetime(\'now\') WHERE id = ?'
  ),
  insertMessage: (d) => d.prepare(
    'INSERT INTO messages (thread_id, role, content, metadata) VALUES (?, ?, ?, ?)'
  ),
  getThreadMessages: (d) => d.prepare(
    'SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC'
  ),
  deleteThreadMessages: (d) => d.prepare(
    'DELETE FROM messages WHERE thread_id = ?'
  ),
};
