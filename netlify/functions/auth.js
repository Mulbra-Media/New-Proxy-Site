// No imports needed — Netlify (Node 18+) provides global fetch, URL, URLSearchParams.

const allowOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const corsHeaders = (origin) => ({
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
});

const siteURL = process.env.URL || ""; // e.g. https://your-oauth-site.netlify.app
const clientId = process.env.GITHUB_CLIENT_ID;
const clientSecret = process.env.GITHUB_CLIENT_SECRET;
const redirectUri = siteURL ? `${siteURL}/callback` : "";

export async function handler(event) {
  const origin = event.headers.origin || "";
  const allowOrigin = allowOrigins.includes(origin) ? origin : "";

  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders(allowOrigin) };
  }

  if (!clientId || !clientSecret || !redirectUri) {
    return {
      statusCode: 500,
      headers: corsHeaders(allowOrigin),
      body: JSON.stringify({
        error:
          "Missing env vars (GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET) or URL for redirect.",
      }),
    };
  }

  if (event.httpMethod === "GET") {
    // Start OAuth — send the user to GitHub consent screen
    const authorize = new URL("https://github.com/login/oauth/authorize");
    authorize.searchParams.set("client_id", clientId);
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("scope", "repo,user:email");
    // Optional: add & verify state param in production

    return {
      statusCode: 302,
      headers: { Location: authorize.toString(), ...corsHeaders(allowOrigin) },
    };
  }

  if (event.httpMethod === "POST") {
    try {
      const { code } = JSON.parse(event.body || "{}");
      if (!code) {
        return {
          statusCode: 400,
          headers: corsHeaders(allowOrigin),
          body: JSON.stringify({ error: "Missing code" }),
        };
      }

      const resp = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      });

      const data = await resp.json();
      if (data.error) {
        return {
          statusCode: 400,
          headers: corsHeaders(allowOrigin),
          body: JSON.stringify(data),
        };
      }

      return {
        statusCode: 200,
        headers: corsHeaders(allowOrigin),
        body: JSON.stringify({ token: data.access_token }),
      };
    } catch (e) {
      return {
        statusCode: 500,
        headers: corsHeaders(allowOrigin),
        body: JSON.stringify({ error: e.message }),
      };
    }
  }

  return {
    statusCode: 405,
    headers: corsHeaders(allowOrigin),
    body: "Method Not Allowed",
  };
}
