
import { Request, Response, NextFunction } from 'express';
import { ErrorHelper } from 'lumostrade';

// Error handler function to be used directly in app
export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  // Format error for Google Cloud and log
  const formatted = ErrorHelper.formatForCloud(err, `Express errorHandler: ${req.method} ${req.originalUrl}`);
  console.error(formatted);
  res.status(err.status || 500);
  res.render('error', {
    error: {
      message: err.message,
      stack: err.stack,
      status: err.status,
      name: err.name,
      code: err.code
    },
    title: 'Error',
    showNavbar: false
  });
}
