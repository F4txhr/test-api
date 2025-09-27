# Dasbor Pemantauan Cloudflare (via Cloudflare Worker)

Ini adalah aplikasi dasbor frontend yang disajikan melalui **Cloudflare Worker**. Arsitektur ini menggunakan Worker sebagai *proxy* untuk berkomunikasi dengan API backend Anda, yang secara efektif menyelesaikan semua masalah CORS.

Worker ini melakukan dua hal:
1.  **Menyajikan Aset Statis:** Menyajikan file `index.html`, `style.css`, dan `script.js` untuk menampilkan dasbor.
2.  **Proxy API:** Meneruskan semua permintaan API (yang dimulai dengan `/statscf/`) dari dasbor ke server backend Anda di Railway.

## Prasyarat

1.  **API Backend Berjalan:** Pastikan API backend Anda di `https://test-api.up.railway.app` aktif dan berjalan.
2.  **Node.js dan NPM:** Anda harus memiliki [Node.js](https://nodejs.org/) (yang menyertakan npm) terinstal di komputer Anda untuk menjalankan perintah `npx`.
3.  **Login ke Wrangler:** Anda harus sudah login ke akun Cloudflare Anda melalui baris perintah. Jika belum, jalankan perintah `npx wrangler login` sekali.

## Cara Deploy

Dengan struktur proyek ini, proses deploy menjadi sangat sederhana dan hanya memerlukan satu langkah.

### Langkah 1: Ubah Nama Worker (Wajib)

1.  Buka file `wrangler.toml`.
2.  Ubah nilai `name` menjadi nama yang unik untuk worker Anda (misalnya, `dashboard-saya-keren`).
    ```toml
    name = "nama-unik-anda"
    ```

### Langkah 2: Deploy

1.  Buka terminal atau command prompt di direktori utama proyek ini.
2.  Jalankan perintah berikut:
    ```bash
    npx wrangler deploy
    ```

Itu saja! Perintah ini akan secara otomatis membuat Worker baru di akun Cloudflare Anda, mengunggah skrip proxy (`index.js`), dan mengunggah semua file statis (`index.html`, dll.).

Setelah selesai, `wrangler` akan memberi Anda URL publik di mana dasbor Anda akan aktif dan dapat diakses.