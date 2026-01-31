// Client-side TypeScript for Chat page

// Declare marked library (loaded via CDN)
declare const marked: {
  parse: (markdown: string) => string;
};

// Types
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  lastMessageAt: number;
}

// LocalStorage keys
const STORAGE_KEYS = {
  SESSIONS: 'lumos_chat_sessions',
  ACTIVE_SESSION: 'lumos_chat_active_session',
  SESSION_PREFIX: 'lumos_chat_session_',
  SESSION_INITIALIZED_PREFIX: 'lumos_chat_session_initialized_',
  SIDEBAR_COLLAPSED: 'lumos_chat_sidebar_collapsed'
};

// State
let currentSessionId: string | null = null;
let sessions: ChatSession[] = [];
let currentSessionInitialized: boolean = false;
let currentAbortController: AbortController | null = null;
const sessionErrors = new Map<string, string>();

// DOM Elements
let sessionList: HTMLElement;
let chatMessages: HTMLElement;
let messageInput: HTMLTextAreaElement;
let sendBtn: HTMLButtonElement;
let stopBtn: HTMLButtonElement;
let newSessionBtn: HTMLButtonElement;
let deleteAllSessionsBtn: HTMLButtonElement;
let sessionSearch: HTMLInputElement;
let sessionTitle: HTMLElement;
let sessionDate: HTMLElement;
let chatError: HTMLElement;
let chatSidebar: HTMLElement;
let expandSidebarBtn: HTMLButtonElement;
let collapseSidebarBtn: HTMLButtonElement;
let newSessionBtnCollapsed: HTMLButtonElement;
let deleteAllSessionsBtnCollapsed: HTMLButtonElement;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Get DOM elements
  sessionList = document.getElementById('sessionList') as HTMLElement;
  chatMessages = document.getElementById('chatMessages') as HTMLElement;
  messageInput = document.getElementById('messageInput') as HTMLTextAreaElement;
  sendBtn = document.getElementById('sendBtn') as HTMLButtonElement;
  stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;
  newSessionBtn = document.getElementById('newSessionBtn') as HTMLButtonElement;
  deleteAllSessionsBtn = document.getElementById('deleteAllSessionsBtn') as HTMLButtonElement;
  const mobileNewSessionBtn = document.getElementById('mobileNewSessionBtn') as HTMLButtonElement | null;

  if (mobileNewSessionBtn) {
    mobileNewSessionBtn.addEventListener('click', () => {
      // On mobile, immediately delete all sessions and start a new one (no confirm)
      deleteAllSessionsImmediate();
    });
  }
  sessionSearch = document.getElementById('sessionSearch') as HTMLInputElement;
  sessionTitle = document.getElementById('sessionTitle') as HTMLElement;
  sessionDate = document.getElementById('sessionDate') as HTMLElement;
  chatError = document.getElementById('chatError') as HTMLElement;
  chatSidebar = document.getElementById('chatSidebar') as HTMLElement;
  expandSidebarBtn = document.getElementById('expandSidebarBtn') as HTMLButtonElement;
  collapseSidebarBtn = document.getElementById('collapseSidebarBtn') as HTMLButtonElement;
  newSessionBtnCollapsed = document.getElementById('newSessionBtnCollapsed') as HTMLButtonElement;
  deleteAllSessionsBtnCollapsed = document.getElementById('deleteAllSessionsBtnCollapsed') as HTMLButtonElement;

  // Initialize sidebar collapse state
  initializeSidebarState();

  // Load sessions and clean up sessions from prior days
  loadSessions();
  deleteSessionsFromPriorDays();
  createNewSession();

  // Event listeners
  sendBtn.addEventListener('click', (e) => {
    e.preventDefault();
    sendMessage();
  });
  stopBtn.addEventListener('click', () => {
    if (currentAbortController) {
      currentAbortController.abort();
    }
  });
  messageInput.addEventListener('keydown', (e) => {
    // Enter without Shift/Cmd/Ctrl submits the message
    // Shift+Enter or Cmd+Enter or Ctrl+Enter adds a newline
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  newSessionBtn.addEventListener('click', createNewSession);
  deleteAllSessionsBtn.addEventListener('click', deleteAllSessions);
  sessionSearch.addEventListener('input', filterSessions);
  
  // Sidebar collapse/expand listeners
  expandSidebarBtn.addEventListener('click', expandSidebar);
  collapseSidebarBtn.addEventListener('click', collapseSidebar);
  newSessionBtnCollapsed.addEventListener('click', createNewSession);
  deleteAllSessionsBtnCollapsed.addEventListener('click', deleteAllSessions);
});

