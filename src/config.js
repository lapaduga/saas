import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');

dotenvConfig({ path: resolve(root, '.env') });

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  dbPath: resolve(root, process.env.DB_PATH || './data/support.db'),
  llm: {
    model: process.env.CHAT_MODEL || 'deepseek-v4-pro',
    baseUrl: process.env.CHAT_BASE_URL || 'https://api.deepseek.com',
    apiKey: process.env.CHAT_API_KEY || '',
    temperature: 0.3,
    maxTokens: 2048,
  },
  embedding: {
    model: process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2',
    dimensions: parseInt(process.env.EMBEDDING_DIMENSION || '384', 10),
    batchSize: parseInt(process.env.EMBEDDING_BATCH_SIZE || '20', 10),
  },
  retriever: {
    threshold: 0.25,
    topK: 10,
    keywordBoost: 0.3,
  },
  pipeline: {
    maxToolSteps: 3,
  },
  rateLimit: {
    windowMs: 60 * 1000,
    maxRequests: 30,
  },
  bodyLimit: '1mb',
  dataDir: resolve(root, 'data'),
  publicDir: resolve(root, 'public'),
  rootDir: root,
};

export default config;
