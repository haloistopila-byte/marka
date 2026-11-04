import { addDays, toIso } from '../invoice/figures.ts';
import { blankInvoice, saveInvoice } from '../invoice/store.ts';

/** Made-up invoices for trying the app locally. The button that calls this exists only in development. */
export function loadSampleData() {
  const today = toIso(new Date());
  const samples = [
    { custName: 'Contoh Ayu', evName: 'Wedding Reception', evDate: addDays(today, 5), dpPaid: 1000000, pelunasan: 0, evStatus: 'Terjadwal' as const },
    { custName: 'Contoh Budi', evName: 'Ulang Tahun Perusahaan', evDate: addDays(today, 30), dpPaid: 0, pelunasan: 0, evStatus: 'Terjadwal' as const },
    { custName: 'Contoh Citra', evName: 'Sweet Seventeen', evDate: addDays(today, 12), dpPaid: 1000000, pelunasan: 2050000, evStatus: 'Terjadwal' as const },
    { custName: 'Contoh Dimas', evName: 'Gathering Kantor', evDate: addDays(today, -20), dpPaid: 1000000, pelunasan: 2050000, evStatus: 'Selesai' as const },
    { custName: 'Contoh Eka', evName: 'Lamaran', evDate: addDays(today, 8), dpPaid: 500000, pelunasan: 0, evStatus: 'Batal' as const }
  ];
  samples.forEach((s, i) => {
    saveInvoice({
      ...blankInvoice(),
      ...s,
      invNum: `DEMO-${String(i + 1).padStart(3, '0')}`,
      custPhone: `0800-0000-000${i + 1}`,
      evLoc: 'Gedung Contoh',
      evStart: '18:00',
      evEnd: '21:00'
    });
  });
}
