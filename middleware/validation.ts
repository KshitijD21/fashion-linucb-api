/**
 * Request Validation Middleware for Fashion LinUCB API
 *
 * Provides comprehensive request validation, duplicate request prevention,
 * and data integrity checks using express-validator and custom logic.
 */

import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';

// In-memory store for recent request hashes (in production, use Redis)
const recentRequestHashes = new Map<string, number>();
const REQUEST_DUPLICATE_WINDOW = 30000; // 30 seconds

// Clean up old request hashes periodically
setInterval(() => {
    const now = Date.now();
    for (const [hash, timestamp] of recentRequestHashes.entries()) {
        if (now - timestamp > REQUEST_DUPLICATE_WINDOW) {
            recentRequestHashes.delete(hash);
        }
    }
}, 60000); // Clean every minute

/**
 * Generate a hash for the request to detect duplicates
 */
function generateRequestHash(req: Request): string {
    const identifier = [
        req.ip || req.connection.remoteAddress,
        req.method,
        req.path,
        JSON.stringify(req.body),
        JSON.stringify(req.query)
    ].join('|');

    return crypto.createHash('sha256').update(identifier).digest('hex');
}

/**
 * Middleware to prevent duplicate requests within a time window
 */
export const preventDuplicateRequests = (req: Request, res: Response, next: NextFunction): void => {
    // Skip duplicate checking for GET requests (they should be idempotent)
    if (req.method === 'GET') {
        next();
        return;
    }

    const requestHash = generateRequestHash(req);
    const now = Date.now();
    const lastRequestTime = recentRequestHashes.get(requestHash);

    if (lastRequestTime && (now - lastRequestTime) < REQUEST_DUPLICATE_WINDOW) {
        res.status(409).json({
            success: false,
            error: 'Duplicate request detected',
            message: 'This request was already processed recently. Please wait before retrying.',
            retryAfter: `${Math.ceil((REQUEST_DUPLICATE_WINDOW - (now - lastRequestTime)) / 1000)} seconds`
        });
        return;
    }

    // Store the request hash with current timestamp
    recentRequestHashes.set(requestHash, now);
    next();
};

/**
 * Validation rules for session creation
 */
export const validateSessionCreation = [
    body('userId')
        .notEmpty()
        .withMessage('User ID is required')
        .isLength({ min: 1, max: 100 })
        .withMessage('User ID must be between 1 and 100 characters')
        .matches(/^[a-zA-Z0-9_-]+$/)
        .withMessage('User ID can only contain alphanumeric characters, underscores, and hyphens'),

    body('context.age')
        .optional()
        .isInt({ min: 13, max: 120 })
        .withMessage('Age must be between 13 and 120'),

    body('context.gender')
        .optional()
        .isIn(['male', 'female', 'other', 'prefer_not_to_say'])
        .withMessage('Gender must be one of: male, female, other, prefer_not_to_say'),

    body('context.location')
        .optional()
        .isLength({ max: 100 })
        .withMessage('Location must be less than 100 characters'),

    body('context.preferences')
        .optional()
        .isArray({ max: 10 })
        .withMessage('Preferences must be an array with maximum 10 items'),

    body('context.preferences.*')
        .optional()
        .isLength({ min: 1, max: 50 })
        .withMessage('Each preference must be between 1 and 50 characters')
];

/**
 * Validation rules for recommendation requests
 */
export const validateRecommendationRequest = [
    param('sessionId')
        .isUUID(4)
        .withMessage('Session ID must be a valid UUID'),

    query('count')
        .optional()
        .isInt({ min: 1, max: 20 })
        .withMessage('Count must be between 1 and 20'),

    query('category')
        .optional()
        .isLength({ min: 1, max: 50 })
        .withMessage('Category must be between 1 and 50 characters'),

    query('price_min')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Minimum price must be a positive number'),

    query('price_max')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Maximum price must be a positive number'),

    query('brand')
        .optional()
        .isLength({ min: 1, max: 50 })
        .withMessage('Brand must be between 1 and 50 characters')
];

/**
 * Validation rules for batch recommendation requests
 */
export const validateBatchRecommendationRequest = [
    body('requests')
        .isArray({ min: 1, max: 10 })
        .withMessage('Requests array must contain between 1 and 10 items'),

    body('requests.*.sessionId')
        .isUUID(4)
        .withMessage('Each session ID must be a valid UUID'),

    body('requests.*.count')
        .optional()
        .isInt({ min: 1, max: 10 })
        .withMessage('Each count must be between 1 and 10'),

    body('requests.*.filters')
        .optional()
        .isObject()
        .withMessage('Filters must be an object'),

    body('requests.*.filters.category')
        .optional()
        .isLength({ min: 1, max: 50 })
        .withMessage('Category filter must be between 1 and 50 characters')
];

