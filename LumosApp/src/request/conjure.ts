 import { Request, Response } from 'express';
import { GoogleAuth } from 'google-auth-library';
// import fetch from 'node-fetch'; // rely on global fetch in Node 18+

const LUMOS_USER = 'LumosUser';
const googleAuth = new GoogleAuth();

interface LumosAgentConfig {
  ServiceURL: string;
  projectId: string;
  AgentName: string;
  region: string;
}

interface ConjureRequest {
  prompt: string;
  sessionId: string;
  isNewSession?: boolean;
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

export default async function conjure(req: Request, res: Response): Promise<void> {
  try {
    const { prompt, message, sessionId, isNewSession } = req.body;
    const userPrompt = prompt || message;

    if (!userPrompt || !sessionId) {
      res.status(400).json({ 
        success: false, 
        error: 'Prompt and sessionId are required' 
      });
      return;
    }

    const agentConfig: LumosAgentConfig = {
      ServiceURL: process.env.AGENT_LUMOSAGENTS_URL || '',
      projectId: process.env.PROJECT_ID || '',
      AgentName: process.env.AGENT_LUMOSAGENTS_CONJURE || '',
      region: process.env.REGION || ''
    };
    
    if (!agentConfig.ServiceURL || !agentConfig.AgentName) {
      console.error('[conjure] LumosConjureAgent environment variables not set');
      res.status(500).json({ 
        success: false, 
        error: 'Conjure service not configured' 
      });
      return;
    }

    const authHeaders = await getIdTokenHeaders(agentConfig.ServiceURL);

    if (isNewSession) {
      await initChatSession(agentConfig, sessionId, authHeaders);
    }

    await runAgent(agentConfig, sessionId, userPrompt, res, authHeaders);

  } catch (error) {
    console.error('[conjure] Error processing conjure request:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error, possibly due to hitting quota rate limits. Try back in a few minutes.'
      });
    }
  }
}

async function runAgent(agentConfig: LumosAgentConfig, sessionId: string, message: string, res: Response, authHeaders: Record<string,string>): Promise<void> {
  // Inject current date context into the message
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD format
  const dateContext = `[Current Date: ${todayStr}] `;
  const enhancedMessage = dateContext + message;
  
  const adkRequest: AdkRunRequest = {
    app_name: agentConfig.AgentName,
    user_id: LUMOS_USER,
    session_id: sessionId,
    new_message: {
      parts: [{ text: enhancedMessage }],
      role: 'user'
    },
    streaming: false
  };

  const apiUrl = `${agentConfig.ServiceURL}/run`;
  const agentFetchOptions = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify(adkRequest),
  } as const;

  const curlCmdAgent = buildCurlCommand(apiUrl, agentFetchOptions.method, agentFetchOptions.headers as Record<string,string>, agentFetchOptions.body);
  console.log('');
  console.log(`[conjure] Calling Agent (Session: ${sessionId}):`);
  console.log(curlCmdAgent);

  const agentResponse = await fetch(apiUrl, agentFetchOptions);

  if (!agentResponse.ok) {
    const errorText = await agentResponse.text();
    console.error(`[conjure] LumosAgent error: ${agentResponse.status} - ${errorText}`);
    
    // Check if error is Session Not Found (404)
    if (agentResponse.status === 404 && errorText.includes('Session not found')) {
      console.log('[conjure] Session not found (expired or service restarted). Re-initializing...');
      await initChatSession(agentConfig, sessionId, authHeaders);
      
      // Retry ONCE
      const curlCmdRetry = buildCurlCommand(apiUrl, agentFetchOptions.method, agentFetchOptions.headers as Record<string,string>, agentFetchOptions.body);
      console.log('');
      console.log(`[conjure] Retrying Agent call (Session: ${sessionId}):`);
      console.log(curlCmdRetry);
      
      const retryResponse = await fetch(apiUrl, agentFetchOptions);
      if (retryResponse.ok) {
        await processAgentResponseNonStreaming(retryResponse, res);
        return;
      } else {
        const retryErrorText = await retryResponse.text();
        console.error(`[conjure] Retry failed: ${retryResponse.status} - ${retryErrorText}`);
      }
    }

    let errorMessage = `Service error: ${agentResponse.statusText}`;
    try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.detail) errorMessage = errorJson.detail;
    } catch (e) {}
    throw new Error(errorMessage);
  }

  await processAgentResponseNonStreaming(agentResponse, res);
}

