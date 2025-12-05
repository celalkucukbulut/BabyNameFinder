const { GoogleGenerativeAI } = require("@google/generative-ai");
const { connectToDatabase } = require('../lib/mongodb');
const Name = require('../models/Name');

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

// Helper function to calculate Levenshtein distance (string similarity)
function levenshteinDistance(str1, str2) {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix = [];

    for (let i = 0; i <= len1; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= len2; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }

    return matrix[len1][len2];
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

        // Connect to database and check for similar names
        await connectToDatabase();

        // Check if a very similar name already exists (catch typos)
        const existingNames = await Name.find({}).select('name').lean();
        const inputLower = sanitizedPrompt.toLocaleLowerCase('tr');

        for (const existingName of existingNames) {
            const existingLower = existingName.name.toLocaleLowerCase('tr');
            const distance = levenshteinDistance(inputLower, existingLower);

            // If the distance is 1-2 characters and names are similar length, likely a typo
            if (distance >= 1 && distance <= 2 && Math.abs(inputLower.length - existingLower.length) <= 2) {
                return res.status(400).json({
                    error: 'Benzer isim bulundu',
                    details: `"${sanitizedPrompt}" yerine "${existingName.name}" mi demek istediniz? Lütfen doğru yazılışı kullanın.`,
                    suggestion: existingName.name
                });
            }
        }

        // Initialize Gemini AI
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        // Craft a specific prompt for name checking with strict validation
        const fullPrompt = `Sen bir Türkçe isim uzmanısın. Sana verilen metni ÇOK KATLI bir şekilde kontrol et:

Kontrol edilecek metin: \"${sanitizedPrompt}\"

ÖNEMLİ KURALLAR:
1. Sadece GERÇEKTEN KULLANILAN Türkçe isimleri kabul et
2. Yazım hatalarını, yanlış yazılmış isimleri REDDET (örn: "Eylüll" yanlış, "Eylül" doğru)
3. Gereksiz çift harfleri REDDET (örn: "Mehmettt", "Ayşee" gibi)
4. Türkçe'de olmayan veya çok nadir kullanılan isimleri REDDET
5. İsim gibi görünen ama anlamsız metinleri REDDET
6. Sadece bilinen, yaygın veya az bilinen ama GERÇEK Türkçe isimleri kabul et

Eğer bu GERÇEK, DOĞRU YAZILMIŞ bir Türkçe isimse, lütfen şu formatta JSON döndür:
{
  "isName": true,
  "name": "İsim (doğru yazılışı)",
  "gender": "Kız" veya "Erkek" veya "Her ikisi",
  "origin": "Köken (örn: Türkçe, Arapça, Farsça, İbranice, vb.)",
  "syllables": hece sayısı (sayı),
  "length": karakter uzunluğu (sayı),
  "meaning": "İsmin anlamı",
  "inQuran": true veya false (Kuran'da geçip geçmediği)
}

Eğer bu bir isim DEĞİLSE veya YANLIŞ YAZILMIŞSA:
{
  "isName": false,
  "message": "Bu bir isim değil veya yanlış yazılmış."
}

Sadece JSON formatında yanıt ver, başka açıklama ekleme.`;

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
