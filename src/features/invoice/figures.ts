/**
 * The invoice's data shape and money rules. No browser APIs here, so the rules can be tested alone.
 * Field names match the old single-file app, so its backups import as they are and an existing
 * Google Apps Script keeps receiving the same payload.
 */

export interface LineItem {
  desc: string;
  qty: number;
  price: number;
  total: number;
}

export type PayStatus = 'Unpaid' | 'Partially Paid' | 'Paid';
export type EventStatus = 'Terjadwal' | 'Selesai' | 'Batal';
export type DiscountType = 'Rp' | '%';

export const EVENT_STATUSES: EventStatus[] = ['Terjadwal', 'Selesai', 'Batal'];
export const PAY_STATUSES: PayStatus[] = ['Unpaid', 'Partially Paid', 'Paid'];

/** What a person fills in. */
export interface InvoiceInput {
  invNum: string;
  invDate: string;
  invDue: string;
  evStatus: EventStatus;
  custName: string;
  custPhone: string;
  custEmail: string;
  evName: string;
  evDate: string;
  evLoc: string;
  evStart: string;
  evEnd: string;
  packageItems: LineItem[];
  addonItems: LineItem[];
  discVal: number;
  discType: DiscountType;
  taxPct: number;
  dpPaid: number;
  pelunasan: number;
  bankName: string;
  bankAcc: string;
  bankHolder: string;
  note: string;
}

/** A saved invoice: the input plus the figures worked out from it. */
export interface Invoice extends InvoiceInput {
  invStatus: PayStatus;
  subtotal: number;
  discount: number;
  grandTotal: number;
  sisa: number;
  createdAt: string;
  updatedAt: string;
}

export interface Figures {
  subtotal: number;
  discount: number;
  taxAmount: number;
  grandTotal: number;
  paid: number;
  sisa: number;
  overpaid: number;
  status: PayStatus;
}

export function computeFigures(i: Pick<InvoiceInput, 'packageItems' | 'addonItems' | 'discVal' | 'discType' | 'taxPct' | 'dpPaid' | 'pelunasan'>): Figures {
  const subtotal = [...i.packageItems, ...i.addonItems].reduce((sum, it) => sum + it.qty * it.price, 0);
  const rawDiscount = i.discType === '%' ? subtotal * (i.discVal / 100) : i.discVal;
  const discount = Math.min(Math.max(0, rawDiscount), subtotal);
  const afterDiscount = subtotal - discount;
  const taxAmount = afterDiscount * (i.taxPct / 100);
  const grandTotal = afterDiscount + taxAmount;
  const paid = i.dpPaid + i.pelunasan;
  const sisa = Math.max(0, grandTotal - paid);
  // Always derived from the money, so the badge on the PDF can never disagree with the balance
  const status: PayStatus = grandTotal > 0 && sisa <= 0 ? 'Paid' : paid > 0 ? 'Partially Paid' : 'Unpaid';
  return { subtotal, discount, taxAmount, grandTotal, paid, sisa, overpaid: Math.max(0, paid - grandTotal), status };
}

const isBlankItem = (it: LineItem) => !it.desc.trim() && !it.price;

/** Turns form input into the record that gets stored: blank rows dropped, figures recalculated. */
export function finalizeInvoice(input: InvoiceInput, createdAt: string, now: string): Invoice {
  const clean = (items: LineItem[]) =>
    items.filter(it => !isBlankItem(it)).map(it => ({ ...it, desc: it.desc.trim(), total: it.qty * it.price }));
  const packageItems = clean(input.packageItems);
  const addonItems = clean(input.addonItems);
  const f = computeFigures({ ...input, packageItems, addonItems });
  return {
    ...input,
    invNum: input.invNum.trim(),
    packageItems,
    addonItems,
    invStatus: f.status,
    subtotal: f.subtotal,
    discount: f.discount,
    grandTotal: f.grandTotal,
    sisa: f.sisa,
    createdAt,
    updatedAt: now
  };
}