async function processAgentResponseNonStreaming(agentResponse: any, res: Response) {
  console.log('[conjure] Processing non-streaming agent response');
  
  const responseJson = await agentResponse.json();
  console.log('[conjure] Response type:', Array.isArray(responseJson) ? 'array' : 'object');
  
  // The /run endpoint returns an array of events
  const events = Array.isArray(responseJson) ? responseJson : [responseJson];
  console.log('[conjure] Total events received:', events.length);
  
  // Log all events for debugging
  events.forEach((event: any, idx: number) => {
    console.log(`[conjure] Event ${idx}:`, {
      hasContent: !!event.content,
      role: event.content?.role,
      partsCount: event.content?.parts?.length,
      hasError: !!event.error
    });
    if (event.content?.parts) {
      event.content.parts.forEach((part: any, partIdx: number) => {
        console.log(`[conjure]   Part ${partIdx}:`, {
          hasText: !!part.text,
          textLength: part.text?.length,
          hasFunctionCall: !!part.functionCall,
          hasFunctionResponse: !!part.functionResponse
        });
      });
    }
  });
  
  // Find the last event with model role and text content
  let finalText = '';
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i] as any;
    
    if (event.error) {
      console.error('[conjure] Agent error:', event.error);
      
      // Parse user-friendly error message from common patterns
      let errorMessage = event.error;
      
      // Check for Vertex AI 429 RESOURCE_EXHAUSTED error
      if (typeof errorMessage === 'string' && errorMessage.includes('429 RESOURCE_EXHAUSTED')) {
         errorMessage = 'Lumos Conjure has hit Vertex resource limits. Please try again later.';
      }
      // Check for quota/rate limit errors
      else if (typeof errorMessage === 'string' && (
        errorMessage.toLowerCase().includes('quota') || 
        errorMessage.toLowerCase().includes('rate limit') ||
        errorMessage.toLowerCase().includes('resource exhausted')
      )) {
         errorMessage = 'Lumos Conjure has hit Vertex quota limits. Please try again later.';
      }
      
      res.status(500).json({ success: false, error: errorMessage });
      return;
    }
    
    if (event.content && event.content.role === 'model' && event.content.parts) {
      const textParts = event.content.parts
        .filter((part: any) => part.text && !part.functionCall && !part.functionResponse)
        .map((part: any) => part.text)
        .filter((text: any) => text);
      
      console.log(`[conjure] Event ${i}: Found ${textParts.length} text-only parts`);
      
      if (textParts.length > 0) {
        finalText = textParts.join('');
        console.log(`[conjure] Found text in event ${i}, length: ${finalText.length}`);
        console.log(`[conjure] Text preview:`, finalText.substring(0, 200));
        break;
      }
    }
  }
  
  if (finalText) {
    console.log('[conjure] Sending response to client');
    res.json({ success: true, text: finalText });
  } else {
    console.warn('[conjure] No text content found in agent response');
    console.warn('[conjure] Full response:', JSON.stringify(responseJson, null, 2));
    res.status(500).json({ success: false, error: 'No visualization data received from agent' });
  }
}

