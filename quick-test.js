#!/usr/bin/env node

/**
 * Quick test to verify LinUCB exclusion logic fix
 */

const BASE_URL = 'http://localhost:3001';

async function quickTest() {
    const fetch = (await import('node-fetch')).default;

    console.log('🧪 Quick LinUCB Exclusion Test\n');

    // Create session
    console.log('Creating session...');
    const sessionRes = await fetch(`${BASE_URL}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId: 'quick-test',
            context: { test: true }
        })
    });

    if (!sessionRes.ok) {
        console.error('Failed to create session');
        return;
    }

    const sessionData = await sessionRes.json();
    const sessionId = sessionData.session_id;
    console.log(`✅ Session: ${sessionId}\n`);

    // Get 10 recommendations
    const products = [];
    const duplicates = [];

    console.log('Getting 10 consecutive recommendations...\n');

    for (let i = 1; i <= 10; i++) {
        console.log(`Request #${i}:`);

        const recRes = await fetch(`${BASE_URL}/api/recommend/${sessionId}`);

        if (!recRes.ok) {
            console.error(`❌ Failed request #${i}`);
            continue;
        }

        const recData = await recRes.json();
        const product = recData.recommendation.product;
        const productId = product.product_id;

        // Check for duplicates
        const existingIndex = products.findIndex(p => p.id === productId);
        if (existingIndex !== -1) {
            duplicates.push({
                productId,
                name: product.name,
                firstSeen: existingIndex + 1,
                duplicateAt: i
            });
            console.log(`   🔴 DUPLICATE: "${product.name}" (first seen in request #${existingIndex + 1})`);
        } else {
            console.log(`   ✅ UNIQUE: "${product.name}"`);
        }

        products.push({
            id: productId,
            name: product.name,
            requestNumber: i
        });

        console.log(`   📊 Products seen: ${recData.user_stats?.products_seen || 0}`);
        console.log('');

        // Small delay
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Results
    console.log('📊 RESULTS:');
    console.log('='.repeat(50));
    console.log(`Total requests: ${products.length}`);
    console.log(`Unique products: ${new Set(products.map(p => p.id)).size}`);
    console.log(`Duplicates found: ${duplicates.length}`);

    if (duplicates.length === 0) {
        console.log('\n🎉 SUCCESS: All recommendations were unique!');
        console.log('✅ LinUCB exclusion logic is working correctly!');
    } else {
        console.log('\n❌ FAILURE: Found duplicate recommendations:');
        duplicates.forEach(dup => {
            console.log(`   • "${dup.name}" (requests #${dup.firstSeen} and #${dup.duplicateAt})`);
        });
    }
}

quickTest().catch(console.error);
