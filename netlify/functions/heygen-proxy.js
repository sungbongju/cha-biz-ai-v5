// netlify/functions/heygen-proxy.js
// HeyGen 스트리밍 API 프록시 - 허용 엔드포인트만 프록시

const ALLOWED_ENDPOINTS = [
  "/v1/streaming.new",
  "/v1/streaming.start",
  "/v1/streaming.task",
  "/v1/streaming.interrupt",
  "/v1/streaming.stop",
];

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: corsHeaders(),
    });
  }

  try {
    const body = await req.json();
    const { endpoint, token, payload } = body;

    if (!endpoint || !ALLOWED_ENDPOINTS.includes(endpoint)) {
      return new Response(
        JSON.stringify({ error: "Invalid or disallowed endpoint" }),
        { status: 400, headers: corsHeaders() }
      );
    }

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Session token required" }),
        { status: 401, headers: corsHeaders() }
      );
    }

    const res = await fetch(`https://api.heygen.com${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(payload || {}),
    });

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.status, headers: corsHeaders(),
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: corsHeaders(),
    });
  }
};

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
