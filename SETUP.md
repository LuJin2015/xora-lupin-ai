# XLI Prototype 1 setup

## Frontend
Publish the repository root with GitHub Pages or Cloudflare Pages.

## Worker
From the repository root, install Wrangler and sign in to Cloudflare, then run:

`npx wrangler deploy --config worker/wrangler.toml`

The Worker config declares a Workers AI binding named `AI`. Use the deployed `workers.dev` URL in the website's **API settings** and run **Test connection**.

## Model IDs configured
- `openai/gpt-6-sol`
- `google/gemini-3.8-flash`
- `openai/gpt-image-2.5-sunburst`
- `google/nano-banana-2.1`
- `google/gemini-3.8-flash-tts`
- `openai/tts-1-hd`
- `@cf/openai/whisper-large-v3-turbo`
- `google/gemini-omni-1.1-flash`

The IDs are recorded as supplied. Confirm each model's availability and required input/output schema in Cloudflare before relying on it. Chat is the first wired mode; the multimodal tools still need model-specific request/response handling. Do not place secrets in frontend code or commit them to Git.
