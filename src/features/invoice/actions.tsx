import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { notify } from '../../components/ui/feedback';
import { InvoiceDocument } from './InvoiceDocument';
import type { Invoice } from './figures.ts';
import { getSettings } from './store.ts';

const APP_TITLE = 'Marka Photobooth — Invoice';

/** Opens the browser's print dialog with only this invoice on the page ("Save as PDF" saves it). */
export async function printInvoice(invoice: Invoice) {
  document.getElementById('invoice-print')?.remove();
  const host = document.createElement('div');
  host.id = 'invoice-print';
  document.body.appendChild(host);
  const root = createRoot(host);
  flushSync(() => root.render(<InvoiceDocument invoice={invoice} qris={getSettings().qris} />));
  // The logo and fonts must be ready or the PDF comes out without them
  await Promise.all([...host.querySelectorAll('img')].map(img => img.decode().catch(() => undefined)));
  await document.fonts.ready;
  // Browsers offer the page title as the PDF's file name
  document.title = `${invoice.invNum} - ${invoice.custName || 'Customer'}`;
  window.addEventListener(
    'afterprint',
    () => {
      document.title = APP_TITLE;
      root.unmount();
      host.remove();
    },
    { once: true }
  );
  window.print();
}

/**
 * Sends the invoice to the Apps Script web app. Google's response cannot be read from a browser
 * (no-cors), so this can only say the request left, not that a row was written.
 */
export async function sendToGoogle(invoice: Invoice): Promise<boolean> {
  const url = getSettings().webhookUrl.trim();
  if (!url.startsWith('https://')) {
    notify('Isi URL Apps Script yang valid di Pengaturan dulu.', 'alert');
    return false;
  }
  try {
    await fetch(url, { method: 'POST', mode: 'no-cors', body: JSON.stringify(invoice) });
    notify('Data dikirim ke Google. Cek Sheet untuk memastikan masuk.', 'info');
    return true;
  } catch {
    notify('Gagal mengirim. Cek URL dan koneksi internet.', 'alert');
    return false;
  }
}

export function autoSendToGoogle(invoice: Invoice) {
  const s = getSettings();
  if (s.autoSend && s.webhookUrl.trim()) void sendToGoogle(invoice);
}
