export default {
  async fetch(request, env, ctx) {
    const start = Date.now();
    let keyNumber = 0;
    let language = "";
    let numSegments = 0;
    let numCharacters = 0;

    try {
      // --------------------------------------------------
      // Authorization header
      // --------------------------------------------------

      const auth = request.headers.get("Authorization");
      if (!auth?.startsWith("Bearer ")) {
        return new Response(
          JSON.stringify({ error: "Missing bearer token" }),
          {
            status: 401,
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
      }
      const apiKey = auth.slice(7);

      // --------------------------------------------------
      // D1 lookup
      // --------------------------------------------------

      const keyHash = await sha256(apiKey);
      const row = await env.DB
        .prepare(`
          SELECT id
          FROM api_keys
          WHERE key_hash = ?
          LIMIT 1
        `)
        .bind(keyHash)
        .first();

      if (!row) {
        ctx.waitUntil(
          logEvent(env, {
            key_number: keyNumber,
            language: language,
            num_segments: numSegments,
            num_characters: numCharacters,
            duration_ms: Date.now() - start,
            response_code: 401
          })
        );
        return new Response(
          JSON.stringify({ error: "Invalid API key" }),
          {
            status: 401,
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
      }
      keyNumber = row.id;

      // --------------------------------------------------
      // Get content
      // --------------------------------------------------

      const bodyText = await request.text();
      const body = JSON.parse(bodyText);
      language = body.language || "en";
      if (!body.segments) {
        ctx.waitUntil(
          logEvent(env, {
            key_number: keyNumber,
            language: language,
            num_segments: numSegments,
            num_characters: numCharacters,
            duration_ms: Date.now() - start,
            response_code: 401
          })
        );
        return new Response(
          JSON.stringify({ error: "Invalid request, missing segments" }),
          {
            status: 401,
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
      }
      numSegments = body.segments.length;
      numCharacters = body.segments.join("").length;

      // --------------------------------------------------
      // Forward request to HF
      // --------------------------------------------------

      const hfResponse = await fetch(env.HF_ENDPOINT_URL, {
        method: request.method,
        headers: {
          "Authorization": `Bearer ${env.HF_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: bodyText
      });
      const responseBody = await hfResponse.arrayBuffer();

      // --------------------------------------------------
      // Respond
      // --------------------------------------------------

      ctx.waitUntil(
        logEvent(env, {
          key_number: keyNumber,
          language: language,
          num_segments: numSegments,
          num_characters: numCharacters,
          duration_ms: Date.now() - start,
          response_code: hfResponse.status
        })
      );
      return new Response(responseBody, {
        status: hfResponse.status,
        headers: hfResponse.headers
      });
    } catch (err) {
      statusCode = 500;
      ctx.waitUntil(
        logEvent(env, {
          key_number: keyNumber,
          language: language,
          num_segments: numSegments,
          num_characters: numCharacters,
          duration_ms: Date.now() - start,
          response_code: 500
        })
      );
      return new Response(
        JSON.stringify({
          error: "Internal error"
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }
  }
};

// --------------------------------------------------
// SHA256 helper
// --------------------------------------------------

async function sha256(input) {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(input)
  );
  return [...new Uint8Array(hashBuffer)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// --------------------------------------------------
// Analytics Engine logging
// --------------------------------------------------

async function logEvent(env, {
  key_number,
  language,
  num_segments,
  num_characters,
  duration_ms,
  response_code
}) {
  env.ANALYTICS_ENGINE.writeDataPoint({
    blobs: [
      String(key_number),
      String(language)
    ],
    doubles: [
      duration_ms,
      num_segments,
      num_characters,
      response_code
    ],
    indexes: [
      "value-detector-hierocles-of-alexandria"
    ]
  });
}
