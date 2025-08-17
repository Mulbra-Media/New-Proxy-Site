export async function handler() {
  // Returns a tiny HTML page that posts the ?code back to the opener (the CMS window)
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>GitHub OAuth</title></head>
<body>
<script>
  (function() {
    var params = new URLSearchParams(window.location.search);
    var code = params.get('code');
    if (window.opener && code) {
      window.opener.postMessage({ type: 'authorization_response', code: code }, '*');
      window.close();
    } else {
      document.body.innerText = code ? 'Close this window' : 'Missing ?code parameter';
    }
  })();
</script>
</body></html>`;
  return { statusCode: 200, headers: { "Content-Type": "text/html" }, body: html };
}
