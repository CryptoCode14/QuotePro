/** TEMPORARY diagnostic — zero imports. Tests invocation + res.status().json() chaining + env presence. */
export default function handler(_req: any, res: any): void {
  res.status(200).json({
    pong: true,
    node: process.version,
    hasUrl: !!process.env.SUPABASE_URL,
    hasAnon: !!process.env.SUPABASE_KEY,
    hasService: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}
