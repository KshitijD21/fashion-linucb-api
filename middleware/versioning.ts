/**
 * API Versioning Middleware for Fashion LinUCB API
 *
 * Provides versioning support for API endpoints to enable smooth frontend
 * migration and backward compatibility.
 */

import { NextFunction, Request, Response } from 'express';

interface ApiVersion {
    version: string;
    supported: boolean;
    deprecated: boolean;
    deprecationDate?: string;
    migrationGuide?: string;
    endOfLife?: string;
}

interface VersionedRequest extends Request {
    apiVersion: string;
    isDeprecated: boolean;
    migrationPath?: string;
}

// API version configuration
const API_VERSIONS: { [key: string]: ApiVersion } = {
    'v1': {
        version: 'v1',
        supported: true,
        deprecated: false
    },
    'v2': {
        version: 'v2',
        supported: true,
        deprecated: false
    },
    // Example of deprecated version
    'v0': {
        version: 'v0',
        supported: true,
        deprecated: true,
        deprecationDate: '2024-12-01',
        migrationGuide: 'https://docs.fashion-api.com/migration/v0-to-v1',
        endOfLife: '2025-06-01'
    }
};

const DEFAULT_VERSION = 'v1';
const CURRENT_VERSION = 'v2';

/**
 * Extract version from request path or headers
 */