// ------------------------------------------------------------------ import

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const nonNegative = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(str(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const items = (v: unknown): LineItem[] =>
  Array.isArray(v)
    ? v.map((it: any) => {
        const qty = nonNegative(it?.qty);
        const price = nonNegative(it?.price);
        return { desc: str(it?.desc), qty, price, total: qty * price };
      })
    : [];

/**
 * Reads one invoice from a backup file, which may come from the old app or be hand-edited. Anything
 * unusable becomes a safe default, and the status and totals are worked out again from the money.
 */
export function normalizeInvoice(key: string, raw: unknown, now: string): Invoice | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const invNum = (str(r.invNum) || key).trim();
  if (!invNum) return null;
  const hasDiscVal = r.discVal !== undefined && r.discVal !== '';
  const input: InvoiceInput = {
    invNum,
    invDate: str(r.invDate),
    invDue: str(r.invDue),
    evStatus: EVENT_STATUSES.includes(r.evStatus as EventStatus) ? (r.evStatus as EventStatus) : 'Terjadwal',
    custName: str(r.custName),
    custPhone: str(r.custPhone),
    custEmail: str(r.custEmail),
    evName: str(r.evName),
    evDate: str(r.evDate),
    evLoc: str(r.evLoc),
    evStart: str(r.evStart),
    evEnd: str(r.evEnd),
    packageItems: items(r.packageItems),
    addonItems: items(r.addonItems),
    discVal: nonNegative(hasDiscVal ? r.discVal : r.discount),
    discType: hasDiscVal && r.discType === '%' ? '%' : 'Rp',
    taxPct: nonNegative(r.taxPct ?? r.taxVal),
    dpPaid: nonNegative(r.dpPaid),
    pelunasan: nonNegative(r.pelunasan),
    bankName: str(r.bankName),
    bankAcc: str(r.bankAcc),
    bankHolder: str(r.bankHolder),
    note: str(r.note)
  };
  return finalizeInvoice(input, str(r.createdAt) || now, str(r.updatedAt) || now);
}

// ------------------------------------------------------------------ numbering and dates

export function nextInvoiceNumber(todayIso: string, existing: string[], lastSeq: number): string {
  const highest = existing.reduce((max, n) => {
    const m = /^MPB-\d{8}-(\d+)$/.exec(n);
    return m ? Math.max(max, Number(m[1])) : max;
  }, lastSeq);
  return `MPB-${todayIso.replace(/-/g, '')}-${String(highest + 1).padStart(3, '0')}`;
}

export function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return toIso(new Date(y, m - 1, d + days));
}

/** Whole days from today to a yyyy-mm-dd date; null when there is no date. */
export function daysUntil(iso: string, today: Date = new Date()): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round((new Date(y, m - 1, d).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 864e5);
}

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export function formatDate(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return MONTHS[m - 1] ? `${d} ${MONTHS[m - 1]} ${y}` : iso;
}

export function formatMoney(n: number): string {
  return 'Rp ' + Math.round(Number.isFinite(n) ? n : 0).toLocaleString('id-ID');
}

// ------------------------------------------------------------------ calendar month

export const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
export const isIsoMonth = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  return toIso(new Date(y, m - 1 + by, 1)).slice(0, 7);
}

export function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** Every date on a month's page, in whole weeks from Monday to Sunday: 28, 35 or 42 of them. */
export function monthGrid(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const before = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const days = new Date(y, m, 0).getDate();
  const cells = Math.ceil((before + days) / 7) * 7;
  return Array.from({ length: cells }, (_, i) => toIso(new Date(y, m - 1, 1 - before + i)));
}

export const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

export function weekday(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return WEEKDAYS[(new Date(y, m - 1, d).getDay() + 6) % 7];
}

// ------------------------------------------------------------------ Google Calendar

/** Used when an invoice has a start time but no end: Google rejects an event that ends as it starts. */
const DEFAULT_EVENT_HOURS = 3;

