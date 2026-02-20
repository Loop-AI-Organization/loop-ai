/**
 * Shown when VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing.
 * Avoids a white screen; points the developer to fix frontend/.env or run the sync script.
 */
export default function SetupRequired() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto">
          <span className="text-xl font-bold text-muted-foreground">◎</span>
        </div>
        <h1 className="text-xl font-semibold">Setup required</h1>
        <p className="text-sm text-muted-foreground">
          Add <code className="rounded bg-muted px-1 py-0.5">VITE_SUPABASE_URL</code> and{' '}
          <code className="rounded bg-muted px-1 py-0.5">VITE_SUPABASE_ANON_KEY</code> to{' '}
          <code className="rounded bg-muted px-1 py-0.5">frontend/.env</code>.
        </p>
        <p className="text-sm text-muted-foreground">
          Or from the repo root, run:{' '}
          <code className="block mt-2 rounded bg-muted p-2 text-left text-xs">
            node scripts/sync-env.js
          </code>
          after setting <code className="rounded bg-muted px-1 py-0.5">SUPABASE_URL</code> and{' '}
          <code className="rounded bg-muted px-1 py-0.5">SUPABASE_ANON_KEY</code> in the root{' '}
          <code className="rounded bg-muted px-1 py-0.5">.env</code>. Then restart the frontend dev server.
        </p>
        <p className="text-xs text-muted-foreground">
          See <strong>docs/GETTING_STARTED.md</strong> for full setup steps.
        </p>
      </div>
    </div>
  );
}
