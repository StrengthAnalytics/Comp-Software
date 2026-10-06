'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setOrganiserEmailAction } from '@/actions/competitions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type OrganiserEmailCardProps = {
  competitionId: string;
  initialEmail: string | null;
  // The signed-in admin's own address, offered as a one-tap fill.
  myEmail: string | null;
};

const INPUT_CLASS =
  'block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none';

// The comp's organiser email: where its volunteer rota change requests are sent, and where lifters'
// replies to their entry emails land. Set to the creating admin's email when a comp is created.
export function OrganiserEmailCard({ competitionId, initialEmail, myEmail }: OrganiserEmailCardProps) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = email.trim() !== (initialEmail ?? '');

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const result = await setOrganiserEmailAction({ competitionId, email });
      if (result.status === 'error') {
        setError(result.fieldErrors?.email?.[0] ?? result.message);
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError('Could not reach the server — please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Organiser email">
      <p className="-mt-3 mb-4 text-sm text-neutral-600">
        This competition&rsquo;s emails come to this address: volunteers&rsquo; rota change requests, and replies from
        lifters to their entry emails.
      </p>

      <label htmlFor="organiser-email" className="text-sm font-medium text-neutral-700">
        Email address
      </label>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <input
          id="organiser-email"
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setSaved(false);
          }}
          placeholder={myEmail ?? 'organiser@example.com'}
          className={`${INPUT_CLASS} min-w-0 flex-1`}
        />
        <Button onClick={save} disabled={saving || !dirty}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        {myEmail === null || email.trim() === myEmail ? null : (
          <button
            type="button"
            onClick={() => {
              setEmail(myEmail);
              setSaved(false);
            }}
            className="font-medium text-brand-700 hover:underline"
          >
            Use my email ({myEmail})
          </button>
        )}
        {email.trim() === '' && !dirty ? (
          <span className="text-neutral-500">Not set — emails go to the addresses in the app&rsquo;s settings.</span>
        ) : null}
        {saved ? <span className="text-emerald-700">Saved ✓</span> : null}
      </div>

      {error === null ? null : (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </Card>
  );
}
