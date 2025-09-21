/**
 * Recommendation API Routes for LinUCB Fashion Recommendation System
 *
 * This module provides HTTP endpoints for:
 * - Session management (create/retrieve user sessions)
 * - Recommendation generation (LinUCB-based product recommendations)
 * - Feedback collection (learning from user interactions)
 * - Analytics and insights (user preference analysis)
 */

import express, { NextFunction, Request, Response, Router } from 'express';
import { Collection } from 'mongodb';
import {
    LINUCB_CONFIG,
    LinUCBModel,
    mapActionToReward,
    UCBScoreResult,
    validateFeatureVector
} from '../models/LinUCB.js';

// Type definitions for this module
interface RequestWithSessionId extends Request {
    sessionId?: string;
}

interface AppLocals {
    db: any;
    collections: {
        products: Collection;
        user_sessions: Collection;
        interactions: Collection;
    } | null;
}

interface CreateSessionRequest {
    userId: string;
    context?: {
        age?: number;
        gender?: string;
        location?: string;
        preferences?: string[];
    };
}

interface FeedbackRequest {
    session_id: string;
    product_id: string;
    action: 'love' | 'like' | 'dislike' | 'skip' | 'neutral';
    context?: {
        timestamp?: string;
        page?: string;
        position?: number;
    };
}

interface ProductDocument {
    _id?: any;                    // MongoDB ObjectId
    product_id: string;           // Our custom product ID (e.g., "BRAND-1234")
    name: string;
    brand: string;
    price: number;
    original_price?: number;
    category_main?: string;
    primary_color?: string;
    urls?: {
        product?: string;
        image?: string;
    };
    // Legacy fields for backward compatibility
    id?: string;
    category?: string;
    color?: string;
    image?: string;
    product_url?: string;
    attributes: {
        style?: string;
        occasion?: string;
        season?: string;
        material?: string;
        [key: string]: any;       // Allow additional attributes
    };
    feature_vector?: number[];
}

const router: Router = express.Router();

// Middleware to validate database connection
const requireDatabase = (req: Request, res: Response, next: NextFunction): void => {
    const { collections } = req.app.locals as AppLocals;
    if (!collections) {
        res.status(503).json({
            success: false,
            error: 'Database not connected',
            message: 'Please check MongoDB connection'
        });
        return;
    }
    next();
};

// Middleware to validate session ID format
const validateSessionId = (req: RequestWithSessionId, res: Response, next: NextFunction): void => {
    const sessionId = req.params.sessionId || req.body.session_id;

    if (!sessionId || typeof sessionId !== 'string' || sessionId.length !== 36) {
        res.status(400).json({
            success: false,
            error: 'Invalid session ID',
            message: 'Session ID must be a valid UUID'
        });
        return;
    }

    req.sessionId = sessionId;
    next();
};

/**
 * POST /api/session
 * Create a new LinUCB session for personalized recommendations
 */
router.post('/session', requireDatabase, async (req: Request<{}, {}, CreateSessionRequest>, res: Response): Promise<void> => {
    try {
        const { collections } = req.app.locals as AppLocals;
        const { userId, context = {} } = req.body;

        // Validate required fields
        if (!userId) {
            res.status(400).json({
                success: false,
                error: 'Missing required fields',
                message: 'userId is required'
            });
            return;
        }

        // Create new LinUCB model instance
        const linucbModel = new LinUCBModel(
            LINUCB_CONFIG.DEFAULT_ALPHA,
            LINUCB_CONFIG.FEATURE_DIMENSIONS
        );

        // Generate session ID
        const { randomUUID } = await import('crypto');
        const sessionId = randomUUID();
        linucbModel.setSessionId(sessionId);

        // Save session to database
        const sessionDoc = {
            session_id: sessionId,
            user_id: userId,
            algorithm: 'LinUCB',
            alpha: linucbModel.getAlpha(),
            feature_dimensions: LINUCB_CONFIG.FEATURE_DIMENSIONS,
            context,
            created_at: new Date(),
            updated_at: new Date(),
            status: 'active',
            total_interactions: 0
        };

        await collections!.user_sessions.insertOne(sessionDoc);

        console.log(`✅ New LinUCB session created: ${sessionId}`);

        res.status(201).json({
            success: true,
            session_id: sessionId,
            algorithm: 'LinUCB',
            configuration: {
                alpha: linucbModel.getAlpha(),
                feature_dimensions: LINUCB_CONFIG.FEATURE_DIMENSIONS,
                exploration_strategy: 'upper_confidence_bound'
            },
            message: 'Session created successfully. Ready for recommendations!'
        });

    } catch (error) {
        console.error('❌ Session creation failed:', error);
        res.status(500).json({
            success: false,
            error: 'Session creation failed',
            message: (error as Error).message
        });
    }
});

