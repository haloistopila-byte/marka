import { useSyncExternalStore } from 'react';
import { notify } from '../../components/ui/feedback';
import { auth } from '../../lib/firebase.ts';
import { invoicesToSync } from '../invoice/figures.ts';
import { getCalendarStatus, getInvoices, getSettings, isCaughtUpWithServer, subscribeStore } from '../invoice/store.ts';

/**
 * Keeps Google Calendar in line with the invoices. The server notes in app/calendar which version of
 * each invoice it last synced, and anything else is sent again. That one comparison also covers
 * saves from another device, restores, renames, deletes, and saves made offline in a tab since closed.
 */

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function callApi(path: string, body: object = {}) {
  const user = auth.currentUser;
  if (!user) throw new ApiError('Sesi login tidak ditemukan. Silakan login ulang.', 401);
  const res = await fetch(`/api/calendar/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new ApiError(data.error || `Server menolak permintaan (HTTP ${res.status}).`, res.status);
  return data;
}

// ------------------------------------------------------------------ queue

/** The server answers 502 when Google refused one invoice. Anything else would fail for the rest too. */
const ONE_INVOICE_FAILED = 502;

const queue = new Set<string>();
// The version tried in this session, so a refused invoice does not repeat on every snapshot
const tried = new Map<string, string>();
let draining = false;

export interface CalendarProgress {
  done: number;
  total: number;
}
const IDLE: CalendarProgress = { done: 0, total: 0 };
let progress = IDLE;
const progressListeners = new Set<() => void>();

function setProgress(next: CalendarProgress) {
  progress = next;
  progressListeners.forEach(l => l());
}

export const useCalendarProgress = () =>
  useSyncExternalStore(
    listener => {
      progressListeners.add(listener);
      return () => progressListeners.delete(listener);
    },
    () => progress
  );

/** One at a time: Google limits the request rate and the server writes each result to one document. */
async function drain() {
  if (draining) return;
  draining = true;
  let done = 0;
  let failed = 0;
  let lastError = '';
  for (const invNum of queue) {
    // Out of the queue before the request: an edit arriving during it must queue the invoice again
    queue.delete(invNum);
    setProgress({ done, total: done + 1 + queue.size });
    try {
      await callApi('sync', { invNum });
    } catch (err) {
      failed += 1;
      lastError = (err as Error).message;
      console.error('[Calendar] Sync failed:', invNum, err);
      if (!(err instanceof ApiError) || err.status !== ONE_INVOICE_FAILED) queue.clear();
    }
    done += 1;
  }
  draining = false;
  setProgress(IDLE);
  if (failed) notify(`Sinkron Google Calendar gagal (${failed} invoice): ${lastError}`, 'alert');
}

function enqueue(nums: string[]) {
  if (!nums.length) return;
  const invoices = getInvoices();
  for (const num of nums) {
    tried.set(num, invoices[num]?.updatedAt ?? '');
    queue.add(num);
  }
  void drain();
}

function syncWhatChanged() {
  const { connected, synced } = getCalendarStatus();
  // Until the server has a save, it would read the old invoice
  if (!connected || !getSettings().calendarAutoSync || !isCaughtUpWithServer()) return;
  const invoices = getInvoices();
  enqueue(invoicesToSync(invoices, synced).filter(num => tried.get(num) !== (invoices[num]?.updatedAt ?? '')));
}

/** Runs while someone is signed in. Returns the function that stops it. */
export function startCalendarSync() {
  const stop = subscribeStore(syncWhatChanged);
  syncWhatChanged();
  return () => {
    stop();
    queue.clear();
    tried.clear();
  };
}

// ------------------------------------------------------------------ what Pengaturan calls

/** Sends everything again, including what failed before and deleted invoices' leftover events. */
export function syncAll(): number {
  const nums = [...new Set([...Object.keys(getInvoices()), ...invoicesToSync({}, getCalendarStatus().synced)])];
  enqueue(nums);
  return nums.length;
}

/** Leaves the page for Google's consent screen. */
export async function connectCalendar() {
  const { url } = await callApi('connect');
  window.location.assign(url);
}

export async function disconnectCalendar() {
  queue.clear();
  tried.clear();
  await callApi('disconnect');
}
