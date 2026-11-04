import React from 'react';
import { computeFigures, formatDate, formatMoney, type InvoiceInput, type LineItem } from './figures.ts';
import './invoice.css';

const BADGE = { Unpaid: 'badge-unpaid', 'Partially Paid': 'badge-partial', Paid: 'badge-paid' } as const;

const ItemTable: React.FC<{ items: LineItem[] }> = ({ items }) => (
  <table className="inv-tbl">
    <thead>
      <tr>
        <th>#</th>
        <th>Deskripsi</th>
        <th>Qty</th>
        <th>Harga</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
      {items.map((it, i) => (
        <tr key={i}>
          <td>{i + 1}</td>
          <td>{it.desc || '—'}</td>
          <td>{it.qty}</td>
          <td>{formatMoney(it.price)}</td>
          <td>{formatMoney(it.qty * it.price)}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

/** The invoice as the customer sees it: the same sheet in the preview and on paper. */
export const InvoiceDocument: React.FC<{ invoice: InvoiceInput; qris?: string }> = ({ invoice: i, qris }) => {
  const f = computeFigures(i);
  const time = i.evStart || i.evEnd ? `${i.evStart}${i.evStart && i.evEnd ? ' – ' : ''}${i.evEnd} WIB` : '';
  const discountLabel = i.discType === '%' ? `-${i.discVal}% (${formatMoney(f.discount)})` : `-${formatMoney(f.discount)}`;
  return (
    <div className="inv">
      <div className="inv-header">
        <div className="inv-brand">
          <img src="/marka-logo.png" alt="Marka Photobooth" />
        </div>
        <div className="inv-meta">
          <div className={`inv-badge ${BADGE[f.status]}`}>{f.status}</div>
          <table className="inv-meta-tbl">
            <tbody>
              <tr><td>Invoice</td><td>{i.invNum || '—'}</td></tr>
              <tr><td>Tanggal</td><td>{formatDate(i.invDate)}</td></tr>
              <tr><td>Jatuh Tempo</td><td>{formatDate(i.invDue)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className="inv-divider" />
      <div className="inv-parties">
        <div>
          <div className="inv-label">Tagihan Kepada</div>
          <div className="inv-party-name">{i.custName || '—'}</div>
          <p>{i.custPhone || '—'}</p>
          {i.custEmail && <p>{i.custEmail}</p>}
        </div>
        <div>
          <div className="inv-label">Detail Event</div>
          <div className="inv-party-name">{i.evName || '—'}</div>
          <p>{formatDate(i.evDate)}</p>
          {time && <p>{time}</p>}
          <p>{i.evLoc || '—'}</p>
        </div>
      </div>
      <div className="inv-divider" />
      <div className="inv-label" style={{ margin: '14px 0 6px' }}>Paket</div>
      <ItemTable items={i.packageItems} />
      {i.addonItems.length > 0 && (
        <>
          <div className="inv-label" style={{ margin: '14px 0 6px' }}>Add-on</div>
          <ItemTable items={i.addonItems} />
        </>
      )}
      <div className="inv-totals">
        <div className="inv-totals-inner">
          <div className="inv-trow"><span>Subtotal</span><span>{formatMoney(f.subtotal)}</span></div>
          {f.discount > 0 && <div className="inv-trow"><span>Diskon</span><span>{discountLabel}</span></div>}
          {i.taxPct > 0 && <div className="inv-trow"><span>Pajak {i.taxPct}%</span><span>{formatMoney(f.taxAmount)}</span></div>}
          <div className="inv-trow grand"><span>Grand Total</span><span>{formatMoney(f.grandTotal)}</span></div>
        </div>
      </div>
      <div className="inv-payment">
        <div className="inv-label" style={{ marginBottom: 8 }}>Rincian Pembayaran</div>
        <div className="inv-prow"><span>DP Sudah Dibayar</span><span>{formatMoney(i.dpPaid)}</span></div>
        <div className="inv-prow"><span>Pelunasan</span><span>{formatMoney(i.pelunasan)}</span></div>
        <div className="inv-prow"><span>Sisa Tagihan</span><span>{formatMoney(f.sisa)}</span></div>
      </div>
      <div className="inv-bankqris">
        <div className="inv-bank">
          <div className="inv-label" style={{ marginBottom: 6 }}>Pembayaran Via</div>
          <p>{i.bankName || '—'}</p>
          <p>{i.bankAcc || '—'}</p>
          <p>{i.bankHolder || '—'}</p>
        </div>
        {qris && (
          <div className="inv-qris">
            <div className="inv-label" style={{ marginBottom: 6 }}>QRIS</div>
            <img src={qris} alt="QRIS" />
          </div>
        )}
      </div>
      {i.note.trim() && (
        <div className="inv-note">
          <div className="inv-label">Catatan</div>
          <div className="inv-note-text">{i.note.trim()}</div>
        </div>
      )}
      <div className="inv-divider" />
      <div className="inv-footer">
        <p className="inv-thanks">
          Terima kasih telah memilih <strong>Marka Photobooth</strong>.
          <br />
          Kami siap mengabadikan momen berharga Anda.
        </p>
      </div>
    </div>
  );
};
