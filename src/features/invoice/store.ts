import { useSyncExternalStore } from 'react';
import { collection, doc, onSnapshot, setDoc, writeBatch, type FirestoreError } from 'firebase/firestore';
import { notify } from '../../components/ui/feedback';
import { db } from '../../lib/firebase.ts';
import { finalizeInvoice, nextInvoiceNumber, normalizeInvoice, toIso, type Invoice, type InvoiceInput } from './figures.ts';

/**
 * Firestore, behind the same synchronous functions the screens always used. Live listeners keep a
 * copy in memory: reads come from it, and a write changes it at once and goes to the server behind
 * the scenes. The SDK takes back a write the server refuses, and writeFailed tells the person.
 *
 *   invoices/{number}   one document per invoice
 *   app/settings        bank details, note, Apps Script
 *   app/qris            the image, on its own because a document holds at most 1 MB
 *   app/counters        the last invoice number used
 */

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
  // Rekening diisi di Pengaturan, supaya tidak masuk ke repo
  bankName: '',
  bankAcc: '',
  bankHolder: '',
  note: '• Pelunasan maksimal H-3 sebelum hari H (keterlambatan pembayaran akan dikenakan denda).\n• DP akan hangus jika acara batal secara sepihak dan tidak dapat dikembalikan.',
  qris: '',
  webhookUrl: '',
  autoSend: false
};

/** Leaves room under Firestore's 1 MB document limit. */
export const MAX_QRIS_CHARS = 1_000_000;

export class StorageFullError extends Error {
  constructor(message = 'Data terlalu besar untuk disimpan.') {
    super(message);
  }
}

export type StoreStatus = 'loading' | 'ready' | 'denied' | 'error';
type InvoiceMap = Record<string, Invoice>;

const invoicesRef = collection(db, 'invoices');
const appRef = collection(db, 'app');
const settingsDoc = doc(appRef, 'settings');
const qrisDoc = doc(appRef, 'qris');
const countersDoc = doc(appRef, 'counters');

/** Invoice numbers are free text, but a document id cannot contain "/", be ".", or look like __x__. */
const invoiceDoc = (num: string) => doc(invoicesRef, encodeURIComponent(num).replace(/\./g, '%2E').replace(/_/g, '%5F'));

// ------------------------------------------------------------------ live copy of the data

let status: StoreStatus = 'loading';
let invoices: InvoiceMap = {};
let savedSettings: Partial<Settings> = {};
// Typed but not sent yet: an incoming snapshot must not undo what the person is typing
let unsentSettings: Partial<Settings> = {};
let qris = '';
let seq = 0;
let settings: Settings = DEFAULT_SETTINGS;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function rebuildSettings() {
  settings = { ...DEFAULT_SETTINGS, ...savedSettings, ...unsentSettings, qris };
}

function writeFailed(err: unknown) {
  console.error('[Firestore] Write failed:', err);
  notify('Perubahan gagal tersimpan ke server dan dibatalkan. Cek koneksi atau hak akses akun ini.', 'alert');
}

function clearData() {
  invoices = {};
  savedSettings = {};
  unsentSettings = {};
  qris = '';
  seq = 0;
  rebuildSettings();
}

/** Starts the live listeners after login. Returns the function that stops them. */
export function connectStore() {
  let haveInvoices = false;
  let haveApp = false;
  const arrived = () => {
    if (status === 'loading' && haveInvoices && haveApp) status = 'ready';
    emit();
  };
  const refused = (err: FirestoreError) => {
    console.error('[Firestore] Listener stopped:', err);
    clearData();
    status = err.code === 'permission-denied' ? 'denied' : 'error';
    emit();
  };

  const stopInvoices = onSnapshot(
    invoicesRef,
    snap => {
      invoices = Object.fromEntries(
        snap.docs.map(d => {
          const inv = d.data() as Invoice;
          return [inv.invNum, inv];
        })
      );
      haveInvoices = true;
      arrived();
    },
    refused
  );
  const stopApp = onSnapshot(
    appRef,
    snap => {
      const data = (name: string) => snap.docs.find(d => d.id === name)?.data();
      savedSettings = (data('settings') as Partial<Settings>) ?? {};
      qris = String(data('qris')?.image ?? '');
      seq = Number(data('counters')?.seq) || 0;
      rebuildSettings();
      haveApp = true;
      arrived();
    },
    refused
  );
  const flushWhenHidden = () => {
    if (document.visibilityState === 'hidden') flushSettings();
  };
  document.addEventListener('visibilitychange', flushWhenHidden);

  return () => {
    flushSettings();
    document.removeEventListener('visibilitychange', flushWhenHidden);
    stopInvoices();
    stopApp();
    clearData();
    status = 'loading';
    emit();
  };
}

