/**
 * Diversity Manager for Fashion LinUCB API
 *
 * This module handles product history tracking and diversity constraints
 * to prevent repetitive recommendations and over-aggressive learning.
 */

import { Collection } from 'mongodb';

// =====================================
// CONFIGURATION PARAMETERS
// =====================================

export const DIVERSITY_CONFIG = {
    EXCLUSION_WINDOW: 20,        // Don't repeat last 20 products
    CATEGORY_LIMIT: 3,           // Max 3 consecutive from same category
    COLOR_LIMIT: 2,              // Max 2 consecutive from same color
    BRAND_LIMIT: 3,              // Max 3 consecutive from same brand
    EXPLORATION_RATE: 0.3,       // 30% exploration bonus for new sessions
    TOP_CANDIDATES: 5,           // Random selection from top 5 scores
    HISTORY_RETENTION: 100,      // Keep last 100 products per session
    DIVERSITY_BONUS_CATEGORY: 0.2, // Bonus for new categories
    DIVERSITY_BONUS_COLOR: 0.15,    // Bonus for new colors
    DIVERSITY_BONUS_BRAND: 0.1,     // Bonus for new brands
} as const;

// =====================================
// TYPE DEFINITIONS
// =====================================

export interface SessionHistoryEntry {
    id?: string;
    session_id: string;
    product_id: string;
    shown_at: Date;
    user_action?: 'love' | 'dislike' | 'skipped' | null;
}

export interface DiversityRules {
    forceNewCategory: boolean;
    forceNewColor: boolean;
    forceNewBrand: boolean;
    avoidCategory: string | null;
    avoidColor: string | null;
    avoidBrand: string | null;
}

export interface UserPreferences {
    seenCategories: string[];
    seenColors: string[];
    seenBrands: string[];
    lovedCategories: string[];
    lovedColors: string[];
    lovedBrands: string[];
    recentHistory: SessionHistoryEntry[];
}

export interface ProductCandidate {
    _id?: any;
    product_id: string;
    name: string;
    brand: string;
    category_main: string;
    primary_color: string;
    price: number;
    original_price?: number;
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
    attributes?: {
        style?: string;
        occasion?: string;
        season?: string;
        material?: string;
        [key: string]: any;
    };
    feature_vector?: number[];
    [key: string]: any;
}

export interface ScoredProduct {
    product: ProductCandidate;
    finalScore: number;
    baseScore: number;
    diversityBonus: number;
    explorationBonus: number;
}

// =====================================
// SESSION HISTORY MANAGEMENT
// =====================================

/**
 * Record that a product was shown to a user
 */
export async function recordShownProduct(
    sessionHistoryCollection: Collection,
    sessionId: string,
    productId: string
): Promise<void> {
    try {
        // Insert new record
        await sessionHistoryCollection.insertOne({
            session_id: sessionId,
            product_id: productId,
            shown_at: new Date(),
            user_action: null
        });

        // Clean up old history (keep last HISTORY_RETENTION products per session)
        const oldRecords = await sessionHistoryCollection
            .find({ session_id: sessionId })
            .sort({ shown_at: -1 })
            .skip(DIVERSITY_CONFIG.HISTORY_RETENTION)
            .toArray();

        if (oldRecords.length > 0) {
            const oldIds = oldRecords.map(record => record._id);
            await sessionHistoryCollection.deleteMany({
                _id: { $in: oldIds }
            });
        }

        console.log(`✅ Recorded shown product: ${productId} for session: ${sessionId}`);
    } catch (error) {
        console.error('❌ Failed to record shown product:', error);
        throw error;
    }
}

/**
 * Update user action for a previously shown product
 */
export async function updateUserAction(
    sessionHistoryCollection: Collection,
    sessionId: string,
    productId: string,
    action: 'love' | 'dislike' | 'skipped'
): Promise<void> {
    try {
        await sessionHistoryCollection.updateOne(
            {
                session_id: sessionId,
                product_id: productId
            },
            {
                $set: {
                    user_action: action,
                    action_timestamp: new Date()
                }
            }
        );

        console.log(`✅ Updated user action: ${action} for product: ${productId}`);
    } catch (error) {
        console.error('❌ Failed to update user action:', error);
        throw error;
    }
}

/**
 * Get session history for a user
 */
