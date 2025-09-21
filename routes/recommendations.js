/**
 * Recommendation API Routes for LinUCB Fashion Recommendation System
 *
 * This module provides HTTP endpoints for:
 * - Session management (create/retrieve user sessions)
 * - Recommendation generation (LinUCB-based product recommendations)
 * - Feedback collection (learning from user interactions)
 * - Analytics and insights (user preference analysis)
 */

import express from 'express';
import {
    LINUCB_CONFIG,
    LinUCBModel,
    createLinUCBSession,
    mapActionToReward,
    validateFeatureVector
} from '../models/LinUCB.js';

const router = express.Router();

// Middleware to validate database connection
const requireDatabase = (req, res, next) => {
    if (!req.app.locals.collections) {
        return res.status(503).json({
            success: false,
            error: 'Database not connected',
            message: 'Please check MongoDB connection'
        });
    }
    next();
};

// Middleware to validate session ID format
const validateSessionId = (req, res, next) => {
    const sessionId = req.params.sessionId || req.body.session_id;

    if (!sessionId || typeof sessionId !== 'string' || sessionId.length !== 36) {
        return res.status(400).json({
            success: false,
            error: 'Invalid session ID',
            message: 'Session ID must be a valid UUID'
        });
    }

    req.sessionId = sessionId;
    next();
};

/**
 * POST /api/session
 * Create a new LinUCB user session
 */
