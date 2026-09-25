/** TEMPORARY diagnostic — zero imports. Reports env presence only, never values. */
export default function handler(_req: any, res: any): void {
  res.status(200).json({
    diag: 1,
    hasUrl: !!process.env.SUPABASE_URL,
    hasAnon: !!process.env.SUPABASE_KEY,
    hasService: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    node: process.version,
  });
}
