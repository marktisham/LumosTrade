import path from 'path';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { SecretManager } from 'lumostrade';
import { ZeroStateManager } from '../utils/ZeroStateManager';

export const AUTH_COOKIE = 'lumos_auth';

let cachedAuthHash: string | null = null;

// Generate a secure hash of the password for cookie validation
async function getAuthHash(): Promise<string> {
  if (cachedAuthHash) {
    return cachedAuthHash;
  }
  const secrets = await SecretManager.getSecrets();
  const password = secrets.LumosApp.auth.password;
  cachedAuthHash = crypto.createHash('sha256').update(password).digest('hex');
  return cachedAuthHash;
}

// Register login/logout routes on the app
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
  app.post('/login', async (req, res) => {
    const submittedPassword = req.body.password;
    const secrets = await SecretManager.getSecrets();
    const correctPassword = secrets.LumosApp.auth.password;

    if (submittedPassword === correctPassword) {
      // 30 days expiry
      const authHash = await getAuthHash();
      res.cookie(AUTH_COOKIE, authHash, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true });
      const nextUrl = req.query.next ? String(req.query.next) : '/';
      return res.redirect(nextUrl);
    }
    // Failed login
    return res.redirect('/login?error=1');
  });

  // Logout: clear cookie and redirect to login
  app.get('/logout', (req, res) => {
    res.clearCookie(AUTH_COOKIE);
    res.redirect('/login');
  });
}

export async function isAuthenticated(req: Request): Promise<boolean> {
  const authHash = await getAuthHash();
  return req.cookies && req.cookies[AUTH_COOKIE] === authHash;
}

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
      const inZeroState = await ZeroStateManager.checkZeroState();
      res.locals.showNavbar = true;
      res.locals.inZeroState = inZeroState;
      
      // In zero state, redirect all pages to brokers settings (except API/request routes)
      if (inZeroState && req.path !== '/brokers' && !req.path.startsWith('/request/') && !req.path.startsWith('/cron')) {
        return res.redirect('/brokers');
      }
      
      return next();
    }
    // Not authenticated: redirect to login
    return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
  };
}
