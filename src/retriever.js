import { getDb, statements } from './storage/db.js';
import { embedSingle } from './embedder.js';
import config from './config.js';

let cachedChunks = null;
let idfScores = null;

function loadChunks() {
  if (cachedChunks) return cachedChunks;
  const db = getDb();
  const rows = statements.getAllChunks(db).all();
  cachedChunks = rows.map(row => ({
    id: row.id,
    content: row.content,
    heading: row.heading,
    source: row.source,
    sourceType: row.source_type,
    title: row.title,
    metadata: JSON.parse(row.metadata || '{}'),
    embedding: row.embedding ? Array.from(new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4)) : null,
  }));
  console.log(`[RETRIEVER] Loaded ${cachedChunks.length} chunks into cache`);
  return cachedChunks;
}

function computeIdf(chunks) {
  if (idfScores) return idfScores;
  const docFreq = {};
  const totalDocs = chunks.length;

  for (const chunk of chunks) {
    const words = tokenize(chunk.content);
    const uniqueWords = new Set(words);
    for (const word of uniqueWords) {
      docFreq[word] = (docFreq[word] || 0) + 1;
    }
  }

  idfScores = {};
  for (const [word, freq] of Object.entries(docFreq)) {
    idfScores[word] = Math.log((totalDocs + 1) / (freq + 1)) + 1;
  }
  return idfScores;
}

function tokenize(text) {
  return text.toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function transliterate(text) {
  const map = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
  };
  return text.split('').map(c => map[c] || c).join('');
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dot / denominator;
}

export async function retrieve(query, topK, threshold) {
  topK = topK || config.retriever.topK;
  threshold = threshold || config.retriever.threshold;
  const chunks = loadChunks();
  const idf = computeIdf(chunks);

  const queryEmbedding = await embedSingle(query);
  const queryTokens = new Set(tokenize(query + ' ' + transliterate(query)));
  const queryTokenArray = [...queryTokens];

  const scored = chunks.map(chunk => {
    const sim = chunk.embedding ? cosineSimilarity(queryEmbedding, chunk.embedding) : 0;

    let keywordScore = 0;
    const chunkTokens = tokenize(chunk.content);
    let matchCount = 0;
    for (const qt of queryTokenArray) {
      for (const ct of chunkTokens) {
        if (ct.includes(qt) || qt.includes(ct)) {
          keywordScore += (idf[qt] || 1);
          matchCount++;
          break;
        }
      }
    }
    keywordScore = matchCount > 0 ? keywordScore / queryTokenArray.length : 0;

    const boost = config.retriever.keywordBoost;
    const finalScore = sim * (1 - boost) + keywordScore * boost;

    return { ...chunk, score: finalScore, semanticScore: sim, keywordScore };
  });

  const results = scored
    .filter(c => c.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  console.log(`[RETRIEVER] Query: "${query.slice(0, 50)}..." → ${results.length} results (top score: ${results[0]?.score?.toFixed(3) || 'none'})`);
  return results;
}

export function invalidateCache() {
  cachedChunks = null;
  idfScores = null;
}