router.post('/session', requireDatabase, async (req, res) => {
    try {
        const { collections } = req.app.locals;
        const { alpha } = req.body;

        // Validate alpha parameter if provided
        const sessionAlpha = alpha && typeof alpha === 'number'
            ? Math.max(LINUCB_CONFIG.MIN_ALPHA, Math.min(LINUCB_CONFIG.MAX_ALPHA, alpha))
            : LINUCB_CONFIG.DEFAULT_ALPHA;

        // Create new LinUCB session
        const linucbModel = createLinUCBSession(sessionAlpha);

        // Prepare session document for database
        const sessionDoc = {
            session_id: linucbModel.sessionId,
            created_at: new Date(),
            updated_at: new Date(),
            total_interactions: 0,
            alpha: sessionAlpha,

            // LinUCB model state
            theta_vector: linucbModel.toJSON().theta_vector,
            a_matrix: linucbModel.toJSON().a_matrix,
            b_vector: linucbModel.toJSON().b_vector,

            // User insights
            preferences_learned: [],
            confidence_level: 'low',
            learning_progress: '0%'
        };

        // Save to database
        await collections.sessions.insertOne(sessionDoc);

        console.log(`✅ New LinUCB session created: ${linucbModel.sessionId}`);

        res.status(201).json({
            success: true,
            session_id: linucbModel.sessionId,
            algorithm: 'LinUCB',
            configuration: {
                alpha: sessionAlpha,
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
            message: error.message
        });
    }
});

/**
 * GET /api/recommend/:sessionId
 * Get personalized product recommendation using LinUCB
 * Query parameters: minPrice, maxPrice, category
 */
router.get('/recommend/:sessionId', requireDatabase, validateSessionId, async (req, res) => {
    try {
        const { collections } = req.app.locals;
        const { sessionId } = req;

        // Parse query parameters
        const minPrice = parseFloat(req.query.minPrice) || 0;
        const maxPrice = parseFloat(req.query.maxPrice) || 10000;
        const category = req.query.category;

        // Validate price range
        if (minPrice < 0 || maxPrice < minPrice) {
            return res.status(400).json({
                success: false,
                error: 'Invalid price range',
                message: 'minPrice must be >= 0 and maxPrice must be >= minPrice'
            });
        }

        // Retrieve user session
        const sessionDoc = await collections.sessions.findOne({ session_id: sessionId });
        if (!sessionDoc) {
            return res.status(404).json({
                success: false,
                error: 'Session not found',
                message: 'Please create a new session first'
            });
        }

        // Restore LinUCB model
        const linucbModel = LinUCBModel.fromJSON(sessionDoc);

        // Build product filter
        const productFilter = {
            price: { $gte: minPrice, $lte: maxPrice }
        };

        if (category) {
            productFilter.category_main = { $regex: new RegExp(category, 'i') };
        }

        // Get candidate products
        const candidateProducts = await collections.products
            .find(productFilter)
            .limit(100) // Limit for performance
            .toArray();

        if (candidateProducts.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No products found',
                message: 'No products match the specified criteria',
                filters: { minPrice, maxPrice, category }
            });
        }

        // Calculate UCB scores for all candidates
        let bestProduct = null;
        let bestScore = -Infinity;
        const scoredProducts = [];

        for (const product of candidateProducts) {
            // Validate feature vector
            if (!validateFeatureVector(product.feature_vector)) {
                console.warn(`⚠️ Invalid feature vector for product ${product.product_id}`);
                continue;
            }

            // Calculate UCB score
            const scoreResult = linucbModel.calculateUCBScore(product.feature_vector);

            if (scoreResult.success && scoreResult.ucbScore > bestScore) {
                bestScore = scoreResult.ucbScore;
                bestProduct = {
                    ...product,
                    scoreResult
                };
            }

            // Store for debugging (only in development)
            if (process.env.NODE_ENV === 'development' && scoredProducts.length < 10) {
                scoredProducts.push({
                    product_id: product.product_id,
                    name: product.name,
                    price: product.price,
                    ucb_score: scoreResult.ucbScore,
                    expected_reward: scoreResult.expectedReward,
                    confidence_bound: scoreResult.confidenceBound
                });
            }
        }

        if (!bestProduct) {
            return res.status(500).json({
                success: false,
                error: 'Recommendation generation failed',
                message: 'Unable to score any products with current model'
            });
        }

        // Generate user insights
        const insights = linucbModel.generateInsights();

        // Prepare response
        const response = {
            success: true,
            recommendation: {
                product: {
                    id: bestProduct.product_id,
                    name: bestProduct.name,
                    brand: bestProduct.brand,
                    price: bestProduct.price,
                    category: bestProduct.category_main,
                    color: bestProduct.primary_color,
                    image: bestProduct.urls?.image,
                    product_url: bestProduct.urls?.product,

                    // Additional attributes for rich display
                    attributes: {
                        style: bestProduct.attributes?.style_category,
                        occasion: bestProduct.attributes?.occasion_primary,
                        season: bestProduct.attributes?.season_primary,
                        material: bestProduct.attributes?.material_type
                    }
                },

                // Algorithm details
                confidence_score: bestProduct.scoreResult.ucbScore,
                expected_reward: bestProduct.scoreResult.expectedReward,
                exploration_bonus: bestProduct.scoreResult.confidenceBound,
                algorithm: 'LinUCB',

                // Recommendation reason
                reasoning: generateRecommendationReasoning(bestProduct, insights)
            },

            user_stats: {
                session_id: sessionId,
                total_interactions: sessionDoc.total_interactions,
                learning_progress: insights.learningProgress,
                confidence_level: insights.confidenceLevel,
                top_preferences: insights.topPreferences.slice(0, 3),
                exploration_rate: `${(linucbModel.alpha * 100).toFixed(1)}%`
            },

            // Filters applied
            filters_applied: {
                price_range: `$${minPrice} - $${maxPrice}`,
                category: category || 'all',
                candidates_evaluated: candidateProducts.length
            }
        };

        // Add debug info in development
        if (process.env.NODE_ENV === 'development') {
            response.debug = {
                scored_products: scoredProducts.sort((a, b) => b.ucb_score - a.ucb_score),
                model_state: {
                    alpha: linucbModel.alpha,
                    interactions: linucbModel.totalInteractions,
                    theta_magnitude: Math.sqrt(
                        linucbModel.theta.transpose().mmul(linucbModel.theta).get(0, 0)
                    ).toFixed(4)
                }
            };
        }

        console.log(`🎯 Recommendation generated for session ${sessionId}: ${bestProduct.product_id} (score: ${bestScore.toFixed(4)})`);

        res.json(response);

    } catch (error) {
        console.error('❌ Recommendation generation failed:', error);
        res.status(500).json({
            success: false,
            error: 'Recommendation generation failed',
            message: error.message
        });
    }
});

