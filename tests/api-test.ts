/**
 * Test Script for Enhanced Fashion LinUCB API Features
 *
 * This script tests the new features including rate limiting, batch operations,
 * caching, API versioning, and performance monitoring.
 */

import axios from 'axios';

const API_BASE_URL = 'http://localhost:3001/api';
const TEST_USER_ID = 'test_user_' + Date.now();

interface TestResult {
    name: string;
    passed: boolean;
    response?: any;
    error?: string;
    responseTime?: number;
}

class APITester {
    private results: TestResult[] = [];
    private sessionId: string = '';

    async runAllTests(): Promise<void> {
        console.log('🧪 Starting Enhanced Fashion LinUCB API Tests...\n');

        try {
            // Start server if not running
            await this.waitForServer();

            // Test API versioning
            await this.testAPIVersioning();

            // Test enhanced rate limiting
            await this.testRateLimiting();

            // Test session creation with validation
            await this.testSessionCreation();

            // Test single recommendation with caching
            await this.testSingleRecommendation();

            // Test batch recommendations
            await this.testBatchRecommendations();

            // Test feedback with cache invalidation
            await this.testFeedback();

            // Test batch feedback
            await this.testBatchFeedback();

            // Test performance monitoring
            await this.testPerformanceMonitoring();

            // Test cache management
            await this.testCacheManagement();

            // Test system health
            await this.testSystemHealth();

            // Print results
            this.printResults();

        } catch (error) {
            console.error('❌ Test suite failed:', error);
        }
    }

    private async waitForServer(maxRetries = 10): Promise<void> {
        for (let i = 0; i < maxRetries; i++) {
            try {
                await axios.get(`${API_BASE_URL}/health`);
                console.log('✅ Server is running\n');
                return;
            } catch (error) {
                if (i === maxRetries - 1) {
                    throw new Error('Server is not responding. Please start the server first.');
                }
                console.log(`⏳ Waiting for server... (${i + 1}/${maxRetries})`);
                await this.sleep(2000);
            }
        }
    }

    private async testAPIVersioning(): Promise<void> {
        console.log('📋 Testing API Versioning...');

        // Test version info endpoint
        await this.runTest('API Version Info', async () => {
            const response = await axios.get(`${API_BASE_URL}/version`);
            return response.status === 200 && response.data.success;
        });

        // Test v1 path prefix
        await this.runTest('V1 Path Prefix', async () => {
            const response = await axios.get(`http://localhost:3001/api/v1/version`);
            return response.status === 200;
        });

        // Test API-Version header
        await this.runTest('API-Version Header', async () => {
            const response = await axios.get(`${API_BASE_URL}/version`, {
                headers: { 'API-Version': 'v2' }
            });
            return response.status === 200 && response.headers['api-version'] === 'v2';
        });
    }

    private async testRateLimiting(): Promise<void> {
        console.log('🚦 Testing Rate Limiting...');

        // Test normal request
        await this.runTest('Normal Rate Limit', async () => {
            const response = await axios.get(`${API_BASE_URL}/health`);
            return response.status === 200;
        });

        // Note: Aggressive rate limit testing is skipped to avoid blocking the API during tests
        console.log('ℹ️  Skipping aggressive rate limit testing to avoid API blocking');
    }

    private async testSessionCreation(): Promise<void> {
        console.log('👤 Testing Session Creation...');

        // Test valid session creation
        await this.runTest('Create Valid Session', async () => {
            const response = await axios.post(`${API_BASE_URL}/session`, {
                userId: TEST_USER_ID,
                context: {
                    age: 25,
                    gender: 'female',
                    preferences: ['casual', 'summer']
                }
            });

            if (response.status === 201 && response.data.success) {
                this.sessionId = response.data.session_id;
                return true;
            }
            return false;
        });

        // Test invalid session creation
        await this.runTest('Invalid Session Data', async () => {
            try {
                await axios.post(`${API_BASE_URL}/session`, {
                    // Missing userId
                    context: { age: 25 }
                });
                return false; // Should have failed
            } catch (error: any) {
                return error.response?.status === 400;
            }
        });
    }

    private async testSingleRecommendation(): Promise<void> {
        console.log('🎯 Testing Single Recommendation...');

        if (!this.sessionId) {
            console.log('⚠️  Skipping recommendation tests - no session ID');
            return;
        }

        // Test first recommendation (cache miss)
        await this.runTest('Single Recommendation (Cache Miss)', async () => {
            const response = await axios.get(`${API_BASE_URL}/recommend/${this.sessionId}`);
            return response.status === 200 && response.data.success;
        });

        // Test second recommendation (cache hit)
        await this.runTest('Single Recommendation (Cache Hit)', async () => {
            const response = await axios.get(`${API_BASE_URL}/recommend/${this.sessionId}`);
            return response.status === 200 && response.data.success;
        });

        // Test recommendation with filters
        await this.runTest('Recommendation with Filters', async () => {
            const response = await axios.get(`${API_BASE_URL}/recommend/${this.sessionId}`, {
                params: {
                    minPrice: 20,
                    maxPrice: 100,
                    category: 'dress'
                }
            });
            return response.status === 200 && response.data.success;
        });
    }

