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

## Firebase

Project `marka-96250`, dikelola dengan akun `markaselfstudio@gmail.com`. Login memakai Google, data di Firestore (`asia-southeast2`). Layar hanya mengakses data lewat `src/features/invoice/store.ts`.

Saat dijalankan lokal, app juga memakai database sungguhan ini, bukan database uji.

- **Menambah anggota tim:** tambahkan emailnya di `firestore.rules`, lalu `firebase deploy --only firestore:rules`.
- **Domain baru:** daftarkan di Firebase Console, Authentication, Settings, Authorized domains. `localhost` sudah terdaftar.
- **Data versi lama:** data di `localStorage` browser dipindahkan lewat tombol di Pengaturan.

Belum dibuat:

- Sync otomatis ke Google Calendar. Sementara ini ada tombol "Tambah ke Google Calendar" dan kiriman ke Apps Script.