// Session Management
function loadSessions(): void {
  const stored = localStorage.getItem(STORAGE_KEYS.SESSIONS);
  sessions = stored ? JSON.parse(stored) : [];
  renderSessionList();
}

function saveSessions(): void {
  localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
}

function createNewSession(): string {
  const sessionId = `session_${Date.now()}`;
  const newSession: ChatSession = {
    id: sessionId,
    title: 'New Chat',
    createdAt: Date.now(),
    lastMessageAt: Date.now()
  };
  
  sessions.unshift(newSession);
  saveSessions();
  localStorage.setItem(STORAGE_KEYS.SESSION_PREFIX + sessionId, JSON.stringify([]));
  
  loadSession(sessionId);
  renderSessionList();
  
  // Mark as not initialized - will be initialized on first message
  currentSessionInitialized = false;

  return sessionId;
}

function loadSession(sessionId: string): void {
  currentSessionId = sessionId;
  localStorage.setItem(STORAGE_KEYS.ACTIVE_SESSION, sessionId);
  
  const session = sessions.find(s => s.id === sessionId);
  if (!session) return;
  
  // Check if session has been initialized
  const initKey = STORAGE_KEYS.SESSION_INITIALIZED_PREFIX + sessionId;
  currentSessionInitialized = localStorage.getItem(initKey) === 'true';
  
  // Update UI
  sessionTitle.textContent = session.title;
  sessionDate.textContent = formatDate(session.createdAt);
  
  // Load and render messages
  const messages = getSessionMessages(sessionId);
  renderMessages(messages);
  
  // Load session error from memory if it exists
  const sessionError = sessionErrors.get(sessionId);
  if (sessionError) {
    showError(sessionError);
  } else {
    hideError();
  }
  
  // Highlight active session in list
  renderSessionList();
  
  // Focus input
  messageInput.focus();
}

function deleteCurrentSession(): void {
  if (!currentSessionId) return;
  
  if (!confirm('Delete this chat session? This cannot be undone.')) return;
  
  // Remove from sessions list
  sessions = sessions.filter(s => s.id !== currentSessionId);
  saveSessions();
  
  // Remove messages, initialization flag, and errors
  localStorage.removeItem(STORAGE_KEYS.SESSION_PREFIX + currentSessionId);
  localStorage.removeItem(STORAGE_KEYS.SESSION_INITIALIZED_PREFIX + currentSessionId);
  sessionErrors.delete(currentSessionId);
  
  // Always create a new session
  createNewSession();
  renderSessionList();
}

function deleteAllSessions(): void {
  if (sessions.length === 0) return;
  
  if (!confirm(`Delete all ${sessions.length} chat sessions? This cannot be undone.`)) return;
  
  performDeleteAllSessions();
}

// Internal helper that deletes all sessions without prompting
function deleteAllSessionsImmediate(): void {
  performDeleteAllSessions();
}

function performDeleteAllSessions(): void {
  // Remove all session data from localStorage
  sessions.forEach(session => {
    localStorage.removeItem(STORAGE_KEYS.SESSION_PREFIX + session.id);
    localStorage.removeItem(STORAGE_KEYS.SESSION_INITIALIZED_PREFIX + session.id);
    sessionErrors.delete(session.id);
  });
  
  // Clear sessions array
  sessions = [];
  saveSessions();
  
  // Create a new session
  createNewSession();
  renderSessionList();
}

