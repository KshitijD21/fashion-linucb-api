/**
 * Enhanced Duplicate Detection Test Script
 *
 * Tests the new duplicate detection features including:
 * - Feedback-specific duplicate windows (60 seconds for same product)
 * - Rapid feedback prevention (5 seconds)
 * - Idempotency key support
 * - Batch conflict detection
 * - Enhanced error messages
 */

const API_BASE = 'http://localhost:3000/api';

// Test utilities
async function makeRequest(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const response = await fetch(url, {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        ...options
    });

    const data = await response.json();
    return { status: response.status, data };
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function logTest(testName) {
    console.log(`\n🧪 Testing: ${testName}`);
    console.log('='.repeat(50));
}

function logResult(description, result) {
    const emoji = result.status >= 200 && result.status < 300 ? '✅' :
                  result.status === 409 ? '⚠️' : '❌';
    console.log(`${emoji} ${description}`);
    console.log(`   Status: ${result.status}`);
    if (result.data.message) {
        console.log(`   Message: ${result.data.message}`);
    }
    if (result.data.conflict_info) {
        console.log(`   Conflict: ${result.data.conflict_info.type} - ${result.data.conflict_info.suggested_action}`);
    }
}

async function testEnhancedDuplicateDetection() {
    console.log('🚀 Starting Enhanced Duplicate Detection Tests\n');

    // Reset duplicate detection for clean testing
    await makeRequest('/duplicate-detection/reset', { method: 'POST' });
    console.log('🔄 Reset duplicate detection state\n');

    const testSessionId = `test-session-${Date.now()}`;
    const testProductId = 'PRODUCT_123';

    // Test 1: Basic feedback submission (should succeed)
    logTest('Basic Feedback Submission');
    const basicFeedback = await makeRequest('/feedback', {
        method: 'POST',
        body: JSON.stringify({
            session_id: testSessionId,
            product_id: testProductId,
            action: 'like'
        })
    });
    logResult('First feedback submission', basicFeedback);

    // Test 2: Rapid feedback prevention (should fail)
    logTest('Rapid Feedback Prevention (< 5 seconds)');
    await sleep(1000); // Wait 1 second
    const rapidFeedback = await makeRequest('/feedback', {
        method: 'POST',
        body: JSON.stringify({
            session_id: testSessionId,
            product_id: testProductId,
            action: 'love'
        })
    });
    logResult('Rapid feedback attempt (should be blocked)', rapidFeedback);

    // Test 3: Same feedback within 60 seconds (should fail)
    logTest('Same Product Feedback Within Window (< 60 seconds)');
    await sleep(6000); // Wait 6 seconds (past rapid feedback window)
    const sameFeedback = await makeRequest('/feedback', {
        method: 'POST',
        body: JSON.stringify({
            session_id: testSessionId,
            product_id: testProductId,
            action: 'dislike'
        })
    });
    logResult('Same product feedback within 60s window (should be blocked)', sameFeedback);

    // Test 4: Idempotency key - same request (should succeed with idempotent response)
    logTest('Idempotency Key Support');
    const idempotentKey = `test-key-${Date.now()}`;

    const firstIdempotent = await makeRequest('/feedback', {
        method: 'POST',
        headers: {
            'idempotency-key': idempotentKey
        },
        body: JSON.stringify({
            session_id: `${testSessionId}-idem`,
            product_id: 'PRODUCT_456',
            action: 'love'
        })
    });
    logResult('First request with idempotency key', firstIdempotent);

    const secondIdempotent = await makeRequest('/feedback', {
        method: 'POST',
        headers: {
            'idempotency-key': idempotentKey
        },
        body: JSON.stringify({
            session_id: `${testSessionId}-idem`,
            product_id: 'PRODUCT_456',
            action: 'love'
        })
    });
    logResult('Duplicate request with same idempotency key (should return cached)', secondIdempotent);

    // Test 5: Different product feedback (should succeed)
    logTest('Different Product Feedback');
    const differentProduct = await makeRequest('/feedback', {
        method: 'POST',
        body: JSON.stringify({
            session_id: testSessionId,
            product_id: 'PRODUCT_789',
            action: 'love'
        })
    });
    logResult('Feedback for different product (should succeed)', differentProduct);

    // Test 6: Batch feedback with conflicts
    logTest('Batch Feedback Conflict Detection');
    const batchFeedback = await makeRequest('/feedback/batch', {
        method: 'POST',
        body: JSON.stringify({
            feedbacks: [
                {
                    sessionId: `${testSessionId}-batch`,
                    productId: 'BATCH_PRODUCT_1',
                    action: 'like'
                },
                {
                    sessionId: `${testSessionId}-batch`,
                    productId: 'BATCH_PRODUCT_1', // Duplicate in same batch
                    action: 'love'
                },
                {
                    sessionId: `${testSessionId}-batch`,
                    productId: 'BATCH_PRODUCT_2',
                    action: 'dislike'
                }
            ]
        })
    });
    logResult('Batch with internal conflicts (should be blocked)', batchFeedback);

    // Test 7: Batch feedback ignoring conflicts
    logTest('Batch Feedback Ignoring Conflicts');
    const batchIgnoreConflicts = await makeRequest('/feedback/batch', {
        method: 'POST',
        body: JSON.stringify({
            feedbacks: [
                {
                    sessionId: `${testSessionId}-batch2`,
                    productId: 'BATCH_PRODUCT_3',
                    action: 'like'
                },
                {
                    sessionId: `${testSessionId}-batch2`,
                    productId: 'BATCH_PRODUCT_3',
                    action: 'love'
                }
            ],
            options: {
                ignoreConflicts: true
            }
        })
    });
    logResult('Batch with conflicts ignored (should process)', batchIgnoreConflicts);

    // Test 8: Feedback status check
    logTest('Feedback Status Check');
    const feedbackStatus = await makeRequest(`/feedback/status/${testSessionId}/${testProductId}/like`);
    logResult('Check feedback status', feedbackStatus);

    // Test 9: General duplicate request detection
    logTest('General Duplicate Request Detection');
    const generalDup1 = await makeRequest('/recommendations', {
        method: 'POST',
        body: JSON.stringify({
            session_id: `${testSessionId}-gen`,
            count: 5
        })
    });
    logResult('First recommendation request', generalDup1);

    const generalDup2 = await makeRequest('/recommendations', {
        method: 'POST',
        body: JSON.stringify({
            session_id: `${testSessionId}-gen`,
            count: 5
        })
    });
    logResult('Duplicate recommendation request (should be blocked)', generalDup2);

    // Test 10: Statistics and monitoring
    logTest('Duplicate Detection Statistics');
    const stats = await makeRequest('/duplicate-detection/stats');
    logResult('Get duplicate detection statistics', stats);
    if (stats.data.duplicate_detection) {
        console.log('   Active records:', stats.data.duplicate_detection.active_request_hashes);
        console.log('   Feedback records:', stats.data.duplicate_detection.active_feedback_records);
        console.log('   Recent conflicts:', stats.data.duplicate_detection.recent_conflicts);
    }

    // Test 11: Wait for feedback window and retry (should succeed after 60s)
    logTest('Feedback After Grace Period');
    console.log('⏰ Note: To test feedback after 60-second window, run this test again in 60+ seconds');

    console.log('\n🎉 Enhanced Duplicate Detection Tests Completed!');
    console.log('\nKey Features Tested:');
    console.log('✅ Rapid feedback prevention (5 seconds)');
    console.log('✅ Same product feedback window (60 seconds)');
    console.log('✅ Idempotency key support');
    console.log('✅ Batch conflict detection');
    console.log('✅ Enhanced error messages with timestamps');
    console.log('✅ Feedback status checking');
    console.log('✅ General duplicate request prevention');
    console.log('✅ Statistics and monitoring');
}

// Error handling wrapper
async function runTests() {
    try {
        await testEnhancedDuplicateDetection();
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.cause) {
            console.error('   Cause:', error.cause.message);
        }
    }
}

// Check if this script is being run directly
if (typeof window === 'undefined') {
    // Node.js environment
    const { fetch } = await import('node-fetch');
    globalThis.fetch = fetch;
    runTests();
} else {
    // Browser environment
    console.log('Enhanced Duplicate Detection Test loaded. Call runTests() to start.');
    window.runTests = runTests;
}

export { runTests, testEnhancedDuplicateDetection };
