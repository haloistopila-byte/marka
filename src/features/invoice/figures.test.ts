import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calendarUrl, computeFigures, daysUntil, finalizeInvoice, formatMonth, isIsoMonth, monthGrid, nextInvoiceNumber, normalizeInvoice, shiftMonth, weekday, type InvoiceInput } from './figures.ts';

const money = (over: Partial<InvoiceInput> = {}) => ({
  packageItems: [{ desc: 'Unlimited 3 Jam', qty: 1, price: 2800000, total: 2800000 }],
  addonItems: [{ desc: 'Backdrop', qty: 2, price: 100000, total: 200000 }],
  discVal: 0,
  discType: 'Rp' as const,
  taxPct: 0,
  dpPaid: 0,
  pelunasan: 0,
  ...over
});

test('grand total applies the discount before the tax', () => {
  const f = computeFigures(money({ discVal: 10, discType: '%', taxPct: 11 }));
  assert.equal(f.subtotal, 3000000);
  assert.equal(f.discount, 300000);
  assert.equal(Math.round(f.grandTotal), 2997000);
});

test('a discount larger than the subtotal stops at zero', () => {
  const f = computeFigures(money({ discVal: 9000000 }));
  assert.equal(f.discount, 3000000);
  assert.equal(f.grandTotal, 0);
});

test('status follows the money, including after a paid invoice grows', () => {
  assert.equal(computeFigures(money()).status, 'Unpaid');
  assert.equal(computeFigures(money({ dpPaid: 500000 })).status, 'Partially Paid');
  assert.equal(computeFigures(money({ dpPaid: 500000, pelunasan: 2500000 })).status, 'Paid');
  const grown = money({ dpPaid: 3000000, addonItems: [{ desc: 'Extra', qty: 1, price: 1200000, total: 1200000 }] });
  assert.equal(computeFigures(grown).status, 'Partially Paid');
  assert.equal(computeFigures(grown).sisa, 1000000);
});

test('overpayment is reported, the balance stays at zero', () => {
  const f = computeFigures(money({ dpPaid: 3500000 }));
  assert.equal(f.sisa, 0);
  assert.equal(f.overpaid, 500000);
});

test('finalize drops blank rows and recalculates line totals', () => {
  const inv = finalizeInvoice(
    { ...money(), addonItems: [{ desc: ' ', qty: 1, price: 0, total: 0 }], invNum: ' MPB-1 ' } as InvoiceInput,
    'a',
    'b'
  );
  assert.equal(inv.invNum, 'MPB-1');
  assert.equal(inv.addonItems.length, 0);
  assert.equal(inv.grandTotal, 2800000);
});

test('an old backup record imports, with its stale status corrected', () => {
  const inv = normalizeInvoice(
    'MPB-20260101-001',
    { custName: 'Ani', invStatus: 'Paid', discVal: '100000', discType: 'Rp', taxVal: '10', dpPaid: 500000, packageItems: [{ desc: 'Paket', qty: 1, price: 1100000 }] },
    'now'
  );
  assert.ok(inv);
  assert.equal(inv.invNum, 'MPB-20260101-001');
  assert.equal(inv.grandTotal, 1100000);
  assert.equal(inv.invStatus, 'Partially Paid');
  assert.equal(inv.evStatus, 'Terjadwal');
});

test('unusable backup entries are rejected, bad numbers become zero', () => {
  assert.equal(normalizeInvoice('x', 'teks', 'now'), null);
  assert.equal(normalizeInvoice('', {}, 'now'), null);
  assert.equal(normalizeInvoice('x', { dpPaid: -5, taxPct: 'abc' }, 'now')?.dpPaid, 0);
});

test('numbers continue past both the stored counter and existing invoices', () => {
  assert.equal(nextInvoiceNumber('2026-11-04', [], 0), 'MPB-20261104-001');
  assert.equal(nextInvoiceNumber('2026-11-04', ['MPB-20260101-007', 'CUSTOM'], 3), 'MPB-20261104-008');
  assert.equal(nextInvoiceNumber('2026-11-04', ['MPB-20260101-002'], 9), 'MPB-20261104-010');
});

test('daysUntil counts calendar days', () => {
  const today = new Date(2026, 10, 4, 23, 30);
  assert.equal(daysUntil('2026-11-04', today), 0);
  assert.equal(daysUntil('2026-11-07', today), 3);
  assert.equal(daysUntil('2026-11-01', today), -3);
  assert.equal(daysUntil('', today), null);
});

test('calendar link handles timed, overnight and all-day events', () => {
  const base = { invNum: 'M1', custName: 'Ani', custPhone: '08', evName: 'Wedding', evLoc: 'Hall', evDate: '2026-12-31', evStart: '', evEnd: '' };
  const dates = (u: string | null) => new URL(u!).searchParams.get('dates');
  assert.equal(calendarUrl({ ...base, evDate: '' }), null);
  assert.equal(dates(calendarUrl(base)), '20261231/20270101');
  assert.equal(dates(calendarUrl({ ...base, evStart: '18:00', evEnd: '21:00' })), '20261231T180000/20261231T210000');
  assert.equal(dates(calendarUrl({ ...base, evStart: '22:00', evEnd: '01:00' })), '20261231T220000/20270101T010000');
});

test('a month page runs in whole weeks from Monday to Sunday', () => {
  // November 2026 starts on a Sunday and ends on a Monday, so it needs six rows
  const nov = monthGrid('2026-11');
  assert.equal(nov.length, 42);
  assert.equal(nov[0], '2026-10-26');
  assert.equal(nov[6], '2026-11-01');
  assert.equal(nov[41], '2026-12-06');
  // February 2027 starts on a Monday and has exactly four weeks
  const feb = monthGrid('2027-02');
  assert.equal(feb.length, 28);
  assert.equal(feb[0], '2027-02-01');
  assert.equal(feb[27], '2027-02-28');
});

test('months step across a year and read in Indonesian', () => {
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(formatMonth('2026-11'), 'November 2026');
  assert.equal(weekday('2026-11-04'), 'Rab');
  assert.equal(weekday('2026-11-01'), 'Min');
  assert.equal(isIsoMonth('2026-11'), true);
  assert.equal(isIsoMonth('2026-13'), false);
  assert.equal(isIsoMonth('abc'), false);
});
