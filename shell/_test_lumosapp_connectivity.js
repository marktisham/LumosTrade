#!/usr/bin/env node

'use strict';

const { execFileSync } = require('node:child_process');

function echoErr(msg) {
  process.stderr.write(`${msg}\n`);
}

function banner(title) {
  process.stdout.write(`\n============================================================\n`);
  process.stdout.write(`${title}\n`);
  process.stdout.write(`============================================================\n`);
}

function subBanner(title) {
  process.stdout.write(`\n------------------------------\n`);
  process.stdout.write(`${title}\n`);
  process.stdout.write(`------------------------------\n`);
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function getIdentityToken({ serviceAccount, audience }) {
  try {
    const out = execFileSync(
      'gcloud',
      [
        'auth',
        'print-identity-token',
        `--impersonate-service-account=${serviceAccount}`,
        `--audiences=${audience}`,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    return out.trim();
  } catch (e) {
    const stderr = e?.stderr ? String(e.stderr) : String(e);
    echoErr(`ERROR: failed to get identity token via gcloud impersonation.`);
    echoErr(`ERROR: ${stderr.trim()}`);
    return '';
  }
}

async function fetchJson({ url, token, body }) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  return { status: res.status, text };
}

async function fetchSseChunk({ url, token, body, maxBytes = 4096, timeoutMs = 15000 }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.body) {
      return { status: res.status, chunk: '' };
    }

    const reader = res.body.getReader();
    let received = 0;
    const chunks = [];

    while (received < maxBytes) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(Buffer.from(value));
        received += value.length;
        if (received >= 256) break; // enough to assert the stream is alive
      }
    }

    controller.abort();
    const chunk = Buffer.concat(chunks).toString('utf8');
    return { status: res.status, chunk };
  } finally {
    clearTimeout(timeout);
  }
}

function looksLikeSse(text) {
  const t = (text || '').trim();
  if (!t) return false;
  return t.includes('data:') || t.includes('event:') || t.startsWith('{') || t.startsWith('[');
}

function sseLooksLikeError(text) {
  const t = String(text || '');
  return (
    /PERMISSION_DENIED/i.test(t) ||
    /IAM_PERMISSION_DENIED/i.test(t) ||
    /\b403\b/.test(t) ||
    /Forbidden/i.test(t) ||
    /data:\s*\{\s*"error"\s*:/.test(t)
  );
}

async function main() {
  const lumosAppServiceAccount = requireEnv('LUMOS_APP_SERVICE_ACCOUNT');
  const agentUrl = requireEnv('AGENT_LUMOSAGENTS_URL');

  const sessionId = new Date().toISOString().replace(/[:.]/g, '-');

  banner('Node connectivity test: LumosApp -> LumosAgents');
  process.stdout.write(`Impersonating: ${lumosAppServiceAccount}\n`);
  process.stdout.write(`Target agent: ${agentUrl}\n`);

  subBanner('TEST: Obtain identity token (impersonation)');
  const token = getIdentityToken({ serviceAccount: lumosAppServiceAccount, audience: agentUrl });
  if (!token) {
    echoErr('ERROR: Could not get identity token. Suggested fix: ./dev service update');
    process.exitCode = 1;
    return;
  }

  // Equivalent curl (for easy copy/paste debugging)
  subBanner('Equivalent curl commands (with Authorization header added)');
  process.stdout.write(
    `curl -X POST '${agentUrl}/apps/LumosChatAgent/users/LumosUser/sessions/${sessionId}' \\\n  -H 'Content-Type: application/json' \\\n  -H 'Authorization: Bearer <id-token>' \\\n  -d '{"preferred_language":"English","visit_count":1}'\n\n`
  );
  process.stdout.write(
    `curl -X POST '${agentUrl}/run_sse' \\\n  -H 'Content-Type: application/json' \\\n  -H 'Authorization: Bearer <id-token>' \\\n  -d '{"app_name":"LumosChatAgent","user_id":"LumosUser","session_id":"${sessionId}","new_message":{"parts":[{"text":"show me tsll trades"}],"role":"user"},"streaming":true}'\n\n`
  );

  subBanner('TEST: Create session');
  const sessionCreate = await fetchJson({
    url: `${agentUrl}/apps/LumosChatAgent/users/LumosUser/sessions/${sessionId}`,
    token,
    body: { preferred_language: 'English', visit_count: 1 },
  });

  if (sessionCreate.status !== 200) {
    echoErr(`ERROR: session create expected 200, got ${sessionCreate.status}`);
    echoErr(`ERROR: response (truncated): ${sessionCreate.text.slice(0, 500)}`);
    process.exitCode = 1;
  } else if (!sessionCreate.text.trim()) {
    echoErr('WARN: session create returned 200 but empty body');
  } else {
    process.stdout.write('✓ session create returned HTTP 200\n');
  }

  subBanner('TEST: run_sse');
  const sse = await fetchSseChunk({
    url: `${agentUrl}/run_sse`,
    token,
    body: {
      app_name: 'LumosChatAgent',
      user_id: 'LumosUser',
      session_id: sessionId,
      new_message: { parts: [{ text: 'show me tsll trades' }], role: 'user' },
      streaming: true,
    },
  });

  if (sse.status !== 200) {
    echoErr(`ERROR: run_sse expected 200, got ${sse.status}`);
    echoErr(`ERROR: response (truncated): ${(sse.chunk || '').slice(0, 500)}`);
    process.exitCode = 1;
  } else if (!looksLikeSse(sse.chunk)) {
    echoErr('WARN: run_sse returned 200 but response did not look like SSE/JSON');
    echoErr(`WARN: first chunk (truncated): ${(sse.chunk || '').slice(0, 500)}`);
  } else if (sseLooksLikeError(sse.chunk)) {
    echoErr('ERROR: run_sse returned 200 but stream contains an error (e.g., PERMISSION_DENIED/Forbidden).');
    echoErr(`ERROR: first chunk (truncated): ${(sse.chunk || '').slice(0, 500)}`);
    process.exitCode = 1;
  } else {
    process.stdout.write('✓ run_sse returned HTTP 200 and streaming data\n');
  }

  banner('Node connectivity test complete');
}

main().catch((e) => {
  echoErr(`ERROR: ${e?.message || String(e)}`);
  process.exitCode = 1;
});
