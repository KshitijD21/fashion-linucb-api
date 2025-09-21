// =====================================
// FASHION LINUCB API - MAIN SERVER
// =====================================

import compression from 'compression';
import cors from 'cors';
import dotenv from 'dotenv';
import express, { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import helmet from 'helmet';
import { Collection, Db, MongoClient } from 'mongodb';
import morgan from 'morgan';

// Load environment variables
dotenv.config();

// =====================================
// TYPE DEFINITIONS
// =====================================

interface AppLocals {
    db: Db | null;
    collections: {
        products: Collection;
        user_sessions: Collection;
        interactions: Collection;
    } | null;
}

interface CustomError extends Error {
    status?: number;
    code?: string;
    details?: any;
    stack?: string;
}

// Extend Express Application interface
declare global {
    namespace Express {
        interface Application {
            locals: AppLocals;
        }
    }
}

// =====================================
// CONFIGURATION & CONSTANTS
// =====================================

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
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
const corsOptions: cors.CorsOptions = {
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
    windowMs: (parseInt(process.env.RATE_LIMIT_WINDOW || '15', 10)) * 60 * 1000, // minutes to ms
    max: parseInt(process.env.RATE_LIMIT_REQUESTS || '100', 10),
    message: {
        success: false,
        error: 'Rate limit exceeded',
        message: 'Too many requests, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);

// Logging middleware
if (NODE_ENV === 'development') {
    const logFormat = process.env.LOG_FORMAT || 'combined';
    app.use(morgan(logFormat));
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'fashion-linucb-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Initialize app.locals
app.locals.db = null;
app.locals.collections = null;

// =====================================
// DATABASE CONNECTION
// =====================================

let client: MongoClient;

async function connectDatabase(): Promise<void> {
    try {
        console.log('📊 Connecting to MongoDB...');

        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            throw new Error('MONGODB_URI environment variable is not defined');
        }

        client = new MongoClient(mongoUri);
        await client.connect();

        const db = client.db();

        // Setup collections
        const collections = {
            products: db.collection('products'),
            user_sessions: db.collection('user_sessions'),
            interactions: db.collection('interactions')
        };

        // Store in app.locals for route access
        app.locals.db = db;
        app.locals.collections = collections;

        console.log('✅ MongoDB connected successfully');

    } catch (error) {
        console.error('❌ MongoDB connection failed:', error);
        throw error;
    }
}

// =====================================
// ROUTE IMPORTS
// =====================================

import recommendationRoutes from './routes/recommendations.js';

// =====================================
// API ROUTES
// =====================================

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
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
app.get('/api/products/count', async (req: Request, res: Response): Promise<void> => {
    try {
        // Use collections from app.locals
        const { collections } = req.app.locals as AppLocals;

        if (!collections) {
            res.status(503).json({
                success: false,
                error: 'Database not connected'
            });
            return;
        }

        const count = await collections.products.countDocuments();
        const sample = await collections.products.findOne({});

        if (!sample) {
            res.json({
                success: true,
                total_products: count,
                message: 'No products found - run data loader first'
            });
            return;
        }

        res.json({
            success: true,
            total_products: count,
            sample_product: {
                id: sample.id,
                name: sample.name,
                category: sample.category,
                price: sample.price,
                brand: sample.brand
            },
            message: `Database contains ${count} products`
        });

    } catch (error) {
        console.error('❌ Products count failed:', error);
        res.status(500).json({
            success: false,
            error: (error as Error).message
        });
    }
});

// API info endpoint
app.get('/api', (req: Request, res: Response) => {
    res.json({
        success: true,
        message: 'Fashion LinUCB API',
        version: '1.0.0',
        description: 'Contextual bandit recommendation system for fashion products',
        endpoints: {
            health: 'GET /health',
            products_count: 'GET /api/products/count',
            create_session: 'POST /api/session',
            get_recommendation: 'GET /api/recommend/:sessionId',
            submit_feedback: 'POST /api/feedback',
            analytics: 'GET /api/analytics'
        },
        algorithm: {
            name: 'LinUCB',
            description: 'Linear Upper Confidence Bound contextual bandit',
            features: {
                real_time_learning: true,
                personalization: true,
                exploration_exploitation: true,
                feature_dimensions: process.env.FEATURE_DIMENSIONS || 26,
                context_dimensions: process.env.CONTEXT_DIMENSIONS || 10,
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
    app.get('/debug/session', (req: Request, res: Response) => {
        res.json({
            session: req.session,
            locals: app.locals
        });
    });

    // Debug endpoint to test database connection
    app.get('/debug/db', async (req: Request, res: Response): Promise<void> => {
        try {
            const { db, collections } = req.app.locals as AppLocals;

            if (!db || !collections) {
                res.status(503).json({
                    success: false,
                    error: 'Database not connected'
                });
                return;
            }

            const stats = await db.admin().serverStatus();

            res.json({
                success: true,
                database_connected: true,
                collections_available: Object.keys(collections),
                server_info: {
                    version: stats.version,
                    uptime: stats.uptime
                }
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                error: (error as Error).message
            });
        }
    });
}

// =====================================
// 404 HANDLER
// =====================================

app.use('*', (req: Request, res: Response) => {
    res.status(404).json({
        success: false,
        error: {
            code: 'NOT_FOUND',
            message: `Route ${req.method} ${req.originalUrl} not found`,
            suggestion: 'Check the API documentation for available endpoints'
        }
    });
});

// =====================================
// ERROR HANDLER
// =====================================

const errorHandler: ErrorRequestHandler = (err: CustomError, req: Request, res: Response, next: NextFunction) => {
    console.error('🚨 Unhandled error:', err);

    const errorResponse: any = {
        success: false,
        error: {
            code: err.code || 'INTERNAL_ERROR',
            message: err.message || 'An unexpected error occurred'
        },
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
        method: req.method
    };

    // Add stack trace in development
    if (NODE_ENV === 'development') {
        errorResponse.error.stack = err.stack;
        errorResponse.error.details = err.details || {};
    }

    const status = err.status || 500;
    res.status(status).json(errorResponse);
};

app.use(errorHandler);

// =====================================
// GRACEFUL SHUTDOWN
// =====================================

const gracefulShutdown = async (signal: string): Promise<void> => {
    console.log(`🛑 ${signal} received, shutting down gracefully...`);

    // Close database connection
    if (client) {
        try {
            await client.close();
            console.log('📊 Database connection closed');
        } catch (error) {
            console.error('❌ Error closing database connection:', error);
        }
    }

    process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// =====================================
// SERVER STARTUP
// =====================================

async function startServer(): Promise<void> {
    try {
        console.log('🚀 Starting Fashion LinUCB API Server...');

        // Connect to database first
        await connectDatabase();

        // Start HTTP server on all interfaces (0.0.0.0) for mobile connectivity
        const HOST = process.env.HOST || '0.0.0.0';
        app.listen(PORT, HOST, () => {
            const networkIP = '10.153.123.55'; // Your current network IP
            console.log('================================');
            console.log(`✅ Server running on port ${PORT}`);
            console.log(`🌍 Environment: ${NODE_ENV}`);
            console.log(`🔗 Local URL: http://localhost:${PORT}`);
            console.log(`📱 Mobile URL: http://${networkIP}:${PORT}`);
            console.log(`📚 Health Check: http://${networkIP}:${PORT}/health`);
            console.log(`🔢 Products Count: http://${networkIP}:${PORT}/api/products/count`);
            console.log(`📖 API Info: http://${networkIP}:${PORT}/api`);
            console.log('================================');
            console.log('✅ Fashion LinUCB API Ready! 🚀');
            console.log('📱 Mobile apps can connect using the Mobile URL above');

            if (NODE_ENV === 'development') {
                console.log('🔧 Development mode active');
            }
        });

    } catch (error) {
        console.error('❌ Server startup failed:', error);
        process.exit(1);
    }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
    console.error('🚨 Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason: unknown, promise: Promise<any>) => {
    console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Start the server
startServer().catch((error: Error) => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
});