/**
 * Validation rules for feedback submission
 */
export const validateFeedbackRequest = [
    body('session_id')
        .isUUID(4)
        .withMessage('Session ID must be a valid UUID'),

    body('product_id')
        .notEmpty()
        .withMessage('Product ID is required')
        .isLength({ min: 1, max: 100 })
        .withMessage('Product ID must be between 1 and 100 characters'),

    body('action')
        .isIn(['love', 'like', 'dislike', 'skip', 'neutral'])
        .withMessage('Action must be one of: love, like, dislike, skip, neutral'),

    body('context.timestamp')
        .optional()
        .isISO8601()
        .withMessage('Timestamp must be a valid ISO 8601 date'),

    body('context.page')
        .optional()
        .isLength({ min: 1, max: 50 })
        .withMessage('Page must be between 1 and 50 characters'),

    body('context.position')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Position must be a non-negative integer')
];

/**
 * Validation rules for batch feedback requests
 */
export const validateBatchFeedbackRequest = [
    body('feedbacks')
        .isArray({ min: 1, max: 50 })
        .withMessage('Feedbacks array must contain between 1 and 50 items'),

    body('feedbacks.*.session_id')
        .isUUID(4)
        .withMessage('Each session ID must be a valid UUID'),

    body('feedbacks.*.product_id')
        .notEmpty()
        .withMessage('Each product ID is required')
        .isLength({ min: 1, max: 100 })
        .withMessage('Each product ID must be between 1 and 100 characters'),

    body('feedbacks.*.action')
        .isIn(['love', 'like', 'dislike', 'skip', 'neutral'])
        .withMessage('Each action must be one of: love, like, dislike, skip, neutral'),

    body('feedbacks.*.context.timestamp')
        .optional()
        .isISO8601()
        .withMessage('Each timestamp must be a valid ISO 8601 date')
];

/**
 * Middleware to handle validation errors
 */
export const handleValidationErrors = (req: Request, res: Response, next: NextFunction): void => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        const formattedErrors = errors.array().map(error => ({
            field: error.type === 'field' ? error.path : 'unknown',
            message: error.msg,
            value: error.type === 'field' ? error.value : undefined
        }));

        res.status(400).json({
            success: false,
            error: 'Validation failed',
            message: 'Request validation failed. Please check your input.',
            details: formattedErrors
        });
        return;
    }

    next();
};

/**
 * Middleware to validate session exists in database
 */
export const validateSessionExists = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { collections } = req.app.locals;
        if (!collections) {
            res.status(503).json({
                success: false,
                error: 'Database not connected',
                message: 'Please check MongoDB connection'
            });
            return;
        }

        const sessionId = req.params.sessionId || req.body.session_id;
        if (!sessionId) {
            res.status(400).json({
                success: false,
                error: 'Session ID missing',
                message: 'Session ID is required'
            });
            return;
        }

        const session = await collections.user_sessions.findOne({ session_id: sessionId });
        if (!session) {
            res.status(404).json({
                success: false,
                error: 'Session not found',
                message: 'The specified session does not exist or has expired'
            });
            return;
        }

        if (session.status !== 'active') {
            res.status(410).json({
                success: false,
                error: 'Session inactive',
                message: 'The specified session is no longer active'
            });
            return;
        }

        next();
    } catch (error) {
        console.error('❌ Session validation error:', error);
        res.status(500).json({
            success: false,
            error: 'Session validation failed',
            message: 'Failed to validate session'
        });
    }
};

/**
 * Middleware to sanitize and normalize request data
 */
export const sanitizeRequest = (req: Request, res: Response, next: NextFunction): void => {
    // Trim string values in body
    if (req.body && typeof req.body === 'object') {
        const sanitizeObject = (obj: any): any => {
            for (const key in obj) {
                if (typeof obj[key] === 'string') {
                    obj[key] = obj[key].trim();
                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                    sanitizeObject(obj[key]);
                }
            }
        };
        sanitizeObject(req.body);
    }

    // Normalize query parameters
    if (req.query) {
        for (const key in req.query) {
            if (typeof req.query[key] === 'string') {
                req.query[key] = (req.query[key] as string).trim();
            }
        }
    }

    next();
};
