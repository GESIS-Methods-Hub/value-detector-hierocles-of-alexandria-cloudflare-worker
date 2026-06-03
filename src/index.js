export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      // --------------------------------------------------
      // Proxy
      // --------------------------------------------------

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
    } else if (url.pathname === "/export") {
      // --------------------------------------------------
      // Export
      // --------------------------------------------------
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
        // Validate input
        // --------------------------------------------------
        const year = parseInt(url.searchParams.get("year"));
        const month = parseInt(url.searchParams.get("month"));
        if (!year || !month || month < 1 || month > 12) {
          return new Response(
            JSON.stringify({ error: "Invalid year/month" }),
            {
              status: 400,
              headers: {
                "Content-Type": "application/json"
              }
            }
          );
        }

        // --------------------------------------------------
        // Query
        // --------------------------------------------------
        const query = `
          SELECT
            blob1 AS key_id,
            blob2 AS language,
            double1 AS duration_ms,
            double2 AS num_segments,
            double3 AS num_characters,
            double4 AS response_code,
            timestamp
          FROM "value-detector-hierocles-of-alexandria"
          WHERE toYear(timestamp) = ${year}
            AND toMonth(timestamp) = ${month}
          ORDER BY timestamp ASC;
        `;
        const res = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`
            },
            body: query
          }
        );
        const data = await res.json();

        // --------------------------------------------------
        // Stream JSONL output
        // --------------------------------------------------
        const stream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            for (const row of data.data) {
              controller.enqueue(
                encoder.encode(JSON.stringify(row) + "\n")
              );
            }
            controller.close();
          }
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "application/x-ndjson",
            "Cache-Control": "no-store"
          }
        });

      } catch (err) {
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
    } else {
      // --------------------------------------------------
      // No such endpoint
      // --------------------------------------------------
      return new Response(
        JSON.stringify({
          error: "Not found"
        }),
        {
          status: 404,
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
