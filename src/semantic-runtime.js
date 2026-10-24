import { resolve } from 'node:path';
import { OllamaEmbeddings } from './embeddings.js';
import { SemanticCache, SemanticIndex } from './semantic-index.js';
import { InputError } from './validation.js';

export function createSemanticRuntime(inventory, env) {
  if (env.STORAGE_SEMANTIC_PREVIEW !== '1') return null;
  const embedder = new OllamaEmbeddings({
    baseUrl: env.STORAGE_EMBEDDING_URL, model: env.STORAGE_EMBEDDING_MODEL,
    modelRevision: env.STORAGE_EMBEDDING_REVISION,
    dimensions: Number(env.STORAGE_EMBEDDING_DIMENSIONS || 1024), apiKey: env.STORAGE_EMBEDDING_KEY || ''
  });
  const path = env.STORAGE_EMBEDDING_CACHE || (inventory.store.path === ':memory:' ? ':memory:' : `${inventory.store.path}.semantic.sqlite`);
  if (path !== ':memory:' && resolve(path) === resolve(inventory.store.path)) throw new InputError('Embedding cache must differ from the inventory database.');
  const cache = new SemanticCache(path);
  if (!cache.audit().ok) { cache.close(); throw new InputError('Semantic cache audit failed; rebuild the separate derived cache.'); }
  const index = new SemanticIndex({ inventory, cache, embedder });
  index.start();
  return { index, cache };
}
