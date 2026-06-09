import Link from 'next/link';
import { CompForm } from '@/components/comps/comp-form';
import { Card } from '@/components/ui/card';

export default function NewCompPage() {
  return (
    <div className="max-w-2xl">
      <Link href="/comps" className="text-sm text-neutral-500 hover:text-neutral-800">
        ← Competitions
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">New competition</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Create the meet first, then add age categories and weight classes.
      </p>
      <Card className="mt-6">
        <CompForm />
      </Card>
    </div>
  );
}
