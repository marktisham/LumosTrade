import path from 'path';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { SecretManager, LogHelper } from 'lumostrade';
import { ZeroStateManager } from '../utils/ZeroStateManager';

// ============================================================================
// CONSTANTS AND TYPES
// ============================================================================

export const AUTH_COOKIE = 'lumos_auth';

interface AuthCookieData {
  hash: string;
  uid: string;
}

let cachedAuthHash: string | null = null;

// ============================================================================
// EXPORTED AUTHENTICATION FUNCTIONS
// ============================================================================

/**
 * Register login and logout routes on the Express app.
 * Handles GET /login (display form), POST /login (authenticate), and GET /logout.
 */
export function registerAuthRoutes(app: import('express').Express) {
  // Login GET: show login form
  app.get('/login', async (req, res) => {
    const controller = await import(path.join(__dirname, '../controllers/login.js'));
    if (typeof controller.default === 'function') {
      return controller.default(req, res, (viewName: string, data: any = {}) => {
        res.render(viewName, { ...data, layout: 'master' });
      });
    }
    res.status(500).send('Login controller missing');
  });

  // Login POST: check password, set cookie
  app.post('/login', handleLoginPost);

  // Logout: clear cookie and redirect to login
  app.get('/logout', (req, res) => {
    res.clearCookie(AUTH_COOKIE);
    res.redirect('/login');
  });
}

/**
 * Check if a request has a valid authentication cookie.
 * Returns true if the cookie exists and the hash matches.
 */
export async function isAuthenticated(req: Request): Promise<boolean> {
  const authHash = await getAuthHash();
  if (!req.cookies || !req.cookies[AUTH_COOKIE]) {
    return false;
  }
  
  try {
    const cookieData: AuthCookieData = JSON.parse(req.cookies[AUTH_COOKIE]);
    return cookieData.hash === authHash;
  } catch {
    // Invalid cookie format
    return false;
  }
}

/**
 * Express middleware to enforce authentication on protected routes.
 * Handles cron auth, public paths, static assets, and redirects unauthenticated users to login.
 */
export function authMiddleware(publicPaths: string[] = ['/login', '/logout']) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Handle cron auth via query string parameter
    if (req.path.startsWith('/cron')) {
      const secrets = await SecretManager.getSecrets();
      const authToken = req.query.auth;
      if (!authToken || authToken !== secrets.LumosApp.auth.cronToken) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      return next();
    }

    // Allow all static assets in /public, /bootstrap, and /styles.css to be served without auth
    if (
      req.path.startsWith('/public/') ||
      req.path.startsWith('/bootstrap/') ||
      req.path === '/styles.css' ||
      req.path === '/brokersClient.js'
    ) {
      return next();
    }

    // Allow login/logout routes without auth
    if (publicPaths.some(p => req.path.startsWith(p))) return next();

    // All other pages must be authenticated
    if (await isAuthenticated(req)) {
      return handleAuthenticatedPageAccess(req, res, next);
    }
    // Not authenticated: redirect to login
    return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
  };
}

// ============================================================================
// AUTHENTICATION HELPERS
// ============================================================================

/**
 * Generate and cache a secure hash of the password for cookie validation.
 * The hash is computed once and cached for subsequent calls.
 */
async function getAuthHash(): Promise<string> {
  if (cachedAuthHash) {
    return cachedAuthHash;
  }
  const secrets = await SecretManager.getSecrets();
  const password = secrets.LumosApp.auth.password;
  cachedAuthHash = crypto.createHash('sha256').update(password).digest('hex');
  return cachedAuthHash;
}

/**
 * Extract the user ID from the authentication cookie.
 * Returns null if the cookie is missing or invalid.
 */
function getUserIdFromCookie(req: Request): string | null {
  if (!req.cookies || !req.cookies[AUTH_COOKIE]) {
    return null;
  }
  
  try {
    const cookieData: AuthCookieData = JSON.parse(req.cookies[AUTH_COOKIE]);
    return cookieData.uid || null;
  } catch {
    return null;
  }
}

