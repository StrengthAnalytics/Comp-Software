import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCompBySlug } from '@/lib/comps/get-comp-by-slug';
import { isCompPubliclyVisible } from '@/lib/comps/meet-status';
import { parseEntryFormConfig } from '@/types/entry-form';
import { PublicEntryForm, type PublicWeightClass } from '@/components/entries/public-entry-form';

// UK-style "11 July 2026"; comp dates are stored as ISO date strings.
function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// The public entry form: lifters self-register into the comp's review inbox. Sign-in-free — the
// page reads the comp under the public-comp RLS policy (a draft comp is invisible to anon and
// 404s), and the form renders from the comp's own design (competitions.entry_form). Submissions
// go through the app's one anonymous server action; nothing joins the comp until an admin
// approves it on the entries screen.
export default async function EnterPage({ params }: { params: Promise<{ 'comp-slug': string }> }) {
  const { 'comp-slug': slug } = await params;
  const comp = await getCompBySlug(slug);

  if (!comp) {
    notFound();
  }

  const accepting = comp.entry_form_open && isCompPubliclyVisible(comp.status);
  const config = parseEntryFormConfig(comp.entry_form);

  // The class dropdown's options; only fetched when the form actually asks the question.
  let weightClasses: PublicWeightClass[] = [];
  if (accepting && config.fields.weight_class !== 'off') {
    const supabase = await createClient();
    const { data } = await supabase
      .from('weight_classes')
      .select('name, gender')
      .eq('competition_id', comp.id)
      .order('sort_order', { ascending: true });
    weightClasses = data ?? [];
  }

  return (
    <main className="min-h-screen bg-neutral-100 px-4 py-10">
      <div className="mx-auto max-w-xl">
        <header className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{comp.name}</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {comp.starts_on ? `${formatDate(comp.starts_on)} · ` : ''}Entry form
          </p>
        </header>

        <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
          {accepting ? (
            <PublicEntryForm
              competitionId={comp.id}
              competitionName={comp.name}
              config={config}
              weightClasses={weightClasses}
            />
          ) : (
            <div className="py-6 text-center">
              <h2 className="text-base font-semibold text-neutral-900">Entries are closed</h2>
              <p className="mt-2 text-sm text-neutral-600">
                This competition is not accepting entries at the moment. Contact the organisers if
                you think this is a mistake.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
