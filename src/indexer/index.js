import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import config from '../config.js';
import { getDb, statements } from '../storage/db.js';
import { chunkMarkdown, chunkFaq } from './chunker.js';
import { embed } from '../embedder.js';

export async function indexAll() {
  const db = getDb();
  const existing = statements.getDocumentCount(db).get();
  if (existing.count > 0) {
    console.log(`[INDEXER] Already indexed ${existing.count} documents, skipping`);
    return;
  }

  console.log('[INDEXER] Starting indexing...');
  const startTime = Date.now();

  const docs = [];

  const faqPath = join(config.dataDir, 'faq.json');
  if (existsSync(faqPath)) {
    const faqData = JSON.parse(readFileSync(faqPath, 'utf-8'));
    for (const entry of faqData) {
      const chunks = chunkFaq(entry);
      docs.push({
        source: `faq:${entry.id}`,
        source_type: 'faq',
        title: entry.question,
        content: entry.answer,
        chunks,
      });
    }
    console.log(`[INDEXER] Loaded ${faqData.length} FAQ entries`);
  }

  const docsDir = join(config.dataDir, 'docs');
  if (existsSync(docsDir)) {
    const files = readdirSync(docsDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const content = readFileSync(join(docsDir, file), 'utf-8');
      const chunks = chunkMarkdown(content, file);
      docs.push({
        source: `doc:${file}`,
        source_type: 'markdown',
        title: file,
        content,
        chunks,
      });
      console.log(`[INDEXER] Loaded doc: ${file} (${chunks.length} chunks)`);
    }
  }

  const insertDoc = statements.insertDocument(db);
  const insertChunk = statements.insertChunk(db);
  let totalChunks = 0;
  const allChunkTexts = [];
  const chunkMeta = [];

  for (const doc of docs) {
    const result = insertDoc.run(doc.source, doc.source_type, doc.title, doc.content, '{}');
    const docId = result.lastInsertRowid;

    for (let i = 0; i < doc.chunks.length; i++) {
      allChunkTexts.push(doc.chunks[i].content);
      chunkMeta.push({ docId, index: i, heading: doc.chunks[i].heading });
      totalChunks++;
    }
  }

  console.log(`[INDEXER] Generating embeddings for ${totalChunks} chunks...`);
  const embeddings = await embed(allChunkTexts);

  for (let i = 0; i < totalChunks; i++) {
    const meta = chunkMeta[i];
    const embeddingBuffer = Buffer.from(new Float32Array(embeddings[i]).buffer);
    insertChunk.run(meta.docId, meta.index, allChunkTexts[i], meta.heading, embeddingBuffer, '{}');
  }

  const elapsed = Date.now() - startTime;
  console.log(`[INDEXER] Indexed ${docs.length} documents, ${totalChunks} chunks in ${elapsed}ms`);
}
