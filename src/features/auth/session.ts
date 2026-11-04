import { useSyncExternalStore } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { clearIndexedDbPersistence, terminate, waitForPendingWrites } from 'firebase/firestore';
import { auth, db, googleProvider } from '../../lib/firebase.ts';
import { flushSettings } from '../invoice/store.ts';

export type Session = { state: 'loading' } | { state: 'out' } | { state: 'in'; user: User };

let session: Session = { state: 'loading' };
const listeners = new Set<() => void>();

onAuthStateChanged(auth, user => {
  session = user ? { state: 'in', user } : { state: 'out' };
  listeners.forEach(l => l());
});

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const useSession = () => useSyncExternalStore(subscribe, () => session);

/** Opens Google's account picker. Returns a message to show, or null when there is nothing to say. */
export async function signInWithGoogle(): Promise<string | null> {
  try {
    await signInWithPopup(auth, googleProvider);
    return null;
  } catch (err) {
    switch ((err as { code?: string }).code) {
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
        return null;
      case 'auth/popup-blocked':
        return 'Jendela login diblokir browser. Izinkan pop-up untuk situs ini, lalu coba lagi.';
      case 'auth/unauthorized-domain':
        return `Domain ${window.location.hostname} belum didaftarkan di Firebase Authentication.`;
      case 'auth/network-request-failed':
        return 'Tidak ada koneksi internet. Coba lagi.';
      default:
        console.error('[Auth] Sign-in failed:', err);
        return 'Gagal masuk. Coba lagi.';
    }
  }
}

const WAIT_FOR_SYNC_MS = 3000;

/**
 * Signs out and removes the customer data cached on this device. If saves are still queued because
 * the connection is down, the cache stays: they are sent when this account next signs in.
 */
export async function signOutUser() {
  flushSettings();
  const synced = await Promise.race([
    waitForPendingWrites(db).then(() => true),
    new Promise<boolean>(resolve => setTimeout(() => resolve(false), WAIT_FOR_SYNC_MS))
  ]);
  await signOut(auth);
  if (synced) {
    await terminate(db);
    // Fails while another tab is open; the cache then stays until a later sign-out
    await clearIndexedDbPersistence(db).catch(() => undefined);
  }
  window.location.reload();
}
