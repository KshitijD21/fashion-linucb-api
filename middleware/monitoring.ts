/**
 * Performance Monitoring Middleware for Fashion LinUCB API
 *
 * Provides comprehensive monitoring including request tracking, response time analysis,
 * usage pattern analytics, and performance metrics logging.
 */

import { NextFunction, Request, Response } from 'express';

// Performance metrics storage (in production, use proper monitoring service)
interface RequestMetrics {
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

interface EndpointStats {
    totalRequests: number;
    successfulRequests: number;
    errorRequests: number;
    averageResponseTime: number;
    lastActivity: number;
}

// In-memory metrics storage (use Redis/monitoring service in production)
const metricsStore = new Map<string, RequestMetrics[]>();
const endpointStats = new Map<string, EndpointStats>();

// Performance thresholds
const PERFORMANCE_THRESHOLDS = {
    SLOW_REQUEST_MS: 1000,
    VERY_SLOW_REQUEST_MS: 3000,
    ERROR_RATE_THRESHOLD: 0.1, // 10%
    METRICS_RETENTION_HOURS: 24
};

/**
 * Initialize performance monitoring for an endpoint
 */
function initializeEndpointStats(endpoint: string): EndpointStats {
    return {
        totalRequests: 0,
        successfulRequests: 0,
        errorRequests: 0,
        averageResponseTime: 0,
        lastActivity: Date.now()
    };
}

/**
 * Update endpoint statistics
 */
function updateEndpointStats(endpoint: string, responseTime: number, isError: boolean): void {
    let stats = endpointStats.get(endpoint);
    if (!stats) {
        stats = initializeEndpointStats(endpoint);
        endpointStats.set(endpoint, stats);
    }

    stats.totalRequests++;
    stats.lastActivity = Date.now();

    if (isError) {
        stats.errorRequests++;
    } else {
        stats.successfulRequests++;
    }

    // Update average response time using exponential moving average
    const alpha = 0.1; // Smoothing factor
    stats.averageResponseTime = stats.averageResponseTime === 0
        ? responseTime
        : alpha * responseTime + (1 - alpha) * stats.averageResponseTime;
}

/**
 * Main performance monitoring middleware
 */
export const performanceMonitoring = (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();
    const endpoint = `${req.method} ${req.route?.path || req.path}`;

    // Store request start time
    res.locals.startTime = startTime;
    res.locals.endpoint = endpoint;

    // Override res.end to capture response metrics
    const originalEnd = res.end.bind(res);
    res.end = function(chunk?: any, encoding?: any, cb?: any) {
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        const isError = res.statusCode >= 400;

        // Create metrics record
        const metrics: RequestMetrics = {
            timestamp: startTime,
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            responseTime,
            ip: req.ip || req.connection.remoteAddress || 'unknown',
            userAgent: req.get('User-Agent'),
            sessionId: req.params.sessionId || req.body?.session_id,
            errors: isError ? [res.statusMessage || 'Unknown error'] : undefined
        };

        // Store metrics
        if (!metricsStore.has(endpoint)) {
            metricsStore.set(endpoint, []);
        }
        metricsStore.get(endpoint)!.push(metrics);

        // Update endpoint statistics
        updateEndpointStats(endpoint, responseTime, isError);

        // Log performance warnings
        if (responseTime > PERFORMANCE_THRESHOLDS.VERY_SLOW_REQUEST_MS) {
            console.warn(`🐌 Very slow request: ${endpoint} took ${responseTime}ms`);
        } else if (responseTime > PERFORMANCE_THRESHOLDS.SLOW_REQUEST_MS) {
            console.warn(`⏱️  Slow request: ${endpoint} took ${responseTime}ms`);
        }

        if (isError) {
            console.error(`❌ Error response: ${endpoint} returned ${res.statusCode}`);
        }

        // Call original end method with proper signature
        return originalEnd(chunk, encoding, cb);
    } as any;

    next();
};

/**
 * Middleware to log API usage patterns
 */
export const usagePatternLogger = (req: Request, res: Response, next: NextFunction): void => {
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';
    const sessionId = req.params.sessionId || req.body?.session_id;

    // Log usage pattern
    console.log(`📊 API Usage: ${req.method} ${req.path} | IP: ${clientIP} | Session: ${sessionId || 'none'} | UA: ${userAgent.substring(0, 50)}...`);

    next();
};

/**
 * Clean up old metrics data periodically
 */
export const cleanupMetrics = (): void => {
    const cutoffTime = Date.now() - (PERFORMANCE_THRESHOLDS.METRICS_RETENTION_HOURS * 60 * 60 * 1000);

    for (const [endpoint, metrics] of metricsStore.entries()) {
        const filteredMetrics = metrics.filter(metric => metric.timestamp > cutoffTime);
        if (filteredMetrics.length === 0) {
            metricsStore.delete(endpoint);
        } else {
            metricsStore.set(endpoint, filteredMetrics);
        }
    }

    console.log(`🧹 Cleaned up old metrics. Current endpoints tracked: ${metricsStore.size}`);
};

// Clean up metrics every hour
setInterval(cleanupMetrics, 60 * 60 * 1000);

/**
 * Get performance metrics for all endpoints
 */
export const getPerformanceMetrics = (): any => {
    const now = Date.now();
    const metrics: any = {
        overview: {
            totalEndpoints: endpointStats.size,
            totalRequests: 0,
            totalErrors: 0,
            averageResponseTime: 0,
            generatedAt: new Date(now).toISOString()
        },
        endpoints: {}
    };

    let totalResponseTime = 0;
    let totalRequests = 0;

    // Aggregate endpoint statistics
    for (const [endpoint, stats] of endpointStats.entries()) {
        const errorRate = stats.totalRequests > 0 ? stats.errorRequests / stats.totalRequests : 0;

        metrics.endpoints[endpoint] = {
            ...stats,
            errorRate: Math.round(errorRate * 10000) / 100, // Percentage with 2 decimals
            averageResponseTime: Math.round(stats.averageResponseTime * 100) / 100,
            status: getEndpointHealthStatus(stats),
            lastActivityAgo: `${Math.round((now - stats.lastActivity) / 1000)}s ago`
        };

        totalRequests += stats.totalRequests;
        totalResponseTime += stats.averageResponseTime * stats.totalRequests;
        metrics.overview.totalErrors += stats.errorRequests;
    }

    metrics.overview.totalRequests = totalRequests;
    metrics.overview.averageResponseTime = totalRequests > 0
        ? Math.round((totalResponseTime / totalRequests) * 100) / 100
        : 0;

    return metrics;
};

/**
 * Determine endpoint health status
 */
function getEndpointHealthStatus(stats: EndpointStats): string {
    const errorRate = stats.totalRequests > 0 ? stats.errorRequests / stats.totalRequests : 0;

    if (errorRate > PERFORMANCE_THRESHOLDS.ERROR_RATE_THRESHOLD) {
        return 'unhealthy';
    }

    if (stats.averageResponseTime > PERFORMANCE_THRESHOLDS.VERY_SLOW_REQUEST_MS) {
        return 'slow';
    }

    if (stats.averageResponseTime > PERFORMANCE_THRESHOLDS.SLOW_REQUEST_MS) {
        return 'warning';
    }

    return 'healthy';
}

/**
 * Get recent request metrics for analysis
 */
export const getRecentMetrics = (endpoint?: string, limitMinutes: number = 60): RequestMetrics[] => {
    const cutoffTime = Date.now() - (limitMinutes * 60 * 1000);

    if (endpoint) {
        const endpointMetrics = metricsStore.get(endpoint) || [];
        return endpointMetrics.filter(metric => metric.timestamp > cutoffTime);
    }

    // Return all recent metrics across all endpoints
    const allMetrics: RequestMetrics[] = [];
    for (const metrics of metricsStore.values()) {
        allMetrics.push(...metrics.filter(metric => metric.timestamp > cutoffTime));
    }

    return allMetrics.sort((a, b) => b.timestamp - a.timestamp);
};

/**
 * Middleware to track database operation performance
 */
export const trackDatabasePerformance = (operationType: string) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        const startTime = Date.now();

