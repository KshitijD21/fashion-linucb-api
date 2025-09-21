#!/usr/bin/env node

/**
 * Test LinUCB Exclusion Logic via Ngrok
 * Tests the fixed recommendation system for unique products
 */

// UPDATE THIS WITH YOUR CURRENT NGROK URL
const NGROK_URL = 'https://b7cc2a87f3da.ngrok-free.app';

async function testViaFirebird() {
    const fetch = (await import('node-fetch')).default;

    console.log('🧪 Testing LinUCB Exclusion Logic via Ngrok');
    console.log(`🌐 Using URL: ${NGROK_URL}`);
    console.log('');

    try {
        // Test 1: Health check
        console.log('1️⃣ Testing server health...');
        const healthRes = await fetch(`${NGROK_URL}/health`);
        if (!healthRes.ok) {
            console.error('❌ Server not healthy');
            return;
        }
        console.log('✅ Server is healthy');
        console.log('');

        // Test 2: Create session
        console.log('2️⃣ Creating session...');
        const sessionRes = await fetch(`${NGROK_URL}/api/session`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true'
            },
            body: JSON.stringify({
                userId: 'ngrok-test-user',
                context: {
                    platform: 'ngrok_test',
                    test_time: new Date().toISOString()
                }
            })
        });

        if (!sessionRes.ok) {
            const errorText = await sessionRes.text();
            console.error('❌ Session creation failed:', errorText);
            return;
        }

        const sessionData = await sessionRes.json();
        const sessionId = sessionData.session_id;
        console.log(`✅ Session created: ${sessionId}`);
        console.log('');

        // Test 3: Get multiple recommendations
        console.log('3️⃣ Testing recommendation uniqueness...');
        console.log('Getting 10 consecutive recommendations:');
        console.log('');

        const products = [];
        const duplicates = [];

        for (let i = 1; i <= 10; i++) {
            console.log(`📦 Request #${i}:`);

            const recRes = await fetch(`${NGROK_URL}/api/recommend/${sessionId}`, {
                headers: {
                    'ngrok-skip-browser-warning': 'true'
                }
            });

            if (!recRes.ok) {
                const errorText = await recRes.text();
                console.error(`   ❌ Failed: ${errorText}`);
                continue;
            }

            const recData = await recRes.json();
            const product = recData.recommendation?.product;

            if (!product) {
                console.error('   ❌ No product in response');
                continue;
            }

            const productId = product.product_id;
            const productName = product.name;

            // Check for duplicates
            const existingIndex = products.findIndex(p => p.id === productId);
            if (existingIndex !== -1) {
                duplicates.push({
                    productId,
                    name: productName,
                    firstSeen: existingIndex + 1,
                    duplicateAt: i
                });
                console.log(`   🔴 DUPLICATE: "${productName}"`);
                console.log(`   ⚠️  First seen in request #${existingIndex + 1}`);
            } else {
                console.log(`   ✅ UNIQUE: "${productName}"`);
            }

            products.push({
                id: productId,
                name: productName,
                brand: product.brand,
                price: product.price,
                requestNumber: i
            });

            // Show stats
            const productsSeen = recData.user_stats?.products_seen || 0;
            const excludedCount = recData.diversity_info?.excluded_products || 0;
            console.log(`   📊 Products seen: ${productsSeen} | Excluded: ${excludedCount}`);
            console.log('');

            // Small delay to avoid overwhelming
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Results
        console.log('📊 TEST RESULTS:');
        console.log('='.repeat(60));
        console.log(`Total requests made: ${products.length}`);
        console.log(`Unique products returned: ${new Set(products.map(p => p.id)).size}`);
        console.log(`Duplicate occurrences: ${duplicates.length}`);
        console.log('');

        if (duplicates.length === 0) {
            console.log('🎉 SUCCESS: LinUCB exclusion logic is working!');
            console.log('✅ All recommendations were unique');
            console.log('✅ No caching interference detected');
            console.log('✅ Session history tracking works correctly');
        } else {
            console.log('❌ FAILURE: Duplicate recommendations found:');
            duplicates.forEach((dup, index) => {
                console.log(`   ${index + 1}. "${dup.name}"`);
                console.log(`      Requests: #${dup.firstSeen} and #${dup.duplicateAt}`);
            });
        }

        console.log('');
        console.log('📝 Product Sequence:');
        console.log('-'.repeat(60));
        products.forEach(product => {
            const isDuplicate = duplicates.some(dup =>
                dup.productId === product.id && dup.duplicateAt === product.requestNumber
            );
            const marker = isDuplicate ? '🔴' : '✅';
            console.log(`${marker} #${product.requestNumber}: "${product.name}" by ${product.brand} - $${product.price}`);
        });

        console.log('');
        console.log('🔗 Frontend Implementation Example:');
        console.log('-'.repeat(60));
        console.log(`
// Session Creation
const session = await fetch('${NGROK_URL}/api/session', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
    },
    body: JSON.stringify({
        userId: 'user-123',
        context: { platform: 'mobile' }
    })
});
const { session_id } = await session.json();

// Get Recommendation
const rec = await fetch('${NGROK_URL}/api/recommend/' + session_id, {
    headers: { 'ngrok-skip-browser-warning': 'true' }
});
const recommendation = await rec.json();

console.log('Product:', recommendation.recommendation.product.name);
        `);

    } catch (error) {
        console.error('🚨 Test failed with error:', error.message);
        console.log('');
        console.log('🔧 Troubleshooting:');
        console.log('1. Make sure your local server is running: pnpm start');
        console.log('2. Update NGROK_URL in this script with your current ngrok URL');
        console.log('3. Check that ngrok is forwarding to localhost:3001');
    }
}

console.log('🚀 Starting LinUCB Exclusion Test...');
console.log(`⏰ Test started at: ${new Date().toISOString()}`);
console.log('');

testViaFirebird().then(() => {
    console.log('');
    console.log('✨ Test completed!');
}).catch(console.error);
