/**
 * LinUCB (Linear Upper Confidence Bound) Contextual Bandit Algorithm
 *
 * This module implements the LinUCB algorithm for fashion recommendation.
 * It learns user preferences through interaction feedback and makes
 * personalized recommendations with confidence bounds.
 *
 * Mathematical Foundation:
 * - θ (theta): User preference vector (26-dimensional)
 * - A: Confidence matrix (26x26, starts as identity)
 * - b: Accumulator vector (26-dimensional)
 * - α (alpha): Exploration parameter (controls exploration vs exploitation)
 *
 * UCB Score = θᵀx + α√(xᵀA⁻¹x)
 * Where x is the product feature vector
 */

import { Matrix, inverse } from 'ml-matrix';
import { v4 as uuidv4 } from 'uuid';

// Configuration constants
export const LINUCB_CONFIG = {
    FEATURE_DIMENSIONS: 26,
    DEFAULT_ALPHA: 0.2,
    REGULARIZATION_LAMBDA: 0.01,
    MIN_ALPHA: 0.05,
    MAX_ALPHA: 2.0,
    ADAPTIVE_ALPHA_DECAY: 0.95
};

/**
 * LinUCB Algorithm Implementation
 */
export class LinUCBModel {
    constructor(alpha = LINUCB_CONFIG.DEFAULT_ALPHA, dimensions = LINUCB_CONFIG.FEATURE_DIMENSIONS) {
        this.alpha = alpha;
        this.dimensions = dimensions;
        this.sessionId = null;
        this.totalInteractions = 0;
        this.lastUpdated = new Date();

        this.initialize();
    }

    /**
     * Initialize LinUCB matrices and vectors
     */
    initialize() {
        try {
            // θ (theta): User preference vector - starts at zero
            this.theta = Matrix.zeros(this.dimensions, 1);

            // A: Confidence matrix - starts as identity matrix with regularization
            this.A = Matrix.eye(this.dimensions, this.dimensions)
                .mul(1 + LINUCB_CONFIG.REGULARIZATION_LAMBDA);

            // b: Accumulator vector - starts at zero
            this.b = Matrix.zeros(this.dimensions, 1);

            console.log(`✅ LinUCB model initialized: ${this.dimensions}D, α=${this.alpha}`);

        } catch (error) {
            console.error('❌ LinUCB initialization failed:', error);
            throw new Error(`Failed to initialize LinUCB model: ${error.message}`);
        }
    }

    /**
     * Calculate UCB score for a product feature vector
     * UCB Score = θᵀx + α√(xᵀA⁻¹x)
     *
     * @param {Array<number>} featureVector - Product feature vector (26-dimensional)
     * @returns {Object} - {ucbScore, expectedReward, confidenceBound, success}
     */
    calculateUCBScore(featureVector) {
        try {
            // Validate feature vector
            if (!Array.isArray(featureVector) || featureVector.length !== this.dimensions) {
                throw new Error(`Invalid feature vector: expected ${this.dimensions} dimensions, got ${featureVector.length}`);
            }

            // Convert to column matrix
            const x = Matrix.columnVector(featureVector);

            // Calculate expected reward: θᵀx
            const expectedReward = this.theta.transpose().mmul(x).get(0, 0);

            // Calculate confidence bound: α√(xᵀA⁻¹x)
            let confidenceBound = 0;
            try {
                // Compute A⁻¹x efficiently
                const AInverse = inverse(this.A);
                const AInverseX = AInverse.mmul(x);
                const xTAInverseX = x.transpose().mmul(AInverseX).get(0, 0);

                // Ensure non-negative for square root
                const variance = Math.max(0, xTAInverseX);
                confidenceBound = this.alpha * Math.sqrt(variance);

            } catch (inversionError) {
                console.warn('⚠️ Matrix inversion failed, using regularized version');

                // Fallback: Add more regularization and retry
                const regularizedA = this.A.add(
                    Matrix.eye(this.dimensions, this.dimensions)
                        .mul(LINUCB_CONFIG.REGULARIZATION_LAMBDA * 10)
                );

                const AInverse = inverse(regularizedA);
                const AInverseX = AInverse.mmul(x);
                const xTAInverseX = x.transpose().mmul(AInverseX).get(0, 0);
                const variance = Math.max(0, xTAInverseX);
                confidenceBound = this.alpha * Math.sqrt(variance);
            }

            // Final UCB score
            const ucbScore = expectedReward + confidenceBound;

            return {
                success: true,
                ucbScore: parseFloat(ucbScore.toFixed(6)),
                expectedReward: parseFloat(expectedReward.toFixed(6)),
                confidenceBound: parseFloat(confidenceBound.toFixed(6)),
                variance: parseFloat((confidenceBound / this.alpha) ** 2)
            };

        } catch (error) {
            console.error('❌ UCB score calculation failed:', error);

            // Fallback: Return random score with high uncertainty
            return {
                success: false,
                ucbScore: Math.random() * 0.5,
                expectedReward: 0,
                confidenceBound: 0.5,
                error: error.message
            };
        }
    }

