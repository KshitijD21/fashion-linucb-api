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
    checkBatchFeedbackConflicts,
    checkFeedbackStatus,
    enhancedDuplicateDetection,
    markFeedbackProcessed
} from '../middleware/enhancedDuplicateDetection.js';
import {
    handleValidationErrors,
    validateBatchFeedbackRequest,
    validateBatchRecommendationRequest,
    validateFeedbackRequest,
    validateRecommendationRequest,
    validateSessionCreation
} from '../middleware/validation.js';
import {
    LINUCB_CONFIG,
    LinUCBModel,
    mapActionToReward,
    validateFeatureVector
} from '../models/LinUCB.js';
import { recommendationCache } from '../utils/caching.js';
import {
    calculateDiversityNeeds,
    calculateDiversityScore,
    DIVERSITY_CONFIG,
    getFilteredCandidates,
    getSessionHistory,
    getUserPreferences,
    recordShownProduct,
    selectRecommendation,
    updateUserAction,
    type ProductCandidate,
    type ScoredProduct
} from '../utils/diversityManager.js';

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
        session_history: Collection;
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
router.post('/session', requireDatabase, validateSessionCreation, handleValidationErrors, async (req: Request<{}, {}, CreateSessionRequest>, res: Response): Promise<void> => {
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
 * Get personalized product recommendation using Enhanced LinUCB with Diversity
 * Query parameters: minPrice, maxPrice, category
 */
router.get('/recommend/:sessionId', requireDatabase, validateRecommendationRequest, handleValidationErrors, validateSessionId, async (req: RequestWithSessionId, res: Response): Promise<void> => {
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

        // Create cache key from filters
        const filters = { minPrice, maxPrice, category, limit };

        // Check cache first
        const cachedResult = recommendationCache.get(sessionId!, filters, 1);
        if (cachedResult) {
            console.log(`💾 Cache hit for session ${sessionId}`);
            res.json(cachedResult);
            return;
        }

        console.log(`🎯 Generating recommendation for session: ${sessionId}`);

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

        // STEP 1: Get session history and user preferences
        const sessionHistory = await getSessionHistory(collections!.session_history, sessionId!);
        const userPreferences = await getUserPreferences(
            collections!.session_history,
            collections!.products,
            sessionId!
        );

        console.log(`📊 Found ${sessionHistory.length} previous recommendations for session`);

        // STEP 2: Calculate diversity rules based on recent interactions
        const diversityRules = await calculateDiversityNeeds(sessionHistory, collections!.products);
        console.log(`🎨 Diversity rules:`, diversityRules);

        // STEP 3: Get recently shown product IDs for exclusion
        const recentlyShown = sessionHistory.slice(0, DIVERSITY_CONFIG.EXCLUSION_WINDOW);
        const excludeIds = recentlyShown.map(entry => entry.product_id);

        // STEP 4: Build additional filters
        const additionalFilters: any = {
            price: { $gte: minPrice, $lte: maxPrice }
        };

        if (category && category !== 'all') {
            additionalFilters.category_main = { $regex: new RegExp(category, 'i') };
        }

        // STEP 5: Get filtered product candidates
        const candidates = await getFilteredCandidates(
            collections!.products,
            excludeIds,
            diversityRules,
            additionalFilters
        );

        if (candidates.length === 0) {
            res.status(404).json({
                success: false,
                error: 'No products found',
                message: 'No products match the specified criteria with diversity constraints'
            });
            return;
        }

        console.log(`🔍 Found ${candidates.length} candidate products after filtering`);

        // STEP 6: Load interaction history and rebuild LinUCB model
        const interactions = await collections!.interactions.find({ session_id: sessionId }).toArray();
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

        console.log(`🧠 LinUCB model restored: ${interactions.length} interactions, α=${session.alpha}`);

        // STEP 7: Score products using Enhanced LinUCB with diversity bonuses
        const scoredProducts: ScoredProduct[] = [];

        for (const product of candidates) {
            try {
                // Use existing feature vector or create one
                const featureVector = product.feature_vector || await createFeatureVector(product as ProductDocument);

                if (!validateFeatureVector(featureVector)) {
                    console.warn(`⚠️ Invalid feature vector for product ${product.product_id}, skipping`);
                    continue;
                }

                // Calculate base LinUCB score
                const scoreResult = linucbModel.calculateUCBScore(featureVector);

                if (scoreResult.success) {
                    // Apply diversity bonuses
                    const diversityScore = calculateDiversityScore(
                        product as ProductCandidate,
                        scoreResult.ucbScore,
                        userPreferences,
                        linucbModel.totalInteractions
                    );

                    scoredProducts.push(diversityScore);
                }
            } catch (error) {
                console.warn(`⚠️ Failed to score product ${product.product_id}:`, error);
                continue;
            }
        }

        if (scoredProducts.length === 0) {
            res.status(500).json({
                success: false,
                error: 'Recommendation generation failed',
                message: 'Unable to score any products with current model'
            });
            return;
        }

        // STEP 8: Select final recommendation with controlled randomness
        const selectedRecommendation = selectRecommendation(scoredProducts);

        // STEP 9: Record the shown product in session history
        await recordShownProduct(
            collections!.session_history,
            sessionId!,
            selectedRecommendation.product.product_id
        );

        // STEP 10: Generate user insights
        const insights = linucbModel.generateInsights();

        // STEP 11: Prepare debug information
        const debugScoredProducts = scoredProducts
            .sort((a, b) => b.finalScore - a.finalScore)
            .slice(0, 10)
            .map(scored => ({
                product_id: scored.product.product_id,
                name: scored.product.name,
                final_score: scored.finalScore,
                base_score: scored.baseScore,
                diversity_bonus: scored.diversityBonus,
                exploration_bonus: scored.explorationBonus
            }));

        // STEP 12: Prepare response
        const response = {
            success: true,
            recommendation: {
                product: {
                    product_id: selectedRecommendation.product.product_id,
                    _id: selectedRecommendation.product._id,
                    id: selectedRecommendation.product.product_id,
                    name: selectedRecommendation.product.name,
                    brand: selectedRecommendation.product.brand,
                    price: selectedRecommendation.product.price,
                    category: selectedRecommendation.product.category_main,
                    color: selectedRecommendation.product.primary_color,
                    image: selectedRecommendation.product.urls?.image || selectedRecommendation.product.image,
                    product_url: selectedRecommendation.product.urls?.product || selectedRecommendation.product.product_url,
                    urls: {
                        image: selectedRecommendation.product.urls?.image || selectedRecommendation.product.image,
                        product: selectedRecommendation.product.urls?.product || selectedRecommendation.product.product_url
                    },
                    attributes: selectedRecommendation.product.attributes
                },
                confidence_score: selectedRecommendation.finalScore,
                base_score: selectedRecommendation.baseScore,
                diversity_bonus: selectedRecommendation.diversityBonus,
                exploration_bonus: selectedRecommendation.explorationBonus,
                algorithm: 'Enhanced LinUCB with Diversity',
                reasoning: sessionHistory.length < 5
                    ? 'Exploratory recommendation to learn your preferences with diversity constraints'
                    : 'Personalized recommendation balancing learned preferences with diversity'
            },
            user_stats: {
                session_id: sessionId,
                learning_progress: insights.learningProgress,
                confidence_level: insights.confidenceLevel,
                top_preferences: insights.topPreferences.slice(0, 3),
                exploration_rate: `${(linucbModel.getAlpha() * 100).toFixed(1)}%`,
                products_seen: sessionHistory.length,
                unique_categories: userPreferences.seenCategories.length,
                unique_colors: userPreferences.seenColors.length,
                unique_brands: userPreferences.seenBrands.length
            },
            diversity_info: {
                exclusion_window: DIVERSITY_CONFIG.EXCLUSION_WINDOW,
                excluded_products: excludeIds.length,
                diversity_constraints_applied: {
                    force_new_category: diversityRules.forceNewCategory,
                    force_new_color: diversityRules.forceNewColor,
                    force_new_brand: diversityRules.forceNewBrand,
                    avoided_category: diversityRules.avoidCategory,
                    avoided_color: diversityRules.avoidColor,
                    avoided_brand: diversityRules.avoidBrand
                },
                candidate_pool_size: candidates.length
            },
            filters_applied: {
                price_range: `$${minPrice} - $${maxPrice}`,
                category: category || 'all',
                candidates_after_filtering: candidates.length,
                scored_products: scoredProducts.length
            },
            debug: {
                scored_products: debugScoredProducts,
                model_state: {
                    alpha: linucbModel.getAlpha(),
                    interactions: linucbModel.totalInteractions,
                    theta_magnitude: linucbModel.theta
                        ? Math.sqrt(linucbModel.theta.transpose().mmul(linucbModel.theta).get(0, 0)).toFixed(4)
                        : '0.0000'
                },
                diversity_config: DIVERSITY_CONFIG
            }
        };

        // Cache the result for future requests (TTL: 5 minutes for single recommendations)
        recommendationCache.set(sessionId!, filters, 1, response, 300000);

        console.log(`✅ Enhanced recommendation generated: ${selectedRecommendation.product.name} (score: ${selectedRecommendation.finalScore.toFixed(3)})`);
        res.json(response);

    } catch (error) {
        console.error('❌ Enhanced recommendation generation failed:', error);
        res.status(500).json({
            success: false,
            error: 'Recommendation generation failed',
            message: (error as Error).message
        });
    }
});

/**
 * POST /api/feedback
 * Process user feedback and update LinUCB model with session history tracking
 */
router.post('/feedback', requireDatabase, enhancedDuplicateDetection, validateFeedbackRequest, handleValidationErrors, async (req: Request<{}, {}, FeedbackRequest>, res: Response): Promise<void> => {
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

        console.log(`💭 Processing feedback: ${action} for product ${product_id} in session ${session_id}`);

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

        // STEP 1: Update session history with user action
        await updateUserAction(
            collections!.session_history,
            session_id,
            product_id,
            action.toLowerCase() as 'love' | 'dislike' | 'skipped'
        );

        // STEP 2: Load interaction history and rebuild LinUCB model
        const interactions = await collections!.interactions.find({ session_id }).toArray();
        const linucbModel = new LinUCBModel(session.alpha, session.feature_dimensions);
        linucbModel.setSessionId(session_id);

        // Replay interactions
        for (const interaction of interactions) {
            if (interaction.feature_vector && typeof interaction.reward === 'number') {
                linucbModel.updateModel(interaction.feature_vector, interaction.reward);
            }
        }

        // STEP 3: Get feature vector for this product
        const featureVector = product.feature_vector || await createFeatureVector(product);

        if (!validateFeatureVector(featureVector)) {
            res.status(400).json({
                success: false,
                error: 'Invalid product features',
                message: 'Product feature vector is invalid'
            });
            return;
        }

        // STEP 4: Calculate reward from action
        const reward = mapActionToReward(action);

        // Get score before update
        const scoreBefore = linucbModel.calculateUCBScore(featureVector);

        // STEP 5: Update LinUCB model
        const updateResult = linucbModel.updateModel(featureVector, reward);

        // Get score after update
        const scoreAfter = linucbModel.calculateUCBScore(featureVector);

        // STEP 6: Save interaction to database
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

        // STEP 7: Update session metadata
        await collections!.user_sessions.updateOne(
            { session_id },
            {
                $set: {
                    updated_at: new Date(),
                    total_interactions: linucbModel.totalInteractions
                }
            }
        );

        // STEP 8: Generate updated insights and preferences
        const insights = linucbModel.generateInsights();
        const userPreferences = await getUserPreferences(
            collections!.session_history,
            collections!.products,
            session_id
        );

        console.log(`✅ Enhanced feedback processed: ${action} on ${product_id} (reward: ${reward})`);

        // Mark feedback as processed for duplicate detection
        markFeedbackProcessed(session_id, product_id, action);

        // Invalidate cache for this session since user preferences may have changed
        recommendationCache.invalidateSession(session_id);

        res.json({
            success: true,
            message: 'Feedback processed with diversity tracking',
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
            diversity_stats: {
                products_seen: userPreferences.recentHistory.length,
                unique_categories: userPreferences.seenCategories.length,
                unique_colors: userPreferences.seenColors.length,
                unique_brands: userPreferences.seenBrands.length,
                loved_categories: userPreferences.lovedCategories,
                loved_colors: userPreferences.lovedColors,
                loved_brands: userPreferences.lovedBrands
            },
            score_evolution: {
                before: scoreBefore.ucbScore,
                after: scoreAfter.ucbScore,
                change: scoreAfter.ucbScore - scoreBefore.ucbScore
            }
        });

    } catch (error) {
        console.error('❌ Enhanced feedback processing failed:', error);
        res.status(500).json({
            success: false,
            error: 'Feedback processing failed',
            message: (error as Error).message
        });
    }
});

