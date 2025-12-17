const { GoogleGenerativeAI } = require("@google/generative-ai");

// Simple in-memory rate limiter
const rateLimit = new Map();

function checkRateLimit(ip) {
    const now = Date.now();
    const userLimit = rateLimit.get(ip) || { count: 0, resetTime: now + 60000 };

    // Reset if time window passed
    if (now > userLimit.resetTime) {
        userLimit.count = 0;
        userLimit.resetTime = now + 60000;
    }

    userLimit.count++;
    rateLimit.set(ip, userLimit);

    // Max 10 requests per minute per IP
    return userLimit.count <= 10;
}

function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] ||
        req.headers['x-real-ip'] ||
        req.connection?.remoteAddress ||
        'unknown';
}



module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // Handle OPTIONS request
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Check rate limit
    const clientIp = getClientIp(req);
    if (!checkRateLimit(clientIp)) {
        return res.status(429).json({
            error: 'Çok fazla istek',
            details: 'Lütfen bir dakika bekleyip tekrar deneyin.'
        });
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    try {
        const apiKey = process.env.GOOGLE_API_KEY;

        if (!apiKey) {
            console.error('GOOGLE_API_KEY is not configured');
            return res.status(500).json({
                error: 'Service configuration error',
                details: 'API key not configured'
            });
        }

        const { prompt } = req.body;

        // Validate prompt
        if (!prompt || typeof prompt !== 'string') {
            return res.status(400).json({
                error: 'Invalid request',
                details: 'Prompt is required and must be a string'
            });
        }

        // Sanitize and validate prompt length
        const sanitizedPrompt = prompt.replace(/<[^>]*>/g, '').trim();

        if (sanitizedPrompt.length === 0) {
            return res.status(400).json({
                error: 'Invalid request',
                details: 'Prompt cannot be empty'
            });
        }

        if (sanitizedPrompt.length > 30) {
            return res.status(400).json({
                error: 'Invalid request',
                details: 'Name must be 30 characters or less'
            });
        }

        // Additional validation: Check for suspicious patterns
        // Reject if there are 3+ consecutive identical letters (very rare in Turkish names)
        if (/(.)\1{2,}/.test(sanitizedPrompt)) {
            return res.status(400).json({
                error: 'Invalid name',
                details: 'Bu bir isim gibi görünmüyor. Lütfen geçerli bir isim girin.'
            });
        }

        // Reject if contains non-Turkish alphabet characters (except space and dash)
        if (!/^[a-zA-ZçÇğĞıİöÖşŞüÜ\s-]+$/.test(sanitizedPrompt)) {
            return res.status(400).json({
                error: 'Invalid characters',
                details: 'Sadece Türkçe harfler kullanabilirsiniz.'
            });
        }



        // Initialize Gemini AI
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        // Craft a specific prompt for name checking with strict validation
        const fullPrompt = `**System Instructions:**
You are a linguistics expert specializing in Turkish Onomastics. Your task is to analyze if a given string is used as a "personal name" (first name) in Türkiye.

**Context:**
This is for a cultural research project. Even if a word has a dictionary meaning (e.g., "Deniz" means "Sea"), you must accept it if it is used as a person's name.

**Rules:**
1. REJECT: Clearly misspelled names (e.g., 'Ahmettt'), random strings (e.g., 'asdfgh'), or numbers.
2. DICTIONARY TRAP: Do not reject names just because they are also common nouns or virtues.

**Output Format:**
return JSON in this format:
{
  "isName": true,
  "name": "Name (correct spelling)",
  "gender": "Kız" or "Erkek" or "Her ikisi",
  "origin": "Origin (e.g., Türkçe, Arapça, Farsça, İbranice, etc.)",
  "syllables": syllable count (number),
  "length": character length (number),
  "meaning": "Meaning of the name in Turkish",
  "inQuran": true or false (whether it appears in the Quran)
}

If this is CLEARLY not a name or is an OBVIOUS typo:
{
  "isName": false,
  "message": "Bu bir isim değil veya yanlış yazılmış."
}
Return ONLY JSON format, no additional explanation.
**Input Text to Analyze:** \"${sanitizedPrompt}\"`;

        // Send request to Gemini
        const result = await model.generateContent(fullPrompt);
        const response = await result.response;
        const text = response.text();

        // Try to parse the response as JSON
        let parsedResponse;
        try {
            // Remove markdown code blocks if present
            const cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            parsedResponse = JSON.parse(cleanedText);
        } catch (parseError) {
            console.error('Failed to parse Gemini response:', text);
            return res.status(500).json({
                error: 'Failed to parse AI response',
                details: 'The AI returned an unexpected format',
                rawResponse: text
            });
        }

        // Enforce Turkish Title Case formatting (e.g., IŞIL -> Işıl)
        if (parsedResponse.isName && parsedResponse.name) {
            parsedResponse.name = parsedResponse.name.toLocaleUpperCase('tr').charAt(0) +
                parsedResponse.name.substring(1).toLocaleLowerCase('tr');
        }

        // Return the parsed response
        return res.status(200).json(parsedResponse);

    } catch (error) {
        console.error('Error in generate function:', error);

        // Handle specific error types
        if (error.message && error.message.includes('API key')) {
            return res.status(500).json({
                error: 'API authentication failed',
                details: 'Invalid or missing API key'
            });
        }

        return res.status(500).json({
            error: 'Internal server error',
            details: error.message || 'An unexpected error occurred'
        });
    }
};
