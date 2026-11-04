import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { calendarEvent, calendarUrl, finalizeInvoice, invoiceDocId, invoicesToSync, type CalendarEvent, type InvoiceInput } from '../../src/features/invoice/figures.ts';
import { eventIdFor, removeEvent, upsertEvent } from './calendarApi.ts';
import { createState, isValidState } from './googleCalendarAuth.ts';

const input: InvoiceInput = {
  invNum: 'MPB-20261231-001',
  invDate: '2026-11-04',
  invDue: '2026-11-07',
  evStatus: 'Terjadwal',
  custName: 'Ani',
  custPhone: '0812',
  custEmail: '',
  evName: 'Wedding',
  evDate: '2026-12-31',
  evLoc: 'Hall',
  evStart: '18:00',
  evEnd: '21:00',
  packageItems: [{ desc: 'Unlimited 3 Jam', qty: 1, price: 2800000, total: 2800000 }],
  addonItems: [],
  discVal: 0,
  discType: 'Rp',
  taxPct: 0,
  dpPaid: 800000,
  pelunasan: 0,
  bankName: '',
  bankAcc: '',
  bankHolder: '',
  note: ''
};
const invoice = (over: Partial<InvoiceInput> = {}) => finalizeInvoice({ ...input, ...over }, 'c', 'u');
const event = calendarEvent(invoice()) as CalendarEvent;

// ------------------------------------------------------------------ what the event says

test('an event carries the invoice details in Jakarta time', () => {
  assert.equal(event.summary, 'Marka: Wedding (Ani)');
  assert.equal(event.location, 'Hall');
  assert.deepEqual(event.start, { dateTime: '2026-12-31T18:00:00', timeZone: 'Asia/Jakarta' });
  assert.deepEqual(event.end, { dateTime: '2026-12-31T21:00:00', timeZone: 'Asia/Jakarta' });
  assert.match(event.description, /Invoice MPB-20261231-001/);
  assert.match(event.description, /Paket: Unlimited 3 Jam/);
  assert.match(event.description, /Partially Paid, sisa Rp/);
});

test('event times handle all-day, overnight and a missing end', () => {
  assert.deepEqual(calendarEvent(invoice({ evStart: '', evEnd: '' }))!.start, { date: '2026-12-31' });
  assert.deepEqual(calendarEvent(invoice({ evStart: '', evEnd: '' }))!.end, { date: '2027-01-01' });
  assert.equal((calendarEvent(invoice({ evStart: '22:00', evEnd: '01:00' }))!.end as any).dateTime, '2027-01-01T01:00:00');
  assert.equal((calendarEvent(invoice({ evEnd: '' }))!.end as any).dateTime, '2026-12-31T21:00:00');
  assert.equal((calendarEvent(invoice({ evEnd: '18:00' }))!.end as any).dateTime, '2026-12-31T21:00:00');
  assert.equal((calendarEvent(invoice({ evStart: '22:30', evEnd: '' }))!.end as any).dateTime, '2027-01-01T01:30:00');
});

test('the manual link agrees with the synced event when the end is missing', () => {
  assert.equal(new URL(calendarUrl({ ...input, evEnd: '' })!).searchParams.get('dates'), '20261231T180000/20261231T210000');
});

test('a cancelled or undated invoice has no event, a finished one keeps it', () => {
  assert.equal(calendarEvent(invoice({ evStatus: 'Batal' })), null);
  assert.equal(calendarEvent(invoice({ evDate: '' })), null);
  assert.notEqual(calendarEvent(invoice({ evStatus: 'Selesai' })), null);
});

// ------------------------------------------------------------------ what needs sending

test('only changed invoices and leftovers of gone ones are sent', () => {
  const invoices = { same: { updatedAt: '1' }, edited: { updatedAt: '2' }, 'new_a.b/c': { updatedAt: '3' } };
  const synced = { same: '1', edited: '1', [invoiceDocId('old_x.y/z')]: '9' };
  assert.deepEqual(invoicesToSync(invoices, synced), ['edited', 'new_a.b/c', 'old_x.y/z']);
  assert.deepEqual(invoicesToSync({ a: { updatedAt: '1' } }, { a: '1' }), []);
});

