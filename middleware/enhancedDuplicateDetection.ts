/**
 * Enhanced Duplicate Detection & Conflict Handling for Fashion LinUCB API
 *
 * Provides intelligent duplicate detection with idempotency key support,
 * contextual conflict handling, and optimized feedback processing.
 */

import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';

// Enhanced duplicate detection with multiple tracking strategies
interface DuplicateRecord {
    timestamp: number;
    sessionId?: string;
    productId?: string;
    action?: string;
    idempotencyKey?: string;
    requestHash: string;
    method: string;
    path: string;
    ip: string;
}

interface FeedbackRecord {
    sessionId: string;
    productId: string;
    action: string;
    timestamp: number;
    idempotencyKey?: string;
    processed: boolean;
    ip: string;
}

interface ConflictInfo {
    type: 'duplicate_request' | 'feedback_conflict' | 'rapid_feedback' | 'batch_conflict';
    originalTimestamp: number;
    conflictReason: string;
    allowRetryAfter?: number;
    suggestedAction?: string;
}

// Enhanced storage with different windows for different scenarios
const recentRequestHashes = new Map<string, DuplicateRecord>();
const feedbackHistory = new Map<string, FeedbackRecord>();
const idempotencyKeys = new Map<string, DuplicateRecord>();

// Configuration for different duplicate detection windows
const DUPLICATE_WINDOWS = {
    GENERAL_REQUEST: 30000,      // 30 seconds for general requests
    FEEDBACK_SAME_PRODUCT: 60000, // 60 seconds for same product feedback
    RAPID_FEEDBACK: 5000,        // 5 seconds for rapid feedback prevention
    IDEMPOTENCY_WINDOW: 86400000, // 24 hours for idempotency keys
};

// Cleanup intervals
setInterval(() => cleanupExpiredRecords(), 60000); // Clean every minute

/**
 * Generate enhanced request hash with optional idempotency key
 */
function generateEnhancedRequestHash(req: Request): { hash: string; feedbackKey?: string } {
    const baseIdentifier = [
        req.ip || req.connection.remoteAddress,
        req.method,
        req.path,
        JSON.stringify(req.body),
        JSON.stringify(req.query)
    ].join('|');

    const hash = crypto.createHash('sha256').update(baseIdentifier).digest('hex');

    // Generate feedback-specific key if this is a feedback request
    let feedbackKey;
    if (req.body && req.body.session_id && req.body.product_id) {
        feedbackKey = `${req.body.session_id}:${req.body.product_id}:${req.body.action}`;
    }

    return { hash, feedbackKey };
}

/**
 * Check for feedback-specific conflicts
 */
function checkFeedbackConflict(
    sessionId: string,
    productId: string,
    action: string,
    idempotencyKey?: string
): ConflictInfo | null {
    const feedbackKey = `${sessionId}:${productId}:${action}`;
    const existingFeedback = feedbackHistory.get(feedbackKey);
    const now = Date.now();

    if (existingFeedback) {
        const timeSinceLastFeedback = now - existingFeedback.timestamp;

        // Allow feedback if enough time has passed (60+ seconds)
        if (timeSinceLastFeedback >= DUPLICATE_WINDOWS.FEEDBACK_SAME_PRODUCT) {
            return null; // No conflict, user can change their mind
        }

        // Check if it's the same idempotency key (allowed retry)
        if (idempotencyKey && existingFeedback.idempotencyKey === idempotencyKey) {
            return null; // Same idempotency key, allowed
        }

        // Check for rapid feedback (less than 5 seconds)
        if (timeSinceLastFeedback < DUPLICATE_WINDOWS.RAPID_FEEDBACK) {
            return {
                type: 'rapid_feedback',
                originalTimestamp: existingFeedback.timestamp,
                conflictReason: 'Feedback submitted too quickly after previous feedback',
                allowRetryAfter: Math.ceil((DUPLICATE_WINDOWS.RAPID_FEEDBACK - timeSinceLastFeedback) / 1000),
                suggestedAction: 'Please wait a moment before submitting feedback'
            };
        }

        // Regular feedback conflict (same product within 60 seconds)
        return {
            type: 'feedback_conflict',
            originalTimestamp: existingFeedback.timestamp,
            conflictReason: 'Same feedback for this product was already submitted recently',
            allowRetryAfter: Math.ceil((DUPLICATE_WINDOWS.FEEDBACK_SAME_PRODUCT - timeSinceLastFeedback) / 1000),
            suggestedAction: 'Wait 60 seconds to change your feedback for this product'
        };
    }

    return null;
}

