import { initializeApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

/**
 * Web config of the Marka Firebase project. These values only name the project and are public in
 * every browser that loads the app: access to the data is decided by firestore.rules.
 */
const firebaseConfig = {
  apiKey: 'AIzaSyAsIJ6bs5nuCCQUqItqRaEPPrHVFmZbvzs',
  authDomain: 'marka-96250.firebaseapp.com',
  projectId: 'marka-96250',
  storageBucket: 'marka-96250.firebasestorage.app',
  messagingSenderId: '585252026076',
  appId: '1:585252026076:web:29fbf04fe86c4e57f1a619',
  measurementId: 'G-9PH6BEK2FD'
};

export const firebaseApp = initializeApp(firebaseConfig);

export const auth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// The on-device cache keeps a save made on a bad connection queued until it reaches the server
export const db = initializeFirestore(firebaseApp, {
  ignoreUndefinedProperties: true,
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
