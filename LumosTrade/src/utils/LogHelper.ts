/** Log formatting helpers for structured Google Cloud logging. */

export class LogHelper {
  /** Format a message and optional key-value params into a structured GCP log object. */
  static LogForGCP(message: string, params?: Record<string, unknown>): void {
    const logObj: Record<string, any> = {
      severity: 'INFO',
      message,
      filter: 'Lumos',
    };

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        try {
          if (value instanceof Error) {
            logObj[key] = value.stack || value.message;
          } else if (typeof value === 'object' && value !== null) {
            // Ensure we have a plain JSON serializable object/value
            logObj[key] = JSON.parse(JSON.stringify(value));
          } else {
            logObj[key] = value;
          }
        } catch {
          // Fallback to string representation if serialization fails
          try {
            logObj[key] = JSON.stringify(value);
          } catch {
            logObj[key] = String(value);
          }
        }
      }
    }

    console.log(JSON.stringify(logObj));
  }

  /** Log a message in a structured format used by GCP to trigger email alerts. */
  static LogForEmail(emailBody: string, subject?: string): void {
    const params: Record<string, unknown> = {
      action: 'email',
      subject: subject || '',
    };
    LogHelper.LogForGCP(emailBody, params);
  }
}
