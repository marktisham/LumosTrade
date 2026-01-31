// ErrorHelper.ts
// Utility for formatting errors in a Google Cloud log-friendly way

export class ErrorHelper {
  /**
   * Formats an error for Google Cloud log explorer parsing
   * @param err The error object or string
   * @param context Optional context string for additional info
   * @returns A string formatted for Google Cloud logs
   */
  static formatForCloud(err: unknown, context?: string): string {
    let message = '';
    if (err instanceof Error) {
      message = err.stack || err.message;
    } else if (typeof err === 'string') {
      message = err;
    } else {
      try {
        message = JSON.stringify(err);
      } catch {
        message = String(err);
      }
    }
    const logObj: Record<string, any> = {
      severity: 'ERROR',
      message,
      filter: 'Lumos',
    };
    if (context) logObj.context = context;
    return JSON.stringify(logObj);
  }

  /**
   * Formats an error or message and logs it to console.error in a GCP-friendly format.
   * @param err The error object or message to log
   * @param context Optional context string
   */
  static LogErrorForGCP(err: unknown, context?: string): void {
    const formatted = ErrorHelper.formatForCloud(err, context);
    console.error(formatted);
  }
}