/**
 * POST /api/feedback
 * Process user feedback and update LinUCB model
 */
router.post('/feedback', requireDatabase, async (req, res) => {
    try {
        const { collections } = req.app.locals;
        const { session_id, product_id, action, context } = req.body;

        // Validate required fields
        if (!session_id || !product_id || !action) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
                message: 'session_id, product_id, and action are required'
            });
        }

        // Validate action
        const validActions = ['love', 'like', 'dislike', 'skip', 'neutral'];
        if (!validActions.includes(action.toLowerCase())) {
            return res.status(400).json({
                success: false,
                error: 'Invalid action',
                message: `Action must be one of: ${validActions.join(', ')}`
            });
        }

        // Get session
        const sessionDoc = await collections.sessions.findOne({ session_id });
        if (!sessionDoc) {
            return res.status(404).json({
                success: false,
                error: 'Session not found',
                message: 'Invalid session ID'
            });
        }

        // Get product
        const product = await collections.products.findOne({ product_id });
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found',
                message: 'Invalid product ID'
            });
        }

        // Validate product feature vector
        if (!validateFeatureVector(product.feature_vector)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid product features',
                message: 'Product has malformed feature vector'
            });
        }

        // Restore LinUCB model
        const linucbModel = LinUCBModel.fromJSON(sessionDoc);

        // Calculate UCB score before update (for logging)
        const scoreBefore = linucbModel.calculateUCBScore(product.feature_vector);

        // Map action to reward
        const reward = mapActionToReward(action);

        // Update LinUCB model
        const updateResult = linucbModel.updateModel(product.feature_vector, reward);

        if (!updateResult.success) {
            return res.status(500).json({
                success: false,
                error: 'Model update failed',
                message: updateResult.error
            });
        }

        // Calculate UCB score after update
        const scoreAfter = linucbModel.calculateUCBScore(product.feature_vector);

        // Generate updated insights
        const insights = linucbModel.generateInsights();

        // Save updated session
        const updatedSessionDoc = {
            ...linucbModel.toJSON(),
            session_id: session_id,
            updated_at: new Date(),
            preferences_learned: insights.topPreferences,
            confidence_level: insights.confidenceLevel,
            learning_progress: insights.learningProgress
        };

        await collections.sessions.replaceOne(
            { session_id },
            updatedSessionDoc,
            { upsert: true }
        );

        // Log interaction
        const interactionDoc = {
            session_id,
            product_id,
            action: action.toLowerCase(),
            reward,
            features_activated: product.feature_explanation,
            ucb_score_before: scoreBefore.ucbScore,
            ucb_score_after: scoreAfter.ucbScore,
            context: context || {},
            timestamp: new Date()
        };

        await collections.interactions.insertOne(interactionDoc);

        console.log(`📈 Feedback processed for session ${session_id}: ${action} on ${product_id} (reward: ${reward})`);

        res.json({
            success: true,
            message: 'Feedback processed successfully',
            learning_update: {
                action: action.toLowerCase(),
                reward: reward,
                total_interactions: updateResult.totalInteractions,
                model_change: updateResult.changeMagnitude,
                new_alpha: updateResult.currentAlpha
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
            message: error.message
        });
    }
});

/**
 * GET /api/session/:sessionId/insights
 * Get detailed user preference insights
 */