// ------------------------------------------------------------------ OAuth state

test('the connect state must be signed by this server and still fresh', () => {
  const state = createState('secret', 1000);
  assert.equal(isValidState(state, 'secret', 2000), true);
  assert.equal(isValidState(state, 'other-secret', 2000), false);
  assert.equal(isValidState(state, 'secret', 1000 + 11 * 60 * 1000), false);
  const [payload, signature] = state.split('.');
  assert.equal(isValidState(`${Buffer.from('{"exp":9e15}').toString('base64url')}.${signature}`, 'secret', 2000), false);
  assert.equal(isValidState(payload, 'secret', 2000), false);
  assert.equal(isValidState('', 'secret', 2000), false);
  assert.equal(isValidState(undefined, 'secret', 2000), false);
});

// ------------------------------------------------------------------ calls to Google

test('event IDs use only what Google allows, and each invoice keeps its own', () => {
  assert.match(eventIdFor('MPB/20261231 ü'), /^[a-v0-9]{5,1024}$/);
  assert.notEqual(eventIdFor('A'), eventIdFor('B'));
  assert.equal(eventIdFor('A'), eventIdFor('A'));
});

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Answers each call with the next status and records what was asked. */
function fakeGoogle(...statuses: number[]) {
  const calls: Array<{ method: string; url: string; body: any }> = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ method: String(init.method), url, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const status = statuses.shift()!;
    return new Response(status === 204 ? null : JSON.stringify(status < 400 ? {} : { error: { message: `google said ${status}` } }), { status });
  }) as typeof fetch;
  return calls;
}

const ID = eventIdFor('M1');

test('an existing event is patched, restored if removed, and old times are cleared', async () => {
  const calls = fakeGoogle(200);
  assert.equal(await upsertEvent('t', 'primary', 'M1', event), 'Update');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'PATCH');
  assert.equal(calls[0].url, `https://www.googleapis.com/calendar/v3/calendars/primary/events/${ID}`);
  assert.equal(calls[0].body.status, 'confirmed');
  assert.equal(calls[0].body.start.date, null);
  assert.equal(calls[0].body.start.dateTime, '2026-12-31T18:00:00');
});

test('an all-day update clears the old dateTime', async () => {
  const calls = fakeGoogle(200);
  await upsertEvent('t', 'primary', 'M1', calendarEvent(invoice({ evStart: '', evEnd: '' }))!);
  assert.deepEqual(calls[0].body.start, { date: '2026-12-31', dateTime: null, timeZone: null });
});

test('a missing event is created with the fixed ID', async () => {
  const calls = fakeGoogle(404, 200);
  assert.equal(await upsertEvent('t', 'a@b.c', 'M1', event), 'Tambah');
  assert.equal(calls[1].method, 'POST');
  assert.equal(calls[1].url, 'https://www.googleapis.com/calendar/v3/calendars/a%40b.c/events');
  assert.equal(calls[1].body.id, ID);
});

test('losing the race to another tab ends in an update, not a duplicate', async () => {
  const calls = fakeGoogle(404, 409, 200);
  assert.equal(await upsertEvent('t', 'primary', 'M1', event), 'Update');
  assert.deepEqual(calls.map(c => c.method), ['PATCH', 'POST', 'PATCH']);
});

test("Google's refusal reaches the caller", async () => {
  fakeGoogle(403);
  await assert.rejects(upsertEvent('t', 'primary', 'M1', event), /google said 403/);
  fakeGoogle(404, 400);
  await assert.rejects(upsertEvent('t', 'primary', 'M1', event), /google said 400/);
  fakeGoogle(500);
  await assert.rejects(removeEvent('t', 'primary', 'M1'), /google said 500/);
});

test('removing reports whether there was anything to remove', async () => {
  const calls = fakeGoogle(204, 404, 410);
  assert.equal(await removeEvent('t', 'primary', 'M1'), 'Hapus');
  assert.equal(await removeEvent('t', 'primary', 'M1'), 'Lewati');
  assert.equal(await removeEvent('t', 'primary', 'M1'), 'Lewati');
  assert.equal(calls[0].method, 'DELETE');
});
