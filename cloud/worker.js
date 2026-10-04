const UPSTREAM = "https://openrouter.ai/api/v1/chat/completions";

function allowed(env) {
  return String(env.MODELS || env.MODEL).split(",").map((m) => m.trim()).filter(Boolean);
}

function option(id, isDefault) {
  return {
    id,
    object: "model",
    owned_by: "openrouter",
    name: id.split("/").pop(),
    description: `${id} via Morpheus Cloud${isDefault ? " (default)" : ""}`,
    category: "cloud",
    providerName: "Morpheus Cloud",
    contextLimit: "128k",
    costTier: "capped",
    rateLimit: "30/min",
    badge: isDefault ? "default" : "cloud",
    speed: "fast",
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");

    if (request.method === "GET" && (path === "" || path === "/health")) {
      return json({ ok: true, model: env.MODEL, models: allowed(env) });
    }
    if (request.method === "GET" && path === "/v1/models") {
      return json({ object: "list", data: allowed(env).map((id) => option(id, id === env.MODEL)) });
    }
    if (request.method !== "POST" || path !== "/v1/chat/completions") {
      return json({ error: { message: "not found" } }, 404);
    }

    const client = request.headers.get("cf-connecting-ip") ?? "anonymous";
    const { success } = await env.LIMITER.limit({ key: client });
    if (!success) return json({ error: { message: "rate limited, try again in a minute" } }, 429);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: { message: "invalid JSON body" } }, 400);
    }
    const cap = Number(env.MAX_TOKENS) || 8192;
    const asked = Number(body.max_tokens ?? body.max_completion_tokens) || cap;
    delete body.max_completion_tokens;
    body.max_tokens = Math.min(asked, cap);
    body.model = allowed(env).includes(body.model) ? body.model : env.MODEL;

    const upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/projectakshith/morpheus",
        "X-Title": "Morpheus",
      },
      body: JSON.stringify(body),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
    });
  },
};
