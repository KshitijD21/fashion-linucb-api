// =====================================
// FASHION LINUCB API - MAIN SERVER
// =====================================

import compression from 'compression';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import helmet from 'helmet';
import morgan from 'morgan';

// Load environment variables
dotenv.config();

// =====================================
// CONFIGURATION & CONSTANTS
// =====================================

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// =====================================
// MIDDLEWARE SETUP
// =====================================

// Security middleware
if (process.env.ENABLE_HELMET !== 'false') {
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", "data:", "https:"],
            },
        },
    }));
}

// Compression middleware
if (process.env.ENABLE_COMPRESSION !== 'false') {
    app.use(compression());
}

// CORS configuration
const corsOptions = {
    origin: process.env.CORS_ORIGINS
        ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
        : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'],
    credentials: process.env.CORS_CREDENTIALS === 'true',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};
app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
    windowMs: (process.env.RATE_LIMIT_WINDOW || 15) * 60 * 1000, // minutes to ms
    max: process.env.RATE_LIMIT_REQUESTS || 100,
    message: {
        success: false,
        error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please try again later.',
        },
    },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);

// Request logging
if (process.env.ENABLE_REQUEST_LOGGING !== 'false') {
    const logFormat = NODE_ENV === 'production'
        ? 'combined'
        : 'dev';
    app.use(morgan(logFormat));
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
    resave: false,
    saveUninitialized: true,
    // Use memory store for development (comment out MongoDB store for now)
    // store: MongoStore.create({
    //     mongoUrl: process.env.MONGODB_URI,
    //     collectionName: process.env.SESSION_COLLECTION || 'user_sessions',
    //     ttl: parseInt(process.env.SESSION_TIMEOUT || '86400000') / 1000, // Convert ms to seconds
    // }),
    cookie: {
        secure: NODE_ENV === 'production',
        httpOnly: true,
        maxAge: parseInt(process.env.SESSION_TIMEOUT || '86400000'),
        sameSite: 'lax',
    },
    name: 'fashion.sid',
}));

// Trust proxy if behind reverse proxy
if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
}

// =====================================
// DATABASE CONNECTION
// =====================================

import { MongoClient } from 'mongodb';

// MongoDB connection
let db, collections;
const client = new MongoClient(process.env.MONGODB_URI);

async function connectToDatabase() {
    try {
        console.log('📊 Connecting to MongoDB...');
        await client.connect();
        db = client.db(); // Use default database from connection string

        collections = {
            products: db.collection('products'),
            models: db.collection('linucb_models'),
            sessions: db.collection('user_sessions'),
            interactions: db.collection('interactions')
        };

        // Make collections available to routes
        app.locals.collections = collections;

        console.log('✅ MongoDB connected successfully');
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error);
        return false;
    }
}

// =====================================
// ROUTE IMPORTS
// =====================================

import recommendationRoutes from './routes/recommendations.js';
// import feedbackRoutes from './routes/feedback.js';
// import itemRoutes from './routes/items.js';
// import sessionRoutes from './routes/sessions.js';

// =====================================
// API ROUTES
// =====================================

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        success: true,
        data: {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            environment: NODE_ENV,
            uptime: process.uptime(),
        },
    });
});