const statusSnapshot = () => status;
const invoiceSnapshot = () => invoices;
const settingsSnapshot = () => settings;

export const useStoreStatus = () => useSyncExternalStore(subscribe, statusSnapshot);
export const useInvoices = () => useSyncExternalStore(subscribe, invoiceSnapshot);
export const useSettings = () => useSyncExternalStore(subscribe, settingsSnapshot);
export const getSettings = settingsSnapshot;

// ------------------------------------------------------------------ invoices

export const getInvoice = (num: string): Invoice | undefined =>
  Object.prototype.hasOwnProperty.call(invoices, num) ? invoices[num] : undefined;

export const invoiceExists = (num: string) => getInvoice(num) !== undefined;

export function saveInvoice(input: InvoiceInput, originalNum?: string): Invoice {
  const now = new Date().toISOString();
  const num = input.invNum.trim();
  const createdAt = getInvoice(num)?.createdAt || (originalNum && getInvoice(originalNum)?.createdAt) || now;
  const record = finalizeInvoice(input, createdAt, now);
  const renamed = originalNum && originalNum !== num ? originalNum : null;

  const next = { ...invoices, [num]: record };
  const batch = writeBatch(db);
  batch.set(invoiceDoc(num), record);
  if (renamed) {
    delete next[renamed];
    batch.delete(invoiceDoc(renamed));
  }
  const match = /^MPB-\d{8}-(\d+)$/.exec(num);
  if (match && Number(match[1]) > seq) {
    seq = Number(match[1]);
    batch.set(countersDoc, { seq }, { merge: true });
  }
  invoices = next;
  batch.commit().catch(writeFailed);
  emit();
  return record;
}

export function deleteInvoice(num: string) {
  const next = { ...invoices };
  delete next[num];
  const batch = writeBatch(db);
  batch.delete(invoiceDoc(num));
  invoices = next;
  batch.commit().catch(writeFailed);
  emit();
}

/** A new invoice's starting values. Saved only when the person presses Simpan. */
export function blankInvoice(): InvoiceInput {
  const today = toIso(new Date());
  const due = new Date();
  due.setDate(due.getDate() + 3);
  return {
    invNum: nextInvoiceNumber(today, Object.keys(invoices), seq),
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
    bankName: settings.bankName,
    bankAcc: settings.bankAcc,
    bankHolder: settings.bankHolder,
    note: settings.note
  };
}

// ------------------------------------------------------------------ settings

const SETTINGS_WRITE_DELAY_MS = 800;
let settingsTimer: ReturnType<typeof setTimeout> | undefined;

/** Sends what was typed. Settings save on every keystroke, and Firestore bills per write. */
export function flushSettings() {
  clearTimeout(settingsTimer);
  if (!Object.keys(unsentSettings).length) return;
  const patch = unsentSettings;
  unsentSettings = {};
  savedSettings = { ...savedSettings, ...patch };
  setDoc(settingsDoc, patch, { merge: true }).catch(writeFailed);
}

export function updateSettings(patch: Partial<Settings>) {
  const { qris: image, ...rest } = patch;
  if (image !== undefined) {
    if (image.length > MAX_QRIS_CHARS) throw new StorageFullError('Gambar QRIS terlalu besar. Pakai gambar yang lebih kecil.');
    qris = image;
    setDoc(qrisDoc, { image }).catch(writeFailed);
  }
  if (Object.keys(rest).length) {
    unsentSettings = { ...unsentSettings, ...rest };
    clearTimeout(settingsTimer);
    settingsTimer = setTimeout(flushSettings, SETTINGS_WRITE_DELAY_MS);
  }
  rebuildSettings();
  emit();
}

// ------------------------------------------------------------------ backup