router.get('/session/:sessionId/insights', requireDatabase, validateSessionId, async (req, res) => {
    try {
        const { collections } = req.app.locals;
        const { sessionId } = req;

        // Get session
        const sessionDoc = await collections.sessions.findOne({ session_id: sessionId });
        if (!sessionDoc) {
            return res.status(404).json({
                success: false,
                error: 'Session not found'
            });
        }

        // Restore model and generate insights
        const linucbModel = LinUCBModel.fromJSON(sessionDoc);
        const insights = linucbModel.generateInsights();

        // Get recent interactions
        const recentInteractions = await collections.interactions
            .find({ session_id: sessionId })
            .sort({ timestamp: -1 })
            .limit(10)
            .toArray();

        res.json({
            success: true,
            session_id: sessionId,
            insights: insights,
            session_stats: {
                created_at: sessionDoc.created_at,
                total_interactions: sessionDoc.total_interactions,
                last_updated: sessionDoc.updated_at,
                exploration_rate: `${(linucbModel.alpha * 100).toFixed(1)}%`
            },
            recent_activity: recentInteractions.map(interaction => ({
                product_id: interaction.product_id,
                action: interaction.action,
                reward: interaction.reward,
                timestamp: interaction.timestamp
            }))
        });

    } catch (error) {
        console.error('❌ Insights retrieval failed:', error);
        res.status(500).json({
            success: false,
            error: 'Insights retrieval failed',
            message: error.message
        });
    }
});

/**
 * GET /api/analytics
 * System-wide analytics (development/admin endpoint)
 */
router.get('/analytics', requireDatabase, async (req, res) => {
    try {
        const { collections } = req.app.locals;

        // Basic statistics
        const totalSessions = await collections.sessions.countDocuments();
        const totalInteractions = await collections.interactions.countDocuments();
        const activeSessions = await collections.sessions.countDocuments({
            updated_at: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
        });

        // Interaction distribution
        const actionDistribution = await collections.interactions.aggregate([
            { $group: { _id: '$action', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]).toArray();

        // Popular products
        const popularProducts = await collections.interactions.aggregate([
            { $group: { _id: '$product_id', interactions: { $sum: 1 }, avg_reward: { $avg: '$reward' } } },
            { $sort: { interactions: -1 } },
            { $limit: 10 }
        ]).toArray();

        res.json({
            success: true,
            analytics: {
                overview: {
                    total_sessions: totalSessions,
                    total_interactions: totalInteractions,
                    active_sessions_24h: activeSessions,
                    avg_interactions_per_session: totalSessions > 0 ? (totalInteractions / totalSessions).toFixed(2) : 0
                },
                user_behavior: {
                    action_distribution: actionDistribution,
                    engagement_rate: activeSessions > 0 ? `${((activeSessions / totalSessions) * 100).toFixed(1)}%` : '0%'
                },
                product_performance: {
                    most_interacted: popularProducts
                },
                algorithm_health: {
                    status: 'operational',
                    model_type: 'LinUCB',
                    feature_dimensions: LINUCB_CONFIG.FEATURE_DIMENSIONS
                }
            },
            generated_at: new Date()
        });

    } catch (error) {
        console.error('❌ Analytics generation failed:', error);
        res.status(500).json({
            success: false,
            error: 'Analytics generation failed',
            message: error.message
        });
    }
});

/**
 * Helper function to generate recommendation reasoning
 */
function generateRecommendationReasoning(product, insights) {
    const reasons = [];

    // Check if product features match user preferences
    const productFeatures = Object.keys(product.feature_explanation || {});
    const userPreferences = insights.topPreferences.map(p => p.feature.toLowerCase());

    const matchingFeatures = productFeatures.filter(feature =>
        userPreferences.some(pref => feature.includes(pref.toLowerCase()))
    );

    if (matchingFeatures.length > 0) {
        reasons.push(`Matches your preference for ${matchingFeatures[0].replace('_', ' ')}`);
    }

    if (insights.confidenceLevel === 'high') {
        reasons.push('High confidence based on your interaction history');
    } else if (insights.confidenceLevel === 'low') {
        reasons.push('Exploratory recommendation to learn your preferences');
    }

    if (reasons.length === 0) {
        reasons.push('Recommended based on current fashion trends');
    }

    return reasons.join('. ');
}

export default router;
