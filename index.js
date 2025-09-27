/**
 * Selamat datang di Cloudflare Worker!
 *
 * Worker ini bertindak sebagai proxy untuk menghindari masalah CORS.
 * Dasbor frontend akan berkomunikasi dengan Worker ini.
 * Worker ini kemudian akan meneruskan permintaan ke API backend Anda di Railway.
 */

const BACKEND_URL = 'https://test-api.up.railway.app';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Hanya proxy permintaan yang ditujukan untuk API (misalnya, /statscf/...)
    if (url.pathname.startsWith('/statscf/')) {
      // Buat URL baru yang menunjuk ke backend di Railway
      const newUrl = new URL(url.pathname + url.search, BACKEND_URL);

      // Buat permintaan baru yang identik, tetapi dengan URL yang baru
      const newRequest = new Request(newUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        redirect: 'follow'
      });

      // Tambahkan header untuk menunjukkan dari mana permintaan ini berasal (opsional, tapi bagus untuk debugging)
      newRequest.headers.set('X-Forwarded-By', 'Cloudflare-Worker-Proxy');

      try {
        // Kirim permintaan ke backend dan kembalikan responsnya langsung
        const response = await fetch(newRequest);

        // Buat respons baru yang dapat di-CORS kan agar browser tidak menolaknya
        const corsResponse = new Response(response.body, response);
        corsResponse.headers.set('Access-Control-Allow-Origin', '*');
        corsResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        corsResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        return corsResponse;

      } catch (e) {
        return new Response('Gagal menghubungi server backend.', { status: 502 });
      }
    }

    // Jika permintaan bukan untuk API, coba sajikan file statis dari Pages
    // (Ini adalah fallback, logika utama penyajian file akan diatur di wrangler.toml)
    try {
        const { pathname } = new URL(request.url);
        // Ini akan ditangani oleh fungsionalitas Pages yang terintegrasi dengan Worker
        // dan akan mengambil file dari direktori yang didefinisikan di wrangler.toml.
        // Jika Anda hanya mendeploy Worker tanpa Pages, Anda perlu menambahkan logika `get-asset-from-kv` di sini.
        // Untuk sekarang, kita biarkan Cloudflare yang menanganinya.
        return env.ASSETS.fetch(request);
    } catch (e) {
        return new Response('Aset tidak ditemukan.', { status: 404 });
    }
  },
};