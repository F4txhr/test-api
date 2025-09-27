# Dasbor Pemantauan Cloudflare

Ini adalah aplikasi dasbor frontend murni yang dirancang untuk memantau statistik dari API pemantauan Cloudflare Anda. Dasbor ini dibangun dengan HTML, CSS, dan JavaScript vanilla, dan siap untuk di-deploy sebagai situs web statis di platform seperti **Netlify** atau **Cloudflare Pages**.

## Prasyarat

1.  **API Backend Berjalan:** Pastikan API backend Anda di `https://test-api.up.railway.app` aktif dan berjalan. Pastikan juga konfigurasi CORS di server API Anda mengizinkan permintaan dari semua domain (`*`) atau setidaknya dari domain Netlify Anda nanti.
2.  **Repositori GitHub:** Proyek ini harus berada di dalam repositori GitHub agar bisa dihubungkan ke Netlify.

## Cara Deploy ke Netlify

Netlify adalah platform yang sangat baik untuk mendeploy situs statis seperti dasbor ini.

### Langkah-langkah Deployment

1.  **Daftar atau Masuk ke Netlify**
    *   Buka [Netlify](https://www.netlify.com/) dan daftar menggunakan akun GitHub Anda, atau masuk jika Anda sudah punya akun.

2.  **Impor Proyek Baru dari Git**
    *   Dari dasbor Netlify Anda, klik tombol **"Add new site"** atau **"Import from Git"**.
    *   Pilih **"Deploy with GitHub"** dan otorisasi Netlify untuk mengakses repositori Anda.
    *   Pilih repositori GitHub yang berisi proyek dasbor ini.

3.  **Konfigurasi Pengaturan Deploy (Bagian Paling Penting)**
    *   Netlify biasanya cukup pintar untuk mendeteksi proyek statis. Pastikan pengaturannya sebagai berikut:
    *   **Branch to deploy:** Pilih cabang utama repositori Anda (misalnya, `main`).
    *   **Build command:** **KOSONGKAN** bagian ini. Kita tidak memerlukan proses build.
    *   **Publish directory:** Atur ke `/` atau biarkan kosong. Karena `index.html` ada di direktori utama (root), Netlify akan secara otomatis mendeteksinya.

4.  **Deploy Situs**
    *   Klik tombol **"Deploy site"**.

Netlify akan mulai mendeploy situs Anda. Proses ini sangat cepat. Setelah selesai, Netlify akan memberi Anda URL unik (misalnya, `nama-unik-anda.netlify.app`) di mana dasbor Anda akan aktif dan dapat diakses.

Dasbor Anda sekarang akan berjalan di Netlify dan berkomunikasi langsung dengan API Anda di Railway.