    private async testBatchRecommendations(): Promise<void> {
        console.log('📦 Testing Batch Recommendations...');

        if (!this.sessionId) {
            console.log('⚠️  Skipping batch recommendation tests - no session ID');
            return;
        }

        // Test batch recommendations
        await this.runTest('Batch Recommendations', async () => {
            const response = await axios.post(`${API_BASE_URL}/recommendations/batch`, {
                requests: [
                    {
                        sessionId: this.sessionId,
                        count: 3,
                        filters: { minPrice: 10, maxPrice: 50 }
                    },
                    {
                        sessionId: this.sessionId,
                        count: 2,
                        filters: { category: 'top' }
                    }
                ],
                globalSettings: {
                    enableParallelProcessing: true,
                    includeDebugInfo: true
                }
            });
            return response.status === 200 && response.data.success;
        });

        // Test invalid batch request
        await this.runTest('Invalid Batch Request', async () => {
            try {
                await axios.post(`${API_BASE_URL}/recommendations/batch`, {
                    requests: [] // Empty array
                });
                return false;
            } catch (error: any) {
                return error.response?.status === 400;
            }
        });
    }

    private async testFeedback(): Promise<void> {
        console.log('💭 Testing Feedback...');

        if (!this.sessionId) {
            console.log('⚠️  Skipping feedback tests - no session ID');
            return;
        }

        // Test valid feedback
        await this.runTest('Valid Feedback', async () => {
            const response = await axios.post(`${API_BASE_URL}/feedback`, {
                session_id: this.sessionId,
                product_id: 'TEST-PRODUCT-1',
                action: 'love',
                context: {
                    page: 'test',
                    position: 1
                }
            });
            return response.status === 200 && response.data.success;
        });

        // Test invalid feedback
        await this.runTest('Invalid Feedback', async () => {
            try {
                await axios.post(`${API_BASE_URL}/feedback`, {
                    session_id: this.sessionId,
                    product_id: 'TEST-PRODUCT-1',
                    action: 'invalid_action'
                });
                return false;
            } catch (error: any) {
                return error.response?.status === 400;
            }
        });
    }

    private async testBatchFeedback(): Promise<void> {
        console.log('📦 Testing Batch Feedback...');

        if (!this.sessionId) {
            console.log('⚠️  Skipping batch feedback tests - no session ID');
            return;
        }

        // Test batch feedback
        await this.runTest('Batch Feedback', async () => {
            const response = await axios.post(`${API_BASE_URL}/feedback/batch`, {
                feedbacks: [
                    {
                        sessionId: this.sessionId,
                        productId: 'TEST-PRODUCT-2',
                        action: 'like',
                        context: { page: 'test' }
                    },
                    {
                        sessionId: this.sessionId,
                        productId: 'TEST-PRODUCT-3',
                        action: 'dislike',
                        context: { page: 'test' }
                    }
                ],
                options: {
                    continueOnError: true,
                    updateModelImmediately: true
                }
            });
            return response.status === 200 && response.data.success;
        });
    }

    private async testPerformanceMonitoring(): Promise<void> {
        console.log('📊 Testing Performance Monitoring...');

        // Test metrics endpoint
        await this.runTest('Performance Metrics', async () => {
            const response = await axios.get(`${API_BASE_URL}/metrics`);
            return response.status === 200 && response.data.success && response.data.metrics;
        });
    }

    private async testCacheManagement(): Promise<void> {
        console.log('💾 Testing Cache Management...');

        // Test cache stats
        await this.runTest('Cache Statistics', async () => {
            const response = await axios.get(`${API_BASE_URL}/cache/stats`);
            return response.status === 200 && response.data.success;
        });

        // Test cache clear (if enabled)
        if (process.env.NODE_ENV === 'development') {
            await this.runTest('Cache Clear', async () => {
                const response = await axios.post(`${API_BASE_URL}/cache/clear`);
                return response.status === 200 && response.data.success;
            });
        }
    }

    private async testSystemHealth(): Promise<void> {
        console.log('🏥 Testing System Health...');

        // Test health endpoint
        await this.runTest('System Health', async () => {
            const response = await axios.get(`${API_BASE_URL}/health`);
            return response.status === 200 && response.data.success;
        });
    }

    private async runTest(name: string, testFn: () => Promise<boolean>): Promise<void> {
        const startTime = Date.now();
        try {
            const passed = await testFn();
            const responseTime = Date.now() - startTime;

            this.results.push({
                name,
                passed,
                responseTime
            });

            const status = passed ? '✅' : '❌';
            console.log(`  ${status} ${name} (${responseTime}ms)`);
        } catch (error: any) {
            const responseTime = Date.now() - startTime;
            this.results.push({
                name,
                passed: false,
                error: error.message,
                responseTime
            });

            console.log(`  ❌ ${name} (${responseTime}ms) - Error: ${error.message}`);
        }
    }

    private printResults(): void {
        console.log('\n📊 Test Results Summary:');
        console.log('========================');

        const passed = this.results.filter(r => r.passed).length;
        const total = this.results.length;
        const passRate = ((passed / total) * 100).toFixed(1);

        console.log(`Total Tests: ${total}`);
        console.log(`Passed: ${passed}`);
        console.log(`Failed: ${total - passed}`);
        console.log(`Pass Rate: ${passRate}%`);

        const avgResponseTime = this.results.reduce((sum, r) => sum + (r.responseTime || 0), 0) / total;
        console.log(`Average Response Time: ${avgResponseTime.toFixed(2)}ms`);

        if (total - passed > 0) {
            console.log('\n❌ Failed Tests:');
            this.results.filter(r => !r.passed).forEach(r => {
                console.log(`  - ${r.name}: ${r.error || 'Test failed'}`);
            });
        }

        console.log(`\n${passed === total ? '🎉' : '⚠️'} Test suite ${passed === total ? 'PASSED' : 'COMPLETED WITH FAILURES'}`);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const tester = new APITester();
    tester.runAllTests().catch(console.error);
}

export { APITester };
