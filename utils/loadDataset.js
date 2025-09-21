/**
 * Fashion Dataset Loader for MongoDB
 *
 * This module loads fashion products from CSV file and converts them into
 * MongoDB documents with both readable attributes and numerical feature vectors
 * for the LinUCB recommendation algorithm.
 */

import csvParser from 'csv-parser';
import dotenv from 'dotenv';
import fs from 'fs';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    explainFeatureVector,
    extractFeatures,
    validateFeatureVector
} from './featureMapping.js';

// Load environment variables
dotenv.config();

// Get directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// MongoDB connection configuration
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fashion-linucb';
const BATCH_SIZE = 100;
const CSV_PATH = path.join(__dirname, '..', 'data', 'PREMIUM_FASHION_DATASET.csv');

// MongoDB Schema for Fashion Products
const productSchema = new mongoose.Schema({
  // IDENTIFIERS
  product_id: { type: String, required: true, unique: true, index: true },
  brand: { type: String, required: true, index: true },
  name: { type: String, required: true },

  // MAIN ATTRIBUTES (readable)
  price: { type: Number, required: true, index: true },
  category_main: { type: String, required: true, index: true },
  primary_color: { type: String, index: true },

  // ALL ATTRIBUTES (readable - for frontend)
  attributes: {
    original_price: Number,
    discount_percentage: Number,
    price_tier: String,
    discount_amount: Number,
    category_sub: String,
    product_type: String,
    secondary_color: String,
    pattern_type: String,
    material_type: String,
    style_category: String,
    fit_type: String,
    length_type: String,
    occasion_primary: String,
    occasion_secondary: String,
    season_primary: String,
    season_secondary: String,
    weather_suitability: String,
    formality_level: String,
    brand_tier: String,
    brand_style: String,
    target_age_group: String,
    quality_indicators: String,
    available_sizes: String,
    size_range_start: String,
    size_range_end: String,
    plus_size_available: String,
    scraped_description: String,
    material_details: String,
    care_instructions: String
  },

  // LINUCB FEATURES (numerical - for algorithm)
  feature_vector: {
    type: [Number],
    required: true,
    validate: {
      validator: function(arr) {
        return arr.length === 26 && arr.every(val => val === 0 || val === 1);
      },
      message: 'Feature vector must be 26 elements of 0s and 1s'
    }
  },
  feature_explanation: { type: mongoose.Schema.Types.Mixed, required: true },

  // URLS
  urls: {
    product: String,
    image: String
  },

  // METADATA
  created_at: { type: Date, default: Date.now, index: true },
  updated_at: { type: Date, default: Date.now }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Create indexes for performance
productSchema.index({ 'attributes.style_category': 1 });
productSchema.index({ 'attributes.occasion_primary': 1 });
productSchema.index({ 'attributes.season_primary': 1 });
productSchema.index({ price: 1, category_main: 1 });

const Product = mongoose.model('Product', productSchema);

/**
 * Connects to MongoDB with error handling
 */
async function connectToMongoDB() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB successfully');

    // Create indexes
    await Product.createIndexes();
    console.log('📊 Database indexes created');

  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

/**
 * Parses a CSV value and handles various data types
 * @param {string} value - Raw CSV value
 * @returns {any} - Parsed value
 */
function parseValue(value) {
  if (!value || value === 'nan' || value === 'Unknown' || value === '') {
    return null;
  }

  // Try to parse as number
  const num = parseFloat(value);
  if (!isNaN(num)) {
    return num;
  }

  // Return as string
  return value.trim();
}

/**
 * Validates required product fields
 * @param {Object} product - Product object
 * @returns {Object} - Validation result
 */
function validateProduct(product) {
  const required = ['product_id', 'brand', 'name', 'price'];
  const missing = required.filter(field => !product[field]);

  return {
    isValid: missing.length === 0,
    missing: missing
  };
}

/**
 * Transforms CSV row into MongoDB document structure
 * @param {Object} row - CSV row object
 * @returns {Object} - MongoDB document or null if invalid
 */
function transformProduct(row) {
  try {
    // Parse basic fields
    const productId = row.product_id?.trim();
    const brand = row.brand?.trim();
    const name = row.name?.trim();
    const price = parseFloat(row.price);

    // Validate required fields
    if (!productId || !brand || !name || isNaN(price)) {
      console.warn(`⚠️  Skipping invalid product: ${productId || 'unknown'}`);
      return null;
    }

    // Extract feature vector
    const featureVector = extractFeatures(row);
    const featureExplanation = explainFeatureVector(featureVector);

    // Validate feature vector
    const validation = validateFeatureVector(featureVector);
    if (!validation.isValid) {
      console.warn(`⚠️  Invalid feature vector for ${productId}:`, validation.issues);
      return null;
    }

    // Build product document
    const product = {
      product_id: productId,
      brand: brand,
      name: name,
      price: price,
      category_main: row.category_main || 'Unknown',
      primary_color: row.primary_color || null,

      attributes: {
        original_price: parseValue(row.original_price),
        discount_percentage: parseValue(row.discount_percentage),
        price_tier: row.price_tier || null,
        discount_amount: parseValue(row.discount_amount),
        category_sub: row.category_sub || null,
        product_type: row.product_type || null,
        secondary_color: row.secondary_color || null,
        pattern_type: row.pattern_type || null,
        material_type: row.material_type || null,
        style_category: row.style_category || null,
        fit_type: row.fit_type || null,
        length_type: row.length_type || null,
        occasion_primary: row.occasion_primary || null,
        occasion_secondary: row.occasion_secondary || null,
        season_primary: row.season_primary || null,
        season_secondary: row.season_secondary || null,
        weather_suitability: row.weather_suitability || null,
        formality_level: row.formality_level || null,
        brand_tier: row.brand_tier || null,
        brand_style: row.brand_style || null,
        target_age_group: row.target_age_group || null,
        quality_indicators: row.quality_indicators || null,
        available_sizes: row.available_sizes || null,
        size_range_start: row.size_range_start || null,
        size_range_end: row.size_range_end || null,
        plus_size_available: row.plus_size_available || null,
        scraped_description: row.scraped_description || null,
        material_details: row.material_details || null,
        care_instructions: row.care_instructions || null
      },

      feature_vector: featureVector,
      feature_explanation: featureExplanation,

      urls: {
        product: row.url || null,
        image: row.image_url || null
      }
    };

    return product;

  } catch (error) {
    console.error(`❌ Error transforming product ${row.product_id}:`, error);
    return null;
  }
}

/**
 * Reads CSV file and returns array of product objects
 * @returns {Promise<Array>} - Array of product objects
 */
function readCSVFile() {
  return new Promise((resolve, reject) => {
    const products = [];

    console.log(`📄 Reading CSV file: ${CSV_PATH}`);

    if (!fs.existsSync(CSV_PATH)) {
      reject(new Error(`CSV file not found: ${CSV_PATH}`));
      return;
    }

    fs.createReadStream(CSV_PATH)
      .pipe(csvParser())
      .on('data', (row) => {
        const product = transformProduct(row);
        if (product) {
          products.push(product);
        }
      })
      .on('end', () => {
        console.log(`✅ CSV file processed. Found ${products.length} valid products`);
        resolve(products);
      })
      .on('error', (error) => {
        console.error('❌ Error reading CSV file:', error);
        reject(error);
      });
  });
}

/**
 * Inserts products into MongoDB in batches
 * @param {Array} products - Array of product objects
 */
async function insertProducts(products) {
  console.log(`💾 Inserting ${products.length} products into MongoDB...`);

  // Clear existing products (for fresh start)
  console.log('🗑️  Clearing existing products...');
  await Product.deleteMany({});

  let insertedCount = 0;
  let errorCount = 0;

  // Process in batches
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);

    try {
      await Product.insertMany(batch, { ordered: false });
      insertedCount += batch.length;
      console.log(`✅ Batch ${Math.floor(i / BATCH_SIZE) + 1}: Inserted ${batch.length} products (Total: ${insertedCount})`);
    } catch (error) {
      // Handle duplicate key errors and other issues
      if (error.writeErrors) {
        const duplicates = error.writeErrors.filter(e => e.code === 11000).length;
        const otherErrors = error.writeErrors.length - duplicates;

        insertedCount += (batch.length - error.writeErrors.length);
        errorCount += error.writeErrors.length;

        console.warn(`⚠️  Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${duplicates} duplicates, ${otherErrors} other errors, ${batch.length - error.writeErrors.length} inserted`);
      } else {
        console.error(`❌ Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error.message);
        errorCount += batch.length;
      }
    }
  }

  console.log(`\n📊 INSERTION SUMMARY:`);
  console.log(`✅ Successfully inserted: ${insertedCount} products`);
  console.log(`❌ Errors/Duplicates: ${errorCount} products`);
  console.log(`📈 Success rate: ${((insertedCount / products.length) * 100).toFixed(2)}%`);
}

/**
 * Displays summary statistics about the loaded data
 */
async function displaySummary() {
  console.log('\n📈 DATABASE SUMMARY:');

  const totalProducts = await Product.countDocuments();
  console.log(`📦 Total products: ${totalProducts}`);

  // Category distribution
  const categoryStats = await Product.aggregate([
    { $group: { _id: '$category_main', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);

  console.log('\n🏷️  Category Distribution:');
  categoryStats.forEach(stat => {
    console.log(`  ${stat._id}: ${stat.count} products`);
  });

  // Price statistics
  const priceStats = await Product.aggregate([
    {
      $group: {
        _id: null,
        avgPrice: { $avg: '$price' },
        minPrice: { $min: '$price' },
        maxPrice: { $max: '$price' }
      }
    }
  ]);

  if (priceStats.length > 0) {
    const stats = priceStats[0];
    console.log('\n💰 Price Statistics:');
    console.log(`  Average: $${stats.avgPrice.toFixed(2)}`);
    console.log(`  Minimum: $${stats.minPrice.toFixed(2)}`);
    console.log(`  Maximum: $${stats.maxPrice.toFixed(2)}`);
  }

  // Feature vector examples
  console.log('\n🔢 Sample Feature Vectors:');
  const samples = await Product.find({}).limit(3).select('product_id name feature_vector feature_explanation');

  samples.forEach(sample => {
    console.log(`\n  Product: ${sample.product_id} - ${sample.name}`);
    console.log(`  Feature Vector: [${sample.feature_vector.join(', ')}]`);
    console.log(`  Features Active:`, Object.keys(sample.feature_explanation));
  });
}

/**
 * Main execution function
 */
async function main() {
  console.log('🚀 Starting Fashion Dataset Loading Process\n');

  try {
    // Connect to MongoDB
    await connectToMongoDB();

    // Read and process CSV file
    const products = await readCSVFile();

    if (products.length === 0) {
      console.log('⚠️  No valid products found to insert');
      return;
    }

    // Insert products into MongoDB
    await insertProducts(products);

    // Display summary statistics
    await displaySummary();

    console.log('\n🎉 Data loading completed successfully!');

  } catch (error) {
    console.error('\n❌ Data loading failed:', error);
    process.exit(1);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('\n🔌 MongoDB connection closed');
  }
}

// Export for testing or module usage
export {
    connectToMongoDB, insertProducts,
    Product, readCSVFile, transformProduct
};

// Run if this file is executed directly
if (process.argv[1].endsWith('loadDataset.js')) {
  main().catch(console.error);
}
