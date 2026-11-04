import React, { useEffect, useRef, useState } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarPlus, Eye, FileDown, Plus, Save, Send, X } from 'lucide-react';
import { Badge, Button, Dialog, EmptyState, Field, Input, MoneyInput, Notice, Page, PageHeader, Panel, Select, Textarea, cx } from '../../components/ui';
import { confirmDialog, notify } from '../../components/ui/feedback';
import { autoSendToGoogle, printInvoice, sendToGoogle } from './actions';
import { InvoiceDocument } from './InvoiceDocument';
import {
  EVENT_STATUSES,
  calendarUrl,
  computeFigures,
  formatMoney,
  type DiscountType,
  type EventStatus,
  type Invoice,
  type InvoiceInput,
  type LineItem
} from './figures.ts';
import { StorageFullError, blankInvoice, getInvoice, invoiceExists, saveInvoice, useSettings } from './store.ts';

export const PAY_TONE = { Unpaid: 'warn', 'Partially Paid': 'data', Paid: 'ok' } as const;

const ItemsEditor: React.FC<{ title: string; items: LineItem[]; onChange: (items: LineItem[]) => void }> = ({ title, items, onChange }) => {
  const patch = (i: number, p: Partial<LineItem>) => onChange(items.map((it, n) => (n === i ? { ...it, ...p } : it)));
  return (
    <Panel title={title} actions={<Button size="sm" icon={Plus} onClick={() => onChange([...items, { desc: '', qty: 1, price: 0, total: 0 }])}>Tambah item</Button>}>
      {items.length === 0 ? (
        <p className="text-[13px] text-ink-3">Belum ada item.</p>
      ) : (
        <div className="space-y-3">
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[1fr_72px_150px_110px_auto]">
              <Input aria-label={`${title} ${i + 1}: deskripsi`} placeholder="Deskripsi" value={it.desc} onChange={e => patch(i, { desc: e.target.value })} className="col-span-2 sm:col-span-1" />
              <Input
                aria-label={`${title} ${i + 1}: qty`}
                inputMode="numeric"
                className="num text-right"
                value={it.qty ? String(it.qty) : ''}
                onChange={e => patch(i, { qty: Number(e.target.value.replace(/\D/g, '')) || 0 })}
              />
              <MoneyInput aria-label={`${title} ${i + 1}: harga`} placeholder="0" value={it.price} onValueChange={price => patch(i, { price })} />
              <span className="num hidden text-right text-[14px] font-medium sm:block">{formatMoney(it.qty * it.price)}</span>
              <Button variant="ghost" size="sm" icon={X} aria-label={`Hapus ${it.desc || 'item'}`} onClick={() => onChange(items.filter((_, n) => n !== i))} />
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
};

const Row: React.FC<{ label: string; value: string; strong?: boolean; alert?: boolean }> = ({ label, value, strong, alert }) => (
  <div className={cx('flex justify-between gap-4 py-1.5 text-[14px]', strong && 'font-semibold')}>
    <span className={strong ? '' : 'text-ink-2'}>{label}</span>
    <span className={cx('num', alert && 'text-alert')}>{value}</span>
  </div>
);

const Form: React.FC<{ initial: InvoiceInput; originalNum?: string }> = ({ initial, originalNum }) => {
  const navigate = useNavigate();
  const settings = useSettings();
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [preview, setPreview] = useState(false);
  const [errors, setErrors] = useState<{ invNum?: string; custName?: string }>({});

  const set = <K extends keyof InvoiceInput>(key: K, value: InvoiceInput[K]) => setDraft(d => ({ ...d, [key]: value }));
  const bind = (key: 'invNum' | 'invDate' | 'invDue' | 'custName' | 'custPhone' | 'custEmail' | 'evName' | 'evDate' | 'evLoc' | 'evStart' | 'evEnd' | 'bankName' | 'bankAcc' | 'bankHolder' | 'note') => ({
    id: `f-${key}`,
    value: draft[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, e.target.value)
  });

  const f = computeFigures(draft);
  const dirty = JSON.stringify(draft) !== saved;

  // Leaving with unsaved changes asks first, whichever way the person leaves
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirtyRef.current && currentLocation.pathname !== nextLocation.pathname);
  const asking = useRef(false);
  useEffect(() => {
    if (blocker.state !== 'blocked' || asking.current) return;
    asking.current = true;
    confirmDialog({ title: 'Tinggalkan tanpa menyimpan?', body: 'Perubahan pada invoice ini akan hilang.', confirmLabel: 'Tinggalkan', cancelLabel: 'Tetap di sini', tone: 'danger' }).then(ok => {
      asking.current = false;
      if (ok) blocker.proceed();
      else blocker.reset();
    });
  }, [blocker]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  /** The one way to save, used by Simpan and Save to PDF alike. Returns the saved record, or null. */
  const persist = async (): Promise<Invoice | null> => {
    const num = draft.invNum.trim();
    const problems = { invNum: num ? undefined : 'Isi nomor invoice.', custName: draft.custName.trim() ? undefined : 'Isi nama customer.' };
    setErrors(problems);
    if (problems.invNum || problems.custName) {
      notify(problems.invNum || problems.custName!, 'alert');
      return null;
    }
    if (num !== originalNum && invoiceExists(num)) {
      const ok = await confirmDialog({ title: `Nomor ${num} sudah dipakai`, body: 'Invoice dengan nomor itu akan diganti dengan isi form ini.', confirmLabel: 'Ganti', tone: 'danger' });
      if (!ok) return null;
    }
    try {
      const rec = saveInvoice(draft, originalNum);
      dirtyRef.current = false;
      if (rec.invNum !== originalNum) {
        navigate(`/invoice/${encodeURIComponent(rec.invNum)}`, { replace: true });
      } else {
        setDraft(rec);
        setSaved(JSON.stringify(rec));
      }
      autoSendToGoogle(rec);
      return rec;
    } catch (err) {
      notify(err instanceof StorageFullError ? err.message : 'Gagal menyimpan invoice.', 'alert');
      return null;
    }
  };

  const onSave = async () => {
    if (await persist()) notify('Invoice tersimpan.', 'ok');
  };
  const onPdf = async () => {
    const rec = await persist();
    if (rec) {
      setPreview(false);
      await printInvoice(rec);
    }
  };
  const onSend = async () => {
    const rec = await persist();
    if (rec) await sendToGoogle(rec);
  };
  const calUrl = calendarUrl(draft);

  return (
    <Page narrow>
      <PageHeader
        title={originalNum ? `Invoice ${originalNum}` : 'Invoice baru'}
        description={dirty ? 'Ada perubahan yang belum disimpan.' : originalNum ? 'Semua perubahan sudah tersimpan.' : 'Belum disimpan.'}
        actions={
          <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate('/dashboard')}>
            Dashboard
          </Button>
        }
      />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <Panel title="Informasi invoice">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nomor invoice" htmlFor="f-invNum" error={errors.invNum} hint="Terisi otomatis, bisa diedit.">
                <Input {...bind('invNum')} />
              </Field>
              <Field label="Status event" htmlFor="f-evStatus">
                <Select id="f-evStatus" value={draft.evStatus} onChange={e => set('evStatus', e.target.value as EventStatus)}>
                  {EVENT_STATUSES.map(s => <option key={s}>{s}</option>)}
                </Select>
              </Field>
              <Field label="Tanggal invoice" htmlFor="f-invDate"><Input type="date" {...bind('invDate')} /></Field>
              <Field label="Jatuh tempo" htmlFor="f-invDue"><Input type="date" {...bind('invDue')} /></Field>
            </div>
          </Panel>

          <Panel title="Customer dan event">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nama customer" htmlFor="f-custName" error={errors.custName}><Input autoComplete="off" placeholder="Nama lengkap" {...bind('custName')} /></Field>
              <Field label="Nomor HP" htmlFor="f-custPhone"><Input type="tel" autoComplete="off" placeholder="08xx-xxxx-xxxx" {...bind('custPhone')} /></Field>
              <Field label="Email" htmlFor="f-custEmail" optional><Input type="email" autoComplete="off" placeholder="email@contoh.com" {...bind('custEmail')} /></Field>
              <Field label="Nama event" htmlFor="f-evName"><Input placeholder="Contoh: Wedding Reception" {...bind('evName')} /></Field>
              <Field label="Tanggal event" htmlFor="f-evDate"><Input type="date" {...bind('evDate')} /></Field>
              <Field label="Lokasi event" htmlFor="f-evLoc"><Input placeholder="Nama gedung atau alamat" {...bind('evLoc')} /></Field>
              <Field label="Jam mulai" htmlFor="f-evStart"><Input type="time" {...bind('evStart')} /></Field>
              <Field label="Jam selesai" htmlFor="f-evEnd"><Input type="time" {...bind('evEnd')} /></Field>
            </div>
          </Panel>

          <ItemsEditor title="Paket" items={draft.packageItems} onChange={v => set('packageItems', v)} />
          <ItemsEditor title="Add-on" items={draft.addonItems} onChange={v => set('addonItems', v)} />

          <Panel title="Metode pembayaran" description="QRIS dan nilai awal rekening diatur di Pengaturan.">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Bank" htmlFor="f-bankName"><Input {...bind('bankName')} /></Field>
              <Field label="Nomor rekening" htmlFor="f-bankAcc"><Input {...bind('bankAcc')} /></Field>
              <Field label="Atas nama" htmlFor="f-bankHolder"><Input {...bind('bankHolder')} /></Field>
            </div>
          </Panel>

          <Panel title="Catatan">
            <Textarea aria-label="Catatan" rows={4} id="f-note" value={draft.note} onChange={e => set('note', e.target.value)} />
          </Panel>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-5">
          <Panel title="Ringkasan" actions={<Badge tone={PAY_TONE[f.status]}>{f.status}</Badge>}>
            <Row label="Subtotal" value={formatMoney(f.subtotal)} />
            <div className="grid grid-cols-[1fr_72px] gap-2 py-1.5">
              {draft.discType === 'Rp' ? (
                <MoneyInput aria-label="Diskon" placeholder="Diskon" value={draft.discVal} onValueChange={v => set('discVal', v)} />
              ) : (
                <Input aria-label="Diskon persen" inputMode="decimal" placeholder="Diskon" className="num text-right" suffix="%" value={draft.discVal || ''} onChange={e => set('discVal', Math.min(100, parseFloat(e.target.value) || 0))} />
              )}
              <Select aria-label="Jenis diskon" value={draft.discType} onChange={e => setDraft(d => ({ ...d, discType: e.target.value as DiscountType, discVal: 0 }))}>
                <option value="Rp">Rp</option>
                <option value="%">%</option>
              </Select>
            </div>
            <div className="py-1.5">
              <Input aria-label="Pajak persen" inputMode="decimal" placeholder="Pajak" className="num text-right" suffix="%" value={draft.taxPct || ''} onChange={e => set('taxPct', Math.min(100, parseFloat(e.target.value) || 0))} />
            </div>
            <div className="mt-1 border-t border-rule pt-2">
              <Row label="Grand total" value={formatMoney(f.grandTotal)} strong />
            </div>
            <div className="mt-3 space-y-3 border-t border-rule pt-3">
              <Field label="DP sudah dibayar"><MoneyInput aria-label="DP sudah dibayar" placeholder="0" value={draft.dpPaid} onValueChange={v => set('dpPaid', v)} /></Field>
              <Field label="Pelunasan"><MoneyInput aria-label="Pelunasan" placeholder="0" value={draft.pelunasan} onValueChange={v => set('pelunasan', v)} /></Field>
            </div>
            <div className="mt-3 border-t border-rule pt-2">
              <Row label="Sisa tagihan" value={formatMoney(f.sisa)} strong alert={f.sisa > 0} />
            </div>
            {f.overpaid > 0 && <Notice tone="warn" className="mt-3">Pembayaran lebih {formatMoney(f.overpaid)} dari grand total.</Notice>}
          </Panel>

          <Panel>
            <div className="grid gap-2">
              <Button variant="primary" icon={Save} onClick={onSave}>Simpan</Button>
              <Button icon={Eye} onClick={() => setPreview(true)}>Preview</Button>
              <Button icon={FileDown} onClick={onPdf}>Simpan dan buat PDF</Button>
              {calUrl && (
                <a href={calUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-control bg-white text-[14px] font-medium text-ink transition-colors hover:bg-shell">
                  <CalendarPlus className="h-[17px] w-[17px]" strokeWidth={1.75} aria-hidden />
                  Tambah ke Google Calendar
                </a>
              )}
              {settings.webhookUrl && <Button icon={Send} onClick={onSend}>Simpan dan kirim ke Google</Button>}
            </div>
          </Panel>
        </aside>
      </div>

      <Dialog
        open={preview}
        onClose={() => setPreview(false)}
        title="Preview invoice"
        width={820}
        footer={
          <>
            <Button onClick={() => setPreview(false)}>Tutup</Button>
            <Button variant="primary" icon={FileDown} onClick={onPdf}>Simpan dan buat PDF</Button>
          </>
        }
      >
        <InvoiceDocument invoice={draft} qris={settings.qris} />
      </Dialog>
    </Page>
  );
};

/** /invoice/baru and /invoice/:num. Always reads fresh, so changes made on the dashboard show here. */
export const InvoiceFormView: React.FC = () => {
  const { num } = useParams();
  const navigate = useNavigate();
  const [initial] = useState<InvoiceInput | undefined>(() => (num ? getInvoice(num) : blankInvoice()));
  if (!initial) {
    return (
      <Page narrow>
        <EmptyState title="Invoice tidak ditemukan" description={`Tidak ada invoice dengan nomor ${num}.`} action={<Button onClick={() => navigate('/dashboard')}>Ke dashboard</Button>} />
      </Page>
    );
  }
  return <Form initial={initial} originalNum={num} />;
};
