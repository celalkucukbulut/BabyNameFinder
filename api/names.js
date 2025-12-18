const { connectToDatabase } = require('../lib/mongodb');
const Name = require('../models/Name');
const { validateApiKey, setCorsHeaders, handleOptions } = require('../lib/apiKeyMiddleware');

// In-memory cache
let cachedData = null;
let cacheTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

module.exports = async (req, res) => {
    // Set CORS headers
    setCorsHeaders(res);

    // Handle OPTIONS request for CORS preflight
    if (handleOptions(req, res)) return;

    // Validate API key (required for all requests)
    const apiKeyError = validateApiKey(req, res, { required: true, maxRequests: 100 });
    if (apiKeyError) {
        return res.status(apiKeyError.status).json({
            error: apiKeyError.error,
            details: apiKeyError.details
        });
    }

    try {
        // Connect to database
        await connectToDatabase();

        // Handle GET request - Fetch names with filtering and pagination
        if (req.method === 'GET') {
            const {
                gender,
                origin,
                syllables,
                maxLength,
                inQuran,
                search,
                excludeLetters,
                page = 1,
                limit = 50,
                all // When 'all=true', return all data without pagination (for web frontend)
            } = req.query;

            // Check if requesting all data (for web frontend client-side filtering)
            const returnAll = all === 'true' || all === '1';

            // Validate pagination parameters
            const pageNum = Math.max(1, parseInt(page) || 1);
            const limitNum = returnAll ? 5000 : Math.min(100, Math.max(1, parseInt(limit) || 50));
            const skip = returnAll ? 0 : (pageNum - 1) * limitNum;

            // Build MongoDB query
            const query = {};

            // Gender filter
            if (gender && gender !== 'Tümü') {
                if (gender === 'Kız') {
                    query.gender = { $in: ['Kız', 'Her ikisi'] };
                } else if (gender === 'Erkek') {
                    query.gender = { $in: ['Erkek', 'Her ikisi'] };
                } else {
                    query.gender = gender;
                }
            }

            // Origin filter
            if (origin && origin !== 'Tümü') {
                query.origin = origin;
            }

            // Syllables filter
            if (syllables && syllables !== 'Tümü') {
                const syllableNum = parseInt(syllables);
                if (syllables === '4' || syllableNum >= 4) {
                    query.syllables = { $gte: 4 };
                } else if (!isNaN(syllableNum)) {
                    query.syllables = syllableNum;
                }
            }

            // Max length filter
            if (maxLength) {
                const maxLen = parseInt(maxLength);
                if (!isNaN(maxLen) && maxLen > 0) {
                    query.length = { $lte: maxLen };
                }
            }

            // Quran filter
            if (inQuran === 'true' || inQuran === true) {
                query.inQuran = true;
            }

            // Search filter (case-insensitive)
            if (search && search.trim()) {
                const searchTerm = search.trim();
                query.name = { $regex: searchTerm, $options: 'i' };
            }

            // Exclude letters filter
            if (excludeLetters && excludeLetters.trim()) {
                const letters = excludeLetters.split(',').map(l => l.trim().toLowerCase()).filter(l => l);
                if (letters.length > 0) {
                    // Build regex to exclude names containing any of these letters
                    const excludePattern = letters.map(l => `(?=.*${l})`).join('');
                    query.name = query.name || {};
                    query.name.$not = new RegExp(`^${excludePattern}`, 'i');
                }
            }

            // Check if we have any filters applied
            const hasFilters = Object.keys(query).length > 0;

            // Use cache only if no filters are applied and we're on page 1
            if (!hasFilters && pageNum === 1 && limitNum === 50) {
                const now = Date.now();
                if (cachedData && cacheTime && (now - cacheTime < CACHE_DURATION)) {
                    res.setHeader('X-Cache', 'HIT');
                    return res.status(200).json({
                        data: cachedData.slice(0, limitNum),
                        pagination: {
                            page: pageNum,
                            limit: limitNum,
                            total: cachedData.length,
                            totalPages: Math.ceil(cachedData.length / limitNum)
                        }
                    });
                }
            }

            // Get total count for pagination
            const totalCount = await Name.countDocuments(query);
            const totalPages = Math.ceil(totalCount / limitNum);

            // Fetch filtered and paginated data
            const names = await Name.find(query)
                .select('-__v -createdAt -updatedAt')
                .collation({ locale: 'tr', strength: 2 })
                .sort({ name: 1 })
                .skip(skip)
                .limit(limitNum)
                .lean();

            // Update cache if no filters and page 1
            if (!hasFilters && pageNum === 1) {
                const allNames = await Name.find({})
                    .select('-__v -createdAt -updatedAt')
                    .collation({ locale: 'tr', strength: 2 })
                    .sort({ name: 1 })
                    .limit(5000)
                    .lean();
                cachedData = allNames;
                cacheTime = Date.now();
            }

            res.setHeader('X-Cache', 'MISS');
            res.setHeader('Cache-Control', 'public, s-maxage=300');
            return res.status(200).json({
                data: names,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total: totalCount,
                    totalPages: totalPages
                }
            });
        }

        // Handle POST request - Add new name(s)
        if (req.method === 'POST') {
            const { body } = req;

            // Size limit check (prevent large payloads)
            if (JSON.stringify(body).length > 10000) {
                return res.status(413).json({
                    error: 'Request too large',
                    details: 'Payload exceeds size limit'
                });
            }

            // Validate request body
            if (!body || (Array.isArray(body) && body.length === 0) || (!Array.isArray(body) && !body.name)) {
                return res.status(400).json({
                    error: 'Invalid request',
                    details: 'Request body must contain name data'
                });
            }

            // Support both single object and array of objects
            const namesToCreate = Array.isArray(body) ? body : [body];

            // Validate and sanitize each name object
            for (const nameData of namesToCreate) {
                // Sanitize HTML tags and format name (Turkish Title Case)
                if (nameData.name) {
                    let cleanName = nameData.name.replace(/<[^>]*>/g, '').trim();
                    // Format: First letter Upper (TR), rest Lower (TR)
                    nameData.name = cleanName.toLocaleUpperCase('tr').charAt(0) +
                        cleanName.substring(1).toLocaleLowerCase('tr');
                }
                if (nameData.meaning) nameData.meaning = nameData.meaning.replace(/<[^>]*>/g, '').trim();
                if (nameData.origin) nameData.origin = nameData.origin.replace(/<[^>]*>/g, '').trim();

                // Validate required fields
                if (!nameData.name || !nameData.gender || !nameData.origin ||
                    nameData.syllables === undefined || nameData.length === undefined ||
                    !nameData.meaning || nameData.inQuran === undefined) {
                    return res.status(400).json({
                        error: 'Invalid request',
                        details: 'Each name must have: name, gender, origin, syllables, length, meaning, and inQuran'
                    });
                }

                // Length validation
                if (nameData.name.length > 30 || nameData.meaning.length > 200 || nameData.origin.length > 50) {
                    return res.status(400).json({
                        error: 'Invalid request',
                        details: 'Field length exceeds maximum allowed'
                    });
                }
            }

            // Create names in database
            const createdNames = await Name.create(namesToCreate);

            // Invalidate cache
            cachedData = null;
            cacheTime = null;

            return res.status(201).json({
                message: `Successfully created ${createdNames.length} name(s)`,
                names: createdNames
            });
        }

        // Method not allowed
        return res.status(405).json({
            error: 'Method not allowed',
            details: 'Only GET and POST methods are supported'
        });

    } catch (error) {
        console.error('Error in /api/names:', error);

        // Handle validation errors
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                error: 'Validation error',
                details: error.message
            });
        }

        // Handle duplicate key errors
        if (error.code === 11000) {
            return res.status(409).json({
                error: 'Duplicate name',
                details: 'A name with this value already exists'
            });
        }

        return res.status(500).json({
            error: 'Internal server error',
            details: error.message || 'An unexpected error occurred'
        });
    }
};

