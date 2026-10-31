/**
 * URL deduplication store.
 *
 * Tracks which URLs have already been visited during a crawl to avoid
 * re-processing. URLs are hashed with xxHash64 before storage to minimise
 * memory consumption.
 *
 * Two back-ends are supported:
 *  - **In-memory** (default) — a plain `Set<string>` of hashes.
 *  - **Redis** — uses `SADD` / `SISMEMBER` on a per-scan key so state
 *    survives process restarts and can be shared across workers.
 */

import type { Redis } from 'ioredis';
import { hashUrl } from './url-utils.js';

/**
 * Redis key prefix. Full key: `blc:visited:{scanId}`
 */
const KEY_PREFIX = 'blc:visited:';

export class DedupStore {
  private set: Set<string> | null = null;
  private redis: Redis | null = null;
  private redisKey: string;

  /**
   * @param scanId — Unique scan identifier (used as part of the Redis key).
   * @param redis  — Optional ioredis instance. When provided the store
   *                 delegates to Redis; otherwise an in-memory Set is used.
   */
  constructor(scanId: string, redis?: Redis) {
    this.redisKey = `${KEY_PREFIX}${scanId}`;

    if (redis) {
      this.redis = redis;
    } else {
      this.set = new Set<string>();
    }
  }

  /**
   * Check whether the URL has already been recorded.
   */
  async has(url: string): Promise<boolean> {
    const hash = await hashUrl(url);

    if (this.redis) {
      const result = await this.redis.sismember(this.redisKey, hash);
      return result === 1;
    }

    return this.set!.has(hash);
  }

  /**
   * Mark a URL as visited.
   */
  async add(url: string): Promise<void> {
    const hash = await hashUrl(url);

    if (this.redis) {
      await this.redis.sadd(this.redisKey, hash);
      return;
    }

    this.set!.add(hash);
  }

  /**
   * Return the number of URLs recorded so far.
   */
  async size(): Promise<number> {
    if (this.redis) {
      return this.redis.scard(this.redisKey);
    }
    return this.set!.size;
  }

  /**
   * Remove all entries (useful for test teardown or scan reset).
   */
  async clear(): Promise<void> {
    if (this.redis) {
      await this.redis.del(this.redisKey);
      return;
    }
    this.set!.clear();
  }
}
