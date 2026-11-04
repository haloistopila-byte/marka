import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { Badge, Button, Dash, Dialog, EmptyState, Input, KpiStrip, Page, PageHeader, Panel, Select, table } from '../../components/ui';
import { confirmDialog, notify } from '../../components/ui/feedback';
import { autoSendToGoogle, printInvoice } from '../invoice/actions';
import { EVENT_STATUSES, PAY_STATUSES, daysUntil, formatDate, formatMoney, toIso, type EventStatus, type Invoice, type PayStatus } from '../invoice/figures.ts';
import { InvoiceDocument } from '../invoice/InvoiceDocument';
import { PAY_TONE } from '../invoice/InvoiceFormView';
import { StorageFullError, deleteInvoice, getInvoice, saveInvoice, useInvoices, useSettings } from '../invoice/store.ts';
import { loadSampleData } from './sampleData';

function failed(err: unknown) {
  notify(err instanceof StorageFullError ? err.message : 'Gagal menyimpan perubahan.', 'alert');
}

/** Upcoming events first, soonest on top; everything else after, most recent on top. */
function sortKey(r: Invoice): [number, number] {
  const d = daysUntil(r.evDate);
  return r.evStatus === 'Terjadwal' && d !== null && d >= 0 ? [0, d] : [1, d === null ? 99999 : -d];
}

const Countdown: React.FC<{ r: Invoice }> = ({ r }) => {
  const d = daysUntil(r.evDate);
  if (r.evStatus !== 'Terjadwal' || d === null) return null;
  if (d < 0) return <Badge tone="warn">Lewat {-d} hari</Badge>;
  const urgent = d <= 7 && r.sisa > 0;
  return <Badge tone={urgent ? 'alert' : 'neutral'}>{d === 0 ? 'Hari ini' : `H-${d}`}</Badge>;
};