function deleteSessionsFromPriorDays(): void {
  if (sessions.length === 0) return;
  
  // Get start of today (midnight) in US Eastern Time
  const now = new Date();
  const todayET = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const todayStartET = new Date(todayET.getFullYear(), todayET.getMonth(), todayET.getDate());
  const todayStartUTC = new Date(todayStartET.toLocaleString('en-US', { timeZone: 'UTC' }));
  
  // Filter sessions to only keep those created today or later
  const sessionsToDelete = sessions.filter(session => session.createdAt < todayStartUTC.getTime());
  
  if (sessionsToDelete.length === 0) return;
  
  // Remove old session data from localStorage
  sessionsToDelete.forEach(session => {
    localStorage.removeItem(STORAGE_KEYS.SESSION_PREFIX + session.id);
    localStorage.removeItem(STORAGE_KEYS.SESSION_INITIALIZED_PREFIX + session.id);
    sessionErrors.delete(session.id);
  });
  
  // Keep only today's sessions
  sessions = sessions.filter(session => session.createdAt >= todayStartUTC.getTime());
  saveSessions();
  renderSessionList();
}

function getSessionMessages(sessionId: string): ChatMessage[] {
  const stored = localStorage.getItem(STORAGE_KEYS.SESSION_PREFIX + sessionId);
  return stored ? JSON.parse(stored) : [];
}

function saveSessionMessages(sessionId: string, messages: ChatMessage[]): void {
  localStorage.setItem(STORAGE_KEYS.SESSION_PREFIX + sessionId, JSON.stringify(messages));
}

function updateSessionTitle(sessionId: string, firstMessage: string): void {
  const session = sessions.find(s => s.id === sessionId);
  if (!session) return;
  
  // Generate title from first message (max 50 chars)
  session.title = firstMessage.substring(0, 50) + (firstMessage.length > 50 ? '...' : '');
  session.lastMessageAt = Date.now();
  saveSessions();
  
  if (sessionId === currentSessionId) {
    sessionTitle.textContent = session.title;
  }
}

// Message Handling
async function sendMessage(): Promise<void> {
  const message = messageInput.value.trim();
  if (!message || !currentSessionId) {
    return;
  }

  messageInput.disabled = true;
  sendBtn.style.display = 'none';
  stopBtn.style.display = 'inline-block';
  hideError();

  // Create abort controller for this request
  currentAbortController = new AbortController();

  const messages = getSessionMessages(currentSessionId);

  const userMessage: ChatMessage = {
    role: 'user',
    content: message,
    timestamp: Date.now()
  };
  messages.push(userMessage);
  saveSessionMessages(currentSessionId, messages);

  if (messages.length === 1) {
    updateSessionTitle(currentSessionId, message);
    renderSessionList();
  }

  messageInput.value = '';
  appendMessageToChat(userMessage, messages.length - 1);

  const assistantMessageDiv = createStreamingMessageDiv(currentAbortController);
  chatMessages.appendChild(assistantMessageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  let fullResponse = '';

  try {
    fullResponse = await runChatRequest(message, currentSessionId, !currentSessionInitialized, assistantMessageDiv);

    if (!currentSessionInitialized) {
      const initKey = STORAGE_KEYS.SESSION_INITIALIZED_PREFIX + currentSessionId;
      localStorage.setItem(initKey, 'true');
      currentSessionInitialized = true;
    }

    if (fullResponse) {
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: fullResponse,
        timestamp: Date.now()
      };
      messages.push(assistantMessage);
      saveSessionMessages(currentSessionId, messages);

      const session = sessions.find(s => s.id === currentSessionId);
      if (session) {
        session.lastMessageAt = Date.now();
        saveSessions();
        renderSessionList();
      }

      finalizeStreamingMessage(assistantMessageDiv, assistantMessage, messages.length - 1);
    } else {
      throw new Error('No response received from agent');
    }

  } catch (error) {
    console.error('Error sending message:', error);
    
    // If aborted, save partial content and don't show error
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('Chat request was cancelled by user');
      
      if (fullResponse) {
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: fullResponse,
          timestamp: Date.now()
        };
        messages.push(assistantMessage);
        saveSessionMessages(currentSessionId!, messages);

        const session = sessions.find(s => s.id === currentSessionId);
        if (session) {
          session.lastMessageAt = Date.now();
          saveSessions();
          renderSessionList();
        }

        finalizeStreamingMessage(assistantMessageDiv, assistantMessage, messages.length - 1);
      } else if (assistantMessageDiv.isConnected) {
        assistantMessageDiv.remove();
      }
    } else {
      let errorMsg = error instanceof Error ? error.message : 'Failed to send message';
      const shouldRetry = isSessionNotFoundError(errorMsg);
      let activeMessages = messages;

      if (shouldRetry && currentAbortController) {
        // Don't create a new session - just retry with the current one
        chatMessages.innerHTML = '';
        appendMessageToChat(userMessage, messages.length - 1);
        const retryAssistantDiv = createStreamingMessageDiv(currentAbortController);
        chatMessages.appendChild(retryAssistantDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        try {
          // Retry with isNewSession: true to reinitialize the session
          fullResponse = await runChatRequest(message, currentSessionId, true, retryAssistantDiv);

          const initKey = STORAGE_KEYS.SESSION_INITIALIZED_PREFIX + currentSessionId;
          localStorage.setItem(initKey, 'true');
          currentSessionInitialized = true;

          if (fullResponse) {
            const assistantMessage: ChatMessage = {
              role: 'assistant',
              content: fullResponse,
              timestamp: Date.now()
            };
            messages.push(assistantMessage);
            saveSessionMessages(currentSessionId, messages);

            const session = sessions.find(s => s.id === currentSessionId);
            if (session) {
              session.lastMessageAt = Date.now();
              saveSessions();
              renderSessionList();
            }

            finalizeStreamingMessage(retryAssistantDiv, assistantMessage, messages.length - 1);
            return;
          }

          throw new Error('No response received from agent');
        } catch (retryError) {
          console.error('Retry failed:', retryError);
          errorMsg = retryError instanceof Error ? retryError.message : errorMsg;
          activeMessages = messages;
        }
      }

      renderMessages(activeMessages);
      showError(errorMsg);
      if (currentSessionId) {
        sessionErrors.set(currentSessionId, errorMsg);
      }

      activeMessages.pop();
      if (currentSessionId) {
        saveSessionMessages(currentSessionId, activeMessages);
      }
      renderMessages(activeMessages);

      messageInput.value = message;
    }
  } finally {
    currentAbortController = null;
    stopBtn.style.display = 'none';
    messageInput.disabled = false;
    sendBtn.style.display = 'inline-block';
    sendBtn.disabled = false;
    messageInput.focus();
  }
}