async function processAgentResponse(agentResponse: any, res: Response) {
  if (!agentResponse.body) {
    throw new Error('No response body from agent');
  }

  const reader = agentResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let pendingJson = '';
  let eventCount = 0;

  try {
    // @ts-ignore
    while (true) {
      // @ts-ignore
      const { done, value } = await reader.read();
      
      if (done) {
        console.log('[conjure] Agent response stream ended');
        break;
      }
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          if (pendingJson) {
             console.warn('[conjure] Dropping unparsed JSON buffer:', pendingJson);
          }
          pendingJson = line.substring(6);
        } else if (pendingJson) {
           pendingJson += line;
        } else {
            continue;
        }

        try {
            let jsonToParse = pendingJson;
             const errorPattern = /^\s*\{\s*"error"\s*:\s*"(.*)"\s*\}\s*$/s;
             const match = jsonToParse.match(errorPattern);
             
             if (match) {
                 const errorContent = match[1];
                 const escapedContent = errorContent.replace(/\\"/g, '\uE000').replace(/"/g, '\\"').replace(/\uE000/g, '\\"');
                 jsonToParse = `{"error": "${escapedContent}"}`;
             }

            const data: any = JSON.parse(jsonToParse);
            pendingJson = ''; 
            eventCount++;

            console.log(`[conjure] Parsed agent event #${eventCount}:`, {
              hasError: !!data.error,
              hasContent: !!data.content,
              role: data.content?.role,
              partsCount: data.content?.parts?.length,
              partial: data.partial
            });

            if (data.error) {
                 console.error('[conjure] Agent error:', data.error);
                 res.write(`event: error\ndata: ${JSON.stringify({ error: data.error })}\n\n`);
                 continue;
            }

            const event = data as AdkEvent;
            if (event.content && event.content.role === 'model' && event.content.parts) {
              const textParts = event.content.parts
                .filter((part: any) => part.text && !part.functionCall && !part.functionResponse)
                .map((part: any) => part.text)
                .filter((text: any) => text);
              
              console.log(`[conjure] Event has ${event.content.parts.length} parts, ${textParts.length} text-only parts`);
              
              if (textParts.length > 0) {
                const text = textParts.join('');
                console.log(`[conjure] Sending chunk to client, length: ${text.length}, final: ${event.partial === false}`);
                
                if (event.partial === false) {
                  res.write(`event: message\ndata: ${JSON.stringify({ chunk: text, final: true })}\n\n`);
                } else {
                  res.write(`event: message\ndata: ${JSON.stringify({ chunk: text })}\n\n`);
                }
              } else {
                console.log('[conjure] No text-only parts found in this event');
              }
            }

        } catch (e) {
            console.error('[conjure] Failed to parse agent event:', e, 'Pending JSON:', pendingJson);
        }
      }
    }
    
    if (pendingJson) {
        console.error('[conjure] Stream ended with unparsed JSON:', pendingJson);
    }

    res.write(`event: done\ndata: ${JSON.stringify({ done: true })}\n\n`);
  } finally {
    // @ts-ignore
    reader.releaseLock();
  }
}

async function initChatSession(agentConfig: LumosAgentConfig, sessionId: string, authHeaders: Record<string,string>): Promise<void> {
  const sessionInitUrl = `${agentConfig.ServiceURL}/apps/${agentConfig.AgentName}/users/${LUMOS_USER}/sessions/${sessionId}`;
  console.log(`[conjure] Initializing new session: ${sessionId}`);

  const sessionInitBody = {
    preferred_language: 'English',
    visit_count: 1
  };

  try {
    const sessionFetchOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(sessionInitBody),
    } as const;

    const curlCmdSession = buildCurlCommand(sessionInitUrl, sessionFetchOptions.method, sessionFetchOptions.headers as Record<string,string>, sessionFetchOptions.body);
    console.log('');
    console.log(`[conjure] Initializing session ${sessionId}:`);
    console.log(curlCmdSession);

    const sessionResponse = await fetch(sessionInitUrl, sessionFetchOptions);

    if (!sessionResponse.ok) {
        const txt = await sessionResponse.text();
       console.error(`[conjure] Session initialization failed: ${sessionResponse.status} - ${txt}`);
    }
  } catch (e) {
    console.error('[conjure] Error initializing session:', e);
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

async function getIdTokenHeaders(audience: string): Promise<Record<string, string>> {
  try {
    const client = await googleAuth.getIdTokenClient(audience);
    const tokenResponse = await client.idTokenProvider.fetchIdToken(audience);
    return { 'Authorization': `Bearer ${tokenResponse}` };
  } catch (error) {
    console.error('[conjure] Error fetching ID token', error);
    throw new Error('Failed to get authorization token');
  }
}
