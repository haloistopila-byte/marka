import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarCheck, RefreshCw, Unplug } from 'lucide-react';
import { Badge, Button, Field, Input, Notice, Panel, Toggle } from '../../components/ui';
import { confirmDialog, notify } from '../../components/ui/feedback';
import { updateSettings, useCalendarStatus, useSettings } from '../invoice/store.ts';
import { connectCalendar, disconnectCalendar, syncAll, useCalendarProgress } from './sync.ts';

/** Why connecting failed. The server sends a code, so a crafted link cannot put its own words on screen. */
const CONNECT_ERRORS: Record<string, string> = {
  expired: 'Sesi otorisasi kedaluwarsa. Ulangi dari tombol Hubungkan.',
  cancelled: 'Otorisasi Google dibatalkan.',
  'exchange-failed': 'Google menolak otorisasi ini. Coba lagi.',
  'no-refresh-token': 'Google tidak memberi izin jangka panjang. Cabut akses app ini di myaccount.google.com, lalu ulangi.',
  'wrong-account': 'Akun Google itu bukan akun tim Marka. Ulangi dan pilih akun Marka.'
};

const formatTime = (iso: string) => new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

export const CalendarPanel: React.FC = () => {
  const calendar = useCalendarStatus();
  const settings = useSettings();
  const progress = useCalendarProgress();
  const [busy, setBusy] = useState(false);
  const [params, setParams] = useSearchParams();

  const connectedParam = params.get('calendar_connected');
  const errorParam = params.get('calendar_error');
  useEffect(() => {
    if (!connectedParam && !errorParam) return;
    if (connectedParam) notify('Google Calendar terhubung.', 'ok');
    else notify(CONNECT_ERRORS[errorParam!] ?? 'Gagal menghubungkan Google Calendar.', 'alert');
    setParams({}, { replace: true });
  }, [connectedParam, errorParam, setParams]);

  const connect = async () => {
    setBusy(true);
    try {
      await connectCalendar();
    } catch (err) {
      notify((err as Error).message, 'alert');
      setBusy(false);
    }
  };

  const disconnect = async () => {
    const ok = await confirmDialog({
      title: 'Putuskan Google Calendar?',
      body: 'Sinkron berhenti. Event yang sudah ada di Google Calendar tetap ada.',
      confirmLabel: 'Putuskan',
      tone: 'danger'
    });
    if (!ok) return;
    setBusy(true);
    try {
      await disconnectCalendar();
      notify('Google Calendar diputuskan.', 'ok');
    } catch (err) {
      notify((err as Error).message, 'alert');
    } finally {
      setBusy(false);
    }
  };

  const syncing = progress.total > 0;

  return (
    <Panel title="Google Calendar" description="Event dari invoice masuk ke kalender satu akun Google, untuk semua akun tim.">
      {!calendar.connected ? (
        <div className="space-y-3">
          <p className="text-[14px] text-ink-2">Cukup dihubungkan sekali. Pilih akun Google Marka di halaman persetujuan.</p>
          <Button variant="primary" icon={CalendarCheck} disabled={busy} onClick={connect}>Hubungkan Akun Google</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <Notice tone="ok">Terhubung ke {calendar.accountEmail}.</Notice>
          <Toggle
            label="Sinkron otomatis"
            description="Saat invoice disimpan, event ikut diperbarui. Event dihapus kalau invoice dihapus, dibatalkan, atau tanggalnya dikosongkan."
            checked={settings.calendarAutoSync}
            onChange={calendarAutoSync => updateSettings({ calendarAutoSync })}
          />
          <Field label="ID kalender" htmlFor="s-calendar" hint="Kosongkan untuk kalender utama akun. Setelah mengganti, tekan Sinkron semua. Event lama tetap di kalender lama.">
            <Input id="s-calendar" placeholder="primary" value={settings.calendarId} onChange={e => updateSettings({ calendarId: e.target.value })} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button icon={RefreshCw} disabled={syncing} onClick={syncAll}>
              {syncing ? `Menyinkronkan ${progress.done + 1}/${progress.total}` : 'Sinkron semua'}
            </Button>
            <Button variant="ghost" icon={Unplug} disabled={busy} onClick={disconnect}>Putuskan</Button>
          </div>
          {calendar.log.length > 0 && (
            <div>
              <h3 className="mb-2 text-[13px] font-medium text-ink-2">Sinkron terakhir</h3>
              <ul className="divide-y divide-line">
                {calendar.log.map(entry => (
                  <li key={`${entry.at}-${entry.invNum}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-2 text-[13px]">
                    <Badge tone={entry.ok ? 'ok' : 'alert'}>{entry.ok ? entry.action : 'Gagal'}</Badge>
                    <span className="font-medium">{entry.invNum}</span>
                    <span className="min-w-0 flex-1 basis-40 break-words text-ink-2">{entry.detail}</span>
                    <span className="text-ink-3">{formatTime(entry.at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
};
