/**
 * Enhanced Type Definitions for Fashion LinUCB API Batch Operations
 *
 * Provides comprehensive TypeScript interfaces for batch operations,
 * enhanced features, and improved type safety.
 */

import { Request, Response } from 'express';
import { Collection } from 'mongodb';

// Base interfaces
export interface BatchRequest {
    id?: string;
    sessionId: string;
}

export interface BatchResponse {
    id?: string;
    success: boolean;
    data?: any;
    error?: string;
    message?: string;
}

// Batch Recommendation Types
export interface BatchRecommendationRequest extends BatchRequest {
    count?: number;
    filters?: {
        minPrice?: number;
        maxPrice?: number;
        category?: string;
        brand?: string;
        color?: string;
        style?: string;
        occasion?: string;
        season?: string;
    };
    diversitySettings?: {
        enableDiversity?: boolean;
        diversityWeight?: number;
        excludeRecent?: boolean;
    };
}

export interface BatchRecommendationRequestBody {
    requests: BatchRecommendationRequest[];
    globalSettings?: {
        defaultCount?: number;
        enableParallelProcessing?: boolean;
        includeDebugInfo?: boolean;
    };
}

export interface RecommendationResult {
    product: {
        product_id: string;
        _id?: any;
        id: string;
        name: string;
        brand: string;
        price: number;
        category?: string;
        color?: string;
        image?: string;
        product_url?: string;
        urls?: {
            image?: string;
            product?: string;
        };
        attributes?: any;
    };
    confidence_score: number;
    base_score: number;
    diversity_bonus?: number;
    exploration_bonus?: number;
    algorithm: string;
    reasoning?: string;
}

export interface BatchRecommendationResponse extends BatchResponse {
    data?: {
        recommendations: RecommendationResult[];
        user_stats?: any;
        debug_info?: any;
        processing_time_ms?: number;
    };
}

// Batch Feedback Types
export interface BatchFeedbackItem {
    sessionId: string;
    productId: string;
    action: 'love' | 'like' | 'dislike' | 'skip' | 'neutral';
    context?: {
        timestamp?: string;
        page?: string;
        position?: number;
        duration?: number;
        interactionType?: 'click' | 'view' | 'purchase' | 'share';
    };
}

export interface BatchFeedbackRequestBody {
    feedbacks: BatchFeedbackItem[];
    options?: {
        enableTransactions?: boolean;
        continueOnError?: boolean;
        updateModelImmediately?: boolean;
    };
}

export interface FeedbackResult {
    sessionId: string;
    productId: string;
    action: string;
    processed: boolean;
    modelUpdated: boolean;
    error?: string;
    processing_time_ms?: number;
}

export interface BatchFeedbackResponse {
    success: boolean;
    total_feedbacks: number;
    successful_feedbacks: number;
    failed_feedbacks: number;
    results: FeedbackResult[];
    processing_time_ms: number;
    errors?: string[];
}

// Caching Types
export interface CacheItem<T> {
    data: T;
    timestamp: number;
    ttl: number;
    hits: number;
}

export interface CacheStats {
    totalItems: number;
    hitRate: number;
    totalHits: number;
    totalMisses: number;
    memoryUsage: number;
    oldestItem: number;
    newestItem: number;
}

export interface RecommendationCacheKey {
    sessionId: string;
    filters: string; // JSON stringified filters
    count: number;
}

// Performance Monitoring Types
export interface RequestMetrics {
    timestamp: number;
    method: string;
    path: string;
    statusCode: number;
    responseTime: number;
    ip: string;
    userAgent?: string;
    sessionId?: string;
    errors?: string[];
}

export interface EndpointStats {
    totalRequests: number;
    successfulRequests: number;
    errorRequests: number;
    averageResponseTime: number;
    lastActivity: number;
}

export interface PerformanceMetrics {
    overview: {
        totalEndpoints: number;
        totalRequests: number;
        totalErrors: number;
        averageResponseTime: number;
        generatedAt: string;
    };
    endpoints: { [key: string]: EndpointStats & { errorRate: number; status: string; lastActivityAgo: string } };
}

// API Versioning Types
export interface ApiVersion {
    version: string;
    supported: boolean;
    deprecated: boolean;
    deprecationDate?: string;
    migrationGuide?: string;
}

export interface VersionedRequest extends Request {
    apiVersion: string;
    isDeprecated: boolean;
    migrationPath?: string;
}

// Enhanced Error Types
export interface EnhancedError extends Error {
    status: number;
    code: string;
    details?: any;
    timestamp: number;
    requestId?: string;
    context?: any;
}

export interface ErrorResponse {
    success: false;
    error: string;
    message: string;
    code?: string;
    details?: any;
    timestamp?: string;
    requestId?: string;
    retryAfter?: string;
}

// Database Types
export interface DatabaseCollections {
    products: Collection;
    user_sessions: Collection;
    interactions: Collection;
    session_history: Collection;
    performance_metrics?: Collection;
    cache_entries?: Collection;
}

export interface SessionDocument {
    session_id: string;
    user_id: string;
    algorithm: string;
    alpha: number;
    feature_dimensions: number;
    context: any;
    created_at: Date;
    updated_at: Date;
    status: 'active' | 'inactive' | 'expired';
    total_interactions: number;
    last_recommendation?: Date;
    cache_settings?: {
        enabled: boolean;
        ttl: number;
    };
}

export interface InteractionDocument {
    session_id: string;
    product_id: string;
    action: string;
    feature_vector: number[];
    reward: number;
    timestamp: Date;
    context?: any;
    batch_id?: string;
}

// Validation Types
export interface ValidationRule {
    field: string;
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    required: boolean;
    min?: number;
    max?: number;
    pattern?: RegExp;
    enum?: any[];
}

export interface ValidationResult {
    valid: boolean;
    errors: Array<{
        field: string;
        message: string;
        value?: any;
    }>;
}

// Rate Limiting Types
export interface RateLimitConfig {
    windowMs: number;
    max: number;
    message: any;
    keyGenerator: (req: Request) => string;
    handler: (req: Request, res: Response) => void;
}

export interface RateLimitStatus {
    limit: number;
    remaining: number;
    reset: Date;
    retryAfter?: number;
}

// System Health Types
export interface HealthCheck {
    status: 'healthy' | 'warning' | 'unhealthy';
    timestamp: string;
    metrics: {
        totalRequests: number;
        recentRequests: number;
        recentErrorRate: number;
        averageResponseTime: number;
        activeEndpoints: number;
        databaseStatus: 'connected' | 'disconnected' | 'error';
        cacheStatus: 'enabled' | 'disabled' | 'error';
    };
    thresholds: any;
}
