// OrbioClient — optional live inference for NPC thoughts. DISABLED by default and never called
// in the published artifact (the artifact cannot reach external hosts). When a developer sets
// `enabled = true` and configures it, mind.think() asks the configured endpoint first and falls
// back to the hand-written answers on any failure.
//
// Request shape: OpenAI-style chat completions.
//   POST {baseUrl}/chat/completions
//   { model, messages: [{role:'system'}, {role:'user'}], max_tokens, temperature }

export const DEFAULT_TIER_PARAMS = {
  redup: { max_tokens: 120, temperature: 1.25 },
  sedang: { max_tokens: 260, temperature: 0.9 },
  terang: { max_tokens: 420, temperature: 0.6 },
};

export class OrbioClient {
  constructor({ baseUrl = '', apiKey = '', models = {}, timeoutMs = 20000, tierParams = DEFAULT_TIER_PARAMS } = {}) {
    this.enabled = false; // must be switched on explicitly
    this.baseUrl = String(baseUrl || '').replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.models = { redup: models.redup || '', sedang: models.sedang || '', terang: models.terang || '' };
    this.timeoutMs = timeoutMs;
    this.tierParams = tierParams;
    this.lastError = null;
  }

  configure(opts = {}) {
    if (opts.baseUrl !== undefined) this.baseUrl = String(opts.baseUrl || '').replace(/\/+$/, '');
    if (opts.apiKey !== undefined) this.apiKey = opts.apiKey;
    if (opts.models) Object.assign(this.models, opts.models);
    if (opts.timeoutMs) this.timeoutMs = opts.timeoutMs;
    if (opts.enabled !== undefined) this.enabled = !!opts.enabled;
    return this;
  }

  get ready() {
    return this.enabled && !!this.baseUrl && !!this.models.redup && !!this.models.sedang && !!this.models.terang;
  }

  // Pure: the request that think() would send (handy for tests and debugging).
  buildRequest({ system, prompt, tier }) {
    const params = this.tierParams[tier] || this.tierParams.sedang;
    return {
      url: this.baseUrl + '/chat/completions',
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.apiKey ? { authorization: 'Bearer ' + this.apiKey } : {}),
        },
        body: JSON.stringify({
          model: this.models[tier],
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt },
          ],
          ...params,
        }),
      },
    };
  }

  // Resolves { text, tokens, model } or throws. Never runs unless enabled + configured.
  async think({ system, prompt, tier }) {
    if (!this.ready) throw new Error('OrbioClient disabled');
    const { url, init } = this.buildRequest({ system, prompt, tier });
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), this.timeoutMs) : null;
    try {
      const res = await globalThis.fetch(url, { ...init, signal: ctrl?.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      const text = json?.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error('empty completion');
      return { text, tokens: json?.usage?.total_tokens ?? null, model: json?.model || this.models[tier] };
    } catch (err) {
      this.lastError = err;
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
