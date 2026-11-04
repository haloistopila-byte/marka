import crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { config } from '../config.ts';
import { isTeamEmail } from '../middleware/auth.ts';
import { adminDb } from './firebaseAdmin.ts';

/**
 * One Google account is connected once, from Pengaturan. Its refresh token stays in
 * server_private/google_calendar, which firestore.rules closes to every browser, so nobody has to
 * log in to Google again. Whether it is connected is published in app/calendar for the screens.
 */

const TOKEN_DOC = 'server_private/google_calendar';
export const STATUS_DOC = 'app/calendar';
const SCOPES = 'openid email https://www.googleapis.com/auth/calendar.events';
const STATE_TTL_MS = 10 * 60 * 1000;

export type ConnectError = 'expired' | 'cancelled' | 'exchange-failed' | 'no-refresh-token' | 'wrong-account';

interface StoredToken {
  refreshToken: string;
  accessToken: string;
  expiryDate: number;
  accountEmail: string;
}

function oauthClient() {
  const { clientId, clientSecret } = config.google;
  if (!clientId || !clientSecret) throw new Error('GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET belum diisi di server.');
  return { clientId, clientSecret };
}

const redirectUriFor = (origin: string) => config.google.redirectUri || `${origin}/auth/google/callback`;

const sign = (payload: string, secret: string) => crypto.createHmac('sha256', secret).update(payload).digest('base64url');

/** The state is signed rather than remembered, so a restart during the consent screen does not break it. */
export function createState(secret: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ exp: now + STATE_TTL_MS, nonce: crypto.randomBytes(12).toString('hex') })).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function isValidState(state: string | undefined, secret: string, now = Date.now()): boolean {
  const [payload, signature] = (state ?? '').split('.');
  if (!payload || !signature) return false;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return false;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > now;
  } catch {
    return false;
  }
}

/** Google's consent page. The chooser is forced because this laptop is signed in to several accounts. */
export function createConnectUrl(origin: string): string {
  const { clientId, clientSecret } = oauthClient();
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUriFor(origin),
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent select_account', // consent: Google only returns a refresh token on this screen
    login_hint: config.teamEmails[0],
    state: createState(clientSecret)
  });
}

function idTokenClaims(idToken: unknown): { email?: string; email_verified?: boolean } {
  if (typeof idToken !== 'string') return {};
  try {
    return JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

const revoke = (token: string) =>
  fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(token), { method: 'POST' }).catch(() => undefined);

/** Handles Google's redirect. Returns null once connected, or what went wrong. */
export async function completeConnect(origin: string, code: string | undefined, state: string | undefined): Promise<ConnectError | null> {
  const { clientId, clientSecret } = oauthClient();
  if (!isValidState(state, clientSecret)) return 'expired';
  if (!code) return 'cancelled';

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUriFor(origin), grant_type: 'authorization_code' })
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    console.error('[Calendar] Code exchange failed:', data.error, data.error_description);
    return 'exchange-failed';
  }
  // Came straight from Google over TLS, so the ID token needs no signature check here
  const claims = idTokenClaims(data.id_token);
  if (!isTeamEmail(claims.email, claims.email_verified)) {
    await revoke(data.refresh_token || data.access_token);
    return 'wrong-account';
  }
  if (!data.refresh_token) return 'no-refresh-token';

  const stored: StoredToken = {
    refreshToken: data.refresh_token,
    accessToken: data.access_token,
    expiryDate: Date.now() + (data.expires_in || 3600) * 1000,
    accountEmail: claims.email!
  };
  await adminDb().doc(TOKEN_DOC).set(stored);
  await adminDb().doc(STATUS_DOC).set({ connected: true, accountEmail: claims.email }, { merge: true });
  return null;
}

/** What was synced is forgotten too, so connecting again sends every invoice to the new connection. */
async function forgetConnection() {
  await adminDb().doc(TOKEN_DOC).delete();
  await adminDb().doc(STATUS_DOC).set({ connected: false, accountEmail: FieldValue.delete(), synced: FieldValue.delete() }, { merge: true });
}

export async function disconnect() {
  const data = (await adminDb().doc(TOKEN_DOC).get()).data() as StoredToken | undefined;
  if (data?.refreshToken) await revoke(data.refreshToken);
  await forgetConnection();
}

/**
 * A valid access token, refreshed when needed, or null when no account is connected. A token Google
 * has revoked ends the connection, so Pengaturan asks to connect again. Any other failure throws:
 * a Google outage must not look like a lost connection.
 */
export async function getCalendarAccessToken(): Promise<string | null> {
  const ref = adminDb().doc(TOKEN_DOC);
  const data = (await ref.get()).data() as StoredToken | undefined;
  if (!data?.refreshToken) return null;
  if (data.accessToken && Date.now() < data.expiryDate - 60_000) return data.accessToken;

  const { clientId, clientSecret } = oauthClient();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: data.refreshToken, grant_type: 'refresh_token' })
  });
  const body: any = await res.json().catch(() => ({}));
  if (body.error === 'invalid_grant') {
    console.warn('[Calendar] Google rejected the refresh token; connection cleared.');
    await forgetConnection();
    return null;
  }
  if (!res.ok || !body.access_token) throw new Error(`Gagal memperbarui token Google (HTTP ${res.status}).`);

  await ref.set({ accessToken: body.access_token, expiryDate: Date.now() + (body.expires_in || 3600) * 1000 }, { merge: true });
  return body.access_token;
}
