const MODELS = {
  chat: [
    { id: "gpt", label: "GPT-5 mini · OpenAI API" },
    { id: "gemini", label: "Gemini 3.8 Flash · Google API" }
  ],
  image: [], voice: [], transcribe: [], video: []
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

async function runOpenAI(env, messages) {
  if (!env.OPENAI_API_KEY) {
    return { missing: "OPENAI_API_KEY", provider: "OpenAI" };
  }
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.OPENAI_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-5-mini",
      messages,
      max_completion_tokens: MAX_OUTPUT_TOKENS
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("OpenAI returned HTTP " + response.status + ": " + safeError(data?.error?.message));
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("OpenAI returned an empty response.");
  return { text, model: "gpt-5-mini", provider: "OpenAI API" };
}

async function runGemini(env, messages) {
  if (!env.GEMINI_API_KEY) {
    return { missing: "GEMINI_API_KEY", provider: "Google Gemini" };
  }
  // Google's OpenAI-compatible endpoint lets XLI use the same messages format.
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.GEMINI_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gemini-3.8-flash",
      messages,
      max_tokens: MAX_OUTPUT_TOKENS
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Gemini returned HTTP " + response.status + ": " + safeError(data?.error?.message));
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("Gemini returned an empty response.");
  return { text, model: "gemini-3.8-flash", provider: "Google Gemini API" };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return json({ error: "This website origin is not allowed to use XLI." }, 403, origin);
    }
    if (request.method === "OPTIONS") {
      if (origin && !ALLOWED_ORIGINS.has(origin)) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders(origin),
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    if (url.pathname === "/" || url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "XLI API",
        version: "prototype-3",
        provider: "OpenAI API + Google Gemini API",
        configured: {
          gpt: Boolean(env.OPENAI_API_KEY),
          gemini: Boolean(env.GEMINI_API_KEY)
        }
      }, 200, origin);
    }
    if (url.pathname === "/api/models" && request.method === "GET") {
      return json({ models: MODELS }, 200, origin);
    }
    if (request.method !== "POST") {
      return json({ error: "Not found. Try /api/health or GET /api/models." }, 404, origin);
    }

    let body;
    try {
      const raw = await request.text();
      if (raw.length > 100000) return json({ error: "Request is too large." }, 413, origin);
      body = JSON.parse(raw);
    } catch {
      return json({ error: "Request body must be valid JSON." }, 400, origin);
    }

    try {
      if (url.pathname === "/api/chat") {
        const model = String(body.model || "");
        if (model !== "gpt" && model !== "gemini") {
          return json({ error: "Choose GPT or Gemini from the model selector." }, 400, origin);
        }
        if (!Array.isArray(body.messages) || !body.messages.length) {
          return json({ error: "Send at least one chat message." }, 400, origin);
        }
        if (body.messages.length > MAX_MESSAGES) {
          return json({ error: "Maximum " + MAX_MESSAGES + " messages per request." }, 400, origin);
        }
        const messages = body.messages.map(message => ({
          role: ["user", "assistant", "system"].includes(message?.role) ? message.role : "user",
          content: String(message?.content || "").slice(0, MAX_MESSAGE_CHARS)
        }));
        const result = model === "gpt"
          ? await runOpenAI(env, messages)
          : await runGemini(env, messages);
        if (result.missing) {
          return json({
            error: result.provider + " is not configured yet. Add the " + result.missing + " secret to the Cloudflare Worker."
          }, 503, origin);
        }
        return json(result, 200, origin);
      }

      if (url.pathname === "/api/run") {
        const mode = String(body.mode || "");
        if (!["image", "voice", "transcribe", "video"].includes(mode)) {
          return json({ error: "Unknown XLI mode." }, 400, origin);
        }
        return json({
          error: "This XLI mode is not connected yet. GPT and Gemini chat are supported."
        }, 501, origin);
      }
      return json({ error: "Unknown API route." }, 404, origin);
    } catch (error) {
      console.error("XLI provider request failed", String(body?.model || ""), safeError(error?.message || error));
      return json({
        error: "Model request failed: " + safeError(error?.message || error),
        model: body?.model || null,
        hint: "Check the provider API key, model access, account limits, and billing."
      }, 502, origin);
    }
  }
};
