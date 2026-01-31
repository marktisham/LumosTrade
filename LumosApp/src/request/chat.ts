import { Request, Response } from 'express';
import { GoogleAuth } from 'google-auth-library';

const LUMOS_USER = 'LumosUser';
const googleAuth = new GoogleAuth();

interface LumosAgentConfig {
  ServiceURL: string;
  projectId: string;
  AgentName: string;
  region: string;
}

interface ChatRequest {
  message: string;
  sessionId: string;
  isNewSession?: boolean;
}

interface ChatResponse {
  success: boolean;
  response?: string;
  error?: string;
}

// Google ADK API types
interface AdkContent {
  parts: Array<{ 
    text?: string;
    functionCall?: {
      id: string;
      name: string;
      args: Record<string, any>;
    };
    functionResponse?: {
      id: string;
      name: string;
      response: any;
    };
    thoughtSignature?: string;
  }>;
  role: string;
}

interface AdkRunRequest {
  app_name: string;
  user_id: string;
  session_id: string;
  new_message: AdkContent;
  streaming?: boolean;
  state_delta?: object;
}

interface AdkEvent {
  id?: string;
  timestamp?: string;
  author?: string;
  content?: AdkContent;
  partial?: boolean;
}

export default async function chat(req: Request, res: Response): Promise<void> {
  try {
    const { message, sessionId, isNewSession }: ChatRequest = req.body;

    if (!message || !sessionId) {
      res.status(400).json({ 
        success: false, 
        error: 'Message and sessionId are required' 
      });
      return;
    }

    const agentConfig: LumosAgentConfig = {
      ServiceURL: process.env.AGENT_LUMOSAGENTS_URL || '',
      projectId: process.env.PROJECT_ID || '',
      AgentName: process.env.AGENT_LUMOSAGENTS_CHAT || '',
      region: process.env.REGION || ''
    };
    
    if (!agentConfig.ServiceURL || !agentConfig.AgentName) {
      console.error('[chat] LumosChatAgent (LumosAgents) environment variables not set');
      res.status(500).json({ 
        success: false, 
        error: 'Chat service not configured' 
      });
      return;
    }

    // Fetch ID token headers for authorized calls to LumosAgent
    const authHeaders = await getIdTokenHeaders(agentConfig.ServiceURL);

    if (isNewSession) {
      await initChatSession(agentConfig, sessionId, authHeaders);
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      await runAgent(agentConfig, sessionId, message, res, authHeaders);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Chat service error';
      res.write(`event: error\ndata: ${JSON.stringify({ error: errMsg })}\n\n`);
    }

    res.end();

  } catch (error) {
    console.error('[chat] Error processing chat request:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error, possibly due to hitting quota rate limits. Try back in a few minutes.'
      });
    }
  }
}

