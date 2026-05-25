import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-neutral-50 px-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Comp-Software</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Organise and run IPF-affiliated powerlifting competitions.
        </p>
      </div>
      <Link
        href="/auth"
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
      >
        Admin sign in
      </Link>
    </main>
  );
}
