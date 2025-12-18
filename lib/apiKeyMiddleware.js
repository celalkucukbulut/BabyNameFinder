/**
 * API Key Middleware for Mobile App Security
 * Validates X-API-Key header against MOBILE_API_KEY environment variable
 */

// Rate limiting per API key
const apiKeyRateLimit = new Map();

/**
 * Check rate limit for API key
 * @param {string} apiKey - The API key to check
 * @param {number} maxRequests - Maximum requests allowed per minute
 * @returns {boolean} - Whether the request should be allowed
 */
function checkApiKeyRateLimit(apiKey, maxRequests = 60) {
    const now = Date.now();
    const keyLimit = apiKeyRateLimit.get(apiKey) || { count: 0, resetTime: now + 60000 };

    // Reset if time window passed
    if (now > keyLimit.resetTime) {
        keyLimit.count = 0;
        keyLimit.resetTime = now + 60000;
    }

    keyLimit.count++;
    apiKeyRateLimit.set(apiKey, keyLimit);

    return keyLimit.count <= maxRequests;
}

/**
 * Get remaining requests for rate limit
 * @param {string} apiKey - The API key to check
 * @param {number} maxRequests - Maximum requests allowed per minute
 * @returns {object} - Remaining requests and reset time
 */
function getRateLimitInfo(apiKey, maxRequests = 60) {
    const keyLimit = apiKeyRateLimit.get(apiKey);
    if (!keyLimit) {
        return { remaining: maxRequests, resetIn: 60 };
    }
    const now = Date.now();
    return {
        remaining: Math.max(0, maxRequests - keyLimit.count),
        resetIn: Math.max(0, Math.ceil((keyLimit.resetTime - now) / 1000))
    };
}

/**
 * Validate API Key middleware
 * @param {object} req - Request object
 * @param {object} res - Response object
 * @param {object} options - Options for validation
 * @returns {object|null} - Error response or null if valid
 */
function validateApiKey(req, res, options = {}) {
    const {
        required = false, // Changed to false for backward compatibility with web
        maxRequests = 60,
        addRateLimitHeaders = true
    } = options;

    const apiKey = req.headers['x-api-key'];
    const validApiKey = process.env.MOBILE_API_KEY;

    // If no API key provided
    if (!apiKey) {
        // Check if request is from web (browser) - allow without API key
        const origin = req.headers['origin'] || req.headers['referer'] || '';
        const isWebRequest = origin.includes('localhost') ||
            origin.includes('vercel.app') ||
            origin.includes(process.env.VERCEL_URL || '');

        if (isWebRequest || !required) {
            // Allow web requests without API key, use IP-based rate limiting
            return null;
        }

        return {
            status: 401,
            error: 'Unauthorized',
            details: 'API key is required. Include X-API-Key header.'
        };
    }

    // Validate API key if provided
    if (validApiKey && apiKey !== validApiKey) {
        return {
            status: 401,
            error: 'Unauthorized',
            details: 'Invalid API key'
        };
    }

    // Check rate limit for API key
    if (!checkApiKeyRateLimit(apiKey, maxRequests)) {
        const limitInfo = getRateLimitInfo(apiKey, maxRequests);
        if (addRateLimitHeaders) {
            res.setHeader('X-RateLimit-Remaining', 0);
            res.setHeader('X-RateLimit-Reset', limitInfo.resetIn);
        }
        return {
            status: 429,
            error: 'Too Many Requests',
            details: `Rate limit exceeded. Try again in ${limitInfo.resetIn} seconds.`
        };
    }

    // Add rate limit headers
    if (addRateLimitHeaders) {
        const limitInfo = getRateLimitInfo(apiKey, maxRequests);
        res.setHeader('X-RateLimit-Limit', maxRequests);
        res.setHeader('X-RateLimit-Remaining', limitInfo.remaining);
        res.setHeader('X-RateLimit-Reset', limitInfo.resetIn);
    }

    return null; // Valid API key
}

/**
 * Helper to set common CORS headers
 * @param {object} res - Response object
 */
function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-API-Key'
    );
}

/**
 * Handle OPTIONS preflight request
 * @param {object} req - Request object
 * @param {object} res - Response object
 * @returns {boolean} - True if OPTIONS request was handled
 */
function handleOptions(req, res) {
    if (req.method === 'OPTIONS') {
        setCorsHeaders(res);
        res.status(200).end();
        return true;
    }
    return false;
}

module.exports = {
    validateApiKey,
    setCorsHeaders,
    handleOptions,
    checkApiKeyRateLimit,
    getRateLimitInfo
};
