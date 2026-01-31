/*
 * Copyright 2026 Mark Isham
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import expressLayouts from 'express-ejs-layouts';
import cookieParser from 'cookie-parser';
import { authMiddleware, registerAuthRoutes } from './route/auth';
import { dynamicControllerLoader } from './route/controller';
import { errorHandler } from './route/error';
import cronRouter from './route/cron';

const app = express();
const port = process.env.PORT || 8080;

// Set EJS as the view engine and configure views directory
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Parse cookies and POST bodies
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Inject any common variables used by all views
app.use((req: Request, res: Response, next: NextFunction) => {
  res.locals.environment = process.env.LUMOS_ENVIRONMENT || 'unknown';
  res.locals.buildNumber = process.env.BUILD_NUMBER || '';
  res.locals.demoMode = process.env.DEMO_MODE === 'True' || process.env.DEMO_MODE === 'true';
  res.locals.demoAllowEdits = process.env.DEMO_ALLOW_EDITS === 'True' || process.env.DEMO_ALLOW_EDITS === 'true';
  res.locals.githubRepoUrl = process.env.GITHUB_REPO_URL || '';
  next();
});

// Use shared auth middleware
app.use(authMiddleware());

// Use express-ejs-layouts and set layouts directory (must be before any routes that use res.render)
app.use(expressLayouts);
app.set('layout', path.join(__dirname, 'templates', 'master.ejs'));

// Register login/logout routes
registerAuthRoutes(app);

// Register cron job route
app.use('/cron', cronRouter);

// Serve static files (CSS, images, etc.) from dist/public
app.use(express.static(path.join(__dirname, 'public')));

// Dynamic controller loader middleware
// This will map /foo to controllers/foo.js and views/foo.ejs
app.use(dynamicControllerLoader({
  controllersDir: path.join(__dirname, 'controllers'),
  viewsDir: path.join(__dirname, 'views'),
  appViews: app.get('views'),
  requestDir: path.join(__dirname, 'request')
}));

// Default route
app.get('/', (req: Request, res: Response) => {
  res.redirect('/home');
});

// Error handler should be last and registered directly on the app
app.use(errorHandler);

app.listen(port, () => {
  console.log(`LumosApp online`);
});

