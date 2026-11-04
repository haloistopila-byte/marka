import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Badge, Button, EmptyState, Page, PageHeader, Panel, TextButton, cx } from '../../components/ui';
import { Countdown } from '../dashboard/DashboardView';
import { WEEKDAYS, formatDate, formatMonth, isIsoDate, isIsoMonth, monthGrid, shiftMonth, toIso, weekday, type EventStatus, type Invoice } from '../invoice/figures.ts';
import { PAY_TONE } from '../invoice/InvoiceFormView';
import { useInvoices } from '../invoice/store.ts';

const STATUS_TONE = { Terjadwal: 'data', Selesai: 'ok', Batal: 'neutral' } as const;

const STATUS_CHIP: Record<EventStatus, string> = {
  Terjadwal: 'bg-data-soft text-data',
  Selesai: 'bg-ok-bg text-ok-ink',
  Batal: 'bg-chip text-ink-2 line-through'
};

const STATUS_DOT: Record<EventStatus, string> = {
  Terjadwal: 'bg-data',
  Selesai: 'bg-ok',
  Batal: 'bg-ink-3'
};

/** How many events a day cell shows before it says "+N lagi". */
const CELL_LIMIT = 3;

const eventName = (r: Invoice) => r.evName || r.custName || r.invNum;
const eventTime = (r: Invoice) => (r.evStart ? `${r.evStart}${r.evEnd ? `–${r.evEnd}` : ''}` : '');
const invoicePath = (r: Invoice) => `/invoice/${encodeURIComponent(r.invNum)}`;