/**
 * Enhanced duplicate request prevention with contextual handling
 */
export const enhancedDuplicateDetection = (req: Request, res: Response, next: NextFunction): void => {
    // Skip duplicate checking for GET requests
    if (req.method === 'GET') {
        next();
        return;
    }

    const { hash, feedbackKey } = generateEnhancedRequestHash(req);
    const now = Date.now();
    const idempotencyKey = req.headers['idempotency-key'] as string || req.body?.idempotency_key;

    // Check idempotency key first if provided
    if (idempotencyKey) {
        const existingIdempotent = idempotencyKeys.get(idempotencyKey);
        if (existingIdempotent) {
            const timeSinceRequest = now - existingIdempotent.timestamp;

            if (timeSinceRequest < DUPLICATE_WINDOWS.IDEMPOTENCY_WINDOW) {
                // Return the same response for idempotent requests
                res.status(200).json({
                    success: true,
                    message: 'Request already processed (idempotent)',
                    idempotency_key: idempotencyKey,
                    processed_at: new Date(existingIdempotent.timestamp).toISOString(),
                    duplicate_detection: {
                        type: 'idempotent_retry',
                        original_timestamp: existingIdempotent.timestamp
                    }
                });
                return;
            }
        }
    }

    // Special handling for feedback requests
    if (feedbackKey && req.body?.session_id && req.body?.product_id && req.body?.action) {
        const conflict = checkFeedbackConflict(
            req.body.session_id,
            req.body.product_id,
            req.body.action,
            idempotencyKey
        );

        if (conflict) {
            res.status(409).json({
                success: false,
                error: 'Feedback conflict detected',
                message: conflict.conflictReason,
                conflict_info: {
                    type: conflict.type,
                    already_processed_at: new Date(conflict.originalTimestamp).toISOString(),
                    retry_after_seconds: conflict.allowRetryAfter,
                    suggested_action: conflict.suggestedAction,
                    current_timestamp: new Date().toISOString()
                },
                feedback_details: {
                    session_id: req.body.session_id,
                    product_id: req.body.product_id,
                    action: req.body.action,
                    time_since_last_feedback: Math.ceil((now - conflict.originalTimestamp) / 1000)
                }
            });
            return;
        }

        // Record new feedback
        feedbackHistory.set(feedbackKey, {
            sessionId: req.body.session_id,
            productId: req.body.product_id,
            action: req.body.action,
            timestamp: now,
            idempotencyKey,
            processed: false,
            ip: req.ip || req.connection.remoteAddress || 'unknown'
        });
    }

    // General duplicate request checking
    const existingRequest = recentRequestHashes.get(hash);
    if (existingRequest && (now - existingRequest.timestamp) < DUPLICATE_WINDOWS.GENERAL_REQUEST) {
        res.status(409).json({
            success: false,
            error: 'Duplicate request detected',
            message: 'Identical request was already processed recently',
            conflict_info: {
                type: 'duplicate_request',
                already_processed_at: new Date(existingRequest.timestamp).toISOString(),
                retry_after_seconds: Math.ceil((DUPLICATE_WINDOWS.GENERAL_REQUEST - (now - existingRequest.timestamp)) / 1000),
                suggested_action: 'Please wait before retrying the same request',
                current_timestamp: new Date().toISOString()
            },
            request_details: {
                method: req.method,
                path: req.path,
                time_since_last_request: Math.ceil((now - existingRequest.timestamp) / 1000)
            }
        });
        return;
    }

    // Store the new request
    const record: DuplicateRecord = {
        timestamp: now,
        sessionId: req.body?.session_id,
        productId: req.body?.product_id,
        action: req.body?.action,
        idempotencyKey,
        requestHash: hash,
        method: req.method,
        path: req.path,
        ip: req.ip || req.connection.remoteAddress || 'unknown'
    };

    recentRequestHashes.set(hash, record);

    if (idempotencyKey) {
        idempotencyKeys.set(idempotencyKey, record);
    }

    next();
};

/**
 * Mark feedback as processed (call after successful feedback processing)
 */
export const markFeedbackProcessed = (sessionId: string, productId: string, action: string): void => {
    const feedbackKey = `${sessionId}:${productId}:${action}`;
    const feedback = feedbackHistory.get(feedbackKey);

    if (feedback) {
        feedback.processed = true;
    }
};

/**
 * Check if specific feedback was already processed
 */
