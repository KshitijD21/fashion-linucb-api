/**
 * Feature Mapping for Fashion Recommendation LinUCB Algorithm
 *
 * This module provides utilities to convert fashion product attributes into
 * numerical feature vectors for machine learning algorithms.
 *
 * Feature Vector Specification (26 dimensions):
 * - Positions 0-4: Categories (one-hot encoding)
 * - Positions 5-12: Colors (one-hot encoding)
 * - Positions 13-16: Occasions (one-hot encoding)
 * - Positions 17-20: Seasons (one-hot encoding)
 * - Positions 21-25: Style Categories (one-hot encoding)
 */

// Feature size constant
export const FEATURE_SIZE = 26;

// Category mapping (positions 0-4)
export const CATEGORIES = [
  'Dresses',
  'Tops',
  'Bottoms',
  'Outerwear',
  'Swimwear'
];

// Color mapping (positions 5-12)
export const COLORS = [
  'Black',
  'White',
  'Blue',
  'Red',
  'Green',
  'Pink',
  'Brown',
  'Grey'
];

// Occasion mapping (positions 13-16)
export const OCCASIONS = [
  'Casual',
  'Work',
  'Party',
  'Formal'
];

// Season mapping (positions 17-20)
export const SEASONS = [
  'Spring',
  'Summer',
  'Fall',
  'Winter'
];

// Style category mapping (positions 21-25)
export const STYLES = [
  'Trendy',
  'Classic',
  'Minimalist',
  'Boho',
  'Athletic'
];

// Complete feature mapping object for reference
export const FEATURE_MAPPING = {
  // Categories (0-4)
  0: 'category_dresses',
  1: 'category_tops',
  2: 'category_bottoms',
  3: 'category_outerwear',
  4: 'category_swimwear',

  // Colors (5-12)
  5: 'color_black',
  6: 'color_white',
  7: 'color_blue',
  8: 'color_red',
  9: 'color_green',
  10: 'color_pink',
  11: 'color_brown',
  12: 'color_grey',

  // Occasions (13-16)
  13: 'occasion_casual',
  14: 'occasion_work',
  15: 'occasion_party',
  16: 'occasion_formal',

  // Seasons (17-20)
  17: 'season_spring',
  18: 'season_summer',
  19: 'season_fall',
  20: 'season_winter',

  // Styles (21-25)
  21: 'style_trendy',
  22: 'style_classic',
  23: 'style_minimalist',
  24: 'style_boho',
  25: 'style_athletic'
};

/**
 * Normalizes string values for consistent matching
 * @param {string} value - The value to normalize
 * @returns {string} - Normalized lowercase string
 */
function normalizeValue(value) {
  if (!value || typeof value !== 'string') return '';
  return value.toLowerCase().trim();
}

/**
 * Maps category values from CSV to standard categories
 * @param {Object} product - Product object with category information
 * @returns {string} - Mapped category or null
 */
function mapCategory(product) {
  const categoryMain = normalizeValue(product.category_main);
  const productType = normalizeValue(product.product_type);

  // Direct mapping for main categories
  if (categoryMain === 'dresses') return 'Dresses';
  if (categoryMain === 'tops') return 'Tops';
  if (categoryMain === 'bottoms') return 'Bottoms';
  if (categoryMain === 'outerwear') return 'Outerwear';
  if (categoryMain === 'swimwear') return 'Swimwear';

  // Map based on product type
  if (productType === 'dress') return 'Dresses';
  if (productType === 'top' || productType === 'blouse' || productType === 'shirt') return 'Tops';
  if (productType === 'bottom' || productType === 'jeans' || productType === 'pants' || productType === 'skirt') return 'Bottoms';
  if (productType === 'outerwear' || productType === 'coat' || productType === 'jacket') return 'Outerwear';
  if (productType === 'swimwear' || productType === 'bikini' || productType === 'swimsuit') return 'Swimwear';

  // Default to Tops for unclassified items
  return 'Tops';
}

/**
 * Maps color values from CSV to standard colors
 * @param {Object} product - Product object with color information
 * @returns {string} - Mapped color or null
 */
function mapColor(product) {
  const primaryColor = normalizeValue(product.primary_color);

  // Direct color mapping
  const colorMap = {
    'black': 'Black',
    'white': 'White',
    'blue': 'Blue',
    'red': 'Red',
    'green': 'Green',
    'pink': 'Pink',
    'brown': 'Brown',
    'grey': 'Grey',
    'gray': 'Grey',
    'beige': 'Brown',
    'navy': 'Blue',
    'burgundy': 'Red',
    'olive': 'Green',
    'maroon': 'Red',
    'cream': 'White',
    'ivory': 'White',
    'tan': 'Brown'
  };

  return colorMap[primaryColor] || null;
}

/**
 * Maps occasion values from CSV to standard occasions
 * @param {Object} product - Product object with occasion information
 * @returns {string} - Mapped occasion or default
 */
function mapOccasion(product) {
  const occasionPrimary = normalizeValue(product.occasion_primary);
  const formalityLevel = normalizeValue(product.formality_level);

  // Direct occasion mapping
  if (occasionPrimary === 'casual') return 'Casual';
  if (occasionPrimary === 'work' || occasionPrimary === 'business') return 'Work';
  if (occasionPrimary === 'party' || occasionPrimary === 'cocktail') return 'Party';
  if (occasionPrimary === 'formal' || occasionPrimary === 'evening') return 'Formal';

  // Map based on formality level
  if (formalityLevel === 'casual') return 'Casual';
  if (formalityLevel === 'formal') return 'Formal';
  if (formalityLevel === 'business') return 'Work';

  // Default to Casual
  return 'Casual';
}

