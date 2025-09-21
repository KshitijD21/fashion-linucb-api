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

// Configuration constants
export const LINUCB_CONFIG = {
    FEATURE_DIMENSIONS: 26,
    DEFAULT_ALPHA: 0.2,
    REGULARIZATION_LAMBDA: 0.01,
    MIN_ALPHA: 0.05,
    MAX_ALPHA: 2.0,
    ADAPTIVE_ALPHA_DECAY: 0.95
} as const;

// Type definitions
export interface LinUCBConfig {
    alpha?: number;
    dimensions?: number;
}

export interface UCBScoreResult {
    success: boolean;
    ucbScore: number;
    expectedReward: number;
    confidenceBound: number;
    variance: number;
    reasoning: string;
    error?: string;
}

export interface UpdateResult {
    success: boolean;
    previousTheta: number[];
    newTheta: number[];
    modelChange: number;
    totalInteractions: number;
    confidenceImprovement: number;
    error?: string;
}

export interface UserInsights {
    confidenceLevel: 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
    learningProgress: string;
    totalInteractions: number;
    topPreferences: Array<{
        feature: string;
        strength: number;
        category: string;
    }>;
    topAversions: Array<{
        feature: string;
        strength: number;
        category: string;
    }>;
    recommendations: string[];
}

export interface ModelSnapshot {
    session_id: string | null;
    algorithm: string;
    alpha: number;
    interactions: number;
    theta_vector: number[];
    last_updated: string;
    learning_progress: string;
    confidence_level: string;
}

/**
 * LinUCB Algorithm Implementation
 */
export class LinUCBModel {
    public alpha: number;
    public dimensions: number;
    public sessionId: string | null;
    public totalInteractions: number;
    public lastUpdated: Date;
    public A!: Matrix;
    public b!: Matrix;
    public theta: Matrix | null;

    constructor(alpha: number = LINUCB_CONFIG.DEFAULT_ALPHA, dimensions: number = LINUCB_CONFIG.FEATURE_DIMENSIONS) {
        this.alpha = alpha;
        this.dimensions = dimensions;
        this.sessionId = null;
        this.totalInteractions = 0;
        this.lastUpdated = new Date();
        this.theta = null;

        this.initialize();
    }

