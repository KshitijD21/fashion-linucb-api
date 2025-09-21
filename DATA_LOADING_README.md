# Fashion Dataset Loading System

## Overview

This data loading system transforms raw fashion CSV data into ML-ready MongoDB documents for the LinUCB recommendation algorithm. It converts text attributes into 26-dimensional feature vectors while preserving all readable attributes for frontend use.

## Files Created

### 1. `utils/featureMapping.js`

- **Purpose**: Converts fashion attributes to numerical feature vectors
- **Features**: 26-dimensional vectors with one-hot encoding for style features
- **Structure**:
  - Positions 0-4: Categories (Dresses, Tops, Bottoms, Outerwear, Swimwear)
  - Positions 5-12: Colors (Black, White, Blue, Red, Green, Pink, Brown, Grey)
  - Positions 13-16: Occasions (Casual, Work, Party, Formal)
  - Positions 17-20: Seasons (Spring, Summer, Fall, Winter)
  - Positions 21-25: Styles (Trendy, Classic, Minimalist, Boho, Athletic)

### 2. `utils/loadDataset.js`

- **Purpose**: Reads CSV and loads data into MongoDB
- **Features**:
  - Batch processing (100 products per batch)
  - Error handling and validation
  - Progress monitoring
  - Database indexing for performance
- **Usage**: `MONGODB_URI="your-connection-string" node utils/loadDataset.js`

### 3. `utils/verifyDataset.js`

- **Purpose**: Validates loaded data and shows examples
- **Features**:
  - Feature vector validation
  - Sample document display
  - Distribution statistics
- **Usage**: `MONGODB_URI="your-connection-string" node utils/verifyDataset.js`

## MongoDB Document Structure

```javascript
{
  // IDENTIFIERS
  product_id: "EDIKTED-0123",
  brand: "Edikted",
  name: "Black Mini Dress",

  // MAIN ATTRIBUTES (readable)
  price: 45.99,
  category_main: "Dresses",
  primary_color: "Black",

  // ALL ATTRIBUTES (readable - for frontend)
  attributes: {
    style_category: "Trendy",
    occasion_primary: "Casual",
    season_primary: "Summer",
    // ... all other CSV columns
  },

  // LINUCB FEATURES (numerical - for algorithm)
  feature_vector: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
  feature_explanation: {
    category_dresses: 1,
    color_black: 1,
    occasion_casual: 1,
    season_summer: 1,
    style_trendy: 1
  },

  // URLS
  urls: {
    product: "https://...",
    image: "https://..."
  },

  created_at: new Date()
}
```

## Dataset Statistics

### Successfully Loaded: 1,007 Products

**Category Distribution:**

- Dresses: 300 products (29.8%)
- Tops: 395 products (39.2%)
- Bottoms: 243 products (24.1%)
- Outerwear: 58 products (5.8%)
- Swimwear: 11 products (1.1%)

**Color Distribution:**

- Black: 333 products (33.1%)
- Blue: 144 products (14.3%)
- White: 93 products (9.2%)
- Red: 64 products (6.4%)
- Brown: 56 products (5.6%)

**Style Distribution:**

- Classic: 330 products (32.8%)
- Trendy: 325 products (32.3%)
- Athletic: 242 products (24.0%)
- Boho: 60 products (6.0%)
- Minimalist: 50 products (5.0%)

**Price Range:**

- Average: $70.93
- Minimum: $10.20
- Maximum: $358.00

## Usage for LinUCB Algorithm

### Querying Products by Features

```javascript
// Find all black dresses for casual occasions
const blackCasualDresses = await Product.find({
  "feature_vector.0": 1, // category_dresses
  "feature_vector.5": 1, // color_black
  "feature_vector.13": 1, // occasion_casual
});
```

### Feature Vector for ML Training

```javascript
// Get feature vectors for LinUCB training
const products = await Product.find({}).select("feature_vector");
const featureMatrix = products.map((p) => p.feature_vector);
```

### Readable Data for Frontend

```javascript
// Get display-ready product data
const product = await Product.findById(id).select(
  "name brand price attributes urls"
);
```

## Performance Optimizations

### Database Indexes Created:

- `product_id` (unique)
- `brand`
- `price`
- `category_main`
- `primary_color`
- `attributes.style_category`
- `attributes.occasion_primary`
- `attributes.season_primary`
- `created_at`

### Batch Processing:

- 100 products per batch
- Error handling for duplicates
- Progress monitoring

## Validation

All feature vectors are validated for:

- ✅ Exactly 26 dimensions
- ✅ Binary values (0 or 1 only)
- ✅ At least one active feature
- ✅ Consistent with readable attributes

## Next Steps

1. **LinUCB Integration**: Use `feature_vector` arrays for contextual bandit training
2. **API Development**: Create endpoints that serve both feature vectors and readable data
3. **Recommendation Engine**: Implement LinUCB algorithm using these feature vectors
4. **Frontend Integration**: Use `attributes` object for product display
5. **Performance Tuning**: Add more specific indexes based on query patterns

## Environment Setup

```bash
# Set MongoDB connection
export MONGODB_URI="mongodb://localhost:27017/fashion-linucb"

# Run data loading
node utils/loadDataset.js

# Verify results
node utils/verifyDataset.js
```

## Technical Notes

- **ES6 Modules**: Uses import/export syntax
- **Error Handling**: Graceful handling of malformed CSV data
- **Type Safety**: Validates feature vectors and required fields
- **Scalability**: Designed for production use with proper indexing
- **Flexibility**: Easy to modify feature mappings or add new attributes

This system provides the foundation for a production-quality fashion recommendation API using LinUCB contextual bandits!