export async function getSessionHistory(
    sessionHistoryCollection: Collection,
    sessionId: string,
    limit: number = DIVERSITY_CONFIG.HISTORY_RETENTION
): Promise<SessionHistoryEntry[]> {
    try {
        const history = await sessionHistoryCollection
            .find({ session_id: sessionId })
            .sort({ shown_at: -1 })
            .limit(limit)
            .toArray();

        return history.map(entry => ({
            id: entry._id?.toString(),
            session_id: entry.session_id,
            product_id: entry.product_id,
            shown_at: entry.shown_at,
            user_action: entry.user_action
        }));
    } catch (error) {
        console.error('❌ Failed to get session history:', error);
        throw error;
    }
}

// =====================================
// DIVERSITY RULES CALCULATION
// =====================================

/**
 * Calculate diversity constraints based on user interaction history
 */
export function calculateDiversityNeeds(
    history: SessionHistoryEntry[],
    productsCollection: Collection
): Promise<DiversityRules> {
    return new Promise(async (resolve, reject) => {
        try {
            const recent = history.slice(0, 10); // Last 10 interactions
            const loved = recent.filter(entry => entry.user_action === 'love');

            const rules: DiversityRules = {
                forceNewCategory: false,
                forceNewColor: false,
                forceNewBrand: false,
                avoidCategory: null,
                avoidColor: null,
                avoidBrand: null
            };

            if (loved.length === 0) {
                resolve(rules);
                return;
            }

            // Get product details for loved items
            const lovedProductIds = loved.map(entry => entry.product_id);
            const lovedProducts = await productsCollection
                .find({ product_id: { $in: lovedProductIds } })
                .toArray();

            // Count categories in loved items
            const categoryCount: { [key: string]: number } = {};
            const colorCount: { [key: string]: number } = {};
            const brandCount: { [key: string]: number } = {};

            lovedProducts.forEach(product => {
                if (product.category_main) {
                    categoryCount[product.category_main] = (categoryCount[product.category_main] || 0) + 1;
                }
                if (product.primary_color) {
                    colorCount[product.primary_color] = (colorCount[product.primary_color] || 0) + 1;
                }
                if (product.brand) {
                    brandCount[product.brand] = (brandCount[product.brand] || 0) + 1;
                }
            });

            // Apply diversity rules
            Object.entries(categoryCount).forEach(([category, count]) => {
                if (count >= DIVERSITY_CONFIG.CATEGORY_LIMIT) {
                    rules.forceNewCategory = true;
                    rules.avoidCategory = category;
                }
            });

            Object.entries(colorCount).forEach(([color, count]) => {
                if (count >= DIVERSITY_CONFIG.COLOR_LIMIT) {
                    rules.forceNewColor = true;
                    rules.avoidColor = color;
                }
            });

            Object.entries(brandCount).forEach(([brand, count]) => {
                if (count >= DIVERSITY_CONFIG.BRAND_LIMIT) {
                    rules.forceNewBrand = true;
                    rules.avoidBrand = brand;
                }
            });

            resolve(rules);
        } catch (error) {
            console.error('❌ Failed to calculate diversity needs:', error);
            reject(error);
        }
    });
}

/**
 * Get user preferences from history
 */
export async function getUserPreferences(
    sessionHistoryCollection: Collection,
    productsCollection: Collection,
    sessionId: string
): Promise<UserPreferences> {
    try {
        const history = await getSessionHistory(sessionHistoryCollection, sessionId);

        if (history.length === 0) {
            return {
                seenCategories: [],
                seenColors: [],
                seenBrands: [],
                lovedCategories: [],
                lovedColors: [],
                lovedBrands: [],
                recentHistory: []
            };
        }

        // Get product details for all history items
        const productIds = history.map(entry => entry.product_id);
        const products = await productsCollection
            .find({ product_id: { $in: productIds } })
            .toArray();

        // Create a map for quick product lookup
        const productMap = new Map();
        products.forEach(product => {
            productMap.set(product.product_id, product);
        });

        // Build preferences
        const seenCategories = new Set<string>();
        const seenColors = new Set<string>();
        const seenBrands = new Set<string>();
        const lovedCategories = new Set<string>();
        const lovedColors = new Set<string>();
        const lovedBrands = new Set<string>();

        history.forEach(entry => {
            const product = productMap.get(entry.product_id);
            if (product) {
                if (product.category_main) seenCategories.add(product.category_main);
                if (product.primary_color) seenColors.add(product.primary_color);
                if (product.brand) seenBrands.add(product.brand);

                if (entry.user_action === 'love') {
                    if (product.category_main) lovedCategories.add(product.category_main);
                    if (product.primary_color) lovedColors.add(product.primary_color);
                    if (product.brand) lovedBrands.add(product.brand);
                }
            }
        });

        return {
            seenCategories: Array.from(seenCategories),
            seenColors: Array.from(seenColors),
            seenBrands: Array.from(seenBrands),
            lovedCategories: Array.from(lovedCategories),
            lovedColors: Array.from(lovedColors),
            lovedBrands: Array.from(lovedBrands),
            recentHistory: history
        };
    } catch (error) {
        console.error('❌ Failed to get user preferences:', error);
        throw error;
    }
}

