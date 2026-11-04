import fs from 'fs';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { config } from '../config.ts';

function adminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const file = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || (file && fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_FILE belum diisi di server.');
  let parsed: { project_id?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    // The parser's message can contain fragments of the private key, so it is never shown
    throw new Error('Isi service account bukan JSON yang valid.');
  }
  // This laptop also holds keys of another company's project, whose data must never be touched
  if (parsed.project_id !== config.firebaseProjectId) {
    throw new Error(`Service account harus milik project ${config.firebaseProjectId}.`);
  }
  return initializeApp({ credential: cert(parsed as object) });
}

export const adminDb = () => getFirestore(adminApp());

/** The caller of an "Authorization: Bearer <Firebase ID token>" header, or null when it is not valid. */
export async function verifyCaller(header: string | undefined): Promise<DecodedIdToken | null> {
  const idToken = header?.startsWith('Bearer ') ? header.slice(7) : '';
  if (!idToken) return null;
  const auth = getAuth(adminApp()); // Outside the try: a server without its key must not look like a bad login
  try {
    return await auth.verifyIdToken(idToken, true);
  } catch {
    return null;
  }
}