    /**
     * Update LinUCB model based on user feedback
     * Learning Updates:
     * - A ← A + xxᵀ (outer product update)
     * - b ← b + r*x (reward-weighted feature update)
     * - θ ← A⁻¹b (solve for new preferences)
     *
     * @param {Array<number>} featureVector - Product feature vector
     * @param {number} reward - User feedback reward (-1 to +2)
     * @returns {Object} - Update result with new parameters
     */
    updateModel(featureVector, reward) {
        try {
            // Validate inputs
            if (!Array.isArray(featureVector) || featureVector.length !== this.dimensions) {
                throw new Error(`Invalid feature vector: expected ${this.dimensions} dimensions`);
            }

            if (typeof reward !== 'number' || reward < -1 || reward > 2) {
                throw new Error(`Invalid reward: must be number between -1 and 2, got ${reward}`);
            }

            // Convert to column matrix
            const x = Matrix.columnVector(featureVector);

            // Store previous theta for comparison
            const previousTheta = this.theta.clone();

            // Update A: A ← A + xxᵀ
            const xxT = x.mmul(x.transpose());
            this.A = this.A.add(xxT);

            // Update b: b ← b + r*x
            const rewardedX = x.mul(reward);
            this.b = this.b.add(rewardedX);

            // Update θ: θ ← A⁻¹b
            try {
                this.theta = inverse(this.A).mmul(this.b);
            } catch (inversionError) {
                console.warn('⚠️ Matrix inversion failed during update, using regularization');

                // Add regularization and retry
                const regularizedA = this.A.add(
                    Matrix.eye(this.dimensions, this.dimensions)
                        .mul(LINUCB_CONFIG.REGULARIZATION_LAMBDA)
                );
                this.theta = inverse(regularizedA).mmul(this.b);
            }

            // Update metadata
            this.totalInteractions++;
            this.lastUpdated = new Date();

            // Adaptive alpha (decrease exploration as we learn more)
            if (this.totalInteractions > 10) {
                this.alpha = Math.max(
                    LINUCB_CONFIG.MIN_ALPHA,
                    this.alpha * LINUCB_CONFIG.ADAPTIVE_ALPHA_DECAY
                );
            }

            // Calculate theta change magnitude for monitoring
            const thetaChange = this.theta.sub(previousTheta);
            const changeMagnitude = Math.sqrt(
                thetaChange.transpose().mmul(thetaChange).get(0, 0)
            );

            console.log(`📈 LinUCB updated: interaction #${this.totalInteractions}, Δθ=${changeMagnitude.toFixed(4)}, α=${this.alpha.toFixed(3)}`);

            return {
                success: true,
                totalInteractions: this.totalInteractions,
                changeMagnitude: parseFloat(changeMagnitude.toFixed(6)),
                currentAlpha: parseFloat(this.alpha.toFixed(4)),
                thetaNorm: parseFloat(Math.sqrt(this.theta.transpose().mmul(this.theta).get(0, 0)).toFixed(4))
            };

        } catch (error) {
            console.error('❌ LinUCB model update failed:', error);
            return {
                success: false,
                error: error.message,
                totalInteractions: this.totalInteractions
            };
        }
    }

    /**
     * Generate human-readable insights from learned preferences
     * Analyzes theta vector to understand user preferences
     *
     * @returns {Object} - User preference insights
     */
    generateInsights() {
        try {
            const insights = {
                topPreferences: [],
                topAversions: [],
                confidenceLevel: 'low',
                learningProgress: '0%',
                recommendations: []
            };

            // Only generate insights if we have enough interactions
            if (this.totalInteractions < 3) {
                insights.recommendations.push('More interactions needed for personalized insights');
                return insights;
            }

            // Feature mapping for interpretability
            const featureNames = [
                // Categories (0-4)
                'Dresses', 'Tops', 'Bottoms', 'Outerwear', 'Swimwear',
                // Colors (5-12)
                'Black', 'White', 'Blue', 'Red', 'Green', 'Pink', 'Brown', 'Grey',
                // Occasions (13-16)
                'Casual', 'Work', 'Party', 'Formal',
                // Seasons (17-20)
                'Spring', 'Summer', 'Fall', 'Winter',
                // Styles (21-25)
                'Trendy', 'Classic', 'Minimalist', 'Boho', 'Athletic'
            ];

            // Extract theta values with feature names
            const thetaValues = [];
            for (let i = 0; i < this.dimensions; i++) {
                thetaValues.push({
                    feature: featureNames[i],
                    value: this.theta.get(i, 0),
                    index: i
                });
            }

            // Sort by preference strength
            thetaValues.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

            // Extract top preferences (positive values)
            insights.topPreferences = thetaValues
                .filter(item => item.value > 0.1)
                .slice(0, 5)
                .map(item => ({
                    feature: item.feature,
                    strength: parseFloat(item.value.toFixed(3)),
                    category: this.getCategoryFromIndex(item.index)
                }));

            // Extract top aversions (negative values)
            insights.topAversions = thetaValues
                .filter(item => item.value < -0.1)
                .slice(0, 3)
                .map(item => ({
                    feature: item.feature,
                    strength: parseFloat(Math.abs(item.value).toFixed(3)),
                    category: this.getCategoryFromIndex(item.index)
                }));

            // Calculate confidence level based on interactions and theta magnitude
            const thetaMagnitude = Math.sqrt(this.theta.transpose().mmul(this.theta).get(0, 0));

            if (this.totalInteractions >= 15 && thetaMagnitude > 1.0) {
                insights.confidenceLevel = 'high';
            } else if (this.totalInteractions >= 8 && thetaMagnitude > 0.5) {
                insights.confidenceLevel = 'medium';
            } else {
                insights.confidenceLevel = 'low';
            }

            // Learning progress percentage
            const maxInteractions = 20; // Consider fully learned after 20 interactions
            insights.learningProgress = `${Math.min(100, Math.round((this.totalInteractions / maxInteractions) * 100))}%`;

            // Generate actionable recommendations
            if (insights.topPreferences.length > 0) {
                const topPref = insights.topPreferences[0];
                insights.recommendations.push(`Strongly prefers ${topPref.feature.toLowerCase()} items`);
            }

            if (insights.topAversions.length > 0) {
                const topAversion = insights.topAversions[0];
                insights.recommendations.push(`Tends to avoid ${topAversion.feature.toLowerCase()} items`);
            }

            return insights;

        } catch (error) {
            console.error('❌ Insights generation failed:', error);
            return {
                topPreferences: [],
                topAversions: [],
                confidenceLevel: 'low',
                learningProgress: '0%',
                recommendations: ['Insights temporarily unavailable'],
                error: error.message
            };
        }
    }

