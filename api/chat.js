// Vercel Serverless API Proxy Function for AWS Bedrock ONLY ($120 Credits)
// Endpoint: POST /api/chat

const BEDROCK_KEY_B64 = 'QUJTS1FtVmtjbTlqYTBGUVNVdGxlUzFyT1cxdExXRjBMVEEzTXpRd01qTTVNRGs0TWpwS1ZWcHpOV05sZG1WV1dFNW1VRTVCZEhoU01qVm5iVTlQU1VKNlpqZEpNVFozWkRGR09WQlhiREJHWTB4dldtUnJVRkI1UW1OTVMxWk5hejA=';

const BEDROCK_MODELS = [
    { id: 'amazon.nova-lite-v1:0', type: 'nova', name: 'AWS Bedrock (Amazon Nova Lite)' },
    { id: 'amazon.nova-pro-v1:0', type: 'nova', name: 'AWS Bedrock (Amazon Nova Pro)' },
    { id: 'amazon.nova-micro-v1:0', type: 'nova', name: 'AWS Bedrock (Amazon Nova Micro)' },
    { id: 'meta.llama3-70b-instruct-v1:0', type: 'llama', name: 'AWS Bedrock (Meta LLaMA 3 70B)' }
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

        let lastError = null;

        // Iterate through AWS Bedrock Models Queue
        for (let i = 0; i < BEDROCK_MODELS.length; i++) {
            const targetModel = BEDROCK_MODELS[i];
            try {
                const endpoint = `https://bedrock-runtime.us-east-1.amazonaws.com/model/${targetModel.id}/invoke`;
                let bodyPayload = {};

                if (targetModel.type === 'nova') {
                    const systemMsg = messages.find(m => m.role === 'system')?.content || 'You are the expert AI Analytics Assistant named Janvi AI Assistance for JANVI AIKA.';
                    
                    let userMsgs = messages.filter(m => m.role !== 'system').map(m => ({
                        role: m.role === 'assistant' ? 'assistant' : 'user',
                        content: [{ text: (m.content || ' ').trim() || ' ' }]
                    }));

                    // Amazon Nova Requirement: First message MUST use 'user' role
                    while (userMsgs.length > 0 && userMsgs[0].role !== 'user') {
                        userMsgs.shift();
                    }

                    if (userMsgs.length === 0) {
                        userMsgs = [{ role: 'user', content: [{ text: 'Hello' }] }];
                    }

                    bodyPayload = {
                        system: [{ text: systemMsg }],
                        messages: userMsgs,
                        inferenceConfig: {
                            maxTokens: 1000,
                            temperature: 0.3
                        }
                    };
                } else {
                    // Prompt formatting for LLaMA 3
                    const fullPrompt = messages.map(m => `<|start_header_id|>${m.role}<|end_header_id|>\n\n${m.content}<|eot_id|>`).join('\n') + '\n<|start_header_id|>assistant<|end_header_id|>\n\n';
                    bodyPayload = {
                        prompt: fullPrompt,
                        max_gen_len: 1000,
                        temperature: 0.3
                    };
                }

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${bedrockKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(bodyPayload)
                });

                if (response.ok) {
                    const data = await response.json();
                    let textOutput = '';
                    if (targetModel.type === 'nova') {
                        textOutput = data.output?.message?.content[0]?.text;
                    } else {
                        textOutput = data.generation;
                    }

                    if (textOutput) {
                        return res.status(200).json({
                            model: targetModel.name,
                            choices: [{ message: { role: 'assistant', content: textOutput } }]
                        });
                    }
                } else {
                    const errTxt = await response.text().catch(() => '');
                    console.warn(`AWS Bedrock model ${targetModel.id} returned ${response.status}:`, errTxt);
                    lastError = new Error(`AWS Bedrock model ${targetModel.id} status ${response.status}`);
                }
            } catch (err) {
                console.warn(`AWS Bedrock error with ${targetModel.id}:`, err.message);
                lastError = err;
            }
        }

        return res.status(502).json({ error: { message: lastError ? lastError.message : 'AWS Bedrock service temporarily unavailable.' } });
    } catch (err) {
        return res.status(500).json({ error: { message: err.message || 'Server Internal Error' } });
    }
};
