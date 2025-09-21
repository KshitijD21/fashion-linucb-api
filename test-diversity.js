#!/usr/bin/env node

/**
 * Test script for Enhanced Fashion LinUCB API
 * Tests the anti-repetition and diversity features
 */

const BASE_URL = 'http://localhost:3001';

// Helper function to make HTTP requests
async function makeRequest(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(`${BASE_URL}${endpoint}`, options);
        const data = await response.json();
        return { status: response.status, data };
    } catch (error) {
        console.error(`Error making request to ${endpoint}:`, error);
        return { status: 500, data: { error: error.message } };
    }
}

// Test function
async function testEnhancedRecommendations() {
    console.log('🧪 Testing Enhanced Fashion LinUCB API with Diversity Features\n');

    // Step 1: Check server health
    console.log('1️⃣ Checking server health...');
    const health = await makeRequest('/health');
    if (health.status !== 200) {
        console.error('❌ Server is not healthy');
        return;
    }
    console.log('✅ Server is healthy\n');

    // Step 2: Create a new session
    console.log('2️⃣ Creating new session...');
    const sessionResponse = await makeRequest('/api/session', 'POST', {
        userId: 'test-user-diversity',
        context: {
            age: 25,
            gender: 'female',
            preferences: ['casual', 'trendy']
        }
    });

    if (sessionResponse.status !== 201) {
        console.error('❌ Failed to create session:', sessionResponse.data);
        return;
    }

    const sessionId = sessionResponse.data.session_id;
    console.log(`✅ Session created: ${sessionId}\n`);

    // Step 3: Get multiple recommendations to test diversity
    console.log('3️⃣ Testing recommendations and diversity...');
    const recommendations = [];
    const categories = new Set();
    const colors = new Set();
    const brands = new Set();
    const productIds = new Set();

    for (let i = 1; i <= 25; i++) {
        console.log(`\n📦 Getting recommendation #${i}...`);

        const recResponse = await makeRequest(`/api/recommend/${sessionId}`);

        if (recResponse.status !== 200) {
            console.error(`❌ Failed to get recommendation #${i}:`, recResponse.data);
            continue;
        }

        const rec = recResponse.data;
        const product = rec.recommendation.product;

        // Track for diversity analysis
        recommendations.push({
            number: i,
            product_id: product.product_id,
            name: product.name,
            category: product.category,
            color: product.color,
            brand: product.brand,
            finalScore: rec.recommendation.confidence_score,
            baseScore: rec.recommendation.base_score,
            diversityBonus: rec.recommendation.diversity_bonus,
            explorationBonus: rec.recommendation.exploration_bonus
        });

        categories.add(product.category);
        colors.add(product.color);
        brands.add(product.brand);
        productIds.add(product.product_id);

        console.log(`   Product: ${product.name}`);
        console.log(`   Category: ${product.category} | Color: ${product.color} | Brand: ${product.brand}`);
        console.log(`   Score: ${rec.recommendation.confidence_score?.toFixed(3)} (base: ${rec.recommendation.base_score?.toFixed(3)}, diversity: ${rec.recommendation.diversity_bonus?.toFixed(3)})`);
        console.log(`   Products seen: ${rec.user_stats.products_seen} | Excluded: ${rec.diversity_info.excluded_products}`);

        // Test feedback with some love actions to trigger diversity constraints
        if (i <= 10 && i % 3 === 0) {
            console.log(`   💖 Giving LOVE feedback to test learning...`);
            const feedbackResponse = await makeRequest('/api/feedback', 'POST', {
                session_id: sessionId,
                product_id: product.product_id,
                action: 'love',
                context: { test: `recommendation_${i}` }
            });

            if (feedbackResponse.status === 200) {
                console.log(`   ✅ Feedback processed`);
            } else {
                console.log(`   ❌ Feedback failed:`, feedbackResponse.data);
            }
        } else if (i % 5 === 0) {
            console.log(`   👍 Giving LIKE feedback...`);
            await makeRequest('/api/feedback', 'POST', {
                session_id: sessionId,
                product_id: product.product_id,
                action: 'like'
            });
        } else {
            console.log(`   ⏭️ Skipping...`);
            await makeRequest('/api/feedback', 'POST', {
                session_id: sessionId,
                product_id: product.product_id,
                action: 'skip'
            });
        }

        // Small delay to make it readable
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Step 4: Analyze results
    console.log('\n\n📊 DIVERSITY ANALYSIS RESULTS\n');
    console.log('='.repeat(50));

    console.log(`\n🔍 REPETITION TEST:`);
    console.log(`   Total recommendations: ${recommendations.length}`);
    console.log(`   Unique products: ${productIds.size}`);
    console.log(`   Repetition rate: ${((1 - productIds.size / recommendations.length) * 100).toFixed(1)}%`);

    if (productIds.size === recommendations.length) {
        console.log(`   ✅ NO REPETITIONS - EXCELLENT!`);
    } else {
        console.log(`   ❌ Found ${recommendations.length - productIds.size} repetitions`);
    }

    console.log(`\n🎨 DIVERSITY TEST:`);
    console.log(`   Unique categories: ${categories.size} (${Array.from(categories).join(', ')})`);
    console.log(`   Unique colors: ${colors.size} (${Array.from(colors).slice(0, 10).join(', ')}${colors.size > 10 ? '...' : ''})`);
    console.log(`   Unique brands: ${brands.size} (${Array.from(brands).slice(0, 10).join(', ')}${brands.size > 10 ? '...' : ''})`);

    console.log(`\n📈 SCORING EVOLUTION:`);
    recommendations.slice(0, 10).forEach(rec => {
        console.log(`   #${rec.number}: ${rec.name} - Score: ${rec.finalScore?.toFixed(3)} (div: ${rec.diversityBonus?.toFixed(3)})`);
    });

    console.log(`\n🎯 SUCCESS CRITERIA:`);
    console.log(`   ✅ No repetition in first 20: ${productIds.size >= Math.min(20, recommendations.length) ? 'PASS' : 'FAIL'}`);
    console.log(`   ✅ Multiple categories: ${categories.size >= 3 ? 'PASS' : 'FAIL'}`);
    console.log(`   ✅ Multiple colors: ${colors.size >= 5 ? 'PASS' : 'FAIL'}`);
    console.log(`   ✅ Multiple brands: ${brands.size >= 3 ? 'PASS' : 'FAIL'}`);

    console.log('\n🎉 Enhanced Fashion LinUCB API Test Complete!');
}

// Run the test
testEnhancedRecommendations().catch(console.error);