/**
 * GET /api/recommend/:sessionId
 * Get personalized product recommendation using LinUCB
 * Query parameters: minPrice, maxPrice, category
 */
router.get('/recommend/:sessionId', requireDatabase, validateSessionId, async (req: RequestWithSessionId, res: Response): Promise<void> => {
    try {
        const { collections } = req.app.locals as AppLocals;
        const { sessionId } = req;

        // Parse query parameters with proper type checking
        const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice as string) : 0;
        const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : 10000;
        const category = req.query.category as string | undefined;
        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

        // Validate parameters
        if (isNaN(minPrice) || isNaN(maxPrice) || minPrice < 0 || maxPrice < 0) {
            res.status(400).json({
                success: false,
                error: 'Invalid price parameters',
                message: 'minPrice and maxPrice must be valid numbers'
            });
            return;
        }

        // Load session data
        const session = await collections!.user_sessions.findOne({ session_id: sessionId });
        if (!session) {
            res.status(404).json({
                success: false,
                error: 'Session not found',
                message: 'Please create a session first using POST /api/session'
            });
            return;
        }

        // Load interaction history for this session
        const interactions = await collections!.interactions.find({ session_id: sessionId }).toArray();

        // Recreate LinUCB model
        const linucbModel = new LinUCBModel(session.alpha, session.feature_dimensions);
        if (sessionId) {
            linucbModel.setSessionId(sessionId);
        }

        // Replay interactions to rebuild model state
        for (const interaction of interactions) {
            if (interaction.feature_vector && typeof interaction.reward === 'number') {
                linucbModel.updateModel(interaction.feature_vector, interaction.reward);
            }
        }

        console.log(`✅ LinUCB model restored: ${interactions.length} interactions, α=${session.alpha}`);

        // Build product filter
        const productFilter: any = {
            price: { $gte: minPrice, $lte: maxPrice }
        };

        if (category && category !== 'all') {
            productFilter.category = { $regex: new RegExp(category, 'i') };
        }

        // Get candidate products
        const products = await collections!.products.find(productFilter).limit(limit).toArray() as unknown as ProductDocument[];

        if (products.length === 0) {
            res.status(404).json({
                success: false,
                error: 'No products found',
                message: 'No products match the specified criteria'
            });
            return;
        }

        // Score products using LinUCB
        const scoredProducts: Array<{
            product_id: string;
            name: string;
            price: number;
            ucb_score: number;
            expected_reward: number;
            confidence_bound: number;
        }> = [];

        let bestScore = -Infinity;
        let bestProduct: ProductDocument | null = null;
        let bestScoreResult: UCBScoreResult | null = null;

        for (const product of products) {
            // Use existing feature vector or create one
            const featureVector = product.feature_vector ||
                await createFeatureVector(product);

            if (!validateFeatureVector(featureVector)) {
                console.warn(`⚠️ Invalid feature vector for product ${product.product_id}, skipping`);
                continue;
            }

            const scoreResult = linucbModel.calculateUCBScore(featureVector);

            if (scoreResult.success && scoreResult.ucbScore > bestScore) {
                bestScore = scoreResult.ucbScore;
                bestProduct = product;
                bestScoreResult = scoreResult;
            }

            // Store for debug info
            scoredProducts.push({
                product_id: product.product_id,
                name: product.name,
                price: product.price,
                ucb_score: scoreResult.ucbScore,
                expected_reward: scoreResult.expectedReward,
                confidence_bound: scoreResult.confidenceBound
            });
        }

        if (!bestProduct || !bestScoreResult) {
            res.status(500).json({
                success: false,
                error: 'Recommendation generation failed',
                message: 'Unable to score any products with current model'
            });
            return;
        }

        // Sort scored products by UCB score for debug info
        scoredProducts.sort((a, b) => b.ucb_score - a.ucb_score);

        // Generate user insights
        const insights = linucbModel.generateInsights();

        // Prepare response
        const response = {
            success: true,
            recommendation: {
                product: {
                    product_id: bestProduct.product_id,  // ← Add this field for feedback
                    _id: bestProduct._id,                // ← Add MongoDB ObjectId as backup
                    id: bestProduct.product_id,          // ← Keep for backward compatibility
                    name: bestProduct.name,
                    brand: bestProduct.brand,
                    price: bestProduct.price,
                    category: bestProduct.category_main || bestProduct.category,
                    color: bestProduct.primary_color || bestProduct.color,
                    image: bestProduct.urls?.image || bestProduct.image,
                    product_url: bestProduct.urls?.product || bestProduct.product_url,
                    urls: {                              // ← Add structured URLs object
                        image: bestProduct.urls?.image || bestProduct.image,
                        product: bestProduct.urls?.product || bestProduct.product_url
                    },
                    attributes: bestProduct.attributes
                },
                confidence_score: bestScoreResult.ucbScore,
                expected_reward: bestScoreResult.expectedReward,
                exploration_bonus: bestScoreResult.confidenceBound,
                algorithm: 'LinUCB',
                reasoning: bestScoreResult.reasoning
            },
            user_stats: {
                session_id: sessionId,
                learning_progress: insights.learningProgress,
                confidence_level: insights.confidenceLevel,
                top_preferences: insights.topPreferences.slice(0, 3),
                exploration_rate: `${(linucbModel.getAlpha() * 100).toFixed(1)}%`
            },
            filters_applied: {
                price_range: `$${minPrice} - $${maxPrice}`,
                category: category || 'all',
                candidates_evaluated: products.length
            },
            debug: {
                scored_products: scoredProducts.slice(0, 10), // Top 10 for debug
                model_state: {
                    alpha: linucbModel.getAlpha(),
                    interactions: linucbModel.totalInteractions,
                    theta_magnitude: linucbModel.theta
                        ? Math.sqrt(linucbModel.theta.transpose().mmul(linucbModel.theta).get(0, 0)).toFixed(4)
                        : '0.0000'
                }
            }
        };

        res.json(response);

    } catch (error) {
        console.error('❌ Recommendation generation failed:', error);
        res.status(500).json({
            success: false,
            error: 'Recommendation generation failed',
            message: (error as Error).message
        });
    }
});