function extractVersion(req: Request): string {
    // Priority order: path parameter > header > query param > default

    // 1. Check path parameter (e.g., /api/v1/recommendations)
    const pathMatch = req.path.match(/^\/api\/v(\d+)\//);
    if (pathMatch) {
        return `v${pathMatch[1]}`;
    }

    // 2. Check Accept header with version
    const acceptHeader = req.get('Accept');
    if (acceptHeader) {
        const versionMatch = acceptHeader.match(/application\/vnd\.fashion-api\.v(\d+)\+json/);
        if (versionMatch) {
            return `v${versionMatch[1]}`;
        }
    }

    // 3. Check custom API-Version header
    const versionHeader = req.get('API-Version');
    if (versionHeader && API_VERSIONS[versionHeader]) {
        return versionHeader;
    }

    // 4. Check query parameter
    const queryVersion = req.query.version as string;
    if (queryVersion && API_VERSIONS[queryVersion]) {
        return queryVersion;
    }

    // 5. Default version
    return DEFAULT_VERSION;
}

/**
 * Rewrite path to remove version prefix for routing
 */
function rewritePath(req: Request, version: string): void {
    // Remove version from path if it exists
    const versionPattern = new RegExp(`^/api/v\\d+/`);
    if (versionPattern.test(req.url)) {
        req.url = req.url.replace(versionPattern, '/api/');
        // Note: req.path is read-only, but req.url modification handles routing
    }
}

/**
 * Add version-specific response headers
 */
function addVersionHeaders(res: Response, version: string, isDeprecated: boolean): void {
    res.set({
        'API-Version': version,
        'API-Current-Version': CURRENT_VERSION,
        'API-Supported-Versions': Object.keys(API_VERSIONS).filter(v => API_VERSIONS[v].supported).join(', ')
    });

    if (isDeprecated) {
        const versionInfo = API_VERSIONS[version];
        res.set({
            'API-Deprecation-Warning': 'true',
            'API-Deprecation-Date': versionInfo.deprecationDate || 'unknown',
            'API-Migration-Guide': versionInfo.migrationGuide || ''
        });

        if (versionInfo.endOfLife) {
            res.set('API-End-Of-Life', versionInfo.endOfLife);
        }
    }
}

/**
 * Main API versioning middleware
 */
export const apiVersioning = (req: VersionedRequest, res: Response, next: NextFunction): void => {
    const version = extractVersion(req);
    const versionInfo = API_VERSIONS[version];

    // Check if version is supported
    if (!versionInfo) {
        res.status(400).json({
            success: false,
            error: 'Unsupported API version',
            message: `API version '${version}' is not supported`,
            supported_versions: Object.keys(API_VERSIONS).filter(v => API_VERSIONS[v].supported),
            current_version: CURRENT_VERSION
        });
        return;
    }

    if (!versionInfo.supported) {
        res.status(410).json({
            success: false,
            error: 'API version discontinued',
            message: `API version '${version}' is no longer supported`,
            supported_versions: Object.keys(API_VERSIONS).filter(v => API_VERSIONS[v].supported),
            current_version: CURRENT_VERSION,
            migration_guide: versionInfo.migrationGuide
        });
        return;
    }

    // Set version information on request
    req.apiVersion = version;
    req.isDeprecated = versionInfo.deprecated;
    req.migrationPath = versionInfo.migrationGuide;

    // Rewrite path for internal routing
    rewritePath(req, version);

    // Add version headers to response
    addVersionHeaders(res, version, versionInfo.deprecated);

    // Log deprecation warnings
    if (versionInfo.deprecated) {
        console.warn(`⚠️  Deprecated API version ${version} used by ${req.ip} for ${req.method} ${req.originalUrl}`);
    }

    next();
};

/**
 * Version-specific response transformer middleware
 */
export const versionedResponse = (req: VersionedRequest, res: Response, next: NextFunction): void => {
    const originalJson = res.json.bind(res);

    res.json = function(obj: any) {
        // Transform response based on API version
        const transformedResponse = transformResponseForVersion(obj, req.apiVersion);

        // Add version metadata to response
        if (transformedResponse && typeof transformedResponse === 'object') {
            transformedResponse._api_version = req.apiVersion;
            transformedResponse._api_deprecated = req.isDeprecated;

            if (req.isDeprecated && req.migrationPath) {
                transformedResponse._migration_guide = req.migrationPath;
            }
        }

        return originalJson(transformedResponse);
    };

    next();
};

/**
 * Transform response data based on API version
 */
function transformResponseForVersion(data: any, version: string): any {
    if (!data || typeof data !== 'object') {
        return data;
    }

    switch (version) {
        case 'v0':
            return transformToV0(data);
        case 'v1':
            return transformToV1(data);
        case 'v2':
            return data; // Current version, no transformation needed
        default:
            return data;
    }
}

/**
 * Transform response to v0 format (legacy support)
 */
function transformToV0(data: any): any {
    // Example transformations for backward compatibility
    if (data.recommendation) {
        // v0 expected flat structure
        return {
            ...data,
            product_id: data.recommendation.product?.product_id,
            product_name: data.recommendation.product?.name,
            product_price: data.recommendation.product?.price,
            confidence: data.recommendation.confidence_score,
            // Remove nested structure
            recommendation: undefined
        };
    }

    if (data.recommendations) {
        // Transform batch recommendations for v0
        return {
            ...data,
            products: data.recommendations.map((rec: any) => ({
                id: rec.product?.product_id,
                name: rec.product?.name,
                price: rec.product?.price,
                confidence: rec.confidence_score
            })),
            recommendations: undefined
        };
    }

    return data;
}

/**
 * Transform response to v1 format
 */
function transformToV1(data: any): any {
    // v1 might have different field names or structure
    if (data.recommendation?.product?.urls) {
        // v1 might expect separate image and product_url fields
        const product = data.recommendation.product;
        product.image_url = product.urls.image;
        product.product_url = product.urls.product;
        delete product.urls;
    }

    return data;
}

/**
 * Get version information endpoint
 */
export const getVersionInfo = (req: Request, res: Response): void => {
    const supportedVersions = Object.entries(API_VERSIONS)
        .filter(([_, info]) => info.supported)
        .map(([version, info]) => ({
            version,
            deprecated: info.deprecated,
            deprecation_date: info.deprecationDate,
            migration_guide: info.migrationGuide,
            end_of_life: info.endOfLife
        }));

    res.json({
        success: true,
        current_version: CURRENT_VERSION,
        default_version: DEFAULT_VERSION,
        supported_versions: supportedVersions,
        version_detection: {
            methods: [
                'Path parameter: /api/v1/endpoint',
                'Accept header: application/vnd.fashion-api.v1+json',
                'API-Version header: v1',
                'Query parameter: ?version=v1'
            ],
            priority: 'path > accept header > api-version header > query parameter > default'
        }
    });
};

/**
 * Middleware to handle deprecated version warnings in response
 */
export const deprecationWarning = (req: VersionedRequest, res: Response, next: NextFunction): void => {
    if (req.isDeprecated) {
        const originalJson = res.json.bind(res);

        res.json = function(obj: any) {
            if (obj && typeof obj === 'object') {
                obj._deprecation_warning = {
                    message: `API version ${req.apiVersion} is deprecated`,
                    migration_guide: req.migrationPath,
                    action_required: 'Please upgrade to the latest API version'
                };
            }
            return originalJson(obj);
        };
    }

    next();
};

export { API_VERSIONS, CURRENT_VERSION, DEFAULT_VERSION };