    /**
     * Initialize LinUCB matrices and vectors
     */
    private initialize(): void {
        try {
            // θ (theta): User preference vector - starts at zero
            this.theta = Matrix.zeros(this.dimensions, 1) as Matrix;

            // A: Confidence matrix - starts as identity matrix (26x26)
            this.A = Matrix.eye(this.dimensions, this.dimensions) as Matrix;

            // b: Accumulator vector - starts at zero (26x1)
            this.b = Matrix.zeros(this.dimensions, 1) as Matrix;

            console.log(`✅ LinUCB model initialized: ${this.dimensions}D, α=${this.alpha}`);

        } catch (error: unknown) {
            console.error('❌ LinUCB initialization failed:', error);
            throw new Error(`Failed to initialize LinUCB model: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Calculate UCB score for a product feature vector
     */
    calculateUCBScore(featureVector: number[]): UCBScoreResult {
        try {
            if (!this.theta) {
                throw new Error('Model not properly initialized');
            }

            // Convert feature vector to Matrix (26x1)
            const x = new Matrix([featureVector]).transpose();

            // Expected reward: θᵀx
            const expectedReward = this.theta.transpose().mmul(x).get(0, 0);

            let confidenceBound = 0;

            try {
                // Confidence bound: α√(xᵀA⁻¹x)
                const AInverse = inverse(this.A);
                const AInverseX = AInverse.mmul(x);
                const xTAInverseX = x.transpose().mmul(AInverseX).get(0, 0);
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
                ucbScore,
                expectedReward,
                confidenceBound,
                variance: (confidenceBound / this.alpha) ** 2,
                reasoning: this.totalInteractions < 5
                    ? 'Exploratory recommendation to learn your preferences'
                    : 'Balanced recommendation based on learned preferences'
            };

        } catch (error: unknown) {
            console.error('❌ UCB score calculation failed:', error);
            return {
                success: false,
                ucbScore: 0,
                expectedReward: 0,
                confidenceBound: 0,
                variance: 0,
                reasoning: 'Error in score calculation',
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Update model with user feedback
     */
    updateModel(featureVector: number[], reward: number): UpdateResult {
        try {
            if (!this.theta) {
                throw new Error('Model not properly initialized');
            }

            // Store previous state for comparison
            const previousTheta = this.theta.clone();

            // Convert feature vector to Matrix (26x1)
            const x = new Matrix([featureVector]).transpose();

            // Update A: A = A + xxᵀ
            const xxT = x.mmul(x.transpose());
            this.A = this.A.add(xxT);

            // Update b: b = b + r*x (reward * feature vector)
            const rewardX = x.mul(reward);
            this.b = this.b.add(rewardX);

            // Update θ: θ = A⁻¹b
            try {
                this.theta = inverse(this.A).mmul(this.b);
            } catch (inversionError) {
                console.warn('⚠️ Matrix inversion failed during update, using regularized version');
                // Fallback with regularization
                const regularizedA = this.A.add(
                    Matrix.eye(this.dimensions, this.dimensions)
                        .mul(LINUCB_CONFIG.REGULARIZATION_LAMBDA)
                );
                this.theta = inverse(regularizedA).mmul(this.b);
            }

            // Update metadata
            this.totalInteractions++;
            this.lastUpdated = new Date();

            // Calculate model change magnitude
            const thetaDiff = this.theta.sub(previousTheta);
            const modelChange = Math.sqrt(
                thetaDiff.transpose().mmul(thetaDiff).get(0, 0)
            );

            // Calculate confidence improvement (simple heuristic)
            const confidenceImprovement = Math.min(modelChange * 10, 1.0);

            console.log(`🔄 Model updated: interaction #${this.totalInteractions}, change: ${modelChange.toFixed(6)}`);

            return {
                success: true,
                previousTheta: previousTheta.to2DArray().flat(),
                newTheta: this.theta.to2DArray().flat(),
                modelChange,
                totalInteractions: this.totalInteractions,
                confidenceImprovement
            };

        } catch (error: unknown) {
            console.error('❌ Model update failed:', error);
            return {
                success: false,
                previousTheta: [],
                newTheta: [],
                modelChange: 0,
                totalInteractions: this.totalInteractions,
                confidenceImprovement: 0,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Generate insights about user preferences
     */
    generateInsights(): UserInsights {
        try {
            const insights: UserInsights = {
                confidenceLevel: 'very_low',
                learningProgress: '0%',
                totalInteractions: this.totalInteractions,
                topPreferences: [],
                topAversions: [],
                recommendations: []
            };

            // Early stage - need more data
            if (this.totalInteractions < 3) {
                insights.recommendations.push('More interactions needed for personalized insights');
                return insights;
            }

            if (!this.theta) {
                insights.recommendations.push('Model not initialized properly');
                return insights;
            }

            // Extract theta values with feature mapping
            const thetaValues = [];
            for (let i = 0; i < this.dimensions; i++) {
                const value = this.theta.get(i, 0);
                const feature = this.getCategoryFromIndex(i);
                thetaValues.push({
                    feature,
                    strength: Math.abs(value),
                    category: this.getFeatureCategoryFromIndex(i),
                    value
                });
            }

            // Sort by absolute strength
            thetaValues.sort((a, b) => b.strength - a.strength);

            // Top preferences (positive values)
            insights.topPreferences = thetaValues
                .filter(item => item.value > 0.1)
                .slice(0, 5)
                .map(item => ({
                    feature: item.feature,
                    strength: item.strength,
                    category: item.category
                }));

            // Top aversions (negative values)
            insights.topAversions = thetaValues
                .filter(item => item.value < -0.1)
                .slice(0, 5)
                .map(item => ({
                    feature: item.feature,
                    strength: item.strength,
                    category: item.category
                }));

            // Calculate confidence level based on interactions and theta magnitude
            if (!this.theta) {
                insights.confidenceLevel = 'very_low';
            } else {
                const thetaMagnitude = Math.sqrt(this.theta.transpose().mmul(this.theta).get(0, 0));
                if (this.totalInteractions >= 20 && thetaMagnitude > 1.0) {
                    insights.confidenceLevel = 'very_high';
                } else if (this.totalInteractions >= 10 && thetaMagnitude > 0.5) {
                    insights.confidenceLevel = 'high';
                } else if (this.totalInteractions >= 5 && thetaMagnitude > 0.3) {
                    insights.confidenceLevel = 'medium';
                } else if (this.totalInteractions >= 3) {
                    insights.confidenceLevel = 'low';
                }
            }

            // Learning progress
            const progressPercent = Math.min((this.totalInteractions / 20) * 100, 100);
            insights.learningProgress = `${Math.round(progressPercent)}%`;

            // Generate recommendations based on insights
            if (insights.topPreferences.length > 0) {
                const topPref = insights.topPreferences[0];
                insights.recommendations.push(`Strongly prefers ${topPref.feature.toLowerCase()} items`);
            }

            if (insights.topAversions.length > 0) {
                const topAversion = insights.topAversions[0];
                insights.recommendations.push(`Tends to avoid ${topAversion.feature.toLowerCase()} items`);
            }

            if (this.totalInteractions >= 10) {
                insights.recommendations.push('Preferences are becoming well-established');
            }

            return insights;

        } catch (error: unknown) {
            console.error('❌ Insights generation failed:', error);
            return {
                confidenceLevel: 'very_low',
                learningProgress: '0%',
                totalInteractions: this.totalInteractions,
                topPreferences: [],
                topAversions: [],
                recommendations: ['Error generating insights'],
                error: error instanceof Error ? error.message : 'Unknown error'
            } as UserInsights & { error: string };
        }
    }

    /**
     * Get feature category from index
     */
    private getCategoryFromIndex(index: number): string {
        // Feature mapping based on our 26-dimensional vector
        const featureMap: { [key: number]: string } = {
            // Categories (0-4)
            0: 'Tops', 1: 'Bottoms', 2: 'Dresses', 3: 'Outerwear', 4: 'Accessories',
            // Colors (5-12)
            5: 'Black', 6: 'White', 7: 'Red', 8: 'Blue', 9: 'Green', 10: 'Pink', 11: 'Brown', 12: 'Multi',
            // Occasions (13-16)
            13: 'Casual', 14: 'Formal', 15: 'Party', 16: 'Work',
            // Seasons (17-20)
            17: 'Spring', 18: 'Summer', 19: 'Fall', 20: 'Winter',
            // Styles (21-25)
            21: 'Minimalist', 22: 'Bohemian', 23: 'Classic', 24: 'Trendy', 25: 'Vintage'
        };

        return featureMap[index] || `Feature_${index}`;
    }

    /**
     * Get feature category type from index
     */
    private getFeatureCategoryFromIndex(index: number): string {
        if (index < 5) return 'Category';
        if (index < 13) return 'Color';
        if (index < 17) return 'Occasion';
        if (index < 21) return 'Season';
        return 'Style';
    }

    /**
     * Export model state for persistence
     */
    toJSON(): ModelSnapshot {
        return {
            session_id: this.sessionId,
            algorithm: 'LinUCB',
            alpha: this.alpha,
            interactions: this.totalInteractions,
            theta_vector: this.theta ? this.theta.to2DArray().flat() : [],
            last_updated: this.lastUpdated.toISOString(),
            learning_progress: this.generateInsights().learningProgress,
            confidence_level: this.generateInsights().confidenceLevel
        };
    }

    /**
     * Restore model from JSON data
     */
    static fromJSON(data: any): LinUCBModel {
        const model = new LinUCBModel(data.alpha, data.theta_vector?.length || LINUCB_CONFIG.FEATURE_DIMENSIONS);
        model.sessionId = data.session_id;
        model.totalInteractions = data.interactions || 0;
        model.lastUpdated = new Date(data.last_updated || Date.now());

        if (data.theta_vector && Array.isArray(data.theta_vector)) {
            try {
                // Restore theta vector
                model.theta = new Matrix([data.theta_vector]).transpose();

                // TODO: Could restore A and b matrices if they were saved
                // For now, we'll reinitialize them and let the model rebuild
                console.log(`✅ LinUCB model restored: ${model.totalInteractions} interactions, α=${model.alpha}`);

            } catch (error) {
                console.warn('⚠️ Could not fully restore model state, reinitializing');
                model.initialize();
            }
        }

        return model;
    }

    /**
     * Set session ID for this model instance
     */
    setSessionId(sessionId: string): void {
        this.sessionId = sessionId;
    }

    /**
     * Get current alpha value
     */
    getAlpha(): number {
        return this.alpha;
    }

    /**
     * Adapt alpha based on learning progress (optional advanced feature)
     */
    adaptAlpha(): void {
        if (this.totalInteractions > 10) {
            // Reduce exploration as we learn more
            this.alpha = Math.max(
                LINUCB_CONFIG.MIN_ALPHA,
                this.alpha * LINUCB_CONFIG.ADAPTIVE_ALPHA_DECAY
            );
        }
    }
}

/**
 * Utility function to map user actions to rewards
 */
export function mapActionToReward(action: string): number {
    const rewardMap: { [key: string]: number } = {
        'love': 2.0,
        'like': 1.0,
        'dislike': -1.0,
        'skip': -0.5,
        'neutral': 0.0
    };

    return rewardMap[action.toLowerCase()] ?? 0.0;
}

/**
 * Utility function to validate feature vectors
 */
export function validateFeatureVector(vector: number[]): boolean {
    return Array.isArray(vector) &&
           vector.length === LINUCB_CONFIG.FEATURE_DIMENSIONS &&
           vector.every(val => typeof val === 'number' && !isNaN(val));
}