// ============================================================================
// REQUEST HANDLERS
// ============================================================================

/**
 * Handle POST /login request: validate password, create auth cookie, and log the result.
 * On success, redirects to the requested page or home.
 * On failure, redirects back to login with an error flag.
 */
async function handleLoginPost(req: Request, res: Response): Promise<void> {
  const submittedPassword = req.body.password;
  const secrets = await SecretManager.getSecrets();
  const correctPassword = secrets.LumosApp.auth.password;
  const clientIp = getClientIp(req);

  if (submittedPassword === correctPassword) {
    // Generate unique user ID and create auth cookie
    const uid = generateUserId();
    const authHash = await getAuthHash();
    const cookieData: AuthCookieData = { hash: authHash, uid };
    
    // 30 days expiry
    res.cookie(AUTH_COOKIE, JSON.stringify(cookieData), { 
      maxAge: 30 * 24 * 60 * 60 * 1000, 
      httpOnly: true 
    });
    
    // Log successful login
    LogHelper.LogForGCP('New user login', {
      uid,
      ip: clientIp,
      userAgent: req.headers['user-agent'] || 'unknown',
      referer: req.headers['referer'] || 'none',
    });
    
    const nextUrl = req.query.next ? String(req.query.next) : '/';
    return res.redirect(nextUrl);
  }
  
  // Failed login
  LogHelper.LogForGCP('Failed login attempt', {
    ip: clientIp,
    userAgent: req.headers['user-agent'] || 'unknown',
    referer: req.headers['referer'] || 'none',
  });
  
  return res.redirect('/login?error=1');
}

/**
 * Handle authenticated page access: check zero state, log page visits, and redirect if necessary.
 * This is called after the user has been verified as authenticated.
 */
async function handleAuthenticatedPageAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  const inZeroState = await ZeroStateManager.checkZeroState();
  res.locals.showNavbar = true;
  res.locals.inZeroState = inZeroState;
  
  // Log authenticated page visit (excluding static resources)
  if (shouldLogPageVisit(req.path)) {
    const uid = getUserIdFromCookie(req);
    const clientIp = getClientIp(req);
    LogHelper.LogForGCP(`Page visited: ${req.path}`, {
      uid: uid || 'unknown',
      ip: clientIp,
      path: req.path,
      method: req.method,
      userAgent: req.headers['user-agent'] || 'unknown',
      referer: req.headers['referer'] || 'none',
    });
  }
  
  // In zero state, redirect all pages to brokers settings (except API/request routes)
  if (inZeroState && req.path !== '/brokers' && !req.path.startsWith('/request/') && !req.path.startsWith('/cron')) {
    return res.redirect('/brokers');
  }
  
  return next();
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Extract the client IP address from the request.
 * Checks x-forwarded-for header first (for proxied requests), then falls back to socket address.
 */
function getClientIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 
         req.ip || 
         req.socket.remoteAddress || 
         'unknown';
}

/**
 * Generate a unique user ID based on current timestamp and random data.
 * Format: {timestamp}-{16-char-hex}
 */
function generateUserId(): string {
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex');
  return `${timestamp}-${random}`;
}

/**
 * Determine if a page visit should be logged.
 * Returns false for static resources (JS, CSS, images, etc.) and special paths.
 */
function shouldLogPageVisit(path: string): boolean {
  // Exclude static resources by extension
  const staticExtensions = ['.js', '.css', '.ico', '.png', '.jpg', '.jpeg', '.svg', '.gif', '.woff', '.woff2', '.ttf', '.map', '.json'];
  if (staticExtensions.some(ext => path.endsWith(ext))) {
    return false;
  }
  
  // Exclude specific paths
  if (path.startsWith('/.well-known/') || path.startsWith('/request/')) {
    return false;
  }
  
  return true;
}
