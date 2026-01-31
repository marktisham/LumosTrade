export class ListHelpers {
  /**
   * Sanitize a list of symbol inputs: trim, uppercase, remove empties, and de-duplicate (preserving order)
   * Made public so clients can call as `ListHelpers.SanitizeSymbols(...)`.
   */
  public static SanitizeSymbols(symbols: string[] | undefined): string[] {
    if (!symbols || symbols.length === 0) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of symbols) {
      const u = (s ?? '').toString().trim().toUpperCase();
      if (u.length === 0) continue;
      if (seen.has(u)) continue;
      seen.add(u);
      out.push(u);
    }
    return out;
  }
}
