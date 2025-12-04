const { connectToDatabase } = require('../lib/mongodb');
const Name = require('../models/Name');

// In-memory cache
let cachedData = null;
let cacheTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // Handle OPTIONS request for CORS preflight
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        // Connect to database
        await connectToDatabase();

        // Handle GET request - Fetch all names
        if (req.method === 'GET') {
            const now = Date.now();

            // Return cached data if available and fresh
            if (cachedData && cacheTime && (now - cacheTime < CACHE_DURATION)) {
                res.setHeader('X-Cache', 'HIT');
                return res.status(200).json(cachedData);
            }

            // Fetch fresh data from database
            const names = await Name.find({})
                .select('-__v -createdAt -updatedAt')
                .sort({ name: 1 })
                .limit(5000) // Prevent massive queries
                .lean();

            // Update cache
            cachedData = names;
            cacheTime = now;

            res.setHeader('X-Cache', 'MISS');
            res.setHeader('Cache-Control', 'public, s-maxage=300');
            return res.status(200).json(names);
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