async function runAgent(agentConfig: LumosAgentConfig, sessionId: string, message: string, res: Response, authHeaders: Record<string,string>): Promise<void> {
  const adkRequest: AdkRunRequest = {
    app_name: agentConfig.AgentName,
    user_id: LUMOS_USER,
    session_id: sessionId,
    new_message: {
      parts: [{ text: message }],
      role: 'user'
    },
    streaming: true
  };

  // Call LumosAgent service using /run_sse endpoint
  // https://google.github.io/adk-docs/deploy/cloud-run/#run-the-agent
  const apiUrl = `${agentConfig.ServiceURL}/run_sse`;
  const agentFetchOptions = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify(adkRequest),
  } as const;

  const curlCmdAgent = buildCurlCommand(apiUrl, agentFetchOptions.method, agentFetchOptions.headers as Record<string,string>, agentFetchOptions.body);
  console.log(curlCmdAgent);

  const agentResponse = await fetch(apiUrl, agentFetchOptions);

  if (!agentResponse.ok) {
    const errorText = await agentResponse.text();
    console.error(`[chat] LumosAgent error: ${agentResponse.status} - ${errorText}`);
    
    let errorMessage = `Chat service error: ${agentResponse.statusText}`;
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.detail) {
        errorMessage = errorJson.detail;
      }
    } catch (e) {
      // If not JSON or no detail, keep the default message
    }
    
    throw new Error(errorMessage);
  }

  if (!agentResponse.body) {
    throw new Error('No response body from agent');
  }

  const reader = agentResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullResponse = '';
  let pendingJson = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        // If line starts with "data: ", it's a new message
        if (line.startsWith('data: ')) {
          // If we had a pending JSON buffer that never successfully parsed, it's effectively a lost packet
          // (or a very weird interleaving). We start fresh.
          if (pendingJson) {
             console.warn('[chat] Dropping unparsed JSON buffer:', pendingJson);
          }
          pendingJson = line.substring(6);
        } else if (pendingJson) {
           // If we have pending JSON, assume this line is a continuation (e.g. multi-line error HTML)
           pendingJson += line;
        } else {
            // Stray line or other SSE event type (like 'event:'), ignore for now
            continue;
        }

        // Try to parse what we have so far
        try {
            let jsonToParse = pendingJson;
            
            // Try to fix malformed JSON where the error message contains unescaped quotes
            // Pattern: {"error": "...unescaped quotes here..."}
            const errorPattern = /^\s*\{\s*"error"\s*:\s*"(.*)"\s*\}\s*$/s;
            const match = jsonToParse.match(errorPattern);
            
            if (match) {
                // Extract the error message and check if it has unescaped quotes
                const errorContent = match[1];
                // Escape any unescaped quotes in the error message
                const escapedContent = errorContent.replace(/\\"/g, '\uE000') // Protect already-escaped quotes
                                                   .replace(/"/g, '\\"')        // Escape unescaped quotes
                                                   .replace(/\uE000/g, '\\"');   // Restore escaped quotes
                jsonToParse = `{"error": "${escapedContent}"}`;
            }
            
            const data: any = JSON.parse(jsonToParse);
            
            // If we got here, parsing succeeded!
            pendingJson = ''; // Clear buffer

            // Check for Error format
            if (data.error) {
                 res.write(`event: error\ndata: ${JSON.stringify({ error: data.error })}\n\n`);
                 continue;
            }

            // Handle AdkEvent format
            const event = data as AdkEvent;
            if (event.content && event.content.role === 'model' && event.content.parts) {
              const textParts = event.content.parts
                .filter(part => part.text && !part.functionCall && !part.functionResponse)
                .map(part => part.text)
                .filter(text => text);
              
              if (textParts.length > 0) {
                const text = textParts.join('');
                
                // Treat partial=false OR partial=undefined as the final complete response
                if (event.partial === false || event.partial === undefined) {
                  fullResponse = text;
                } else {
                  fullResponse += text;
                }
                
                res.write(`event: message\ndata: ${JSON.stringify({ chunk: text, fullText: fullResponse })}\n\n`);
              }
            }

        } catch (e) {
            // Parse failed - assume incomplete JSON and continue loop to append more lines
        }
      }
    }
    
    // If stream ended and we still have unparsed JSON
    if (pendingJson) {
         console.error('[chat] Stream ended with unparsed JSON:', pendingJson);
         // Try to send it as an error to the UI so we can see what happened
         res.write(`event: error\ndata: ${JSON.stringify({ error: "Stream ended with incomplete data: " + pendingJson })}\n\n`);
    }

    res.write(`event: done\ndata: ${JSON.stringify({ done: true })}\n\n`);
  } finally {
    reader.releaseLock();
  }
}

async function initChatSession(agentConfig: LumosAgentConfig, sessionId: string, authHeaders: Record<string,string>): Promise<void> {
  const sessionInitUrl = `${agentConfig.ServiceURL}/apps/${agentConfig.AgentName}/users/${LUMOS_USER}/sessions/${sessionId}`;
  console.log(`[chat] Initializing new session: ${sessionId}`);

  const sessionInitBody = {
    preferred_language: 'English',
    visit_count: 1
  };

  // Create or update session in ADK
  // https://google.github.io/adk-docs/deploy/cloud-run/#create-or-update-a-session
  try {
    const sessionFetchOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(sessionInitBody),
    } as const;

    const curlCmdSession = buildCurlCommand(sessionInitUrl, sessionFetchOptions.method, sessionFetchOptions.headers as Record<string,string>, sessionFetchOptions.body);
    console.log(curlCmdSession);

    const sessionResponse = await fetch(sessionInitUrl, sessionFetchOptions);

    if (!sessionResponse.ok) {
      const errorText = await sessionResponse.text();
      console.error(`[chat] Session initialization failed: ${sessionResponse.status} - ${errorText}`);
    }
  } catch (e) {
    console.error('[chat] Error initializing session:', e);
  }
}

function shellEscapeSingleQuotes(str: string): string {
  // Escape single quotes for safe shell embedding: ' -> '\''
  return str.replace(/'/g, "'\\''");
}

function buildCurlCommand(url: string, method: string, headers?: Record<string, string>, body?: any): string {
  const headerParts = headers ? Object.entries(headers).map(([k, v]) => {
    // Include the full header value (no masking) so logs are copy/pasteable
    const escapedVal = shellEscapeSingleQuotes(String(v));
    return `-H '${k}: ${escapedVal}'`;
  }).join(' ') : '';
  let dataPart = '';
  if (body !== undefined) {
    const json = typeof body === 'string' ? body : JSON.stringify(body);
    const escaped = shellEscapeSingleQuotes(json);
    dataPart = ` -d '${escaped}'`;
  }
  return `curl -X ${method.toUpperCase()} '${url}' ${headerParts}${dataPart}`.trim();
}

// Get the authorization headers needed to access the GCloud run service url passed in (LumosAgents for example)
async function getIdTokenHeaders(audience: string): Promise<Record<string, string>> {
  try {
    const client = await googleAuth.getIdTokenClient(audience);
    const tokenResponse = await client.idTokenProvider.fetchIdToken(audience);
    return { 'Authorization': `Bearer ${tokenResponse}` };
  } catch (error) {
    console.error('[chat] Error fetching ID token for audience', audience, error);
    throw new Error('Failed to get authorization token for url: ' + audience);
  }
}
