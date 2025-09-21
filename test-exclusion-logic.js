#!/usr/bin/env node

/**
 * Test script to demonstrate and test LinUCB product exclusion logic
 * Tests if the API returns unique products on consecutive calls
 */

const BASE_URL = 'http://localhost:3001';

// Helper function to make HTTP requests
async function makeRequest(endpoint, method = 'GET', body = null) {
    const url = `${BASE_URL}${endpoint}`;

    const options = {
        method,
        headers: {
            'Content-Type': 'application/json'
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    try {
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(url, options);
        const data = await response.json();

        return {
            status: response.status,
            data
        };
    } catch (error) {
        console.error(`Request failed for ${url}:`, error.message);
        return {
            status: 500,
            data: { error: error.message }
        };
    }
}

// Test function
async function testLinUCBExclusionLogic() {
    console.log('🧪 Testing LinUCB Product Exclusion Logic\n');
    console.log('Expected: Each API call should return a DIFFERENT product');
    console.log('Actual issue: Same products returned repeatedly\n');

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
        userId: 'test-exclusion-logic',
        context: {
            age: 28,
            gender: 'female',
            preferences: ['casual', 'elegant']
        }
    });

    if (sessionResponse.status !== 201) {
        console.error('❌ Failed to create session:', sessionResponse.data);
        return;
    }

    const sessionId = sessionResponse.data.session_id;
    console.log(`✅ Session created: ${sessionId}\n`);

    // Step 3: Test consecutive recommendations
    console.log('3️⃣ Testing consecutive recommendations...');
    console.log('Making 15 consecutive API calls to test exclusion logic:\n');

    const recommendations = [];
    const productIds = new Set();
    const duplicateOccurrences = [];

    for (let i = 1; i <= 15; i++) {
        console.log(`📦 API Call #${i}:`);

        const recResponse = await makeRequest(`/api/recommend/${sessionId}`);

        if (recResponse.status !== 200) {
            console.error(`❌ Failed to get recommendation #${i}:`, recResponse.data);
            continue;
        }

        const rec = recResponse.data;
        const product = rec.recommendation.product;
        const productId = product.product_id;

        // Check if this is a duplicate
        const isDuplicate = productIds.has(productId);
        if (isDuplicate) {
            const firstOccurrence = recommendations.findIndex(r => r.product_id === productId) + 1;
            duplicateOccurrences.push({
                productId,
                firstCall: firstOccurrence,
                duplicateCall: i,
                name: product.name
            });
            console.log(`   🔴 DUPLICATE! Product "${product.name}" (ID: ${productId})`);
            console.log(`   ⚠️  First seen in call #${firstOccurrence}, now repeated in call #${i}`);
        } else {
            console.log(`   ✅ UNIQUE: "${product.name}" (ID: ${productId})`);
        }

        productIds.add(productId);
        recommendations.push({
            call: i,
            product_id: productId,
            name: product.name,
            brand: product.brand,
            category: product.category || product.category_main,
            price: product.price,
            excluded_count: rec.diversity_info?.excluded_products || 0,
            products_seen: rec.user_stats?.products_seen || 0
        });

        // Show current exclusion info
        console.log(`   📊 Exclusion info: ${rec.diversity_info?.excluded_products || 0} products excluded`);
        console.log(`   📈 Products seen: ${rec.user_stats?.products_seen || 0}`);
        console.log('');

        // Small delay to simulate real usage
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Step 4: Analyze results
    console.log('4️⃣ Analysis Results:');
    console.log('==========================================');
    console.log(`Total API calls made: ${recommendations.length}`);
    console.log(`Unique products returned: ${productIds.size}`);
    console.log(`Duplicate occurrences: ${duplicateOccurrences.length}`);
    console.log('');

    if (duplicateOccurrences.length === 0) {
        console.log('✅ SUCCESS: All recommendations were unique!');
        console.log('✅ LinUCB exclusion logic is working correctly');
    } else {
        console.log('❌ FAILURE: Found duplicate recommendations!');
        console.log('❌ LinUCB exclusion logic is NOT working');
        console.log('');
        console.log('Duplicate Details:');
        duplicateOccurrences.forEach((dup, index) => {
            console.log(`   ${index + 1}. "${dup.name}" (ID: ${dup.productId})`);
            console.log(`      First call: #${dup.firstCall} | Duplicate call: #${dup.duplicateCall}`);
        });
    }

    console.log('');
    console.log('5️⃣ Recommendation Sequence:');
    console.log('==========================================');
    recommendations.forEach(rec => {
        const isDuplicate = duplicateOccurrences.some(dup =>
            dup.productId === rec.product_id && dup.duplicateCall === rec.call
        );
        const marker = isDuplicate ? '🔴' : '✅';
        console.log(`${marker} Call #${rec.call}: "${rec.name}" (${rec.brand}) - $${rec.price}`);
    });

    // Step 5: Test specific frontend scenario
    console.log('');
    console.log('6️⃣ Frontend Simulation:');
    console.log('==========================================');
    console.log('Simulating typical frontend usage pattern...');

    // Create new session for frontend test
    const frontendSession = await makeRequest('/api/session', 'POST', {
        userId: 'frontend-user',
        context: { platform: 'mobile_app' }
    });

    if (frontendSession.status === 201) {
        const frontendSessionId = frontendSession.data.session_id;
        console.log(`Frontend session: ${frontendSessionId}`);

        // Simulate swipe pattern: get recommendation -> provide feedback -> get next
        for (let i = 1; i <= 5; i++) {
            console.log(`\nFrontend Request #${i}:`);

            // Get recommendation
            const rec = await makeRequest(`/api/recommend/${frontendSessionId}`);
            if (rec.status === 200) {
                const product = rec.recommendation.product;
                console.log(`📱 Shown to user: "${product.name}" by ${product.brand}`);

                // Expected request from frontend
                console.log(`📤 Expected request:
   Method: GET
   URL: ${BASE_URL}/api/recommend/${frontendSessionId}
   Headers: { "Content-Type": "application/json" }`);

                // Expected response
                console.log(`📥 Expected response object:
   {
     "success": true,
     "recommendation": {
       "product": {
         "product_id": "${product.product_id}",
         "name": "${product.name}",
         "brand": "${product.brand}",
         "price": ${product.price},
         "image": "${product.image || product.urls?.image || 'N/A'}",
         "product_url": "${product.product_url || product.urls?.product || 'N/A'}"
       },
       "confidence_score": ${rec.recommendation.confidence_score.toFixed(3)}
     },
     "user_stats": {
       "products_seen": ${rec.user_stats.products_seen}
     }
   }`);

                // Simulate user feedback
                const feedbackAction = i % 3 === 0 ? 'love' : (i % 2 === 0 ? 'dislike' : 'skipped');
                const feedback = await makeRequest('/api/feedback', 'POST', {
                    session_id: frontendSessionId,
                    product_id: product.product_id,
                    action: feedbackAction
                });

                if (feedback.status === 200) {
                    console.log(`✅ User gave "${feedbackAction}" feedback`);
                } else {
                    console.log(`❌ Feedback failed:`, feedback.data);
                }
            }
        }
    }

    console.log('\n🏁 Test Complete!');
    if (duplicateOccurrences.length > 0) {
        console.log('🚨 CRITICAL ISSUE: Duplicate products detected - exclusion logic needs fixing!');
    } else {
        console.log('🎉 SUCCESS: Product exclusion logic working correctly!');
    }
}

// Run the test
testLinUCBExclusionLogic().catch(console.error);