async function runChatRequest(message: string, sessionId: string, isNewSession: boolean, assistantMessageDiv: HTMLElement): Promise<string> {
  const requestBody = {
    message,
    sessionId,
    isNewSession
  };

  const response = await fetch('/request/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
    signal: currentAbortController?.signal
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let currentEventType = '';
  let fullResponse = '';

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) {
        currentEventType = '';
        continue;
      }

      if (line.startsWith('event: ')) {
        currentEventType = line.substring(7).trim();
        continue;
      }

      if (line.startsWith('data: ')) {
        if (currentEventType === 'done') {
          continue;
        }

        try {
          const jsonStr = line.substring(6);
          const data = JSON.parse(jsonStr);

          if (data.error) {
            throw new Error(data.error);
          }

          if (data.fullText !== undefined) {
            fullResponse = data.fullText;
            updateStreamingMessage(assistantMessageDiv, fullResponse);
          }
        } catch (e) {
          if (e instanceof SyntaxError) {
            console.error('[chat] Failed to parse SSE data:', e);
          } else {
            throw e;
          }
        }
      }
    }
  }

  return fullResponse;
}

function isSessionNotFoundError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('session not found') ||
    normalized.includes('session_not_found') ||
    (normalized.includes('session') && normalized.includes('not found')) ||
    normalized.includes('unknown session')
  );
}

