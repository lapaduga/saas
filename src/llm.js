import config from './config.js';

export async function chat(messages, options = {}) {
  const startTime = Date.now();
  const url = `${config.llm.baseUrl}/chat/completions`;

  const body = {
    model: options.model || config.llm.model,
    messages,
    temperature: options.temperature ?? config.llm.temperature,
    max_tokens: options.maxTokens || config.llm.maxTokens,
    stream: false,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.llm.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[LLM] API error ${response.status}:`, error.slice(0, 200));
      throw new Error(`LLM API error: ${response.status}`);
    }

    const data = await response.json();
    const elapsed = Date.now() - startTime;
    const content = data.choices?.[0]?.message?.content || '';
    const tokens = data.usage || {};

    console.log(`[LLM] Response in ${elapsed}ms, tokens: ${tokens.prompt_tokens || 0}+${tokens.completion_tokens || 0}`);

    return {
      content,
      usage: tokens,
      timing_ms: elapsed,
    };
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`[LLM] Error after ${elapsed}ms:`, err.message);
    throw err;
  }
}
