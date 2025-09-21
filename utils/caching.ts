/**
 * Recommendation Caching System for Fashion LinUCB API
 *
 * Provides in-memory caching for recommendations to reduce database queries
 * and improve response times. In production, replace with Redis or similar.
 */

import crypto from 'crypto';

interface CacheItem<T> {
    data: T;
    timestamp: number;
    ttl: number;
    hits: number;
    sessionId: string;
    size: number;
}

interface CacheStats {
    totalItems: number;
    hitRate: number;
    totalHits: number;
    totalMisses: number;
    memoryUsage: number;
    oldestItem: number;
    newestItem: number;
}

class RecommendationCache {
    private cache = new Map<string, CacheItem<any>>();
    private hitCount = 0;
    private missCount = 0;
    private maxSize: number;
    private defaultTTL: number;
    private cleanupInterval: NodeJS.Timeout;

    constructor(maxSize = 1000, defaultTTL = 300000) { // 5 minutes default TTL
        this.maxSize = maxSize;
        this.defaultTTL = defaultTTL;

        // Clean up expired items every minute
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpired();
        }, 60000);
    }

    /**
     * Generate a cache key from recommendation parameters
     */
    private generateKey(sessionId: string, filters: any, count: number): string {
        const keyData = {
            sessionId,
            filters: filters || {},
            count
        };

        const keyString = JSON.stringify(keyData, Object.keys(keyData).sort());
        return crypto.createHash('md5').update(keyString).digest('hex');
    }

    /**
     * Store recommendation result in cache
     */
    set(sessionId: string, filters: any, count: number, data: any, ttl?: number): void {
        const key = this.generateKey(sessionId, filters, count);
        const expiry = ttl || this.defaultTTL;
        const dataSize = this.estimateSize(data);

        // If cache is full, remove oldest items
        while (this.cache.size >= this.maxSize) {
            this.removeOldest();
        }

        const cacheItem: CacheItem<any> = {
            data,
            timestamp: Date.now(),
            ttl: expiry,
            hits: 0,
            sessionId,
            size: dataSize
        };

        this.cache.set(key, cacheItem);

        console.log(`💾 Cached recommendation for session ${sessionId}, size: ${dataSize} bytes`);
    }

    /**
     * Retrieve recommendation from cache
     */
    get(sessionId: string, filters: any, count: number): any | null {
        const key = this.generateKey(sessionId, filters, count);
        const item = this.cache.get(key);

        if (!item) {
            this.missCount++;
            return null;
        }

        // Check if item has expired
        if (Date.now() - item.timestamp > item.ttl) {
            this.cache.delete(key);
            this.missCount++;
            return null;
        }

        // Update hit count and access time
        item.hits++;
        this.hitCount++;

        console.log(`🎯 Cache hit for session ${sessionId}, hits: ${item.hits}`);
        return item.data;
    }

    /**
     * Invalidate all cache entries for a specific session
     */
    invalidateSession(sessionId: string): void {
        let removedCount = 0;

        for (const [key, item] of this.cache.entries()) {
            if (item.sessionId === sessionId) {
                this.cache.delete(key);
                removedCount++;
            }
        }

        if (removedCount > 0) {
            console.log(`🗑️  Invalidated ${removedCount} cache entries for session ${sessionId}`);
        }
    }

    /**
     * Invalidate cache entries that contain specific product
     */
    invalidateProduct(productId: string): void {
        let removedCount = 0;

        for (const [key, item] of this.cache.entries()) {
            // Check if cached recommendations contain this product
            if (this.containsProduct(item.data, productId)) {
                this.cache.delete(key);
                removedCount++;
            }
        }

        if (removedCount > 0) {
            console.log(`🗑️  Invalidated ${removedCount} cache entries containing product ${productId}`);
        }
    }

    /**
     * Check if cached data contains a specific product
     */
    private containsProduct(data: any, productId: string): boolean {
        if (!data || !data.recommendations) return false;

        return data.recommendations.some((rec: any) =>
            rec.product?.product_id === productId || rec.product?.id === productId
        );
    }

    /**
     * Remove oldest cache item
     */
    private removeOldest(): void {
        let oldestKey = '';
        let oldestTime = Date.now();

        for (const [key, item] of this.cache.entries()) {
            if (item.timestamp < oldestTime) {
                oldestTime = item.timestamp;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            this.cache.delete(oldestKey);
        }
    }

    /**
     * Clean up expired cache items
     */
    private cleanupExpired(): void {
        const now = Date.now();
        let removedCount = 0;

        for (const [key, item] of this.cache.entries()) {
            if (now - item.timestamp > item.ttl) {
                this.cache.delete(key);
                removedCount++;
            }
        }

        if (removedCount > 0) {
            console.log(`🧹 Cleaned up ${removedCount} expired cache entries`);
        }
    }

    /**
     * Estimate memory size of data (rough calculation)
     */
    private estimateSize(data: any): number {
        try {
            return new Blob([JSON.stringify(data)]).size;
        } catch {
            // Fallback estimation
            return JSON.stringify(data).length * 2; // Rough estimate
        }
    }

    /**
     * Get cache statistics
     */
    getStats(): CacheStats {
        const now = Date.now();
        let totalSize = 0;
        let oldest = now;
        let newest = 0;

        for (const item of this.cache.values()) {
            totalSize += item.size;
            if (item.timestamp < oldest) oldest = item.timestamp;
            if (item.timestamp > newest) newest = item.timestamp;
        }

        const totalRequests = this.hitCount + this.missCount;

        return {
            totalItems: this.cache.size,
            hitRate: totalRequests > 0 ? (this.hitCount / totalRequests) * 100 : 0,
            totalHits: this.hitCount,
            totalMisses: this.missCount,
            memoryUsage: totalSize,
            oldestItem: oldest === now ? 0 : oldest,
            newestItem: newest
        };
    }

    /**
     * Clear all cache entries
     */
    clear(): void {
        const itemCount = this.cache.size;
        this.cache.clear();
        this.hitCount = 0;
        this.missCount = 0;
        console.log(`🗑️  Cleared ${itemCount} cache entries`);
    }

    /**
     * Get cache entries for a specific session
     */
    getSessionEntries(sessionId: string): Array<{ key: string; item: CacheItem<any> }> {
        const entries: Array<{ key: string; item: CacheItem<any> }> = [];

        for (const [key, item] of this.cache.entries()) {
            if (item.sessionId === sessionId) {
                entries.push({ key, item });
            }
        }

        return entries;
    }

    /**
     * Warm up cache with popular recommendations
     */
    async warmup(collections: any, popularSessions: string[] = []): Promise<void> {
        console.log('🔥 Warming up recommendation cache...');

        // This would typically fetch and cache popular recommendations
        // Implementation depends on your specific use case

        console.log(`🔥 Cache warmup completed for ${popularSessions.length} sessions`);
    }

    /**
     * Cleanup resources
     */
    destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.clear();
    }
}

// Singleton instance
const recommendationCache = new RecommendationCache(
    parseInt(process.env.CACHE_MAX_SIZE || '1000', 10),
    parseInt(process.env.CACHE_TTL_MS || '300000', 10)
);

export { RecommendationCache, recommendationCache };
export type { CacheItem, CacheStats };