function renderMessages(messages: ChatMessage[]): void {
  chatMessages.innerHTML = '';
  
  messages.forEach((msg, idx) => {
    const msgDiv = createMessageElement(msg, idx);
    chatMessages.appendChild(msgDiv);
  });
  
  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function createMessageElement(msg: ChatMessage, idx: number): HTMLElement {
  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-message chat-message-${msg.role}`;
  msgDiv.dataset.messageIndex = idx.toString();
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'chat-message-content';
  
  if (msg.role === 'assistant' && typeof marked !== 'undefined') {
    contentDiv.innerHTML = marked.parse(msg.content);
  } else {
    contentDiv.textContent = msg.content;
  }
  
  const timeDiv = buildMessageTimeDiv(msg, idx);
  
  msgDiv.appendChild(contentDiv);
  msgDiv.appendChild(timeDiv);
  return msgDiv;
}

function buildMessageTimeDiv(msg: ChatMessage, idx: number): HTMLElement {
  const timeDiv = document.createElement('div');
  timeDiv.className = 'chat-message-time';
  timeDiv.textContent = formatTime(msg.timestamp);

  if (msg.role === 'user') {
    const copyBtn = document.createElement('i');
    copyBtn.className = 'fa-solid fa-copy chat-copy-response';
    copyBtn.title = 'Copy prompt';
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(msg.content);
        showCopyNotification();
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    });
    timeDiv.appendChild(copyBtn);
  }

  if (msg.role === 'assistant' && idx > 0) {
    const scrollBtn = document.createElement('i');
    scrollBtn.className = 'fa-solid fa-arrow-up chat-scroll-to-prompt';
    scrollBtn.title = 'Scroll to prompt';
    scrollBtn.addEventListener('click', () => {
      const promptIdx = idx - 1;
      const promptDiv = chatMessages.querySelector(`[data-message-index="${promptIdx}"]`) as HTMLElement;
      if (promptDiv) {
        promptDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    timeDiv.appendChild(scrollBtn);
  }

  if (msg.role === 'assistant') {
    const copyBtn = document.createElement('i');
    copyBtn.className = 'fa-solid fa-copy chat-copy-response';
    copyBtn.title = 'Copy response';
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(msg.content);
        showCopyNotification();
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    });
    timeDiv.appendChild(copyBtn);
  }

  return timeDiv;
}

function appendMessageToChat(msg: ChatMessage, idx: number): HTMLElement {
  const msgDiv = createMessageElement(msg, idx);
  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return msgDiv;
}

function finalizeStreamingMessage(div: HTMLElement, msg: ChatMessage, idx: number): void {
  div.removeAttribute('id');
  div.className = `chat-message chat-message-${msg.role}`;
  div.dataset.messageIndex = idx.toString();

  const contentDiv = div.querySelector('.chat-message-content') as HTMLElement;
  if (contentDiv) {
    // Clear all content and styling
    contentDiv.innerHTML = '';
    contentDiv.className = 'chat-message-content';
    contentDiv.removeAttribute('style');
    
    // Render the final content
    if (msg.role === 'assistant' && typeof marked !== 'undefined') {
      contentDiv.innerHTML = marked.parse(msg.content);
    } else {
      contentDiv.textContent = msg.content;
    }
  }

  const statusDiv = div.querySelector('.chat-streaming-status') as HTMLElement;
  if (statusDiv) {
    statusDiv.remove();
  }

  const existingTimeDiv = div.querySelector('.chat-message-time');
  if (existingTimeDiv) {
    existingTimeDiv.remove();
  }

  div.appendChild(buildMessageTimeDiv(msg, idx));
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showCopyNotification(): void {
  // Create toast notification
  const toast = document.createElement('div');
  toast.className = 'position-fixed top-0 start-50 translate-middle-x p-3';
  toast.style.zIndex = '9999';
  toast.style.marginTop = '20px';
  toast.innerHTML = `
    <div class="toast show" role="alert">
      <div class="toast-body bg-secondary text-white rounded">
        <i class="fa-solid fa-copy me-2"></i>Copied to clipboard
      </div>
    </div>
  `;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 1000);
}

function createStreamingMessageDiv(abortController: AbortController): HTMLElement {
  const streamingDiv = document.createElement('div');
  streamingDiv.id = 'streamingMessage';
  streamingDiv.className = 'chat-message chat-message-assistant';
  streamingDiv.innerHTML = `
    <div class="chat-message-content chat-streaming-content" style="display: none;">
    </div>
    <div class="chat-streaming-status">
      <i class="fa-solid fa-spinner fa-spin"></i>
      Lumos Chat agent processing...
    </div>
  `;
  
  return streamingDiv;
}

function updateStreamingMessage(div: HTMLElement, text: string): void {
  const statusDiv = div.querySelector('.chat-streaming-status') as HTMLElement;
  const contentDiv = div.querySelector('.chat-message-content') as HTMLElement;
  
  if (text) {
    if (contentDiv) {
      contentDiv.style.display = 'block';
      if (typeof marked !== 'undefined') {
        contentDiv.innerHTML = marked.parse(text);
      } else {
        contentDiv.textContent = text;
      }
      contentDiv.scrollTop = contentDiv.scrollHeight;
    }
    
    if (statusDiv) {
      statusDiv.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>Generating response...';
    }
  }
  
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Session List Rendering
function renderSessionList(): void {
  sessionList.innerHTML = '';
  
  const searchTerm = sessionSearch.value.toLowerCase();
  const filteredSessions = sessions.filter(s => 
    s.title.toLowerCase().includes(searchTerm)
  );
  
  // Hide "Delete All" button if there's only one session and it's the current one
  if (sessions.length === 1 && sessions[0].id === currentSessionId) {
    deleteAllSessionsBtn.style.display = 'none';
  } else {
    deleteAllSessionsBtn.style.display = 'block';
  }
  
  if (filteredSessions.length === 0) {
    sessionList.innerHTML = '<div class="text-muted text-center p-3">No sessions</div>';
    return;
  }
  
  filteredSessions.forEach(session => {
    const sessionDiv = document.createElement('div');
    sessionDiv.className = 'chat-session-item' + (session.id === currentSessionId ? ' active' : '');
    sessionDiv.addEventListener('click', () => loadSession(session.id));
    
    sessionDiv.innerHTML = `
      <div class="chat-session-title">${escapeHtml(session.title)}</div>
      <div class="chat-session-date">${formatDate(session.lastMessageAt)}</div>
    `;
    
    // Add tooltip attribute to show full session title on hover
    sessionDiv.setAttribute('title', session.title);
    sessionDiv.setAttribute('aria-label', session.title);
    
    sessionList.appendChild(sessionDiv);
  });
}

function filterSessions(): void {
  renderSessionList();
}

// Error Display
function showError(message: string): void {
  // Check if this is a full HTML document (contains <html> tag)
  if (message.includes('<html') || message.includes('<!DOCTYPE html>')) {
    // Render in an iframe for proper display
    chatError.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '200px';
    iframe.style.border = '1px solid #ccc';
    iframe.style.backgroundColor = 'white';
    chatError.appendChild(iframe);
    
    // Write the HTML into the iframe
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(message);
      iframeDoc.close();
    }
  } else {
    // Regular text/HTML fragment, use textContent for safety
    chatError.textContent = message;
  }
  chatError.style.display = 'block';
}

function hideError(): void {
  chatError.style.display = 'none';
  chatError.innerHTML = '';
}

// Utility Functions
function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  
  // Compare calendar days, not elapsed time
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = nowStart.getTime() - dateStart.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  // Format time as "3:45 pm"
  const time = date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  }).toLowerCase();
  
  if (days === 0) {
    return `${time} today`;
  } else if (days === 1) {
    return `${time} yesterday`;
  } else {
    // Format as "10:15 am, Jan 15"
    const monthDay = date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
    return `${time}, ${monthDay}`;
  }
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit' 
  });
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Sidebar Collapse/Expand Functions
function initializeSidebarState(): void {
  const isCollapsed = localStorage.getItem(STORAGE_KEYS.SIDEBAR_COLLAPSED) === 'true';
  if (isCollapsed) {
    chatSidebar.classList.add('collapsed');
    chatSidebar.classList.remove('expanded');
  } else {
    chatSidebar.classList.add('expanded');
    chatSidebar.classList.remove('collapsed');
  }
}

function collapseSidebar(): void {
  chatSidebar.classList.add('collapsed');
  chatSidebar.classList.remove('expanded');
  localStorage.setItem(STORAGE_KEYS.SIDEBAR_COLLAPSED, 'true');
}

function expandSidebar(): void {
  chatSidebar.classList.add('expanded');
  chatSidebar.classList.remove('collapsed');
  localStorage.setItem(STORAGE_KEYS.SIDEBAR_COLLAPSED, 'false');
}