/**
 * Maps season values from CSV to standard seasons
 * @param {Object} product - Product object with season information
 * @returns {string} - Mapped season or null
 */
function mapSeason(product) {
  const seasonPrimary = normalizeValue(product.season_primary);

  // Direct season mapping
  const seasonMap = {
    'spring': 'Spring',
    'summer': 'Summer',
    'fall': 'Fall',
    'autumn': 'Fall',
    'winter': 'Winter'
  };

  return seasonMap[seasonPrimary] || null;
}

/**
 * Maps style values from CSV to standard style categories
 * @param {Object} product - Product object with style information
 * @returns {string} - Mapped style or default
 */
function mapStyle(product) {
  const styleCategory = normalizeValue(product.style_category);
  const brandStyle = normalizeValue(product.brand_style);

  // Direct style mapping
  const styleMap = {
    'trendy': 'Trendy',
    'classic': 'Classic',
    'minimalist': 'Minimalist',
    'bohemian': 'Boho',
    'boho': 'Boho',
    'athletic': 'Athletic',
    'sporty': 'Athletic',
    'casual': 'Classic',
    'romantic': 'Boho',
    'edgy': 'Trendy',
    'contemporary': 'Trendy',
    'european': 'Classic'
  };

  // Try style_category first, then brand_style
  if (styleMap[styleCategory]) return styleMap[styleCategory];
  if (styleMap[brandStyle]) return styleMap[brandStyle];

  // Default to Classic
  return 'Classic';
}

/**
 * Extracts features from a product object and returns a 26-element numerical array
 * @param {Object} product - Product object from CSV
 * @returns {Array<number>} - 26-element feature vector
 */
export function extractFeatures(product) {
  // Initialize feature vector with zeros
  const features = new Array(FEATURE_SIZE).fill(0);

  try {
    // Extract and map attributes
    const category = mapCategory(product);
    const color = mapColor(product);
    const occasion = mapOccasion(product);
    const season = mapSeason(product);
    const style = mapStyle(product);

    // Set category features (positions 0-4)
    if (category) {
      const categoryIndex = CATEGORIES.indexOf(category);
      if (categoryIndex !== -1) {
        features[categoryIndex] = 1;
      }
    }

    // Set color features (positions 5-12)
    if (color) {
      const colorIndex = COLORS.indexOf(color);
      if (colorIndex !== -1) {
        features[5 + colorIndex] = 1;
      }
    }

    // Set occasion features (positions 13-16)
    if (occasion) {
      const occasionIndex = OCCASIONS.indexOf(occasion);
      if (occasionIndex !== -1) {
        features[13 + occasionIndex] = 1;
      }
    }

    // Set season features (positions 17-20)
    if (season) {
      const seasonIndex = SEASONS.indexOf(season);
      if (seasonIndex !== -1) {
        features[17 + seasonIndex] = 1;
      }
    }

    // Set style features (positions 21-25)
    if (style) {
      const styleIndex = STYLES.indexOf(style);
      if (styleIndex !== -1) {
        features[21 + styleIndex] = 1;
      }
    }

    return features;

  } catch (error) {
    console.error('Error extracting features from product:', error);
    return new Array(FEATURE_SIZE).fill(0);
  }
}

/**
 * Explains a feature vector by mapping it back to readable feature names
 * @param {Array<number>} featureVector - 26-element feature vector
 * @returns {Object} - Object with feature names and their values
 */
export function explainFeatureVector(featureVector) {
  if (!Array.isArray(featureVector) || featureVector.length !== FEATURE_SIZE) {
    throw new Error(`Feature vector must be an array of ${FEATURE_SIZE} elements`);
  }

  const explanation = {};

  // Explain each feature position
  for (let i = 0; i < FEATURE_SIZE; i++) {
    if (featureVector[i] === 1) {
      const featureName = FEATURE_MAPPING[i];
      explanation[featureName] = 1;
    }
  }

  return explanation;
}

/**
 * Validates a feature vector for correctness
 * @param {Array<number>} featureVector - Feature vector to validate
 * @returns {Object} - Validation result with isValid and issues
 */
export function validateFeatureVector(featureVector) {
  const result = {
    isValid: true,
    issues: []
  };

  // Check if array has correct length
  if (!Array.isArray(featureVector) || featureVector.length !== FEATURE_SIZE) {
    result.isValid = false;
    result.issues.push(`Feature vector must have exactly ${FEATURE_SIZE} elements`);
    return result;
  }

  // Check if all values are 0 or 1
  for (let i = 0; i < featureVector.length; i++) {
    if (featureVector[i] !== 0 && featureVector[i] !== 1) {
      result.isValid = false;
      result.issues.push(`Feature at position ${i} must be 0 or 1, got ${featureVector[i]}`);
    }
  }

  // Check if at least one feature is set (not all zeros)
  const totalFeatures = featureVector.reduce((sum, val) => sum + val, 0);
  if (totalFeatures === 0) {
    result.isValid = false;
    result.issues.push('Feature vector should have at least one feature set to 1');
  }

  return result;
}

// Export utility functions for testing
export {
    mapCategory,
    mapColor,
    mapOccasion,
    mapSeason,
    mapStyle,
    normalizeValue
};
