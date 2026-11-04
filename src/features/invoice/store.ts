import { useSyncExternalStore } from 'react';
import { finalizeInvoice, nextInvoiceNumber, normalizeInvoice, toIso, type Invoice, type InvoiceInput } from './figures.ts';

/**
 * Local storage for this phase: everything lives in this browser. Screens only use the functions
 * below, so Firestore can replace them later without touching the screens.
 */

const KEY_INVOICES = 'marka_invoices';
const KEY_DAMAGED = 'marka_invoices_rusak';
const KEY_SEQ = 'marka_seq';
const KEY_SETTINGS = 'marka_settings';

export interface Settings {
  bankName: string;
  bankAcc: string;
  bankHolder: string;
  note: string;
  qris: string;
  webhookUrl: string;
  autoSend: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  bankName: 'BCA',
  bankAcc: '7265279911',
  bankHolder: 'BENNI SETIAWAN',
  note: '• Pelunasan maksimal H-3 sebelum hari H (keterlambatan pembayaran akan dikenakan denda).\n• DP akan hangus jika acara batal secara sepihak dan tidak dapat dikembalikan.',
  qris: '',
  webhookUrl: '',
  autoSend: false
};

export class StorageFullError extends Error {
  constructor() {
    super('Penyimpanan browser penuh. Data belum tersimpan.');
  }
}

type InvoiceMap = Record<string, Invoice>;

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    throw new StorageFullError();
  }
}

function readInvoices(): InvoiceMap {
  const raw = localStorage.getItem(KEY_INVOICES);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as InvoiceMap;
  } catch {
    // Keep the damaged text: the next save would otherwise replace it with a nearly empty list
    try {
      localStorage.setItem(KEY_DAMAGED, raw);
      localStorage.removeItem(KEY_INVOICES);
    } catch {}
    return {};
  }
}

function readSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY_SETTINGS) || '{}') };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const readSeq = () => Number(localStorage.getItem(KEY_SEQ)) || 0;

// ------------------------------------------------------------------ subscriptions

let invoicesCache: InvoiceMap | null = null;
let settingsCache: Settings | null = null;
const listeners = new Set<() => void>();

function changed() {
  invoicesCache = null;
  settingsCache = null;
  listeners.forEach(l => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Another tab saved: show its changes here as well
if (typeof window !== 'undefined') window.addEventListener('storage', changed);

const invoiceSnapshot = () => (invoicesCache ??= readInvoices());
const settingsSnapshot = () => (settingsCache ??= readSettings());

export const useInvoices = () => useSyncExternalStore(subscribe, invoiceSnapshot);
export const useSettings = () => useSyncExternalStore(subscribe, settingsSnapshot);
export const getSettings = settingsSnapshot;

// ------------------------------------------------------------------ invoices

export const getInvoice = (num: string): Invoice | undefined => {
  const db = readInvoices();
  return Object.prototype.hasOwnProperty.call(db, num) ? db[num] : undefined;
};

export const invoiceExists = (num: string) => getInvoice(num) !== undefined;

/** Saves an invoice, re-reading first so a save in another tab is not lost. */
export function saveInvoice(input: InvoiceInput, originalNum?: string): Invoice {
  const db = readInvoices();
  const now = new Date().toISOString();
  const num = input.invNum.trim();
  const createdAt = db[num]?.createdAt || (originalNum && db[originalNum]?.createdAt) || now;
  const record = finalizeInvoice(input, createdAt, now);
  if (originalNum && originalNum !== num) delete db[originalNum];
  db[num] = record;
  write(KEY_INVOICES, JSON.stringify(db));
  const match = /^MPB-\d{8}-(\d+)$/.exec(num);
  if (match && Number(match[1]) > readSeq()) write(KEY_SEQ, match[1]);
  changed();
  return record;
}

export function deleteInvoice(num: string) {
  const db = readInvoices();
  delete db[num];
  write(KEY_INVOICES, JSON.stringify(db));
  changed();
}

/** A new invoice's starting values. Saved only when the person presses Simpan. */
export function blankInvoice(): InvoiceInput {
  const s = readSettings();
  const today = toIso(new Date());
  const due = new Date();
  due.setDate(due.getDate() + 3);
  return {
    invNum: nextInvoiceNumber(today, Object.keys(readInvoices()), readSeq()),
    invDate: today,
    invDue: toIso(due),
    evStatus: 'Terjadwal',
    custName: '',
    custPhone: '',
    custEmail: '',
    evName: '',
    evDate: '',
    evLoc: '',
    evStart: '',
    evEnd: '',
    packageItems: [{ desc: 'Unlimited 3 Jam', qty: 1, price: 2800000, total: 2800000 }],
    addonItems: [
      { desc: 'Backdrop', qty: 1, price: 100000, total: 100000 },
      { desc: 'Break 1 Jam', qty: 1, price: 150000, total: 150000 }
    ],
    discVal: 0,
    discType: 'Rp',
    taxPct: 0,
    dpPaid: 0,
    pelunasan: 0,
    bankName: s.bankName,
    bankAcc: s.bankAcc,
    bankHolder: s.bankHolder,
    note: s.note
  };
}

// ------------------------------------------------------------------ settings

export function updateSettings(patch: Partial<Settings>) {
  write(KEY_SETTINGS, JSON.stringify({ ...readSettings(), ...patch }));
  changed();
}

// ------------------------------------------------------------------ backup

export function backupJson(): string {
  return JSON.stringify({ app: 'marka-photobooth', version: 1, exportedAt: new Date().toISOString(), invoices: readInvoices(), settings: readSettings(), seq: readSeq() }, null, 1);
}

export interface ParsedBackup {
  invoices: Invoice[];
  skipped: number;
  settings: Partial<Settings> | null;
  seq: number;
}

/** Reads a backup of this app or of the old single-file app. Throws on a file that is neither. */
export function parseBackup(text: string): ParsedBackup {
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Format tidak dikenali');
  const isNew = data.app === 'marka-photobooth';
  const source: Record<string, unknown> = isNew ? data.invoices || {} : data;
  const now = new Date().toISOString();
  const invoices: Invoice[] = [];
  let skipped = 0;
  for (const key of Object.keys(source)) {
    const inv = normalizeInvoice(key, source[key], now);
    if (inv) invoices.push(inv);
    else skipped += 1;
  }
  let settings: Partial<Settings> | null = null;
  if (isNew && data.settings && typeof data.settings === 'object') {
    const s = data.settings;
    settings = {};
    for (const k of ['bankName', 'bankAcc', 'bankHolder', 'note'] as const) if (typeof s[k] === 'string') settings[k] = s[k];
    if (typeof s.qris === 'string' && s.qris.startsWith('data:image/')) settings.qris = s.qris;
    if (typeof s.webhookUrl === 'string' && (s.webhookUrl === '' || s.webhookUrl.startsWith('https://'))) settings.webhookUrl = s.webhookUrl;
    if (typeof s.autoSend === 'boolean') settings.autoSend = s.autoSend;
  }
  return { invoices, skipped, settings, seq: isNew ? Number(data.seq) || 0 : 0 };
}

/** Merges a backup in. Invoices with the same number are replaced. */
export function applyBackup(b: ParsedBackup) {
  const db = readInvoices();
  for (const inv of b.invoices) db[inv.invNum] = inv;
  write(KEY_INVOICES, JSON.stringify(db));
  if (b.seq > readSeq()) write(KEY_SEQ, String(b.seq));
  if (b.settings) write(KEY_SETTINGS, JSON.stringify({ ...readSettings(), ...b.settings }));
  changed();
}