/**
 * POST /api/feedback/batch
 * Process multiple feedback actions in a single request
 */
router.post('/feedback/batch', requireDatabase, enhancedDuplicateDetection, validateBatchFeedbackRequest, handleValidationErrors, async (req: Request, res: Response): Promise<void> => {
    try {
        const { collections } = req.app.locals as AppLocals;
        const startTime = Date.now();

        // Validate request body
        const { feedbacks, options = {} } = req.body;

        if (!Array.isArray(feedbacks) || feedbacks.length === 0) {
            res.status(400).json({
                success: false,
                error: 'Invalid request format',
                message: 'Feedbacks array is required and must contain at least one item'
            });
            return;
        }

        if (feedbacks.length > 50) {
            res.status(400).json({
                success: false,
                error: 'Too many feedbacks',
                message: 'Maximum 50 feedbacks allowed per batch'
            });
            return;
        }

        // Check for batch conflicts before processing
        const batchConflicts = checkBatchFeedbackConflicts(feedbacks);
        if (batchConflicts.length > 0 && !options.ignoreConflicts) {
            res.status(409).json({
                success: false,
                error: 'Batch conflicts detected',
                message: 'Some feedback items in the batch have conflicts',
                conflicts: batchConflicts.map(({ index, conflict }) => ({
                    feedback_index: index,
                    feedback_item: feedbacks[index],
                    conflict_type: conflict.type,
                    conflict_reason: conflict.conflictReason,
                    suggested_action: conflict.suggestedAction
                })),
                batch_info: {
                    total_feedbacks: feedbacks.length,
                    conflicted_feedbacks: batchConflicts.length,
                    can_retry_with_ignore_conflicts: true
                }
            });
            return;
        }

        const {
            enableTransactions = true,
            continueOnError = true,
            updateModelImmediately = true
        } = options;

        const results: any[] = [];
        const errors: string[] = [];
        let successfulFeedbacks = 0;
        let failedFeedbacks = 0;

        // Validate all feedbacks first
        for (let i = 0; i < feedbacks.length; i++) {
            const feedback = feedbacks[i];
            const { sessionId, productId, action } = feedback;

            if (!sessionId || !productId || !action) {
                const errorMsg = `Feedback ${i + 1}: Missing required fields (sessionId, productId, action)`;
                errors.push(errorMsg);
                results.push({
                    sessionId: sessionId || 'unknown',
                    productId: productId || 'unknown',
                    action: action || 'unknown',
                    processed: false,
                    modelUpdated: false,
                    error: errorMsg
                });
                failedFeedbacks++;
                if (!continueOnError) break;
                continue;
            }

            // Validate action
            const validActions = ['love', 'like', 'dislike', 'skip', 'neutral'];
            if (!validActions.includes(action.toLowerCase())) {
                const errorMsg = `Feedback ${i + 1}: Invalid action '${action}'. Must be one of: ${validActions.join(', ')}`;
                errors.push(errorMsg);
                results.push({
                    sessionId,
                    productId,
                    action,
                    processed: false,
                    modelUpdated: false,
                    error: errorMsg
                });
                failedFeedbacks++;
                if (!continueOnError) break;
                continue;
            }

            // Validate session ID format
            if (typeof sessionId !== 'string' || sessionId.length !== 36) {
                const errorMsg = `Feedback ${i + 1}: Invalid session ID format`;
                errors.push(errorMsg);
                results.push({
                    sessionId,
                    productId,
                    action,
                    processed: false,
                    modelUpdated: false,
                    error: errorMsg
                });
                failedFeedbacks++;
                if (!continueOnError) break;
                continue;
            }
        }

        // Group feedbacks by session for batch processing
        const feedbacksBySession = new Map<string, any[]>();
        for (const feedback of feedbacks) {
            if (!feedbacksBySession.has(feedback.sessionId)) {
                feedbacksBySession.set(feedback.sessionId, []);
            }
            feedbacksBySession.get(feedback.sessionId)!.push(feedback);
        }

        // Process feedbacks by session
        for (const [sessionId, sessionFeedbacks] of feedbacksBySession.entries()) {
            try {
                // Load session
                const session = await collections!.user_sessions.findOne({ session_id: sessionId });
                if (!session) {
                    for (const feedback of sessionFeedbacks) {
                        const errorMsg = `Session ${sessionId} not found`;
                        errors.push(errorMsg);
                        results.push({
                            sessionId: feedback.sessionId,
                            productId: feedback.productId,
                            action: feedback.action,
                            processed: false,
                            modelUpdated: false,
                            error: errorMsg
                        });
                        failedFeedbacks++;
                    }
                    if (!continueOnError) break;
                    continue;
                }

                if (session.status !== 'active') {
                    for (const feedback of sessionFeedbacks) {
                        const errorMsg = `Session ${sessionId} is not active`;
                        errors.push(errorMsg);
                        results.push({
                            sessionId: feedback.sessionId,
                            productId: feedback.productId,
                            action: feedback.action,
                            processed: false,
                            modelUpdated: false,
                            error: errorMsg
                        });
                        failedFeedbacks++;
                    }
                    if (!continueOnError) break;
                    continue;
                }

                // Load LinUCB model for this session
                const interactions = await collections!.interactions.find({ session_id: sessionId }).toArray();
                const linucbModel = new LinUCBModel(session.alpha, session.feature_dimensions);
                linucbModel.setSessionId(sessionId);

                // Replay existing interactions
                for (const interaction of interactions) {
                    if (interaction.feature_vector && typeof interaction.reward === 'number') {
                        linucbModel.updateModel(interaction.feature_vector, interaction.reward);
                    }
                }

                // Process feedbacks for this session
                const sessionStartTime = Date.now();
                let sessionSuccessCount = 0;
                const interactionDocs: any[] = [];

                for (const feedback of sessionFeedbacks) {
                    try {
                        const { productId, action, context = {} } = feedback;

                        // Load product
                        const product = await collections!.products.findOne({ product_id: productId }) as ProductDocument | null;
                        if (!product) {
                            const errorMsg = `Product ${productId} not found`;
                            errors.push(errorMsg);
                            results.push({
                                sessionId,
                                productId,
                                action,
                                processed: false,
                                modelUpdated: false,
                                error: errorMsg
                            });
                            failedFeedbacks++;
                            if (!continueOnError) break;
                            continue;
                        }

                        // Get feature vector
                        const featureVector = product.feature_vector || await createFeatureVector(product);
                        if (!validateFeatureVector(featureVector)) {
                            const errorMsg = `Invalid feature vector for product ${productId}`;
                            errors.push(errorMsg);
                            results.push({
                                sessionId,
                                productId,
                                action,
                                processed: false,
                                modelUpdated: false,
                                error: errorMsg
                            });
                            failedFeedbacks++;
                            if (!continueOnError) break;
                            continue;
                        }

                        // Calculate reward and update model
                        const reward = mapActionToReward(action);
                        const scoreBefore = linucbModel.calculateUCBScore(featureVector);

                        if (updateModelImmediately) {
                            linucbModel.updateModel(featureVector, reward);
                        }

                        const scoreAfter = linucbModel.calculateUCBScore(featureVector);

                        // Update session history
                        await updateUserAction(
                            collections!.session_history,
                            sessionId,
                            productId,
                            action.toLowerCase() as 'love' | 'dislike' | 'skipped'
                        );

                        // Prepare interaction document for batch insert
                        const interactionDoc = {
                            session_id: sessionId,
                            product_id: productId,
                            action: action.toLowerCase(),
                            reward,
                            feature_vector: featureVector,
                            context: {
                                ...context,
                                batch_processed: true,
                                batch_timestamp: new Date()
                            },
                            timestamp: new Date(),
                            score_before: scoreBefore.ucbScore,
                            score_after: scoreAfter.ucbScore
                        };

                        interactionDocs.push(interactionDoc);
                        sessionSuccessCount++;

                        results.push({
                            sessionId,
                            productId,
                            action,
                            processed: true,
                            modelUpdated: updateModelImmediately,
                            processing_time_ms: Date.now() - sessionStartTime,
                            reward,
                            score_change: scoreAfter.ucbScore - scoreBefore.ucbScore
                        });

                    } catch (feedbackError) {
                        const errorMsg = `Failed to process feedback for product ${feedback.productId}: ${(feedbackError as Error).message}`;
                        errors.push(errorMsg);
                        results.push({
                            sessionId,
                            productId: feedback.productId,
                            action: feedback.action,
                            processed: false,
                            modelUpdated: false,
                            error: errorMsg
                        });
                        failedFeedbacks++;
                        if (!continueOnError) break;
                    }
                }

                // Batch insert interactions for this session
                if (interactionDocs.length > 0) {
                    try {
                        // Simple batch insert (transactions can be added later with proper client access)
                        await collections!.interactions.insertMany(interactionDocs);
                        await collections!.user_sessions.updateOne(
                            { session_id: sessionId },
                            {
                                $set: {
                                    updated_at: new Date(),
                                    total_interactions: linucbModel.totalInteractions
                                }
                            }
                        );
                    } catch (insertError) {
                        console.error(`❌ Failed to insert interactions for session ${sessionId}:`, insertError);
                        // Mark as failed but continue processing
                        for (let i = sessionSuccessCount - interactionDocs.length; i < sessionSuccessCount; i++) {
                            if (results[i] && results[i].sessionId === sessionId) {
                                results[i].processed = false;
                                results[i].error = 'Database insert failed';
                            }
                        }
                        failedFeedbacks += interactionDocs.length;
                        successfulFeedbacks -= interactionDocs.length;
                    }
                }

                successfulFeedbacks += sessionSuccessCount;

            } catch (sessionError) {
                // Handle session-level errors
                for (const feedback of sessionFeedbacks) {
                    const errorMsg = `Session processing failed: ${(sessionError as Error).message}`;
                    errors.push(errorMsg);
                    results.push({
                        sessionId: feedback.sessionId,
                        productId: feedback.productId,
                        action: feedback.action,
                        processed: false,
                        modelUpdated: false,
                        error: errorMsg
                    });
                    failedFeedbacks++;
                }
                if (!continueOnError) break;
            }
        }

        const processingTime = Date.now() - startTime;

        console.log(`📦 Batch feedback completed: ${successfulFeedbacks}/${feedbacks.length} successful, ${processingTime}ms`);

        res.status(200).json({
            success: true,
            total_feedbacks: feedbacks.length,
            successful_feedbacks: successfulFeedbacks,
            failed_feedbacks: failedFeedbacks,
            processing_time_ms: processingTime,
            options_used: {
                enableTransactions,
                continueOnError,
                updateModelImmediately
            },
            results,
            errors: errors.length > 0 ? errors : undefined,
            summary: {
                sessions_processed: feedbacksBySession.size,
                average_processing_time: Math.round(processingTime / feedbacks.length),
                success_rate: Math.round((successfulFeedbacks / feedbacks.length) * 100)
            }
        });

    } catch (error) {
        console.error('❌ Batch feedback processing failed:', error);
        res.status(500).json({
            success: false,
            error: 'Batch feedback processing failed',
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
 * POST /api/recommendations/batch
 * Get multiple product recommendations in a single request
 */
router.post('/batch', requireDatabase, validateBatchRecommendationRequest, handleValidationErrors, async (req: Request, res: Response): Promise<void> => {
    try {
        const { collections } = req.app.locals as AppLocals;
        const startTime = Date.now();

        // Validate request body structure
        const { requests, globalSettings = {} } = req.body;

        if (!Array.isArray(requests) || requests.length === 0) {
            res.status(400).json({
                success: false,
                error: 'Invalid request format',
                message: 'Requests array is required and must contain at least one item'
            });
            return;
        }

        if (requests.length > 10) {
            res.status(400).json({
                success: false,
                error: 'Too many requests',
                message: 'Maximum 10 requests allowed per batch'
            });
            return;
        }

        const {
            defaultCount = 5,
            enableParallelProcessing = true,
            includeDebugInfo = false
        } = globalSettings;

        const responses: any[] = [];
        const errors: string[] = [];

        // Process requests (parallel or sequential based on settings)
        if (enableParallelProcessing) {
            // Process all requests in parallel
            const promises = requests.map(async (request: any, index: number) => {
                try {
                    const result = await processSingleRecommendationRequest(
                        collections!,
                        request,
                        defaultCount,
                        includeDebugInfo
                    );
                    return { index, result, error: null };
                } catch (error) {
                    return {
                        index,
                        result: null,
                        error: `Request ${index + 1}: ${(error as Error).message}`
                    };
                }
            });

            const results = await Promise.all(promises);

            // Sort results by original index and separate successes from errors
            results.sort((a, b) => a.index - b.index);

            for (const { result, error } of results) {
                if (error) {
                    errors.push(error);
                    responses.push({
                        success: false,
                        error: 'Request processing failed',
                        message: error
                    });
                } else {
                    responses.push({
                        success: true,
                        data: result
                    });
                }
            }
        } else {
            // Process requests sequentially
            for (let i = 0; i < requests.length; i++) {
                try {
                    const result = await processSingleRecommendationRequest(
                        collections!,
                        requests[i],
                        defaultCount,
                        includeDebugInfo
                    );
                    responses.push({
                        success: true,
                        data: result
                    });
                } catch (error) {
                    const errorMsg = `Request ${i + 1}: ${(error as Error).message}`;
                    errors.push(errorMsg);
                    responses.push({
                        success: false,
                        error: 'Request processing failed',
                        message: errorMsg
                    });
                }
            }
        }

        const processingTime = Date.now() - startTime;
        const successfulRequests = responses.filter(r => r.success).length;

        console.log(`📦 Batch recommendation completed: ${successfulRequests}/${requests.length} successful, ${processingTime}ms`);

        res.status(200).json({
            success: true,
            total_requests: requests.length,
            successful_requests: successfulRequests,
            failed_requests: requests.length - successfulRequests,
            processing_time_ms: processingTime,
            processing_mode: enableParallelProcessing ? 'parallel' : 'sequential',
            responses,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error('❌ Batch recommendation failed:', error);
        res.status(500).json({
            success: false,
            error: 'Batch processing failed',
            message: (error as Error).message
        });
    }
});

/**
 * Helper function to process a single recommendation request
 */
async function processSingleRecommendationRequest(
    collections: any,
    request: any,
    defaultCount: number,
    includeDebugInfo: boolean
): Promise<any> {
    const { sessionId, count = defaultCount, filters = {} } = request;
    const requestId = request.id || `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // Validate session ID
    if (!sessionId || typeof sessionId !== 'string' || sessionId.length !== 36) {
        throw new Error('Invalid session ID format');
    }

    // Check if session exists
    const session = await collections.user_sessions.findOne({ session_id: sessionId });
    if (!session) {
        throw new Error('Session not found');
    }

    if (session.status !== 'active') {
        throw new Error('Session is not active');
    }

    // Apply filters
    const {
        minPrice = 0,
        maxPrice = 10000,
        category,
        brand,
        color,
        style,
        occasion,
        season
    } = filters;

    // Validate filter parameters
    if (typeof minPrice !== 'number' || typeof maxPrice !== 'number' ||
        minPrice < 0 || maxPrice < 0 || minPrice > maxPrice) {
        throw new Error('Invalid price filter parameters');
    }

    if (count < 1 || count > 10) {
        throw new Error('Count must be between 1 and 10');
    }

    // Get session history and user preferences
    const sessionHistory = await getSessionHistory(collections.session_history, sessionId);
    const userPreferences = await getUserPreferences(
        collections.session_history,
        collections.products,
        sessionId
    );

    // Calculate diversity rules
    const diversityRules = await calculateDiversityNeeds(sessionHistory, collections.products);

    // Get recently shown products for exclusion
    const recentlyShown = sessionHistory.slice(0, DIVERSITY_CONFIG.EXCLUSION_WINDOW);
    const excludeIds = recentlyShown.map(entry => entry.product_id);

    // Build database filters
    const additionalFilters: any = {
        price: { $gte: minPrice, $lte: maxPrice }
    };

    if (category && category !== 'all') {
        additionalFilters.category_main = { $regex: new RegExp(category, 'i') };
    }

    if (brand) {
        additionalFilters.brand = { $regex: new RegExp(brand, 'i') };
    }

    if (color) {
        additionalFilters.primary_color = { $regex: new RegExp(color, 'i') };
    }

    if (style && style !== 'all') {
        additionalFilters['attributes.style'] = { $regex: new RegExp(style, 'i') };
    }

    if (occasion && occasion !== 'all') {
        additionalFilters['attributes.occasion'] = { $regex: new RegExp(occasion, 'i') };
    }

    if (season && season !== 'all') {
        additionalFilters['attributes.season'] = { $regex: new RegExp(season, 'i') };
    }

    // Get filtered candidates
    const candidates = await getFilteredCandidates(
        collections.products,
        excludeIds,
        diversityRules,
        additionalFilters
    );

    if (candidates.length === 0) {
        throw new Error('No products found matching the criteria');
    }

    // Load and rebuild LinUCB model
    const interactions = await collections.interactions.find({ session_id: sessionId }).toArray();
    const linucbModel = new LinUCBModel(session.alpha, session.feature_dimensions);
    linucbModel.setSessionId(sessionId);

    // Replay interactions
    for (const interaction of interactions) {
        if (interaction.feature_vector && typeof interaction.reward === 'number') {
            linucbModel.updateModel(interaction.feature_vector, interaction.reward);
        }
    }

    // Score all candidates
    const scoredProducts: ScoredProduct[] = [];
    for (const product of candidates) {
        try {
            const featureVector = product.feature_vector || await createFeatureVector(product as ProductDocument);

            if (!validateFeatureVector(featureVector)) {
                continue;
            }

            const scoreResult = linucbModel.calculateUCBScore(featureVector);
            if (scoreResult.success) {
                const diversityScore = calculateDiversityScore(
                    product as ProductCandidate,
                    scoreResult.ucbScore,
                    userPreferences,
                    linucbModel.totalInteractions
                );
                scoredProducts.push(diversityScore);
            }
        } catch (error) {
            continue; // Skip problematic products
        }
    }

    if (scoredProducts.length === 0) {
        throw new Error('No products could be scored with current model');
    }

    // Sort by final score and select top N
    scoredProducts.sort((a, b) => b.finalScore - a.finalScore);
    const selectedProducts = scoredProducts.slice(0, count);

    // Record shown products in session history
    for (const selected of selectedProducts) {
        await recordShownProduct(
            collections.session_history,
            sessionId,
            selected.product.product_id
        );
    }

    // Prepare recommendations
    const recommendations = selectedProducts.map(selected => ({
        product: {
            product_id: selected.product.product_id,
            _id: selected.product._id,
            id: selected.product.product_id,
            name: selected.product.name,
            brand: selected.product.brand,
            price: selected.product.price,
            category: selected.product.category_main,
            color: selected.product.primary_color,
            image: selected.product.urls?.image || selected.product.image,
            product_url: selected.product.urls?.product || selected.product.product_url,
            urls: {
                image: selected.product.urls?.image || selected.product.image,
                product: selected.product.urls?.product || selected.product.product_url
            },
            attributes: selected.product.attributes
        },
        confidence_score: selected.finalScore,
        base_score: selected.baseScore,
        diversity_bonus: selected.diversityBonus,
        exploration_bonus: selected.explorationBonus,
        algorithm: 'Enhanced LinUCB with Diversity'
    }));

    const result: any = {
        request_id: requestId,
        session_id: sessionId,
        count: selectedProducts.length,
        recommendations,
        filters_applied: filters,
        user_stats: {
            total_interactions: linucbModel.totalInteractions,
            session_length: sessionHistory.length,
            confidence_level: linucbModel.totalInteractions > 5 ? 'high' : 'building'
        }
    };

    if (includeDebugInfo) {
        result.debug_info = {
            candidates_found: candidates.length,
            products_scored: scoredProducts.length,
            top_alternatives: scoredProducts.slice(count, count + 3).map(p => ({
                product_id: p.product.product_id,
                name: p.product.name,
                final_score: p.finalScore
            })),
            diversity_rules: diversityRules,
            user_preferences: userPreferences
        };
    }

    return result;
}

/**
 * GET /api/feedback/status/:sessionId/:productId/:action
 * Check the status of a specific feedback submission
 */
router.get('/feedback/status/:sessionId/:productId/:action', checkFeedbackStatus);

/**
 * Helper function to create feature vector from product data
 */
async function createFeatureVector(product: ProductDocument): Promise<number[]> {
    // Import the feature mapping utility
    const { extractFeatures } = await import('../utils/featureMapping.js');
    return extractFeatures(product);
}

export default router;
