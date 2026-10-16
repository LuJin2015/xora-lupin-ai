# XLI — Xora Lupin Intelligence

XLI is a static frontend backed by a Cloudflare Worker. The models listed as Cloudflare-hosted use the Workers AI binding `env.AI.run()`; their inference requests do not require separate OpenAI or Google API keys.

## Cloudflare Workers AI models

- **Chat:** `@cf/google/gemma-4-26b-a4b-it`, `@cf/moonshotai/kimi-k2.6`, and beta LoRA variants `@cf/google/gemma-7b-it-lora` and `@cf/google/gemma-2b-it-lora`
- **Image Studio:** `@cf/black-forest-labs/flux-2-klein-4b` and `@cf/black-forest-labs/flux-2-klein-9b`
- **Voice Studio:** `@cf/deepgram/aura-2-en`
- **Transcription:** `@cf/openai/whisper-large-v3-turbo`

GPT-5 mini and Gemini 3.8 Flash remain optional external-provider choices and require their own API secrets. They are not needed for the Cloudflare-hosted models.

## Configure and deploy

From the repository root:

```sh
npx wrangler deploy --config worker/wrangler.toml
```

Then open the XLI site, choose **API settings**, and enter the Worker URL. No API keys need to be pasted into XLI or committed to GitHub.

Optional external API secrets only if you explicitly want those providers:

```sh
npx wrangler secret put OPENAI_API_KEY --config worker/wrangler.toml
npx wrangler secret put GEMINI_API_KEY --config worker/wrangler.toml
```

**Kimi K2.6 requires a Workers Paid plan or eligible prepaid AI Gateway credits**; it is not available on standard Workers Free billing. Review current model pricing before using it. FLUX, Aura 2, and Whisper also have usage-based pricing. Beta LoRA models may have limitations.

## Safety and limits

This is a prototype. CORS restrictions are not authentication; a public Worker endpoint can still be called by non-browser clients. Add Cloudflare rate limiting and abuse controls before public production use. Do not commit API keys or paste them into chat.
