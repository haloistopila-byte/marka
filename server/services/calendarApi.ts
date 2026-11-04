import type { CalendarEvent } from '../../src/features/invoice/figures.ts';

/** Calls to the Google Calendar API. No Firebase here, so it can be tested alone. */

export type CalendarAction = 'Tambah' | 'Update' | 'Hapus' | 'Lewati';

/**
 * The event ID comes from the invoice number, so every sync of an invoice lands on the same event
 * and two tabs saving together cannot create a duplicate. Google allows only 0-9 and a-v.
 */
export const eventIdFor = (invNum: string) => 'marka' + Buffer.from(invNum, 'utf8').toString('hex');

async function failure(res: Response): Promise<Error> {
  const data: any = await res.json().catch(() => ({}));
  return new Error(data?.error?.message || `Google Calendar menolak permintaan (HTTP ${res.status}).`);
}

const eventsUrl = (calendarId: string) => `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;

/** Creates the invoice's event or brings it up to date. Edits made in Google outside these fields stay. */
export async function upsertEvent(token: string, calendarId: string, invNum: string, event: CalendarEvent): Promise<CalendarAction> {
  const id = eventIdFor(invNum);
  const url = eventsUrl(calendarId);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const patch = () =>
    fetch(`${url}/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        ...event,
        // A patch merges, so an event going from all-day to timed must drop the old kind of time.
        start: { date: null, dateTime: null, timeZone: null, ...event.start },
        end: { date: null, dateTime: null, timeZone: null, ...event.end },
        // Brings back an event that was removed when the invoice was cancelled
        status: 'confirmed'
      })
    });

  const patched = await patch();
  if (patched.ok) return 'Update';
  if (patched.status !== 404) throw await failure(patched);

  const created = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ ...event, id }) });
  if (created.ok) return 'Tambah';
  if (created.status !== 409) throw await failure(created);

  // Another tab created it between the two calls
  const retried = await patch();
  if (retried.ok) return 'Update';
  throw await failure(retried);
}

export async function removeEvent(token: string, calendarId: string, invNum: string): Promise<CalendarAction> {
  const res = await fetch(`${eventsUrl(calendarId)}/${eventIdFor(invNum)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  if (res.ok) return 'Hapus';
  // Never created, or already gone
  if (res.status === 404 || res.status === 410) return 'Lewati';
  throw await failure(res);
}
