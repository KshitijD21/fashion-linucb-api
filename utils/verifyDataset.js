/**
 * Verification Script for Fashion Dataset Loading
 *
 * This script demonstrates the MongoDB document structure and validates
 * that the feature vectors are correctly formatted for LinUCB algorithm.
 */

import mongoose from 'mongoose';
import { FEATURE_MAPPING, FEATURE_SIZE } from './featureMapping.js';

// MongoDB connection
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fashion-linucb-test';

// Product schema (simplified for verification)
const productSchema = new mongoose.Schema({
  product_id: String,
  brand: String,
  name: String,
  price: Number,
  category_main: String,
  primary_color: String,
  attributes: mongoose.Schema.Types.Mixed,
  feature_vector: [Number],
  feature_explanation: mongoose.Schema.Types.Mixed,
  urls: {
    product: String,
    image: String
  },
  created_at: Date
});

const Product = mongoose.model('Product', productSchema);

/**
 * Validates feature vectors across all products
 */
async function validateFeatureVectors() {
  console.log('🔍 Validating Feature Vectors...\n');

  const products = await Product.find({}).limit(10);
  let validCount = 0;

  for (const product of products) {
    const isValid = (
      Array.isArray(product.feature_vector) &&
      product.feature_vector.length === FEATURE_SIZE &&
      product.feature_vector.every(val => val === 0 || val === 1) &&
      product.feature_vector.some(val => val === 1)
    );

    if (isValid) validCount++;

    console.log(`${isValid ? '✅' : '❌'} ${product.product_id}: Vector length ${product.feature_vector.length}, Active features: ${product.feature_vector.filter(v => v === 1).length}`);
  }

  console.log(`\n📊 Validation Summary: ${validCount}/${products.length} products have valid feature vectors\n`);
}

/**
 * Displays sample MongoDB documents
 */
async function displaySampleDocuments() {
  console.log('📄 Sample MongoDB Documents:\n');

  // Find products from different categories
  const categories = ['Dresses', 'Tops', 'Bottoms'];

  for (const category of categories) {
    const product = await Product.findOne({ category_main: category });

    if (product) {
      console.log(`--- ${category.toUpperCase()} SAMPLE ---`);
      console.log(`Product ID: ${product.product_id}`);
      console.log(`Brand: ${product.brand}`);
      console.log(`Name: ${product.name}`);
      console.log(`Price: $${product.price}`);
      console.log(`Category: ${product.category_main}`);
      console.log(`Color: ${product.primary_color}`);

      console.log('\nReadable Attributes:');
      console.log(`  Style: ${product.attributes?.style_category || 'N/A'}`);
      console.log(`  Occasion: ${product.attributes?.occasion_primary || 'N/A'}`);
      console.log(`  Season: ${product.attributes?.season_primary || 'N/A'}`);
      console.log(`  Material: ${product.attributes?.material_type || 'N/A'}`);

      console.log('\nLinUCB Features (ML-ready):');
      console.log(`  Feature Vector: [${product.feature_vector.join(', ')}]`);
      console.log(`  Vector Length: ${product.feature_vector.length}`);
      console.log(`  Active Features:`, product.feature_explanation);

      console.log('\nURLs:');
      console.log(`  Product: ${product.urls?.product || 'N/A'}`);
      console.log(`  Image: ${product.urls?.image || 'N/A'}`);

      console.log('\n' + '='.repeat(80) + '\n');
    }
  }
}

/**
 * Shows distribution statistics
 */
async function showDistributionStats() {
  console.log('📊 Dataset Distribution Statistics:\n');

  // Feature activation frequency
  console.log('🎯 Feature Activation Frequency:');

  const products = await Product.find({});
  const featureActivations = new Array(FEATURE_SIZE).fill(0);

  products.forEach(product => {
    product.feature_vector.forEach((value, index) => {
      if (value === 1) featureActivations[index]++;
    });
  });

  // Group by feature type
  console.log('\nCategories (0-4):');
  for (let i = 0; i <= 4; i++) {
    const featureName = FEATURE_MAPPING[i];
    console.log(`  ${featureName}: ${featureActivations[i]} products (${((featureActivations[i] / products.length) * 100).toFixed(1)}%)`);
  }

  console.log('\nColors (5-12):');
  for (let i = 5; i <= 12; i++) {
    const featureName = FEATURE_MAPPING[i];
    console.log(`  ${featureName}: ${featureActivations[i]} products (${((featureActivations[i] / products.length) * 100).toFixed(1)}%)`);
  }

  console.log('\nOccasions (13-16):');
  for (let i = 13; i <= 16; i++) {
    const featureName = FEATURE_MAPPING[i];
    console.log(`  ${featureName}: ${featureActivations[i]} products (${((featureActivations[i] / products.length) * 100).toFixed(1)}%)`);
  }

  console.log('\nSeasons (17-20):');
  for (let i = 17; i <= 20; i++) {
    const featureName = FEATURE_MAPPING[i];
    console.log(`  ${featureName}: ${featureActivations[i]} products (${((featureActivations[i] / products.length) * 100).toFixed(1)}%)`);
  }

  console.log('\nStyles (21-25):');
  for (let i = 21; i <= 25; i++) {
    const featureName = FEATURE_MAPPING[i];
    console.log(`  ${featureName}: ${featureActivations[i]} products (${((featureActivations[i] / products.length) * 100).toFixed(1)}%)`);
  }

  console.log('\n');
}

/**
 * Main verification function
 */
async function main() {
  console.log('🔍 Fashion Dataset Verification\n');
  console.log('=' * 50);

  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const totalProducts = await Product.countDocuments();
    console.log(`📦 Total Products in Database: ${totalProducts}\n`);

    if (totalProducts === 0) {
      console.log('❌ No products found. Please run the data loading script first:');
      console.log('   MONGODB_URI="mongodb://localhost:27017/fashion-linucb-test" node utils/loadDataset.js\n');
      return;
    }

    await validateFeatureVectors();
    await displaySampleDocuments();
    await showDistributionStats();

    console.log('🎉 Verification completed successfully!');
    console.log('\n💡 Next Steps:');
    console.log('   - Use these feature vectors with LinUCB algorithm');
    console.log('   - Query products by feature_vector for ML training');
    console.log('   - Use readable attributes for frontend display');
    console.log('   - Index feature_vector fields for fast similarity searches');

  } catch (error) {
    console.error('❌ Verification failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 MongoDB connection closed');
  }
}

// Run verification
main().catch(console.error);
