import React, { useEffect, useState } from 'react';
import { LogIn, LogOut, RefreshCw } from 'lucide-react';
import { Button, Notice } from '../../components/ui';
import { connectStore, useStoreStatus } from '../invoice/store.ts';
import { signInWithGoogle, signOutUser, useSession } from './session.ts';

const Card: React.FC<{ title?: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="flex min-h-screen items-center justify-center p-5 font-ui text-ink">
    <div className="w-full max-w-sm space-y-4 rounded-lg border border-line bg-white p-6">
      <img src="/marka-logo.png" alt="Marka Photobooth" className="h-9 w-fit object-contain" />
      {title && <h1 className="text-[18px] font-semibold leading-6">{title}</h1>}
      {children}
    </div>
  </div>
);

const Loading: React.FC = () => (
  <Card>
    <p role="status" className="text-[14px] text-ink-2">Memuat data…</p>
  </Card>
);

const Login: React.FC = () => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const login = async () => {
    setBusy(true);
    setError(null);
    setError(await signInWithGoogle());
    setBusy(false);
  };
  return (
    <Card title="Masuk">
      <p className="text-[14px] text-ink-2">Dashboard dan invoice hanya untuk tim Marka Photobooth.</p>
      {error && <Notice tone="alert">{error}</Notice>}
      <Button variant="primary" icon={LogIn} className="w-full" disabled={busy} onClick={login}>
        {busy ? 'Menunggu Google…' : 'Masuk dengan Google'}
      </Button>
    </Card>
  );
};

/** Shows the app only to someone signed in whose account firestore.rules lets read the data. */
export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const session = useSession();
  const status = useStoreStatus();
  const uid = session.state === 'in' ? session.user.uid : null;

  useEffect(() => (uid ? connectStore() : undefined), [uid]);

  if (session.state === 'loading') return <Loading />;
  if (session.state === 'out') return <Login />;
  if (status === 'denied') {
    return (
      <Card title="Akun ini belum punya akses">
        <p className="text-[14px] text-ink-2">
          <span className="font-medium text-ink">{session.user.email}</span> belum terdaftar sebagai tim Marka. Minta admin menambahkannya, atau masuk dengan akun lain.
        </p>
        <Button icon={LogOut} className="w-full" onClick={signOutUser}>Keluar</Button>
      </Card>
    );
  }
  if (status === 'error') {
    return (
      <Card title="Data tidak bisa dimuat">
        <p className="text-[14px] text-ink-2">Cek koneksi internet, lalu muat ulang halaman.</p>
        <Button icon={RefreshCw} className="w-full" onClick={() => window.location.reload()}>Muat ulang</Button>
      </Card>
    );
  }
  if (status === 'loading') return <Loading />;
  return <>{children}</>;
};
