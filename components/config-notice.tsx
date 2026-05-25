// Shown when the deployment is missing its Supabase environment variables. Surfaces the cause
// (rather than a generic 500) so the fix — set the vars in Vercel and redeploy — is obvious.
export function ConfigNotice() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-6 py-12">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
          Backend not configured
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          This deployment is missing its Supabase environment variables
          (<code className="text-neutral-800">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
          <code className="text-neutral-800">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>). Set them for
          this environment in Vercel and redeploy.
        </p>
      </div>
    </div>
  );
}