export function backupJson(): string {
  return JSON.stringify({ app: 'marka-photobooth', version: 1, exportedAt: new Date().toISOString(), invoices, settings, seq }, null, 1);
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
  const parsed: Invoice[] = [];
  let skipped = 0;
  for (const key of Object.keys(source)) {
    const inv = normalizeInvoice(key, source[key], now);
    if (inv) parsed.push(inv);
    else skipped += 1;
  }
  let parsedSettings: Partial<Settings> | null = null;
  if (isNew && data.settings && typeof data.settings === 'object') {
    const s = data.settings;
    parsedSettings = {};
    for (const k of ['bankName', 'bankAcc', 'bankHolder', 'note'] as const) if (typeof s[k] === 'string') parsedSettings[k] = s[k];
    if (typeof s.qris === 'string' && s.qris.startsWith('data:image/')) parsedSettings.qris = s.qris;
    if (typeof s.webhookUrl === 'string' && (s.webhookUrl === '' || s.webhookUrl.startsWith('https://'))) parsedSettings.webhookUrl = s.webhookUrl;
    if (typeof s.autoSend === 'boolean') parsedSettings.autoSend = s.autoSend;
  }
  return { invoices: parsed, skipped, settings: parsedSettings, seq: isNew ? Number(data.seq) || 0 : 0 };
}

const BATCH_SIZE = 400; // Firestore takes at most 500 writes in one batch

/** Merges a backup in. Invoices with the same number are replaced. Resolves once the server has it. */
export async function applyBackup(b: ParsedBackup) {
  if (b.settings) updateSettings(b.settings);
  flushSettings();

  const commits: Promise<void>[] = [];
  for (let i = 0; i < b.invoices.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const inv of b.invoices.slice(i, i + BATCH_SIZE)) batch.set(invoiceDoc(inv.invNum), inv);
    commits.push(batch.commit());
  }
  if (b.seq > seq) {
    seq = b.seq;
    commits.push(setDoc(countersDoc, { seq }, { merge: true }));
  }
  invoices = { ...invoices, ...Object.fromEntries(b.invoices.map(inv => [inv.invNum, inv])) };
  emit();
  await Promise.all(commits);
}

// ------------------------------------------------------------------ data from the localStorage version

const LEGACY_INVOICES = 'marka_invoices';
const LEGACY_SETTINGS = 'marka_settings';
const LEGACY_SEQ = 'marka_seq';

/** What the app saved in this browser before Firestore. Null when there is nothing readable. */
export function readLegacyData(): ParsedBackup | null {
  try {
    const rawInvoices = localStorage.getItem(LEGACY_INVOICES);
    const rawSettings = localStorage.getItem(LEGACY_SETTINGS);
    if (!rawInvoices && !rawSettings) return null;
    return parseBackup(
      JSON.stringify({
        app: 'marka-photobooth',
        invoices: rawInvoices ? JSON.parse(rawInvoices) : {},
        settings: rawSettings ? JSON.parse(rawSettings) : null,
        seq: Number(localStorage.getItem(LEGACY_SEQ)) || 0
      })
    );
  } catch {
    return null;
  }
}

/**
 * Sends this browser's old data to Firestore without overwriting newer work: an invoice goes up
 * only if it is missing or newer there, a setting only if it is still empty there. The old data is
 * kept under a new name once the server has it, so it is not offered again and can still be rescued.
 */
export async function moveLegacyData(b: ParsedBackup): Promise<{ moved: number; qrisTooBig: boolean }> {
  const newer = b.invoices.filter(inv => {
    const current = getInvoice(inv.invNum);
    return !current || inv.updatedAt > current.updatedAt;
  });
  const saved: Partial<Settings> = { ...savedSettings, qris };
  const empty = Object.fromEntries(Object.entries(b.settings ?? {}).filter(([k]) => !saved[k as keyof Settings])) as Partial<Settings>;
  const qrisTooBig = (empty.qris?.length ?? 0) > MAX_QRIS_CHARS;
  if (qrisTooBig) delete empty.qris;

  await applyBackup({ ...b, invoices: newer, settings: empty });

  for (const key of [LEGACY_INVOICES, LEGACY_SETTINGS, LEGACY_SEQ]) {
    const value = localStorage.getItem(key);
    if (value === null) continue;
    // Removed first: a second copy of a full store would not fit
    localStorage.removeItem(key);
    localStorage.setItem(`${key}_dipindah`, value);
  }
  return { moved: newer.length, qrisTooBig };
}