// =====================================
// SMART FILTERING LOGIC
// =====================================

/**
 * Get filtered product candidates with exclusions and diversity constraints
 */
export async function getFilteredCandidates(
    productsCollection: Collection,
    excludeIds: string[],
    diversityRules: DiversityRules,
    additionalFilters: any = {}
): Promise<ProductCandidate[]> {
    try {
        // Build base query
        const query: any = {
            product_id: { $nin: excludeIds },
            ...additionalFilters
        };

        // Apply diversity filters
        if (diversityRules.forceNewCategory && diversityRules.avoidCategory) {
            query.category_main = { $ne: diversityRules.avoidCategory };
        }

        if (diversityRules.forceNewColor && diversityRules.avoidColor) {
            query.primary_color = { $ne: diversityRules.avoidColor };
        }

        if (diversityRules.forceNewBrand && diversityRules.avoidBrand) {
            query.brand = { $ne: diversityRules.avoidBrand };
        }

        // Get candidates with randomization
        const candidates = await productsCollection
            .aggregate([
                { $match: query },
                { $sample: { size: 200 } } // Random sampling for diversity
            ])
            .toArray();

        console.log(`✅ Found ${candidates.length} filtered candidates`);
        return candidates as ProductCandidate[];
    } catch (error) {
        console.error('❌ Failed to get filtered candidates:', error);
        throw error;
    }
}

// =====================================
// BALANCED SCORING SYSTEM
// =====================================

/**
 * Apply diversity and exploration bonuses to LinUCB scores
 */
export function calculateDiversityScore(
    product: ProductCandidate,
    baseScore: number,
    userPreferences: UserPreferences,
    sessionInteractions: number
): ScoredProduct {
    let diversityBonus = 0;

    // Bonus for new categories
    if (!userPreferences.seenCategories.includes(product.category_main)) {
        diversityBonus += DIVERSITY_CONFIG.DIVERSITY_BONUS_CATEGORY;
    }

    // Bonus for new colors
    if (!userPreferences.seenColors.includes(product.primary_color)) {
        diversityBonus += DIVERSITY_CONFIG.DIVERSITY_BONUS_COLOR;
    }

    // Bonus for new brands
    if (!userPreferences.seenBrands.includes(product.brand)) {
        diversityBonus += DIVERSITY_CONFIG.DIVERSITY_BONUS_BRAND;
    }

    // Exploration bonus (higher for new sessions)
    const explorationBonus = Math.max(
        DIVERSITY_CONFIG.EXPLORATION_RATE - (sessionInteractions * 0.01),
        0.05
    );

    const finalScore = baseScore + diversityBonus + explorationBonus;

    return {
        product,
        finalScore,
        baseScore,
        diversityBonus,
        explorationBonus
    };
}

/**
 * Select final recommendation with controlled randomness
 */
export function selectRecommendation(
    scoredProducts: ScoredProduct[]
): ScoredProduct {
    if (scoredProducts.length === 0) {
        throw new Error('No scored products available');
    }

    // Sort by final score
    scoredProducts.sort((a, b) => b.finalScore - a.finalScore);

    // Pick from top candidates randomly to add variety
    const topCandidates = scoredProducts.slice(0, Math.min(
        DIVERSITY_CONFIG.TOP_CANDIDATES,
        scoredProducts.length
    ));

    const selected = topCandidates[Math.floor(Math.random() * topCandidates.length)];

    console.log(`✅ Selected recommendation: ${selected.product.name} (score: ${selected.finalScore.toFixed(3)})`);
    return selected;
}
