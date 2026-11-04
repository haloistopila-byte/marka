import React, { useRef } from 'react';
import { Download, Trash2, Upload } from 'lucide-react';
import { Button, Field, Input, Page, PageHeader, Panel, Textarea, Toggle } from '../../components/ui';
import { confirmDialog, notify } from '../../components/ui/feedback';
import { toIso } from '../invoice/figures.ts';
import { StorageFullError, applyBackup, backupJson, parseBackup, updateSettings, useInvoices, useSettings, type Settings } from '../invoice/store.ts';

const MAX_QRIS_SIDE = 800;

/** Shrinks the QRIS image: browser storage is small, and a phone photo would fill it. */
async function shrinkImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_QRIS_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/png');
}

export const SettingsView: React.FC = () => {
  const settings = useSettings();
  const count = Object.keys(useInvoices()).length;
  const restoreInput = useRef<HTMLInputElement>(null);

  const change = (patch: Partial<Settings>) => {
    try {
      updateSettings(patch);
      return true;
    } catch (err) {
      notify(err instanceof StorageFullError ? err.message : 'Gagal menyimpan pengaturan.', 'alert');
      return false;
    }
  };

  const onQris = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      if (change({ qris: await shrinkImage(file) })) notify('QRIS tersimpan.', 'ok');
    } catch {
      notify('File itu tidak bisa dibaca sebagai gambar.', 'alert');
    }
  };

  const backup = () => {
    const url = URL.createObjectURL(new Blob([backupJson()], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `marka-backup-${toIso(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const restore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Cleared right away so the same file can be chosen again, even after cancelling
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = parseBackup(await file.text());
      if (!parsed.invoices.length) {
        notify('Tidak ada invoice di file itu.', 'alert');
        return;
      }
      const ok = await confirmDialog({
        title: `Pulihkan ${parsed.invoices.length} invoice?`,
        body: `Digabung dengan data yang ada. Invoice dengan nomor yang sama akan diganti.${parsed.settings ? ' Pengaturan juga diganti dari file ini.' : ''}${parsed.skipped ? ` ${parsed.skipped} entri rusak dilewati.` : ''}`,
        confirmLabel: 'Pulihkan'
      });
      if (!ok) return;
      applyBackup(parsed);
      notify(`${parsed.invoices.length} invoice dipulihkan.`, 'ok');
    } catch (err) {
      notify(err instanceof StorageFullError ? err.message : 'File backup tidak valid.', 'alert');
    }
  };

  const webhookInvalid = settings.webhookUrl.trim() !== '' && !settings.webhookUrl.trim().startsWith('https://');

  return (
    <Page narrow>
      <PageHeader title="Pengaturan" description="Perubahan tersimpan otomatis di browser ini." />

      <Panel title="Nilai awal invoice baru" description="Invoice yang sudah ada tidak berubah.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Bank" htmlFor="s-bank"><Input id="s-bank" value={settings.bankName} onChange={e => change({ bankName: e.target.value })} /></Field>
          <Field label="Nomor rekening" htmlFor="s-acc"><Input id="s-acc" value={settings.bankAcc} onChange={e => change({ bankAcc: e.target.value })} /></Field>
          <Field label="Atas nama" htmlFor="s-holder"><Input id="s-holder" value={settings.bankHolder} onChange={e => change({ bankHolder: e.target.value })} /></Field>
          <Field label="Catatan" htmlFor="s-note" className="sm:col-span-3"><Textarea id="s-note" rows={4} value={settings.note} onChange={e => change({ note: e.target.value })} /></Field>
        </div>
      </Panel>

      <Panel title="QRIS" description="Tampil di semua invoice selama gambarnya ada di sini.">
        <div className="flex flex-wrap items-center gap-4">
          {settings.qris && <img src={settings.qris} alt="QRIS saat ini" className="h-24 w-24 rounded-md border border-line bg-white object-contain" />}
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-control bg-white px-4 text-[14px] font-medium hover:bg-shell focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink">
              <Upload className="h-[17px] w-[17px]" strokeWidth={1.75} aria-hidden />
              {settings.qris ? 'Ganti gambar' : 'Upload gambar'}
              <input type="file" accept="image/*" className="sr-only" onChange={onQris} />
            </label>
            {settings.qris && <Button variant="ghost" icon={Trash2} onClick={() => change({ qris: '' })}>Hapus</Button>}
          </div>
        </div>
      </Panel>

      <Panel title="Google Sheets dan Calendar" description="Mengirim invoice ke web app Google Apps Script yang sudah Anda pasang.">
        <div className="space-y-3">
          <Field label="URL Apps Script Web App" htmlFor="s-hook" error={webhookInvalid ? 'URL harus diawali https://' : undefined}>
            <Input id="s-hook" placeholder="https://script.google.com/macros/s/xxxxx/exec" value={settings.webhookUrl} onChange={e => change({ webhookUrl: e.target.value })} />
          </Field>
          <Toggle label="Kirim otomatis" description="Setiap kali invoice disimpan atau ditandai lunas." checked={settings.autoSend} onChange={autoSend => change({ autoSend })} />
        </div>
      </Panel>

      <Panel title="Backup data" description={`${count} invoice tersimpan di browser ini. File backup juga berisi pengaturan dan QRIS. Restore menerima backup dari app lama.`}>
        <div className="flex flex-wrap gap-2">
          <Button icon={Download} onClick={backup}>Backup data</Button>
          <Button icon={Upload} onClick={() => restoreInput.current?.click()}>Restore data</Button>
          <input ref={restoreInput} type="file" accept=".json,application/json" className="hidden" onChange={restore} aria-label="File backup" />
        </div>
      </Panel>
    </Page>
  );
};