// Add after your existing routes
app.get('/api/products/count', async (req, res) => {
    try {
        // Use collections from app.locals
        const { collections } = req.app.locals;

        if (!collections) {
            return res.status(503).json({
                success: false,
                error: 'Database not connected'
            });
        }

        const count = await collections.products.countDocuments();
        const sample = await collections.products.findOne({});

        if (!sample) {
            return res.json({
                success: true,
                total_products: count,
                message: 'No products found - run data loader first'
            });
        }

        res.json({
            success: true,
            total_products: count,
            sample_product: {
                id: sample.product_id,
                name: sample.name,
                brand: sample.brand,
                price: sample.price,
                category: sample.category_main,
                feature_vector_length: sample.feature_vector.length,
                active_features: sample.feature_explanation
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});


// API version info
app.get('/api', (req, res) => {
    res.json({
        success: true,
        data: {
            name: 'Fashion LinUCB API',
            version: '1.0.0',
            description: 'Fashion Recommendation System using LinUCB Algorithm',
            endpoints: {
                health: '/health',
                recommendations: '/api/v1/recommendations',
                feedback: '/api/v1/feedback',
                sessions: '/api/v1/sessions',
                items: '/api/v1/items',
            },
            algorithm: {
                name: 'LinUCB',
                type: 'Contextual Bandit',
                parameters: {
                    alpha: process.env.LINUCB_ALPHA || 0.5,
                    feature_dimensions: process.env.FEATURE_DIMENSIONS || 30,
                    context_dimensions: process.env.CONTEXT_DIMENSIONS || 10,
                },
            },
        },
    });
});

// Mount API routes
app.use('/api', recommendationRoutes);

// =====================================
// DEBUG ROUTES (Development Only)
// =====================================

if (NODE_ENV === 'development' && process.env.ENABLE_DEBUG_ROUTES === 'true') {
    // Debug endpoint to view session data
    app.get('/debug/session', (req, res) => {
        res.json({
            success: true,
            data: {
                session_id: req.sessionID,
                session_data: req.session,
                cookies: req.headers.cookie,
            },
        });
    });

    // Debug endpoint to view environment configuration
    app.get('/debug/config', (req, res) => {
        const safeConfig = {
            PORT,
            NODE_ENV,
            FEATURE_DIMENSIONS: process.env.FEATURE_DIMENSIONS,
            CONTEXT_DIMENSIONS: process.env.CONTEXT_DIMENSIONS,
            LINUCB_ALPHA: process.env.LINUCB_ALPHA,
            CORS_ORIGINS: process.env.CORS_ORIGINS,
            // Don't expose sensitive data
            MONGODB_URI: process.env.MONGODB_URI ? '[CONFIGURED]' : '[NOT SET]',
            SESSION_SECRET: process.env.SESSION_SECRET ? '[CONFIGURED]' : '[NOT SET]',
        };

        res.json({
            success: true,
            data: safeConfig,
        });
    });
}

// =====================================
// ERROR HANDLING
// =====================================

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: {
            code: 'NOT_FOUND',
            message: `Route ${req.method} ${req.originalUrl} not found`,
            suggestion: 'Check the API documentation for available endpoints',
        },
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);

    // Default error response
    let statusCode = err.statusCode || 500;
    let errorResponse = {
        success: false,
        error: {
            code: err.code || 'INTERNAL_SERVER_ERROR',
            message: err.message || 'An unexpected error occurred',
        },
    };

    // Include stack trace in development
    if (NODE_ENV === 'development' && process.env.DETAILED_ERRORS === 'true') {
        errorResponse.error.stack = err.stack;
        errorResponse.error.details = err.details || {};
    }

    res.status(statusCode).json(errorResponse);
});

// =====================================
// SERVER STARTUP
// =====================================

async function startServer() {
    try {
        console.log('🚀 Starting Fashion LinUCB API Server...');

        // Initialize database connection
        console.log('📊 Connecting to MongoDB...');
        const connected = await connectToDatabase();
        if (!connected) {
            console.error('❌ Failed to connect to database');
            process.exit(1);
        }

        // Start HTTP server
        app.listen(PORT, () => {
            console.log('================================');
            console.log(`✅ Server running on port ${PORT}`);
            console.log(`🌍 Environment: ${NODE_ENV}`);
            console.log(`🔗 API URL: http://localhost:${PORT}`);
            console.log(`📚 Health Check: http://localhost:${PORT}/health`);
            console.log(`� Products Count: http://localhost:${PORT}/api/products/count`);
            console.log(`�📖 API Info: http://localhost:${PORT}/api`);
            console.log('================================');
            console.log('✅ Fashion LinUCB API Ready! 🚀');

            if (NODE_ENV === 'development') {
                console.log('🔧 Development mode active');
                if (process.env.ENABLE_DEBUG_ROUTES === 'true') {
                    console.log(`🐛 Debug routes: http://localhost:${PORT}/debug/`);
                }
            }
        });

    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    console.log('🛑 SIGTERM received, shutting down gracefully...');
    await client.close();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('🛑 SIGINT received, shutting down gracefully...');
    await client.close();
    process.exit(0);
});

// Start the server
startServer();

// =====================================
// EXPORT FOR TESTING
// =====================================

export default app;
