export class StingUtils {
  /**
   * Returns a trimmed string if input is non-empty; otherwise returns null.
   * Accepts null/undefined and treats strings containing only whitespace as empty.
   */
  public static ParseNotEmpty(input: string | null | undefined): string | null {
    if (input === undefined || input === null) return null;
    const trimmed = input.toString().trim();
    return trimmed.length === 0 ? null : trimmed;
  }
}
