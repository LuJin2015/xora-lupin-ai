const MODELS = {
  chat: [
    { id: "gemma4", label: "Gemma 4 · Cloudflare" },
    { id: "gemma7b", label: "Gemma 7B LoRA · Beta" },
    { id: "gemma2b", label: "Gemma 2B LoRA · Beta" },
    { id: "gpt", label: "GPT-5 mini · OpenAI API (optional)" },
    { id: "gemini", label: "Gemini 3.8 Flash · Google API (optional)" }
  ],
  image: [
    { id: "flux4", label: "FLUX.2 Klein 4B · Cloudflare" },
    { id: "flux9", label: "FLUX.2 Klein 9B · Cloudflare" }
  ],
  voice: [{ id: "aura2", label: "Deepgram Aura 2 · Cloudflare" }],
  transcribe: [{ id: "whisper", label: "Whisper Large v3 Turbo · Cloudflare" }],
  video: []
};
const CLOUD_MODELS = {
  gemma4: "@cf/google/gemma-4-26b-a4b-it",
  gemma7b: "@cf/google/gemma-7b-it-lora",
  gemma2b: "@cf/google/gemma-2b-it-lora"
};
const ALLOWED_ORIGINS = new Set([
  "https://lujin2015.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000"
]);
const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 12000;
const MAX_OUTPUT_TOKENS = 1200;
const corsHeaders = origin => ({
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Vary": "Origin",
  ...(ALLOWED_ORIGINS.has(origin) ? {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  } : {})
});
const json = (data, status = 200, origin = "") =>
  new Response(JSON.stringify(data), { status, headers: corsHeaders(origin) });
