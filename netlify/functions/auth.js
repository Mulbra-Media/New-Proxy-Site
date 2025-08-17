// Netlify Functions (Node 18) — uses built-in fetch, no dependencies.

// --- Config & helpers ---
const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

// Prefer explicit redirect (avoids mismatch); fallback to Netlify-provided URL.
const SITE_URL = (process.env.URL || "").replace(/\/$/, "");
const REDIRECT_URI = (process.env.OAUTH_REDIRECT_URI || (SITE_URL ? `${SITE_URL}/callback` : "")).replace(/\/$/, "");

// CORS headers for allowed origins
const cors = (origin) => ({
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
});

export async function handler(event) {
  const origin = event.headers?.origin || "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : "";

  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors(allowOrigin) };
  }

  // Sanity checks
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    return {
      statusCode: 500,
      headers: cors(allowOrigin),
      body: JSON.stringify({
        error:
          "Missing env vars. Required: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, and OAUTH_REDIRECT_URI (or URL).",
      }),
    };
  }

  // Start OAuth: redirect user to GitHub consent
  if (event.httpMethod === "GET") {
    const authorize = new URL("https://github.com/login/oauth/authorize");
    authorize.searchParams.set("client_id", CLIENT_ID);
    authorize.searchParams.set("redirect_uri", REDIRECT_URI + "/callback".replace(/\/callback\/callback$/, "/callback")); // tolerate accidental missing /callback in env
    authorize.searchParams.set("scope", "repo,user:email"); // scopes needed by CMS

    return {
      statusCode: 302,
      headers: { Location: authorize.toString(), ...cors(allowOrigin) },
    };
  }

  // Exchange code for token
  if (event.httpMethod === "POST") {
    try {
      const { code } = JSON.parse(event.body || "{}");
      if (!code) {
        return { statusCode: 400, headers: cors(allowOrigin), body: JSON.stringify({ error: "Missing code" }) };
      }

      const resp = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          code,
          redirect_uri: REDIRECT_URI + "/callback".replace(/\/callback\/callback$/, "/callback"),
        }),
      });

      const data = await resp.json();
      if (data.error) {
        return { statusCode: 400, headers: cors(allowOrigin), body: JSON.stringify(data) };
      }
      return { statusCode: 200, headers: cors(allowOrigin), body: JSON.stringify({ token: data.access_token }) };
    } catch (e) {
      return { statusCode: 500, headers: cors(allowOrigin), body: JSON.stringify({ error: e.message }) };
    }
  }

  return { statusCode: 405, headers: cors(allowOrigin), body: "Method Not Allowed" };
}
