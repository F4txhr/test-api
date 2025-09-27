# Dasbor Pemantauan Cloudflare

Ini adalah aplikasi dasbor frontend murni yang dirancang untuk memantau statistik dari API pemantauan Cloudflare Anda. Dasbor ini dibangun dengan HTML, CSS, dan JavaScript vanilla, dan siap untuk di-deploy sebagai situs web statis.

## Prasyarat

1.  **API Backend Berjalan:** Pastikan API backend Anda (dari proyek sebelumnya) sudah berjalan dan dapat diakses secara publik. URL API yang digunakan oleh dasbor ini diatur di `script.js` sebagai `https://cfanalistik.up.railway.app`.
2.  **Repositori GitHub:** Proyek ini harus berada di dalam repositori GitHub agar bisa dihubungkan ke Cloudflare Pages.

## Cara Deploy ke Cloudflare Pages

Metode yang direkomendasikan untuk mendeploy dasbor ini adalah melalui **Cloudflare Pages**, yang dirancang khusus untuk hosting situs statis.

### Langkah-langkah Deployment

1.  **Masuk ke Dasbor Cloudflare**
    *   Login ke akun Cloudflare Anda.

2.  **Buka Halaman "Workers & Pages"**
    *   Di menu navigasi sisi kiri, klik pada **Workers & Pages**.

3.  **Buat Aplikasi Baru**
    *   Klik tombol **"Create application"**.
    *   Pilih tab **"Pages"**.
    *   Klik tombol **"Connect to Git"**.

4.  **Hubungkan ke Repositori Anda**
    *   Pilih repositori GitHub yang berisi proyek dasbor ini. Anda mungkin perlu mengotorisasi Cloudflare untuk mengakses akun GitHub Anda jika ini pertama kalinya.
    *   Setelah memilih repositori, klik **"Begin setup"**.

5.  **Konfigurasi Build & Deploy (Pengaturan Paling Penting)**
    *   **Project name:** Beri nama proyek Anda (misalnya, `cf-dashboard`).
    *   **Production branch:** Pilih cabang utama repositori Anda (misalnya, `main`).
    *   **Framework preset:** Biarkan pada **"None"**.
    *   **Build command:** **KOSONGKAN** bagian ini. Kita tidak memerlukan proses build.
    *   **Build output directory:** Atur ke `/`. Karena file `index.html` berada di direktori utama (root), kita memberi tahu Cloudflare untuk menggunakan direktori utama sebagai output.
    *   **Root directory (advanced):** Biarkan kosong.

6.  **Simpan dan Deploy**
    *   Klik tombol **"Save and Deploy"**.

Cloudflare akan mulai mendeploy situs Anda. Proses ini biasanya sangat cepat (kurang dari satu menit). Setelah selesai, Cloudflare akan memberikan Anda URL unik (misalnya, `cf-dashboard.pages.dev`) di mana dasbor Anda akan aktif dan dapat diakses.