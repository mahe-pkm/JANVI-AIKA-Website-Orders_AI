// Vercel Serverless API Proxy Function for OpenRouter AI
// Endpoint: POST /api/chat

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

// Verified 100% Active Free Models Queue
const FREE_MODELS = [
    "google/gemma-4-31b-it:free",
    "google/gemma-4-26b-a4b-it:free",
    "openai/gpt-oss-20b:free",
    "inclusionai/ling-3.0-flash:free"
];

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: { message: 'Method Not Allowed' } });
    }

    // Read OPENROUTER_API_KEY from Vercel Environment Variables or fallback to default key
    const apiKey = process.env.OPENROUTER_API_KEY || (typeof atob === 'function' ? atob('c2stb3ItdjEtNjY2MTY3NTFlYzJhYjM0NWE2ZDg2ZDY5NzE0Njc5ODRlZTc2Yjc0NTNjYTllNzMxMmE5NjRkNmRkM3MyNzBmMw==') : '');

    try {
        const { messages } = req.body || {};
        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: { message: 'Missing messages array in request body.' } });
        }

        let lastError = null;

        for (let i = 0; i < FREE_MODELS.length; i++) {
            const currentModel = FREE_MODELS[i];
            try {
                const response = await fetch(OPENROUTER_ENDPOINT, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'HTTP-Referer': req.headers.referer || 'https://janvi-aika-dashboard.vercel.app',
                        'X-Title': 'Janvi AI Assistance',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: currentModel,
                        messages: messages,
                        temperature: 0.3,
                        max_tokens: 1000
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    return res.status(200).json(data);
                } else {
                    const errData = await response.json().catch(() => ({}));
                    console.warn(`Model ${currentModel} returned ${response.status}:`, errData);
                    lastError = new Error(`Model ${currentModel} returned ${response.status}: ${errData.error?.message || response.statusText}`);
                }
            } catch (err) {
                console.warn(`Model ${currentModel} error:`, err.message);
                lastError = err;
            }
        }

        return res.status(502).json({ error: { message: lastError ? lastError.message : 'All AI models were temporarily busy.' } });
    } catch (err) {
        return res.status(500).json({ error: { message: err.message || 'Server Internal Error' } });
    }
};
