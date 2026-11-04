# Marka Photobooth

App dashboard event dan invoice untuk Marka Photobooth. Fondasinya (UI kit, server Express, tooling) disalin dari project Istopila.

## Menjalankan

```bash
npm install
npm run dev
```

Lalu buka http://localhost:3000. Tes dan pemeriksaan tipe:

```bash
npm test
npm run lint
```

Untuk produksi, `npm run build` lalu `npm start`. Variabel environment ada di `.env.example`.

## Isi

- **Dashboard**: ringkasan, pencarian, filter, status event, tandai lunas.
- **Invoice**: form, preview, PDF lewat dialog cetak browser.
- **Pengaturan**: rekening, catatan, QRIS, Apps Script, backup dan restore. Restore menerima backup dari app HTML lama.

## Status: fase lokal

Data tersimpan di `localStorage` browser, belum ada login. Layar hanya mengakses data lewat `src/features/invoice/store.ts`, jadi Firebase cukup menggantikan file itu.

Belum dibuat, menunggu project Firebase milik Marka:

- Login dan akun tim
- Penyimpanan di Firestore
- Sync otomatis ke Google Calendar. Sementara ini ada tombol "Tambah ke Google Calendar" dan kiriman ke Apps Script.
