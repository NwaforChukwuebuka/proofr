import { NextResponse } from "next/server";

/**
 * Flask-style interactive API docs (Swagger UI).
 * Visit https://proofr.onrender.com/api
 */
export async function GET() {
  const bust = process.env.RENDER_GIT_COMMIT?.slice(0, 8) ?? String(Date.now());

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="Cache-Control" content="no-store" />
  <title>PROOFR API</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css" />
  <style>
    html { box-sizing: border-box; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin: 0; background: #f7f8fa; font-family: system-ui, sans-serif; }
    .proofr-banner {
      background: #0b1f3a;
      color: #fff;
      padding: 16px 20px;
      border-bottom: 3px solid #0052ff;
    }
    .proofr-banner h1 {
      margin: 0 0 8px;
      font-size: 1.25rem;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .proofr-banner ol {
      margin: 0;
      padding-left: 1.25rem;
      line-height: 1.55;
      font-size: 0.95rem;
      color: #dbe7ff;
    }
    .proofr-banner code {
      background: rgba(255,255,255,0.12);
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 0.88em;
    }
    .proofr-banner a { color: #9ec1ff; }
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info { margin: 20px 0 10px; }
  </style>
</head>
<body>
  <div class="proofr-banner">
    <h1>PROOFR API docs</h1>
    <ol>
      <li>Open the <strong>Auth</strong> section below → <code>POST /api/auth/login</code></li>
      <li>Try it out with a demo merchant or lender <code>email</code> + <code>password</code></li>
      <li>Copy <code>accessToken</code> from the response</li>
      <li>Click <strong>Authorize</strong> (lock icon) → paste into <strong>BearerAuth</strong> → Authorize</li>
      <li>Call the other endpoints</li>
    </ol>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.onload = function () {
      window.ui = SwaggerUIBundle({
        url: "/api/openapi?v=${bust}",
        dom_id: "#swagger-ui",
        deepLinking: true,
        persistAuthorization: true,
        displayRequestDuration: true,
        tryItOutEnabled: true,
        docExpansion: "list",
        defaultModelsExpandDepth: -1,
        filter: true,
        tagsSorter: function (a, b) {
          if (a === "Auth") return -1;
          if (b === "Auth") return 1;
          return a.localeCompare(b);
        },
        operationsSorter: "alpha",
        presets: [SwaggerUIBundle.presets.apis],
        layout: "BaseLayout",
      });
    };
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
