import { Router } from 'express';
import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { calendarEvent, invoiceDocId, type Invoice } from '../../src/features/invoice/figures.ts';
import { requireTeam } from '../middleware/auth.ts';
import { removeEvent, upsertEvent, type CalendarAction } from '../services/calendarApi.ts';
import { adminDb } from '../services/firebaseAdmin.ts';
import { STATUS_DOC, completeConnect, createConnectUrl, disconnect, getCalendarAccessToken } from '../services/googleCalendarAuth.ts';

const MAX_LOG = 20;
const SETTINGS_PATH = '/pengaturan';

interface LogEntry {
  at: string;
  invNum: string;
  custName: string;
  action: CalendarAction;
  ok: boolean;
  detail: string;
}

// req.host honours X-Forwarded-Host because 'trust proxy' is on
const originOf = (req: Request) => `${req.protocol}://${req.host}`;

/** Notes the result in app/calendar, which every open screen is already listening to. */
async function record(invNum: string, syncedVersion: string | null | undefined, entry: LogEntry | null) {
  const ref = adminDb().doc(STATUS_DOC);
  await adminDb().runTransaction(async tx => {
    const data = (await tx.get(ref)).data();
    tx.set(
      ref,
      {
        ...(syncedVersion !== undefined && { synced: { [invoiceDocId(invNum)]: syncedVersion ?? FieldValue.delete() } }),
        ...(entry && { log: [entry, ...(data?.log ?? [])].slice(0, MAX_LOG) })
      },
      { merge: true }
    );
  });
}

/** Mounted at /api/calendar */
export const router = Router();

/** Mounted at /, because Google redirects to the exact address registered in Google Cloud. */
export const oauthCallbackRouter = Router();

router.post('/connect', requireTeam, (req: Request, res: Response) => {
  try {
    res.json({ success: true, url: createConnectUrl(originOf(req)) });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

oauthCallbackRouter.get('/auth/google/callback', async (req: Request, res: Response) => {
  const text = (v: unknown) => (typeof v === 'string' ? v : undefined);
  let error: string | null;
  try {
    error = await completeConnect(originOf(req), text(req.query.code), text(req.query.state));
  } catch (err) {
    console.error('[Calendar] Connecting failed:', err);
    error = 'exchange-failed';
  }
  res.redirect(`${SETTINGS_PATH}?${error ? `calendar_error=${error}` : 'calendar_connected=1'}`);
});

router.post('/disconnect', requireTeam, async (_req: Request, res: Response) => {
  await disconnect();
  res.json({ success: true });
});

/**
 * Makes the calendar match one invoice, as Firestore has it now. The browser only names the invoice,
 * and one route covers every case: a saved invoice gets its event, while a cancelled, undated,
 * renamed or deleted one loses it. Asking twice is harmless.
 */
router.post('/sync', requireTeam, async (req: Request, res: Response) => {
  const invNum = typeof req.body?.invNum === 'string' ? req.body.invNum.trim() : '';
  if (!invNum) {
    res.status(400).json({ success: false, error: 'Nomor invoice kosong.' });
    return;
  }

  const invoice = (await adminDb().doc(`invoices/${invoiceDocId(invNum)}`).get()).data() as Invoice | undefined;
  const log = (action: CalendarAction, ok: boolean, detail: string): LogEntry => ({
    at: new Date().toISOString(),
    invNum,
    custName: invoice?.custName ?? '',
    action,
    ok,
    detail
  });
  const event = invoice ? calendarEvent(invoice) : null;

  try {
    const token = await getCalendarAccessToken();
    if (!token) {
      res.status(409).json({ success: false, error: 'Google Calendar belum terhubung.' });
      return;
    }
    // Read here, never from the request: the token must not be pointed at a calendar the team did not choose
    const saved = (await adminDb().doc('app/settings').get()).data()?.calendarId;
    const calendarId = (typeof saved === 'string' && saved.trim()) || 'primary';

    const action = event ? await upsertEvent(token, calendarId, invNum, event) : await removeEvent(token, calendarId, invNum);
    const detail = event ? `${event.summary}` : invoice ? 'Event batal atau belum bertanggal.' : 'Invoice dihapus atau diganti nomornya.';
    await record(invNum, invoice ? invoice.updatedAt : null, action === 'Lewati' ? null : log(action, true, detail));
    res.json({ success: true, action });
  } catch (err) {
    const message = (err as Error).message;
    console.error(`[Calendar] Sync of ${invNum} failed:`, message);
    await record(invNum, undefined, log(event ? 'Update' : 'Hapus', false, message)).catch(() => undefined);
    res.status(502).json({ success: false, error: message });
  }
});
