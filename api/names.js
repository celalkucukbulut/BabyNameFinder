const { connectToDatabase } = require('../lib/mongodb');
const Name = require('../models/Name');

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
            const names = await Name.find({}).select('-__v -createdAt -updatedAt').lean();
            return res.status(200).json(names);
        }

        // Handle POST request - Add new name(s)
        if (req.method === 'POST') {
            const { body } = req;

            // Validate request body
            if (!body || (Array.isArray(body) && body.length === 0) || (!Array.isArray(body) && !body.name)) {
                return res.status(400).json({
                    error: 'Invalid request',
                    details: 'Request body must contain name data'
                });
            }

            // Support both single object and array of objects
            const namesToCreate = Array.isArray(body) ? body : [body];

            // Validate each name object
            for (const nameData of namesToCreate) {
                if (!nameData.name || !nameData.gender || !nameData.origin ||
                    nameData.syllables === undefined || nameData.length === undefined ||
                    !nameData.meaning || nameData.inQuran === undefined) {
                    return res.status(400).json({
                        error: 'Invalid request',
                        details: 'Each name must have: name, gender, origin, syllables, length, meaning, and inQuran'
                    });
                }
            }

            // Create names in database
            const createdNames = await Name.create(namesToCreate);

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
