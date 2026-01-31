export class LumosStateHelper {
  public static IsDemoMode(): boolean {
    return process.env.DEMO_MODE === 'True' || process.env.DEMO_MODE === 'true';
  }
}