function safeError(value) {
  return String(value || "Provider request failed.")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/key=[^&\s]+/gi, "key=[redacted]")
    .slice(0, 350);
}
function extractText(result) {
  const value = result?.response ?? result?.result?.response ??
    result?.choices?.[0]?.message?.content ?? result?.text;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(x => x?.text || "").join("");
  return "";
}
async function runOpenAI(env, messages) {
  if (!env.OPENAI_API_KEY) return { missing: "OPENAI_API_KEY", provider: "OpenAI" };
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { "Authorization": "Bearer " + env.OPENAI_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-5-mini", messages, max_completion_tokens: MAX_OUTPUT_TOKENS })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("OpenAI HTTP " + response.status + ": " + safeError(data?.error?.message));
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("OpenAI returned an empty response.");
  return { text, model: "gpt-5-mini", provider: "OpenAI API" };
}
async function runGemini(env, messages) {
  if (!env.GEMINI_API_KEY) return { missing: "GEMINI_API_KEY", provider: "Google Gemini" };
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST", headers: { "Authorization": "Bearer " + env.GEMINI_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gemini-3.8-flash", messages, max_tokens: MAX_OUTPUT_TOKENS })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Gemini HTTP " + response.status + ": " + safeError(data?.error?.message));
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("Gemini returned an empty response.");
  return { text, model: "gemini-3.8-flash", provider: "Google Gemini API" };
}
function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: "This website origin is not allowed to use XLI." }, 403, origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...corsHeaders(origin), "Access-Control-Max-Age": "86400" } });
    if (url.pathname === "/" || url.pathname === "/api/health") {
      return json({
        ok: true, service: "XLI API", version: "prototype-4",
        provider: "Cloudflare Workers AI + optional OpenAI/Gemini APIs",
        configured: { cloudflareAI: Boolean(env.AI), gpt: Boolean(env.OPENAI_API_KEY), gemini: Boolean(env.GEMINI_API_KEY) }
      }, 200, origin);
    }
    if (url.pathname === "/api/models" && request.method === "GET") return json({ models: MODELS }, 200, origin);
    if (request.method !== "POST") return json({ error: "Not found. Try /api/health or GET /api/models." }, 404, origin);
    let body;
    try {
      const raw = await request.text();
      if (raw.length > 15000000) return json({ error: "Request is too large (15 MB maximum)." }, 413, origin);
      body = JSON.parse(raw);
    } catch { return json({ error: "Request body must be valid JSON." }, 400, origin); }
    try {
      if (url.pathname === "/api/chat") {
        const model = String(body.model || "");
        if (!Array.isArray(body.messages) || !body.messages.length) return json({ error: "Send at least one chat message." }, 400, origin);
        if (body.messages.length > MAX_MESSAGES) return json({ error: "Maximum " + MAX_MESSAGES + " messages per request." }, 400, origin);
        const messages = body.messages.map(m => ({
          role: ["user", "assistant", "system"].includes(m?.role) ? m.role : "user",
          content: String(m?.content || "").slice(0, MAX_MESSAGE_CHARS)
        }));
        let result;
        if (CLOUD_MODELS[model]) {
          if (!env.AI) return json({ error: "Cloudflare Workers AI binding is unavailable." }, 503, origin);
          const output = await env.AI.run(CLOUD_MODELS[model], { messages, max_tokens: MAX_OUTPUT_TOKENS });
          const text = extractText(output);
          if (!text.trim()) throw new Error("Cloudflare AI returned no text. Raw result: " + JSON.stringify(output).slice(0, 180));
          result = { text, model: CLOUD_MODELS[model], provider: "Cloudflare Workers AI" };
        } else if (model === "gpt") result = await runOpenAI(env, messages);
        else if (model === "gemini") result = await runGemini(env, messages);
        else return json({ error: "Choose a supported chat model." }, 400, origin);
        if (result.missing) return json({ error: result.provider + " is not configured. Add " + result.missing + " only if you want this optional external provider." }, 503, origin);
        return json(result, 200, origin);
      }
      if (url.pathname === "/api/run") {
        const mode = String(body.mode || "");
        if (!env.AI) return json({ error: "Cloudflare Workers AI binding is unavailable." }, 503, origin);
        if (mode === "image") {
          const model = body.model === "flux9" ? "@cf/black-forest-labs/flux-2-klein-9b" : body.model === "flux4" ? "@cf/black-forest-labs/flux-2-klein-4b" : "";
          const prompt = String(body.prompt || "").trim().slice(0, 4000);
          if (!model || !prompt) return json({ error: "Choose FLUX and enter an image prompt." }, 400, origin);
          const form = new FormData();
          form.append("prompt", prompt);
          form.append("width", "1024");
          form.append("height", "768");
          const formResponse = new Response(form);
          const output = await env.AI.run(model, { multipart: { body: formResponse.body, contentType: formResponse.headers.get("content-type") } });
          const image = output?.image || output?.result?.image;
          if (typeof image !== "string") throw new Error("FLUX returned no image data.");
          return json({ image: "data:image/png;base64," + image, model }, 200, origin);
        }
        if (mode === "voice") {
          if (body.model !== "aura2") return json({ error: "Choose Deepgram Aura 2." }, 400, origin);
          const text = String(body.prompt || "").trim().slice(0, 4000);
          if (!text) return json({ error: "Enter text to turn into speech." }, 400, origin);
          const stream = await env.AI.run("@cf/deepgram/aura-2-en", { text, speaker: "luna", encoding: "mp3" });
          const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
          return json({ audio: "data:audio/mpeg;base64," + bytesToBase64(bytes), model: "@cf/deepgram/aura-2-en" }, 200, origin);
        }
        if (mode === "transcribe") {
          const audio = String(body.audio || "");
          if (!audio) return json({ error: "Choose an audio file first." }, 400, origin);
          if (audio.length > 14000000) return json({ error: "Audio file is too large (about 10 MB maximum)." }, 413, origin);
          const output = await env.AI.run("@cf/openai/whisper-large-v3-turbo", { audio, task: "transcribe" });
          return json({ text: output?.text || output?.transcription_info?.text || "No speech detected.", model: "@cf/openai/whisper-large-v3-turbo" }, 200, origin);
        }
        return json({ error: "This XLI mode is not connected yet." }, 501, origin);
      }
      return json({ error: "Unknown API route." }, 404, origin);
    } catch (error) {
      console.error("XLI request failed", String(body?.model || body?.mode || ""), safeError(error?.message || error));
      return json({ error: "Model request failed: " + safeError(error?.message || error), hint: "Check Cloudflare model availability, input format, account limits, and billing." }, 502, origin);
    }
  }
};