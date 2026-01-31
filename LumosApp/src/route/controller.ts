import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';

/**
 * Dynamic controller loader middleware for Express.
 *
 * This middleware maps the first segment of the URL path to a controller file in the controllers directory.
 * If a controller exists, it is loaded and called. If not, it tries to render a view with the same name.
 *
 * Example:
 *   /positions  => loads controllers/positions.js and calls its default export as a function
 *   /foo     => loads controllers/foo.js if it exists, else renders views/foo.ejs
 *   /        => defaults to 'home' controller or view
 *
 * Controller files should export a default function with the signature:
 *   (req, res, render) => void
 *
 * The render helper renders the view with the same name as the route, passing any data.
 *
 * Example controller (controllers/positions.ts):
 *   export default function(req, res, render) {
 *     render('positions', { title: 'Positions', positions: [...] });
 *   }

 * Example view (views/positions.ejs):
 *   <table>...</table>
 */


export function dynamicControllerLoader({
  controllersDir,
  viewsDir,
  appViews,
  requestDir
}: {
  controllersDir: string;
  viewsDir: string;
  appViews: string;
  requestDir?: string;
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    let route = extractRoute(req);

    // All routes that arrive here are assumed already authenticated

    // Request routes are used for client side javascript requests
    if (isRequestRoute(route)) {
      if (!requestDir) {
        return res.status(404).json({ error: 'Request directory not configured' });
      }
      return handleRequestRoute(req, res, next, requestDir, route);
    }

    // Controller routes are used to render mvc views
    const handledByController = await handleControllerRoute(req, res, next, controllersDir, route);
    if (handledByController) return;

    // If no controller or request route is found, try to render a view with the same name
    if (handleViewFallback(res, appViews, route)) return;

    // If no view is found, call the next middleware
    next();
  };
}

function extractRoute(req: Request): string {
  return req.path.replace(/^\/+|\/+$/g, '') || 'home';
}

function isRequestRoute(route: string): boolean {
  return route.startsWith('request/');
}

function getRequestRoute(route: string): string {
  const afterRequest = route.replace(/^request\/+/, '');
  return afterRequest.split('/')[0];
}

function invalidRequestRoute(requestRoute: string): boolean {
  return !requestRoute || requestRoute.includes('..');
}

async function handleRequestRoute(
  req: Request,
  res: Response,
  next: NextFunction,
  requestDir: string,
  route: string
) {
  const requestRoute = getRequestRoute(route);
  if (invalidRequestRoute(requestRoute)) {
    return res.status(400).json({ error: 'Invalid request path' });
  }
  const requestPath = path.join(requestDir, `${requestRoute}.js`);
  if (fs.existsSync(requestPath)) {
    const requestModule = await import(requestPath);
    if (typeof requestModule.default === 'function') {
      try {
        const maybePromise = requestModule.default(req, res, next);
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.catch((err: any) => {
            console.error('[dynamicControllerLoader] Async request error caught:', err);
            next(err);
          });
        }
      } catch (err) {
        console.error('[dynamicControllerLoader] Sync request error caught:', err);
        next(err);
      }
      return;
    }
  }
  return res.status(404).json({ error: 'Request not found' });
}

async function handleControllerRoute(
  req: Request,
  res: Response,
  next: NextFunction,
  controllersDir: string,
  route: string
) {
  const controllerPath = path.join(controllersDir, `${route}.js`);
  if (fs.existsSync(controllerPath)) {
    const controller = await import(controllerPath);
    if (typeof controller.default === 'function') {
      try {
        const maybePromise = controller.default(req, res, (viewName: string, data: any = {}) => {
          res.render(viewName, { ...data });
        });
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.catch((err: any) => {
            console.error('[dynamicControllerLoader] Async error caught:', err);
            next(err);
          });
        }
      } catch (err) {
        console.error('[dynamicControllerLoader] Sync error caught:', err);
        next(err);
      }
      return true;
    }
  }
  return false;
}

function handleViewFallback(res: Response, appViews: string, route: string): boolean {
  if (fs.existsSync(path.join(appViews, `${route}.ejs`))) {
    res.render(route, {});
    return true;
  }
  return false;
}