export const DashboardView: React.FC = () => {
  const db = useInvoices();
  const settings = useSettings();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [pay, setPay] = useState<PayStatus | ''>('');
  const [ev, setEv] = useState<EventStatus | ''>('');
  const [previewNum, setPreviewNum] = useState<string | null>(null);

  const all = useMemo(() => Object.values(db), [db]);

  const stats = useMemo(() => {
    const month = toIso(new Date()).slice(0, 7);
    let upcoming = 0, thisMonth = 0, unpaid = 0, unpaidSum = 0, collected = 0;
    for (const r of all) {
      // Money received counts even for a cancelled event: the DP is not refunded
      collected += r.dpPaid + r.pelunasan;
      if (r.evStatus === 'Batal') continue;
      const d = daysUntil(r.evDate);
      if (r.evStatus !== 'Selesai' && d !== null && d >= 0) upcoming++;
      if (r.evDate.slice(0, 7) === month) thisMonth++;
      if (r.sisa > 0) {
        unpaid++;
        unpaidSum += r.sisa;
      }
    }
    return { upcoming, thisMonth, unpaid, unpaidSum, collected };
  }, [all]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter(r => (!pay || r.invStatus === pay) && (!ev || r.evStatus === ev))
      .filter(r => !needle || [r.invNum, r.custName, r.evName, r.evLoc, r.custPhone].join(' ').toLowerCase().includes(needle))
      .sort((a, b) => {
        const x = sortKey(a), y = sortKey(b);
        return x[0] - y[0] || x[1] - y[1];
      });
  }, [all, q, pay, ev]);

  const setEventStatus = (num: string, evStatus: EventStatus) => {
    const r = getInvoice(num);
    if (!r) return;
    try {
      saveInvoice({ ...r, evStatus }, num);
      notify('Status event diperbarui.', 'ok');
    } catch (err) {
      failed(err);
    }
  };

  const markPaid = async (num: string) => {
    const r = getInvoice(num);
    if (!r) return;
    const ok = await confirmDialog({ title: `Tandai ${num} lunas?`, body: `Sisa ${formatMoney(r.sisa)} dicatat sebagai pelunasan.`, confirmLabel: 'Tandai lunas' });
    if (!ok) return;
    try {
      const rec = saveInvoice({ ...r, pelunasan: r.pelunasan + r.sisa }, num);
      notify('Invoice ditandai lunas.', 'ok');
      autoSendToGoogle(rec);
    } catch (err) {
      failed(err);
    }
  };

  const remove = async (num: string) => {
    const ok = await confirmDialog({ title: `Hapus invoice ${num}?`, body: 'Tidak bisa dibatalkan. Data yang sudah terkirim ke Google tidak ikut terhapus.', confirmLabel: 'Hapus', tone: 'danger' });
    if (!ok) return;
    try {
      deleteInvoice(num);
      notify('Invoice dihapus.', 'ok');
    } catch (err) {
      failed(err);
    }
  };

  const previewing = previewNum ? db[previewNum] : undefined;

  return (
    <Page>
      <PageHeader
        title="Dashboard"
        description="Event dan invoice Marka Photobooth."
        actions={<Button variant="primary" icon={Plus} onClick={() => navigate('/invoice/baru')}>Invoice baru</Button>}
      />
      <KpiStrip
        items={[
          { label: 'Event mendatang', value: stats.upcoming, hint: 'Belum selesai' },
          { label: 'Event bulan ini', value: stats.thisMonth, hint: 'Tanpa event batal' },
          { label: 'Belum lunas', value: stats.unpaid, hint: `Sisa ${formatMoney(stats.unpaidSum)}`, tone: stats.unpaid ? 'alert' : 'default' },
          { label: 'Terkumpul', value: formatMoney(stats.collected), hint: 'Termasuk DP event batal' }
        ]}
      />
      <Panel flush>
        <div className="flex flex-col gap-2 p-4 sm:flex-row sm:p-5">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" strokeWidth={1.75} aria-hidden />
            <Input aria-label="Cari invoice" placeholder="Cari customer, event, atau nomor invoice" className="pl-9" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <Select aria-label="Filter pembayaran" wrapperClassName="sm:w-48" value={pay} onChange={e => setPay(e.target.value as PayStatus | '')}>
            <option value="">Semua pembayaran</option>
            {PAY_STATUSES.map(s => <option key={s}>{s}</option>)}
          </Select>
          <Select aria-label="Filter status event" wrapperClassName="sm:w-48" value={ev} onChange={e => setEv(e.target.value as EventStatus | '')}>
            <option value="">Semua status event</option>
            {EVENT_STATUSES.map(s => <option key={s}>{s}</option>)}
          </Select>
        </div>
        {rows.length === 0 ? (
          <div className="px-4 pb-5 sm:px-5">
            {all.length ? (
              <EmptyState title="Tidak ada invoice yang cocok" description="Ubah pencarian atau filter." />
            ) : (
              <EmptyState
                title="Belum ada invoice"
                description="Buat invoice pertama, atau pulihkan backup dari app lama di Pengaturan."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button variant="primary" icon={Plus} onClick={() => navigate('/invoice/baru')}>Invoice baru</Button>
                    {import.meta.env.DEV && <Button onClick={loadSampleData}>Muat data contoh</Button>}
                  </div>
                }
              />
            )}
          </div>
        ) : (
          <div className={table.wrap}>
            <table className={table.table}>
              <thead>
                <tr>
                  <th className={table.th}>Event</th>
                  <th className={table.th}>Customer</th>
                  <th className={table.th}>Invoice</th>
                  <th className={table.th}>Pembayaran</th>
                  <th className={table.th}>Status event</th>
                  <th className={table.th}><span className="sr-only">Aksi</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.invNum} className={table.tr}>
                    <td className={`${table.td} py-2.5`}>
                      <p className="font-medium">{r.evName || <Dash />}</p>
                      <p className="whitespace-nowrap text-[12px] text-ink-3">
                        {formatDate(r.evDate)}
                        {r.evStart && `, ${r.evStart}${r.evEnd ? `–${r.evEnd}` : ''}`}
                      </p>
                      {r.evLoc && <p className="text-[12px] text-ink-3">{r.evLoc}</p>}
                    </td>
                    <td className={table.td}>
                      <p className="min-w-[110px]">{r.custName || <Dash />}</p>
                      <p className="whitespace-nowrap text-[12px] text-ink-3">{r.custPhone}</p>
                    </td>
                    <td className={table.td}>
                      <Link className="whitespace-nowrap underline-offset-4 hover:underline" to={`/invoice/${encodeURIComponent(r.invNum)}`}>{r.invNum}</Link>
                      <p className="num text-[12px] text-ink-3">{formatMoney(r.grandTotal)}</p>
                    </td>
                    <td className={table.td}>
                      <Badge tone={PAY_TONE[r.invStatus]}>{r.invStatus}</Badge>
                      <p className="num mt-0.5 whitespace-nowrap text-[12px] text-ink-3">Sisa {formatMoney(r.sisa)}</p>
                    </td>
                    <td className={table.td}>
                      <div className="flex items-center gap-2">
                        <Select aria-label={`Status event ${r.invNum}`} wrapperClassName="w-[124px]" className="h-8 text-[13px]" value={r.evStatus} onChange={e => setEventStatus(r.invNum, e.target.value as EventStatus)}>
                          {EVENT_STATUSES.map(s => <option key={s}>{s}</option>)}
                        </Select>
                        <Countdown r={r} />
                      </div>
                    </td>
                    <td className={table.td}>
                      <div className="flex justify-end gap-1">
                        <Button size="sm" onClick={() => navigate(`/invoice/${encodeURIComponent(r.invNum)}`)}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => setPreviewNum(r.invNum)}>Preview</Button>
                        {r.sisa > 0 && r.evStatus !== 'Batal' && <Button size="sm" variant="ghost" onClick={() => markPaid(r.invNum)}>Lunas</Button>}
                        <Button size="sm" variant="ghost" className="text-alert hover:text-alert" onClick={() => remove(r.invNum)}>Hapus</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <p className="text-[12px] text-ink-3">
        Data tersimpan di browser ini saja. <Link to="/pengaturan" className="underline underline-offset-4">Backup secara berkala</Link>, terutama sebelum membersihkan data browser.
      </p>

      <Dialog
        open={Boolean(previewing)}
        onClose={() => setPreviewNum(null)}
        title="Preview invoice"
        width={820}
        footer={
          <>
            <Button onClick={() => setPreviewNum(null)}>Tutup</Button>
            <Button variant="primary" onClick={() => previewing && printInvoice(previewing)}>Buat PDF</Button>
          </>
        }
      >
        {previewing && <InvoiceDocument invoice={previewing} qris={settings.qris} />}
      </Dialog>
    </Page>
  );
};