const EventRow: React.FC<{ r: Invoice }> = ({ r }) => (
  <li className="border-t border-rule">
    <Link to={invoicePath(r)} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[#fafaf8] sm:items-center sm:px-5">
      <div className="w-9 shrink-0 text-center">
        <p className="text-[12px] leading-4 text-ink-3">{weekday(r.evDate)}</p>
        <p className="num text-[18px] font-semibold leading-6">{Number(r.evDate.slice(8))}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className={cx('break-words font-medium', r.evStatus === 'Batal' && 'text-ink-2 line-through')}>{eventName(r)}</p>
        <p className="text-[12px] text-ink-3">{[eventTime(r), r.custName, r.evLoc].filter(Boolean).join(' · ')}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-1.5">
        <Countdown r={r} />
        <Badge tone={STATUS_TONE[r.evStatus]}>{r.evStatus}</Badge>
        <Badge tone={PAY_TONE[r.invStatus]}>{r.invStatus}</Badge>
      </div>
    </Link>
  </li>
);

/** A month on one page, and the list of what happens in it. Each dated invoice is one project. */
export const CalendarView: React.FC = () => {
  const db = useInvoices();
  const navigate = useNavigate();
  const today = toIso(new Date());
  const [params, setParams] = useSearchParams();
  const asked = params.get('bulan') ?? '';
  // Kept in the URL, so coming back from an invoice lands on the same month
  const month = isIsoMonth(asked) ? asked : today.slice(0, 7);
  const [picked, setPicked] = useState<string | null>(null);
  const selected = picked?.startsWith(month) ? picked : null;

  const goTo = (next: string) => setParams({ bulan: next }, { replace: true });

  const all = useMemo(() => Object.values(db), [db]);
  const undated = all.filter(r => !isIsoDate(r.evDate) && r.evStatus !== 'Batal').length;

  const events = useMemo(
    () =>
      all
        .filter(r => isIsoDate(r.evDate) && r.evDate.startsWith(`${month}-`))
        .sort((a, b) => a.evDate.localeCompare(b.evDate) || a.evStart.localeCompare(b.evStart) || eventName(a).localeCompare(eventName(b))),
    [all, month]
  );

  const byDay = useMemo(() => {
    const days = new Map<string, Invoice[]>();
    for (const r of events) days.set(r.evDate, [...(days.get(r.evDate) ?? []), r]);
    return days;
  }, [events]);

  const grid = useMemo(() => monthGrid(month), [month]);
  const breakdown = (Object.keys(STATUS_DOT) as EventStatus[])
    .map(s => [events.filter(r => r.evStatus === s).length, s.toLowerCase()] as const)
    .filter(([n]) => n > 0)
    .map(([n, s]) => `${n} ${s}`)
    .join(', ');
  const listed = selected ? byDay.get(selected) ?? [] : events;

  return (
    <Page>
      <PageHeader
        title="Kalender"
        description={
          events.length
            ? `${events.length} project di ${formatMonth(month)}: ${breakdown}.`
            : `Belum ada project di ${formatMonth(month)}.`
        }
        actions={<Button variant="primary" icon={Plus} onClick={() => navigate('/invoice/baru')}>Invoice baru</Button>}
      />

      <Panel flush>
        <div className="flex items-center gap-1.5 p-4 sm:px-5">
          <h2 className="mr-auto text-[15px] font-semibold leading-6" aria-live="polite">{formatMonth(month)}</h2>
          {month !== today.slice(0, 7) && <Button size="sm" onClick={() => goTo(today.slice(0, 7))}>Bulan ini</Button>}
          <Button size="sm" icon={ChevronLeft} aria-label="Bulan sebelumnya" onClick={() => goTo(shiftMonth(month, -1))} />
          <Button size="sm" icon={ChevronRight} aria-label="Bulan berikutnya" onClick={() => goTo(shiftMonth(month, 1))} />
        </div>

        <div className="grid grid-cols-7 border-t border-line" aria-hidden>
          {WEEKDAYS.map(d => <p key={d} className="py-1.5 text-center text-[12px] text-ink-3">{d}</p>)}
        </div>
        <div className="grid grid-cols-7 gap-px border-y border-line bg-line">
          {grid.map(date => {
            if (!date.startsWith(month)) {
              return <div key={date} className="min-h-14 bg-shell p-1 text-[12px] leading-6 text-ink-3 md:min-h-28 md:p-1.5">
                <span className="num block w-6 text-center">{Number(date.slice(8))}</span>
              </div>;
            }
            const day = byDay.get(date) ?? [];
            const isSelected = selected === date;
            return (
              <div key={date} className="relative min-h-14 min-w-0 bg-white md:min-h-28">
                <button
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`${formatDate(date)}, ${day.length} project`}
                  onClick={() => setPicked(isSelected ? null : date)}
                  className={cx('absolute inset-0 transition-colors hover:bg-[#fafaf8] focus-visible:-outline-offset-2', isSelected && 'ring-2 ring-inset ring-ink')}
                />
                <div className="pointer-events-none relative p-1 md:p-1.5">
                  <span className={cx('num block h-6 w-6 rounded-full text-center text-[12px] leading-6', date === today ? 'bg-night font-medium text-white' : 'text-ink')}>
                    {Number(date.slice(8))}
                  </span>
                  {/* On a phone a cell is too narrow for names: dots here, names in the list below */}
                  <div className="mt-1 flex flex-wrap justify-center gap-0.5 md:hidden">
                    {day.map(r => <span key={r.invNum} className={cx('h-1.5 w-1.5 rounded-full', STATUS_DOT[r.evStatus])} />)}
                  </div>
                  <div className="mt-1 hidden space-y-0.5 md:block">
                    {day.slice(0, CELL_LIMIT).map(r => (
                      <Link
                        key={r.invNum}
                        to={invoicePath(r)}
                        title={`${eventName(r)}${r.custName ? `, ${r.custName}` : ''} (${r.evStatus})`}
                        className={cx('pointer-events-auto block truncate rounded px-1.5 py-0.5 text-[12px] leading-4 hover:brightness-95', STATUS_CHIP[r.evStatus])}
                      >
                        {r.evStart && <span className="num mr-1">{r.evStart}</span>}
                        {eventName(r)}
                      </Link>
                    ))}
                    {day.length > CELL_LIMIT && <p className="px-1.5 text-[12px] leading-4 text-ink-3">+{day.length - CELL_LIMIT} lagi</p>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3 text-[12px] text-ink-3 sm:px-5">
          {(Object.keys(STATUS_DOT) as EventStatus[]).map(s => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className={cx('h-1.5 w-1.5 rounded-full', STATUS_DOT[s])} aria-hidden />
              {s}
            </span>
          ))}
        </div>
      </Panel>

      <Panel flush>
        <div className="flex items-center justify-between gap-3 p-4 sm:px-5">
          <h2 className="text-[15px] font-semibold leading-6">{selected ? `Project ${formatDate(selected)}` : `Project ${formatMonth(month)}`}</h2>
          {selected && <TextButton onClick={() => setPicked(null)}>Lihat sebulan</TextButton>}
        </div>
        {listed.length ? (
          <ul>{listed.map(r => <EventRow key={r.invNum} r={r} />)}</ul>
        ) : (
          <div className="px-4 pb-5 sm:px-5">
            <EmptyState
              title={selected ? 'Tidak ada project di tanggal ini' : 'Belum ada project di bulan ini'}
              description="Project muncul di sini setelah invoice-nya diberi tanggal event."
            />
          </div>
        )}
      </Panel>

      {undated > 0 && (
        <p className="text-[12px] text-ink-3">
          {undated} invoice belum punya tanggal event, jadi tidak muncul di kalender. <Link to="/dashboard" className="underline underline-offset-4">Lihat di Dashboard</Link>
        </p>
      )}
    </Page>
  );
};