/**
 * POST /api/feedback
 * Process user feedback and update LinUCB model
 */
router.post('/feedback', requireDatabase, async (req: Request<{}, {}, FeedbackRequest>, res: Response): Promise<void> => {
    try {
        const { collections } = req.app.locals as AppLocals;
        const { session_id, product_id, action, context } = req.body;

        // Validate required fields
        if (!session_id || !product_id || !action) {
            res.status(400).json({
                success: false,
                error: 'Missing required fields',
                message: 'session_id, product_id, and action are required'
            });
            return;
        }

        // Validate action
        const validActions = ['love', 'like', 'dislike', 'skip', 'neutral'];
        if (!validActions.includes(action.toLowerCase())) {
            res.status(400).json({
                success: false,
                error: 'Invalid action',
                message: `Action must be one of: ${validActions.join(', ')}`
            });
            return;
        }

        // Load session
        const session = await collections!.user_sessions.findOne({ session_id });
        if (!session) {
            res.status(404).json({
                success: false,
                error: 'Session not found',
                message: 'Invalid session_id'
            });
            return;
        }

        // Load product
        const product = await collections!.products.findOne({ product_id: product_id }) as ProductDocument | null;
        if (!product) {
            res.status(404).json({
                success: false,
                error: 'Product not found',
                message: 'Invalid product_id'
            });
            return;
        }

        // Load interaction history
        const interactions = await collections!.interactions.find({ session_id }).toArray();

        // Recreate LinUCB model
        const linucbModel = new LinUCBModel(session.alpha, session.feature_dimensions);
        linucbModel.setSessionId(session_id);

        // Replay interactions
        for (const interaction of interactions) {
            if (interaction.feature_vector && typeof interaction.reward === 'number') {
                linucbModel.updateModel(interaction.feature_vector, interaction.reward);
            }
        }

        // Get feature vector for this product
        const featureVector = product.feature_vector || await createFeatureVector(product);

        if (!validateFeatureVector(featureVector)) {
            res.status(400).json({
                success: false,
                error: 'Invalid product features',
                message: 'Product feature vector is invalid'
            });
            return;
        }

        // Calculate reward from action
        const reward = mapActionToReward(action);

        // Get score before update
        const scoreBefore = linucbModel.calculateUCBScore(featureVector);

        // Update model
        const updateResult = linucbModel.updateModel(featureVector, reward);

        // Get score after update
        const scoreAfter = linucbModel.calculateUCBScore(featureVector);

        // Save interaction to database
        const interactionDoc = {
            session_id,
            product_id,
            action: action.toLowerCase(),
            reward,
            feature_vector: featureVector,
            context: context || {},
            timestamp: new Date(),
            score_before: scoreBefore.ucbScore,
            score_after: scoreAfter.ucbScore
        };

        await collections!.interactions.insertOne(interactionDoc);

        // Update session metadata
        await collections!.user_sessions.updateOne(
            { session_id },
            {
                $set: {
                    updated_at: new Date(),
                    total_interactions: linucbModel.totalInteractions
                }
            }
        );

        // Generate updated insights
        const insights = linucbModel.generateInsights();

        console.log(`📈 Feedback processed for session ${session_id}: ${action} on ${product_id} (reward: ${reward})`);

        res.json({
            success: true,
            message: 'Feedback processed successfully',
            learning_update: {
                action,
                reward,
                total_interactions: linucbModel.totalInteractions,
                model_change: updateResult.modelChange,
                new_alpha: linucbModel.getAlpha()
            },
            user_insights: {
                confidence_level: insights.confidenceLevel,
                learning_progress: insights.learningProgress,
                top_preferences: insights.topPreferences.slice(0, 3),
                recommendations: insights.recommendations
            },
            score_evolution: {
                before: scoreBefore.ucbScore,
                after: scoreAfter.ucbScore,
                change: scoreAfter.ucbScore - scoreBefore.ucbScore
            }
        });

    } catch (error) {
        console.error('❌ Feedback processing failed:', error);
        res.status(500).json({
            success: false,
            error: 'Feedback processing failed',
            message: (error as Error).message
        });
    }
});

