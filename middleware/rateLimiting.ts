/**
 * Advanced Rate Limiting Middleware for Fashion LinUCB API
 *
 * Provides multi-tier rate limiting with different limits for various endpoints,
 * IP-based protection, and enhanced error responses with retry-after headers.
 */

import { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';

// Rate limiting configurations for different endpoint types
export const rateLimitConfigs = {
    // General API rate limit - 100 requests per minute
    general: rateLimit({
        windowMs: 60 * 1000, // 1 minute
        max: 100,
        message: {
            success: false,
            error: 'Rate limit exceeded',
            message: 'Too many requests. Please try again later.',
            retryAfter: '1 minute',
            limit: 100,
            windowMs: 60000
        },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req: Request) => {
            // Use IP address as the key for rate limiting
            return req.ip || req.connection.remoteAddress || 'unknown';
        },
        handler: (req: Request, res: Response) => {
            const retryAfter = Math.round(60000 / 1000); // Convert to seconds
            res.status(429).set({
                'Retry-After': retryAfter.toString(),
                'X-RateLimit-Limit': '100',
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': new Date(Date.now() + 60000).toISOString()
            }).json({
                success: false,
                error: 'Rate limit exceeded',
                message: `Too many requests. Please try again in ${retryAfter} seconds.`,
                retryAfter: `${retryAfter} seconds`,
                limit: 100,
                windowMs: 60000
            });
        }
    }),

    // Stricter limits for recommendation endpoints - 30 requests per minute
    recommendations: rateLimit({
        windowMs: 60 * 1000, // 1 minute
        max: 30,
        message: {
            success: false,
            error: 'Recommendation rate limit exceeded',
            message: 'Too many recommendation requests. Please try again later.',
            retryAfter: '1 minute',
            limit: 30,
            windowMs: 60000
        },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req: Request) => {
            return req.ip || req.connection.remoteAddress || 'unknown';
        },
        handler: (req: Request, res: Response) => {
            const retryAfter = Math.round(60000 / 1000);
            res.status(429).set({
                'Retry-After': retryAfter.toString(),
                'X-RateLimit-Limit': '30',
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': new Date(Date.now() + 60000).toISOString()
            }).json({
                success: false,
                error: 'Recommendation rate limit exceeded',
                message: `Too many recommendation requests. Please try again in ${retryAfter} seconds.`,
                retryAfter: `${retryAfter} seconds`,
                limit: 30,
                windowMs: 60000
            });
        }
    }),

    // Batch operation limits - 10 requests per minute (more expensive operations)
    batch: rateLimit({
        windowMs: 60 * 1000, // 1 minute
        max: 10,
        message: {
            success: false,
            error: 'Batch operation rate limit exceeded',
            message: 'Too many batch requests. Please try again later.',
            retryAfter: '1 minute',
            limit: 10,
            windowMs: 60000
        },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req: Request) => {
            return req.ip || req.connection.remoteAddress || 'unknown';
        },
        handler: (req: Request, res: Response) => {
            const retryAfter = Math.round(60000 / 1000);
            res.status(429).set({
                'Retry-After': retryAfter.toString(),
                'X-RateLimit-Limit': '10',
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': new Date(Date.now() + 60000).toISOString()
            }).json({
                success: false,
                error: 'Batch operation rate limit exceeded',
                message: `Too many batch requests. Please try again in ${retryAfter} seconds.`,
                retryAfter: `${retryAfter} seconds`,
                limit: 10,
                windowMs: 60000
            });
        }
    }),

    // Feedback endpoints - 50 requests per minute
    feedback: rateLimit({
        windowMs: 60 * 1000, // 1 minute
        max: 50,
        message: {
            success: false,
            error: 'Feedback rate limit exceeded',
            message: 'Too many feedback requests. Please try again later.',
            retryAfter: '1 minute',
            limit: 50,
            windowMs: 60000
        },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req: Request) => {
            return req.ip || req.connection.remoteAddress || 'unknown';
        },
        handler: (req: Request, res: Response) => {
            const retryAfter = Math.round(60000 / 1000);
            res.status(429).set({
                'Retry-After': retryAfter.toString(),
                'X-RateLimit-Limit': '50',
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': new Date(Date.now() + 60000).toISOString()
            }).json({
                success: false,
                error: 'Feedback rate limit exceeded',
                message: `Too many feedback requests. Please try again in ${retryAfter} seconds.`,
                retryAfter: `${retryAfter} seconds`,
                limit: 50,
                windowMs: 60000
            });
        }
    }),

    // Session creation - 5 sessions per minute (prevent abuse)
    session: rateLimit({
        windowMs: 60 * 1000, // 1 minute
        max: 5,
        message: {
            success: false,
            error: 'Session creation rate limit exceeded',
            message: 'Too many session creation requests. Please try again later.',
            retryAfter: '1 minute',
            limit: 5,
            windowMs: 60000
        },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req: Request) => {
            return req.ip || req.connection.remoteAddress || 'unknown';
        },
        handler: (req: Request, res: Response) => {
            const retryAfter = Math.round(60000 / 1000);
            res.status(429).set({
                'Retry-After': retryAfter.toString(),
                'X-RateLimit-Limit': '5',
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': new Date(Date.now() + 60000).toISOString()
            }).json({
                success: false,
                error: 'Session creation rate limit exceeded',
                message: `Too many session creation requests. Please try again in ${retryAfter} seconds.`,
                retryAfter: `${retryAfter} seconds`,
                limit: 5,
                windowMs: 60000
            });
        }
    })
};

// Enhanced rate limiting middleware that logs attempts
export const enhancedRateLimit = (limitType: keyof typeof rateLimitConfigs) => {
    const limiter = rateLimitConfigs[limitType];

    return (req: Request, res: Response, next: any) => {
        // Log rate limit attempts for monitoring
        const clientIP = req.ip || req.connection.remoteAddress || 'unknown';

        limiter(req, res, (err) => {
            if (err) {
                console.warn(`⚠️  Rate limit exceeded for ${limitType}: ${clientIP} - ${req.method} ${req.path}`);
            }
            next(err);
        });
    };
};

// IP whitelist for trusted sources (optional)
export const ipWhitelist = [
    '127.0.0.1',
    '::1',
    // Add trusted IPs here
];

// Bypass rate limiting for whitelisted IPs
export const skipRateLimitForWhitelist = (req: Request) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    return ipWhitelist.includes(clientIP || '');
};