    /**
     * Helper method to categorize features by index
     */
    getCategoryFromIndex(index) {
        if (index <= 4) return 'category';
        if (index <= 12) return 'color';
        if (index <= 16) return 'occasion';
        if (index <= 20) return 'season';
        return 'style';
    }

    /**
     * Serialize model to database format
     */
    toJSON() {
        return {
            sessionId: this.sessionId,
            alpha: this.alpha,
            dimensions: this.dimensions,
            totalInteractions: this.totalInteractions,
            lastUpdated: this.lastUpdated,

            // Convert matrices to arrays for storage
            theta_vector: this.theta.to2DArray().flat(),
            a_matrix: this.A.to2DArray(),
            b_vector: this.b.to2DArray().flat(),

            // Metadata
            learning_progress: this.generateInsights().learningProgress,
            confidence_level: this.generateInsights().confidenceLevel
        };
    }

    /**
     * Load model from database format
     */
    static fromJSON(data) {
        try {
            const model = new LinUCBModel(data.alpha, data.dimensions);

            model.sessionId = data.sessionId;
            model.totalInteractions = data.totalInteractions || 0;
            model.lastUpdated = new Date(data.lastUpdated || Date.now());

            // Restore matrices from arrays
            if (data.theta_vector && data.theta_vector.length === model.dimensions) {
                model.theta = Matrix.columnVector(data.theta_vector);
            }

            if (data.a_matrix && data.a_matrix.length === model.dimensions) {
                model.A = new Matrix(data.a_matrix);
            }

            if (data.b_vector && data.b_vector.length === model.dimensions) {
                model.b = Matrix.columnVector(data.b_vector);
            }

            console.log(`✅ LinUCB model restored: ${model.totalInteractions} interactions, α=${model.alpha}`);
            return model;

        } catch (error) {
            console.error('❌ Failed to restore LinUCB model:', error);
            // Return fresh model as fallback
            return new LinUCBModel();
        }
    }

    /**
     * Validate model state
     */
    isValid() {
        try {
            return (
                this.theta instanceof Matrix &&
                this.A instanceof Matrix &&
                this.b instanceof Matrix &&
                this.theta.rows === this.dimensions &&
                this.A.rows === this.dimensions &&
                this.A.columns === this.dimensions &&
                this.b.rows === this.dimensions &&
                typeof this.alpha === 'number' &&
                this.alpha > 0
            );
        } catch {
            return false;
        }
    }
}

/**
 * Utility functions for LinUCB operations
 */

/**
 * Create a new LinUCB session
 */
export function createLinUCBSession(alpha = LINUCB_CONFIG.DEFAULT_ALPHA) {
    const model = new LinUCBModel(alpha);
    model.sessionId = uuidv4();
    return model;
}

/**
 * Map user action to numerical reward
 */
export function mapActionToReward(action) {
    const rewardMap = {
        'love': 2.0,
        'like': 1.0,
        'dislike': -1.0,
        'skip': 0.0,
        'neutral': 0.0
    };

    return rewardMap[action.toLowerCase()] ?? 0.0;
}

/**
 * Validate feature vector format
 */
export function validateFeatureVector(vector) {
    return (
        Array.isArray(vector) &&
        vector.length === LINUCB_CONFIG.FEATURE_DIMENSIONS &&
        vector.every(val => typeof val === 'number' && (val === 0 || val === 1))
    );
}

export default LinUCBModel;
