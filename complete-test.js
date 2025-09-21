#!/usr/bin/env node

/**
 * Complete API Test Scenario - LinUCB Exclusion Logic
 * This shows the complete flow and outputs to identify any issues
 */

const BASE_URL = 'http://localhost:3001';

async function completeAPITest() {
    const fetch = (await import('node-fetch')).default;

    console.log('🔍 COMPLETE API TEST SCENARIO');
    console.log('='.repeat(80));
    console.log(`Testing URL: ${BASE_URL}`);
    console.log(`Started at: ${new Date().toISOString()}`);
    console.log('');

    try {
        // ==========================================
        // STEP 1: Health Check
        // ==========================================
        console.log('1️⃣ HEALTH CHECK');
        console.log('-'.repeat(40));

        const healthRes = await fetch(`${BASE_URL}/health`);
        console.log(`Request: GET ${BASE_URL}/health`);
        console.log(`Status: ${healthRes.status} ${healthRes.statusText}`);

        if (healthRes.ok) {
            const healthData = await healthRes.json();
            console.log(`Response:`, JSON.stringify(healthData, null, 2));
            console.log('✅ Health check passed');
        } else {
            console.log('❌ Health check failed');
            return;
        }
        console.log('');

        // ==========================================
        // STEP 2: Products Count Check
        // ==========================================
        console.log('2️⃣ PRODUCTS COUNT CHECK');
        console.log('-'.repeat(40));

        const countRes = await fetch(`${BASE_URL}/api/products/count`);
        console.log(`Request: GET ${BASE_URL}/api/products/count`);
        console.log(`Status: ${countRes.status} ${countRes.statusText}`);

        if (countRes.ok) {
            const countData = await countRes.json();
            console.log(`Response:`, JSON.stringify(countData, null, 2));
            console.log(`✅ Found ${countData.total_products} products available`);
        } else {
            console.log('❌ Products count check failed');
        }
        console.log('');

        // ==========================================
        // STEP 3: Session Creation
        // ==========================================
        console.log('3️⃣ SESSION CREATION');
        console.log('-'.repeat(40));

        const sessionPayload = {
            userId: 'complete-test-user',
            context: {
                platform: 'api_test',
                timestamp: new Date().toISOString(),
                test_type: 'exclusion_logic_verification'
            }
        };

        console.log(`Request: POST ${BASE_URL}/api/session`);
        console.log(`Payload:`, JSON.stringify(sessionPayload, null, 2));

        const sessionRes = await fetch(`${BASE_URL}/api/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sessionPayload)
        });

        console.log(`Status: ${sessionRes.status} ${sessionRes.statusText}`);

        if (!sessionRes.ok) {
            const errorText = await sessionRes.text();
            console.log('❌ Session creation failed');
            console.log('Error:', errorText);
            return;
        }

        const sessionData = await sessionRes.json();
        console.log(`Response:`, JSON.stringify(sessionData, null, 2));

        const sessionId = sessionData.session_id;
        console.log(`✅ Session created: ${sessionId}`);
        console.log('');

        // ==========================================
        // STEP 4: Multiple Recommendation Requests
        // ==========================================
        console.log('4️⃣ RECOMMENDATION SEQUENCE TEST');
        console.log('-'.repeat(40));
        console.log('Testing 15 consecutive recommendation requests...');
        console.log('This will show if products are being repeated (the main issue)');
        console.log('');

        const recommendations = [];
        const productTracker = new Map(); // Track when each product was first seen
        let duplicateCount = 0;

        for (let i = 1; i <= 15; i++) {
            console.log(`📦 RECOMMENDATION REQUEST #${i}`);
            console.log(`Request: GET ${BASE_URL}/api/recommend/${sessionId}`);

            const recRes = await fetch(`${BASE_URL}/api/recommend/${sessionId}`);
            console.log(`Status: ${recRes.status} ${recRes.statusText}`);

            if (!recRes.ok) {
                const errorText = await recRes.text();
                console.log(`❌ Request #${i} failed:`, errorText);
                console.log('');
                continue;
            }

            const recData = await recRes.json();

            // Extract key information
            const product = recData.recommendation?.product;
            if (!product) {
                console.log('❌ No product in response');
                console.log('Full Response:', JSON.stringify(recData, null, 2));
                console.log('');
                continue;
            }

            const productId = product.product_id;
            const productName = product.name;
            const productBrand = product.brand;
            const productPrice = product.price;
            const confidenceScore = recData.recommendation?.confidence_score;
            const productsSeen = recData.user_stats?.products_seen;
            const excludedProducts = recData.diversity_info?.excluded_products;

            // Check for duplicates
            if (productTracker.has(productId)) {
                const firstSeen = productTracker.get(productId);
                duplicateCount++;
                console.log(`🔴 DUPLICATE DETECTED!`);
                console.log(`   Product: "${productName}" (ID: ${productId})`);
                console.log(`   First seen: Request #${firstSeen}`);
                console.log(`   Repeated in: Request #${i}`);
                console.log(`   ❌ This should NOT happen with proper exclusion logic!`);
            } else {
                productTracker.set(productId, i);
                console.log(`✅ UNIQUE PRODUCT`);
                console.log(`   Product: "${productName}" (ID: ${productId})`);
                console.log(`   Brand: ${productBrand}`);
                console.log(`   Price: $${productPrice}`);
            }

            console.log(`   Confidence Score: ${confidenceScore?.toFixed(3) || 'N/A'}`);
            console.log(`   Products Seen Counter: ${productsSeen || 'N/A'}`);
            console.log(`   Excluded Products: ${excludedProducts || 'N/A'}`);

            // Show key parts of the response structure
            console.log(`   Response Structure Check:`);
            console.log(`   ├── success: ${recData.success}`);
            console.log(`   ├── recommendation.product.product_id: ${product.product_id}`);
            console.log(`   ├── user_stats.products_seen: ${recData.user_stats?.products_seen}`);
            console.log(`   └── diversity_info.excluded_products: ${recData.diversity_info?.excluded_products}`);

            recommendations.push({
                requestNumber: i,
                productId,
                productName,
                brand: productBrand,
                price: productPrice,
                confidenceScore,
                productsSeen,
                excludedProducts,
                isDuplicate: productTracker.get(productId) !== i
            });

            console.log('');

            // Small delay to avoid overwhelming the server
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        // ==========================================
        // STEP 5: Results Analysis
        // ==========================================
        console.log('5️⃣ RESULTS ANALYSIS');
        console.log('='.repeat(80));

        const totalRequests = recommendations.length;
        const uniqueProducts = new Set(recommendations.map(r => r.productId)).size;
        const duplicateRequests = recommendations.filter(r => r.isDuplicate).length;

        console.log(`📊 STATISTICS:`);
        console.log(`   Total Requests Made: ${totalRequests}`);
        console.log(`   Unique Products Returned: ${uniqueProducts}`);
        console.log(`   Duplicate Occurrences: ${duplicateRequests}`);
        console.log(`   Success Rate: ${((uniqueProducts / totalRequests) * 100).toFixed(1)}%`);
        console.log('');

        if (duplicateCount === 0) {
            console.log('🎉 SUCCESS: LinUCB Exclusion Logic is Working Correctly!');
            console.log('✅ All recommendations were unique');
            console.log('✅ No caching interference detected');
            console.log('✅ Session history tracking is functional');
        } else {
            console.log('❌ FAILURE: LinUCB Exclusion Logic has Issues!');
            console.log(`❌ Found ${duplicateCount} duplicate recommendations`);
            console.log('❌ This indicates the exclusion logic is not working properly');
        }
        console.log('');

        console.log('📋 DETAILED RECOMMENDATION SEQUENCE:');
        console.log('-'.repeat(80));
        recommendations.forEach(rec => {
            const status = rec.isDuplicate ? '🔴 DUPLICATE' : '✅ UNIQUE';
            console.log(`${status} #${rec.requestNumber}: "${rec.productName}" by ${rec.brand} - $${rec.price} (Seen: ${rec.productsSeen}, Excluded: ${rec.excludedProducts})`);
        });
        console.log('');

        // ==========================================
        // STEP 6: Issue Diagnosis
        // ==========================================
        console.log('6️⃣ ISSUE DIAGNOSIS');
        console.log('-'.repeat(40));

        if (duplicateCount > 0) {
            console.log('🔍 POTENTIAL ISSUES DETECTED:');
            console.log('');

            // Check if products_seen counter is increasing
            const seenCounters = recommendations.map(r => r.productsSeen).filter(s => s !== undefined);
            const isCounterIncreasing = seenCounters.every((count, index) => index === 0 || count > seenCounters[index - 1]);

            if (!isCounterIncreasing) {
                console.log('❌ Issue 1: products_seen counter not increasing properly');
                console.log('   This suggests session history is not being updated');
            } else {
                console.log('✅ products_seen counter is increasing correctly');
            }

            // Check exclusion logic
            const exclusionCounts = recommendations.map(r => r.excludedProducts).filter(e => e !== undefined);
            const hasExclusions = exclusionCounts.some(count => count > 0);

            if (!hasExclusions) {
                console.log('❌ Issue 2: No products being excluded');
                console.log('   This suggests exclusion logic is not filtering previously shown products');
            } else {
                console.log('✅ Products are being excluded (exclusion logic partially working)');
            }

        } else {
            console.log('✅ No issues detected - exclusion logic working perfectly!');
        }

        console.log('');
        console.log('🏁 COMPLETE TEST FINISHED');
        console.log(`⏰ Completed at: ${new Date().toISOString()}`);

    } catch (error) {
        console.error('🚨 TEST FAILED WITH ERROR:', error.message);
        console.error('Stack trace:', error.stack);
    }
}

// Run the complete test
completeAPITest().catch(console.error);