        // Store operation info
        res.locals.dbOperation = {
            type: operationType,
            startTime
        };

        // Override response to track DB operation time
        const originalJson = res.json;
        res.json = function(obj: any) {
            const dbOperationTime = Date.now() - startTime;

            if (dbOperationTime > 500) { // Log slow DB operations
                console.warn(`🗄️  Slow database operation: ${operationType} took ${dbOperationTime}ms`);
            }

            return originalJson.call(this, obj);
        };

        next();
    };
};

/**
 * Get system health status
 */
export const getSystemHealth = (): any => {
    const metrics = getPerformanceMetrics();
    const recentMetrics = getRecentMetrics(undefined, 10); // Last 10 minutes

    const recentErrorRate = recentMetrics.length > 0
        ? recentMetrics.filter(m => m.statusCode >= 400).length / recentMetrics.length
        : 0;

    const avgRecentResponseTime = recentMetrics.length > 0
        ? recentMetrics.reduce((sum, m) => sum + m.responseTime, 0) / recentMetrics.length
        : 0;

    return {
        status: recentErrorRate > PERFORMANCE_THRESHOLDS.ERROR_RATE_THRESHOLD ? 'unhealthy' : 'healthy',
        timestamp: new Date().toISOString(),
        metrics: {
            totalRequests: metrics.overview.totalRequests,
            recentRequests: recentMetrics.length,
            recentErrorRate: Math.round(recentErrorRate * 10000) / 100,
            averageResponseTime: Math.round(avgRecentResponseTime * 100) / 100,
            activeEndpoints: metrics.overview.totalEndpoints
        },
        thresholds: PERFORMANCE_THRESHOLDS
    };
};
