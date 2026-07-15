import { pipeline as loadPipeline, env } from '@xenova/transformers';
import config from './config.js';

let extractor = null;

env.cacheDir = `${config.rootDir}/.cache`;

async function loadModel() {
  if (!extractor) {
    console.log('[EMBEDDER] Loading model:', config.embedding.model);
    extractor = await loadPipeline('feature-extraction', config.embedding.model);
    console.log('[EMBEDDER] Model loaded');
  }
  return extractor;
}

export async function embed(texts) {
  const pipe = await loadModel();
  const results = [];
  const batchSize = config.embedding.batchSize;

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const outputs = await Promise.all(
      batch.map(async (text) => {
        const output = await pipe(text, { pooling: 'mean', normalize: true });
        return Array.from(output.data);
      })
    );
    results.push(...outputs);
  }

  return results;
}

export async function embedSingle(text) {
  const results = await embed([text]);
  return results[0];
}