export const checkFeedbackStatus = (req: Request, res: Response): void => {
    const { sessionId, productId, action } = req.params;
    const feedbackKey = `${sessionId}:${productId}:${action}`;
    const feedback = feedbackHistory.get(feedbackKey);

    if (feedback) {
        res.json({
            success: true,
            feedback_status: {
                session_id: sessionId,
                product_id: productId,
                action: action,
                processed: feedback.processed,
                submitted_at: new Date(feedback.timestamp).toISOString(),
                time_since_submission: Math.ceil((Date.now() - feedback.timestamp) / 1000),
                idempotency_key: feedback.idempotencyKey
            }
        });
    } else {
        res.status(404).json({
            success: false,
            error: 'Feedback not found',
            message: 'No feedback record found for the specified parameters',
            searched_for: {
                session_id: sessionId,
                product_id: productId,
                action: action
            }
        });
    }
};

/**
 * Get duplicate detection statistics
 */
export const getDuplicateStats = (): any => {
    const now = Date.now();

    return {
        active_request_hashes: recentRequestHashes.size,
        active_feedback_records: feedbackHistory.size,
        active_idempotency_keys: idempotencyKeys.size,
        recent_conflicts: Array.from(recentRequestHashes.values())
            .filter(record => (now - record.timestamp) < 300000) // Last 5 minutes
            .length,
        recent_feedback: Array.from(feedbackHistory.values())
            .filter(feedback => (now - feedback.timestamp) < 300000) // Last 5 minutes
            .length,
        processed_feedback_count: Array.from(feedbackHistory.values())
            .filter(feedback => feedback.processed).length,
        windows: DUPLICATE_WINDOWS,
        last_cleanup: new Date().toISOString()
    };
};

/**
 * Enhanced batch feedback conflict detection
 */
export const checkBatchFeedbackConflicts = (feedbacks: any[]): Array<{ index: number; conflict: ConflictInfo }> => {
    const conflicts: Array<{ index: number; conflict: ConflictInfo }> = [];
    const batchFeedbackKeys = new Set<string>();

    feedbacks.forEach((feedback, index) => {
        const { sessionId, productId, action, idempotency_key } = feedback;
        const feedbackKey = `${sessionId}:${productId}:${action}`;

        // Check for conflicts within the batch itself
        if (batchFeedbackKeys.has(feedbackKey)) {
            conflicts.push({
                index,
                conflict: {
                    type: 'batch_conflict',
                    originalTimestamp: Date.now(),
                    conflictReason: 'Duplicate feedback within the same batch',
                    suggestedAction: 'Remove duplicate feedback items from batch'
                }
            });
            return;
        }

        batchFeedbackKeys.add(feedbackKey);

        // Check for existing conflicts
        const conflict = checkFeedbackConflict(sessionId, productId, action, idempotency_key);
        if (conflict) {
            conflicts.push({ index, conflict });
        }
    });

    return conflicts;
};

/**
 * Clean up expired records
 */
function cleanupExpiredRecords(): void {
    const now = Date.now();
    let cleanedCount = 0;

    // Clean request hashes
    for (const [hash, record] of recentRequestHashes.entries()) {
        if (now - record.timestamp > DUPLICATE_WINDOWS.GENERAL_REQUEST) {
            recentRequestHashes.delete(hash);
            cleanedCount++;
        }
    }

    // Clean feedback history (keep longer for grace period)
    for (const [key, feedback] of feedbackHistory.entries()) {
        if (now - feedback.timestamp > DUPLICATE_WINDOWS.FEEDBACK_SAME_PRODUCT * 2) {
            feedbackHistory.delete(key);
            cleanedCount++;
        }
    }

    // Clean idempotency keys
    for (const [key, record] of idempotencyKeys.entries()) {
        if (now - record.timestamp > DUPLICATE_WINDOWS.IDEMPOTENCY_WINDOW) {
            idempotencyKeys.delete(key);
            cleanedCount++;
        }
    }

    if (cleanedCount > 0) {
        console.log(`🧹 Cleaned up ${cleanedCount} expired duplicate detection records`);
    }
}

/**
 * Reset duplicate detection (for testing purposes)
 */
export const resetDuplicateDetection = (): void => {
    recentRequestHashes.clear();
    feedbackHistory.clear();
    idempotencyKeys.clear();
    console.log('🔄 Duplicate detection records reset');
};

export {
    checkFeedbackConflict, ConflictInfo, DUPLICATE_WINDOWS, DuplicateRecord,
    FeedbackRecord
};