/**
 * GET /api/analytics
 * System-wide analytics (development/admin endpoint)
 */
router.get('/analytics', requireDatabase, async (req: Request, res: Response): Promise<void> => {
    try {
        const { collections } = req.app.locals as AppLocals;

        // Get basic statistics
        const [sessionsCount, interactionsCount, activeSessions] = await Promise.all([
            collections!.user_sessions.countDocuments(),
            collections!.interactions.countDocuments(),
            collections!.user_sessions.countDocuments({
                updated_at: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            })
        ]);

        // Get action distribution
        const actionStats = await collections!.interactions.aggregate([
            { $group: { _id: '$action', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]).toArray();

        // Get product interaction stats
        const productStats = await collections!.interactions.aggregate([
            {
                $group: {
                    _id: '$product_id',
                    interactions: { $sum: 1 },
                    avg_reward: { $avg: '$reward' }
                }
            },
            { $sort: { interactions: -1 } },
            { $limit: 10 }
        ]).toArray();

        // Calculate engagement rate
        const engagementRate = sessionsCount > 0
            ? ((interactionsCount / sessionsCount) * 100).toFixed(1)
            : '0.0';

        res.json({
            success: true,
            analytics: {
                overview: {
                    total_sessions: sessionsCount,
                    total_interactions: interactionsCount,
                    active_sessions_24h: activeSessions,
                    avg_interactions_per_session: (interactionsCount / Math.max(sessionsCount, 1)).toFixed(2)
                },
                user_behavior: {
                    action_distribution: actionStats,
                    engagement_rate: `${engagementRate}%`
                },
                product_performance: {
                    most_interacted: productStats
                },
                algorithm_health: {
                    status: 'operational',
                    model_type: 'LinUCB',
                    feature_dimensions: LINUCB_CONFIG.FEATURE_DIMENSIONS
                }
            },
            generated_at: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Analytics generation failed:', error);
        res.status(500).json({
            success: false,
            error: 'Analytics generation failed',
            message: (error as Error).message
        });
    }
});

/**
 * Helper function to create feature vector from product data
 */
async function createFeatureVector(product: ProductDocument): Promise<number[]> {
    // Import the feature mapping utility
    const { extractFeatures } = await import('../utils/featureMapping.js');
    return extractFeatures(product);
}

export default router;
