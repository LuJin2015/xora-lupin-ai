# XLI — Xora Lupin Intelligence

XLI is a static frontend backed by a Cloudflare Worker. The Worker routes chat requests to the official OpenAI and Google Gemini APIs. Provider keys must stay in Cloudflare Worker secrets and must never be placed in `app.js`, HTML, GitHub, or browser storage.

## Chat models

- **GPT-5 mini** — OpenAI API model ID `gpt-5-mini`
- **Gemini 3.8 Flash** — Google Gemini API model ID `gemini-3.8-flash`

The model selector uses short IDs (`gpt` and `gemini`); the Worker maps these to provider model IDs.

## Configure the Worker

Run these commands from the repository root. They prompt for each secret; paste the key only into the terminal prompt, not into chat or a source file:

```sh
npx wrangler secret put OPENAI_API_KEY --config worker/wrangler.toml
npx wrangler secret put GEMINI_API_KEY --config worker/wrangler.toml
npx wrangler deploy --config worker/wrangler.toml
```

You can configure only one provider at first; the other model will show a clear missing-secret message until its secret is added. The Worker health endpoint `/api/health` reports whether each key is configured, never the key value.

## Costs and safety

- OpenAI API usage is billed separately from a ChatGPT subscription. GPT requests will fail if the API account lacks access or available API billing.
- Gemini availability and price depend on the Google AI account, model, and current billing/usage limits. Do not enable paid usage without the account owner's permission.
- Do not commit API keys. If a key is ever pasted into GitHub, a public issue, or a chat, revoke it and create a replacement.
- This is a prototype. CORS restrictions are not authentication; a public Worker endpoint can still be called by non-browser clients. Before public production use, add Cloudflare rate limiting and abuse controls to prevent unexpected API usage.

## Current scope

GPT and Gemini chat are wired up. Image generation, voice, transcription, and video modes are not connected yet.
