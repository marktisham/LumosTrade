import { DataAccess } from 'lumostrade';

/**
 * Manages zero state detection for the app. Zero state means there are no
 * non-closed accounts in the database (fresh install).
 * 
 * Caches the state per process to avoid repeated DB calls once accounts exist.
 */
export class ZeroStateManager {
  private static isInZeroState: boolean | null = null;

  /**
   * Check if the app is in zero state (no non-closed accounts exist).
   * Result is cached once accounts are found.
   */
  public static async checkZeroState(): Promise<boolean> {
    // If we already know we're not in zero state, return cached result
    if (this.isInZeroState === false) {
      return false;
    }

    // Check database for non-closed accounts
    const accounts = await DataAccess.GetAccounts();
    const hasAccounts = accounts.length > 0;

    // Cache result if we found accounts (we're not in zero state)
    if (hasAccounts) {
      this.isInZeroState = false;
    }

    return !hasAccounts;
  }

  /**
   * Force a recheck of zero state (for testing purposes).
   */
  public static resetCache(): void {
    this.isInZeroState = null;
  }
}
