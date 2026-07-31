// Vercel Serverless API Proxy Function for AWS Bedrock & OpenRouter AI
// Endpoint: POST /api/chat

const BEDROCK_ENDPOINT = 'https://bedrock-runtime.us-east-1.amazonaws.com/model/amazon.nova-lite-v1:0/invoke';
const BEDROCK_KEY_B64 = 'QUJTS1FtVmtjbTlqYTBGUVNVdGxlUzFyT1cxdExXRjBMVEEzTXpRd01qTTVNRGs0TWpwS1ZWcHpOV05sZG1WV1dFNW1VRTVCZEhoU01qVm5iVTlQU1VKNlpqZEpNVFozWkRGR09WQlhiREJHWTB4dldtUnJVRkI1UW1OTVMxWk5hejA=';

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_KEY_B64 = 'c2stb3ItdjEtNjY2MTY3NTFlYzJhYjM0NWE2ZDg2ZDY5NzE0Njc5ODRlZTc2Yjc0NTNjYTllNzMxMmE5NjRkNmRkM3MyNzBmMw==';

const FREE_MODELS = [
    "google/gemma-4-26b-a4b-it:free",
    "openai/gpt-oss-20b:free"
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

    try {
        const { messages } = req.body || {};
        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: { message: 'Missing messages array in request body.' } });
        }

        const bedrockKey = process.env.AWS_BEDROCK_KEY || (typeof atob === 'function' ? atob(BEDROCK_KEY_B64) : '');
        const openrouterKey = process.env.OPENROUTER_API_KEY || (typeof atob === 'function' ? atob(OPENROUTER_KEY_B64) : '');

        // 1. Primary Priority: AWS Bedrock ($120 Credits - Amazon Nova Lite)
        try {
            const systemMsg = messages.find(m => m.role === 'system')?.content || '';
            const userMsgs = messages.filter(m => m.role !== 'system').map(m => ({
                role: m.role === 'assistant' ? 'assistant' : 'user',
                content: [{ text: m.content }]
            }));

            const bedrockBody = {
                system: systemMsg ? [{ text: systemMsg }] : [],
                messages: userMsgs,
                inferenceConfig: {
                    maxTokens: 1000,
                    temperature: 0.3
                }
            };

            const bedrockResp = await fetch(BEDROCK_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${bedrockKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(bedrockBody)
            });

            if (bedrockResp.ok) {
                const bData = await bedrockResp.json();
                const textOutput = bData.output?.message?.content[0]?.text;
                if (textOutput) {
                    return res.status(200).json({
                        model: 'AWS Bedrock (Amazon Nova)',
                        choices: [{ message: { role: 'assistant', content: textOutput } }]
                    });
                }
            } else {
                const bErr = await bedrockResp.text().catch(() => '');
                console.warn('AWS Bedrock returned non-200:', bedrockResp.status, bErr);
            }
        } catch (bedrockErr) {
            console.warn('AWS Bedrock error, falling back to OpenRouter:', bedrockErr.message);
        }

        // 2. Secondary Fallback: OpenRouter Free Models
        let lastError = null;

        for (let i = 0; i < FREE_MODELS.length; i++) {
            const currentModel = FREE_MODELS[i];
            try {
                const response = await fetch(OPENROUTER_ENDPOINT, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${openrouterKey}`,
                        'HTTP-Referer': req.headers.referer || 'https://janvi-aika-dashboard.vercel.app',
                        'X-Title': 'Janvi AI Assistance',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: currentModel,
                        messages: messages,
                        temperature: 0.3,
                        max_tokens: 600
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
