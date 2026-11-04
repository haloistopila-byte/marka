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

Variabel environment untuk server Express ada di `.env.example`.

## Menjalankan di Windows 11

Pasang dulu [Node.js LTS](https://nodejs.org) (22.18 atau lebih baru) dan [Git](https://git-scm.com/download/win), lalu ambil project sekali saja:

```bat
git clone https://github.com/haloistopila-byte/marka.git
```

Klik dua kali `jalankan-windows.bat` di folder itu. Browser terbuka di http://localhost:3000. Biarkan jendela hitamnya terbuka selama app dipakai, dan tutup untuk mematikannya. App hanya bisa dibuka dari komputer itu, dan internet tetap perlu untuk login dan data.

### Auto update

Setiap kali dibuka, app mengambil versi terbaru dari branch `main` di GitHub. Jadi semua yang digabung ke `main` sampai ke semua komputer saat app dibuka berikutnya. App yang sedang berjalan baru berubah setelah ditutup dan dibuka lagi.

- Versi baru yang gagal di-build dibatalkan otomatis, dan app kembali ke versi sebelumnya.
- Kalau GitHub tidak terjangkau atau ada edit lokal yang bentrok, update dilewati dan app dibuka dengan versi yang ada.
- Folder hasil salin atau unduh ZIP tetap bisa jalan, tapi tanpa auto update.

Perubahan `firestore.rules` tidak ikut lewat jalur ini, karena harus di-deploy ke Firebase.

## Isi

- **Dashboard**: ringkasan, pencarian, filter, status event, tandai lunas.
- **Invoice**: form, preview, PDF lewat dialog cetak browser.
- **Pengaturan**: rekening, catatan, QRIS, Google Calendar, Apps Script, backup dan restore. Restore menerima backup dari app HTML lama.

## Firebase

Project `marka-96250`, dikelola dengan akun `markaselfstudio@gmail.com`. Login memakai Google, data di Firestore (`asia-southeast2`). Layar hanya mengakses data lewat `src/features/invoice/store.ts`.

Saat dijalankan lokal, app juga memakai database sungguhan ini, bukan database uji.

- **Menambah anggota tim:** tambahkan emailnya di `firestore.rules` dan `teamEmails` di `server/config.ts`, lalu `firebase deploy --only firestore:rules`.
- **Domain baru:** daftarkan di Firebase Console, Authentication, Settings, Authorized domains. `localhost` sudah terdaftar.
- **Data versi lama:** data di `localStorage` browser dipindahkan lewat tombol di Pengaturan.

## Google Calendar

Satu akun Google dihubungkan sekali dari Pengaturan, lalu event mengikuti invoice: dibuat dan diperbarui saat invoice disimpan, dihapus saat invoice dihapus, dibatalkan, atau tanggalnya dikosongkan. Sinkron berjalan selama app terbuka di salah satu komputer, dan yang tertinggal dikirim saat app dibuka lagi.

### Menyiapkan

Langkah 1 sampai 3 dilakukan sekali, dengan akun `markaselfstudio@gmail.com`, di project `marka-96250`.

1. Google Cloud Console: aktifkan **Google Calendar API**.
2. Google Auth Platform: tambahkan scope `calendar.events`, lalu **Publish app** ke status In production. Selama masih Testing, Google mencabut izinnya setelah 7 hari dan sinkron minta dihubungkan ulang.
3. Buat **OAuth Client** tipe Web application dengan redirect URI `http://localhost:3000/auth/google/callback`.
4. Firebase Console, Project settings, Service accounts: buat kunci baru dan simpan di luar folder project.
5. Di **setiap komputer** yang menjalankan app, buat file `.env` di folder project dari `.env.example`, lalu tutup dan buka lagi app-nya. File ini tidak masuk Git, jadi tidak ikut auto update dan tidak tertimpa olehnya.
6. Di Pengaturan, tekan **Hubungkan Akun Google** dan pilih akun Marka. Akun di luar tim ditolak.

`.env` berisi rahasia yang memberi akses penuh ke database, jadi pasang hanya di komputer tepercaya.

### Cara kerjanya

- Token Google ada di `server_private/google_calendar`. `firestore.rules` tidak punya aturan untuk koleksi itu, jadi browser tidak bisa membacanya.
- Status koneksi, versi invoice yang terakhir disinkronkan, dan 20 log terakhir ada di `app/calendar`. Browser tim bisa membacanya, hanya server yang menulisnya.
- Browser cukup menyebut nomor invoice ke `POST /api/calendar/sync`. Server membaca invoice dari Firestore, dan ID event diturunkan dari nomor itu, jadi sinkron berulang tidak membuat duplikat.