const eventTitle = (i: Pick<InvoiceInput, 'evName' | 'custName'>) => `Marka: ${i.evName || 'Event'} (${i.custName || 'Customer'})`;

/** When a timed event ends. An end time earlier than the start means the booth runs past midnight. */
function eventEnd(i: Pick<InvoiceInput, 'evDate' | 'evStart' | 'evEnd'>): { date: string; time: string } {
  if (i.evEnd && i.evEnd !== i.evStart) return { date: i.evEnd < i.evStart ? addDays(i.evDate, 1) : i.evDate, time: i.evEnd };
  const [h, m] = i.evStart.split(':');
  const hour = Number(h) + DEFAULT_EVENT_HOURS;
  return { date: hour >= 24 ? addDays(i.evDate, 1) : i.evDate, time: `${String(hour % 24).padStart(2, '0')}:${m}` };
}

/** Invoice numbers are free text, but a document id cannot contain "/", be ".", or look like __x__. */
export const invoiceDocId = (num: string) => encodeURIComponent(num).replace(/\./g, '%2E').replace(/_/g, '%5F');

export interface CalendarEvent {
  summary: string;
  description: string;
  location: string;
  start: { date: string } | { dateTime: string; timeZone: string };
  end: { date: string } | { dateTime: string; timeZone: string };
  reminders: { useDefault: false; overrides: Array<{ method: 'popup'; minutes: number }> };
}

/** The event an invoice should have on the calendar, or null when it should have none. */
export function calendarEvent(i: Invoice): CalendarEvent | null {
  if (!i.evDate || i.evStatus === 'Batal') return null;
  const timeZone = 'Asia/Jakarta';
  const end = i.evStart ? eventEnd(i) : null;
  const items = [...i.packageItems, ...i.addonItems].map(it => it.desc).filter(Boolean);
  return {
    summary: eventTitle(i),
    description: [
      `Invoice ${i.invNum}`,
      `Customer: ${i.custName}`,
      `HP: ${i.custPhone}`,
      ...(items.length ? [`Paket: ${items.join(', ')}`] : []),
      `Pembayaran: ${i.invStatus}, sisa ${formatMoney(i.sisa)}`
    ].join('\n'),
    location: i.evLoc,
    start: end ? { dateTime: `${i.evDate}T${i.evStart}:00`, timeZone } : { date: i.evDate },
    end: end ? { dateTime: `${end.date}T${end.time}:00`, timeZone } : { date: addDays(i.evDate, 1) },
    // The day before, and two hours before setup
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 24 * 60 }, { method: 'popup', minutes: 120 }] }
  };
}

/** Invoices whose saved version is not the one last sent, and what was sent for invoices now gone. */
export function invoicesToSync(invoices: Record<string, { updatedAt: string }>, synced: Record<string, string>): string[] {
  const changed = Object.keys(invoices).filter(num => synced[invoiceDocId(num)] !== invoices[num].updatedAt);
  const gone = Object.keys(synced).map(decodeURIComponent).filter(num => !Object.prototype.hasOwnProperty.call(invoices, num));
  return [...changed, ...gone];
}

/** A link that opens Google Calendar's "new event" page already filled in, in Jakarta time. */
export function calendarUrl(i: Pick<InvoiceInput, 'invNum' | 'custName' | 'custPhone' | 'evName' | 'evDate' | 'evLoc' | 'evStart' | 'evEnd'>): string | null {
  if (!i.evDate) return null;
  const day = i.evDate.replace(/-/g, '');
  let dates: string;
  if (i.evStart) {
    const end = eventEnd(i);
    dates = `${day}T${i.evStart.replace(':', '')}00/${end.date.replace(/-/g, '')}T${end.time.replace(':', '')}00`;
  } else {
    dates = `${day}/${addDays(i.evDate, 1).replace(/-/g, '')}`;
  }
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: eventTitle(i),
    dates,
    ctz: 'Asia/Jakarta',
    location: i.evLoc,
    details: `Invoice ${i.invNum}\nCustomer: ${i.custName}\nHP: ${i.custPhone}`
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
