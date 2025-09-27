document.addEventListener('DOMContentLoaded', () => {
  const API_BASE_URL = "https://test-api.up.railway.app";

  // Elemen utama
  const select = document.getElementById('registration-select');
  const refreshBtn = document.getElementById('refresh-button');
  const addBtn = document.getElementById('add-new-button');
  const editBtn = document.getElementById('edit-button');
  const delBtn = document.getElementById('delete-button');
  const statsDisplay = document.getElementById('stats-display');
  const loading = document.getElementById('loading-indicator');
  const errorBox = document.getElementById('error-message');

  const modals = {
    registration: document.getElementById('registration-modal'),
    update: document.getElementById('update-modal'),
    delete: document.getElementById('delete-modal')
  };

  function closeAllModals() {
    for (const key in modals) {
      if (modals.hasOwnProperty(key)) {
        modals[key].classList.add('hidden');
      }
    }
  }
  function openModal(key) {
    closeAllModals();
    modals[key].classList.remove('hidden');
  }

  // Fetch daftar
  async function fetchRegistrations() {
    try {
      const res = await fetch(`${API_BASE_URL}/statscf/registrations`);
      if (!res.headers.get('content-type')?.includes('application/json')) {
        throw new Error("Respons server tidak valid. Coba lagi nanti.");
      }
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Gagal ambil daftar.");
      populateSelect(data.data);
    } catch (e) {
      showError(e.message);
    }
  }

  function populateSelect(items) {
    select.innerHTML = `<option value="">-- Silakan pilih --</option>`;
    items.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.unique_id;
      opt.textContent = r.name;
      select.appendChild(opt);
    });
  }

  async function fetchStats() {
    if (!select.value) {
      statsDisplay.classList.add('hidden');
      return;
    }
    showLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/statscf/data/${select.value}`);
      if (!res.headers.get('content-type')?.includes('application/json')) {
        throw new Error("Respons server tidak valid. Coba lagi nanti.");
      }
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Gagal ambil statistik.");
      displayStats(data.data[0]);
    } catch (e) {
      showError(e.message);
    } finally {
      showLoading(false);
    }
  }

  function displayStats(d) {
    if (!d) {
      statsDisplay.innerHTML = "<p>Tidak ada data.</p>";
      statsDisplay.classList.remove('hidden');
      return;
    }
    let html = `<h2>Ringkasan Statistik</h2>`;
    if (d.global_stats) {
      html += `<div class="stat-card"><h3>Global</h3>
        <p><strong>Total Permintaan:</strong> ${d.global_stats.total_requests}</p></div>`;
    }
    if (d.zone_stats) {
      html += `<div class="stat-card"><h3>Zona</h3>
        <p><strong>Total Bandwidth:</strong> ${formatBytes(d.zone_stats.bandwidth_bytes)}</p></div>`;
    }
    if (d.worker_stats) {
      html += `<div class="stat-card"><h3>Worker</h3>
        <p><strong>Permintaan:</strong> ${d.worker_stats.requests}</p>
        <p><strong>Error:</strong> ${d.worker_stats.errors}</p></div>`;
    }
    statsDisplay.innerHTML = html;
    statsDisplay.classList.remove('hidden');
  }

  function formatBytes(b) {
    if (b === 0) return "0 B";
    const k = 1024;
    const i = Math.floor(Math.log(b)/Math.log(k));
    const sizes = ["B","KB","MB","GB","TB"];
    return (b/Math.pow(k,i)).toFixed(2) + " " + sizes[i];
  }

  function showLoading(x) {
    loading.classList.toggle('hidden', !x);
    if (x) statsDisplay.classList.add('hidden');
  }
  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.toggle('hidden', !msg);
    if (msg) statsDisplay.classList.add('hidden');
  }

  // Submit handler
  document.getElementById('registration-form').addEventListener('submit', async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    try {
      const res = await fetch(`${API_BASE_URL}/statscf`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(data)
      });
      if (!res.headers.get('content-type')?.includes('application/json')) {
        throw new Error("Respons server tidak valid. Coba lagi nanti.");
      }
      const out = await res.json();
      if (!res.ok || !out.success) throw new Error(out.error || "Gagal daftar.");
      closeAllModals(); fetchRegistrations();
    } catch (err) {
      document.getElementById('modal-error-message').textContent = err.message;
      document.getElementById('modal-error-message').classList.remove('hidden');
    }
  });

  document.getElementById('update-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!select.value) return;
    const data = Object.fromEntries(new FormData(e.target).entries());

    // Hapus field opsional yang kosong agar tidak menimpa data yang ada
    if (!data.cf_worker_name) delete data.cf_worker_name;
    if (!data.cf_zone_id) delete data.cf_zone_id;
    if (!data.error_threshold) delete data.error_threshold;

    try {
      const res = await fetch(`${API_BASE_URL}/statscf/${select.value}`, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(data)
      });
      if (!res.headers.get('content-type')?.includes('application/json')) {
        throw new Error("Respons server tidak valid. Coba lagi nanti.");
      }
      const out = await res.json();
      if (!res.ok || !out.success) throw new Error(out.error || "Gagal update.");
      closeAllModals(); fetchRegistrations();
    } catch (err) {
      const box = document.getElementById('update-modal-error-message');
      box.textContent = err.message; box.classList.remove('hidden');
    }
  });

  document.getElementById('delete-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!select.value) return;
    const data = Object.fromEntries(new FormData(e.target).entries());
    try {
      const res = await fetch(`${API_BASE_URL}/statscf/${select.value}`, {
        method: 'DELETE', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({cf_api_token:data.cf_api_token})
      });
      if (!res.headers.get('content-type')?.includes('application/json')) {
        throw new Error("Respons server tidak valid. Coba lagi nanti.");
      }
      const out = await res.json();
      if (!res.ok || !out.success) throw new Error(out.error || "Gagal hapus.");
      closeAllModals(); fetchRegistrations(); statsDisplay.classList.add('hidden');
    } catch (err) {
      const box = document.getElementById('delete-modal-error-message');
      box.textContent = err.message; box.classList.remove('hidden');
    }
  });

  // Event binding
  select.addEventListener('change', () => {
    fetchStats();
    editBtn.disabled = !select.value;
    delBtn.disabled = !select.value;
  });
  refreshBtn.addEventListener('click', fetchStats);
  addBtn.addEventListener('click', ()=>openModal('registration'));
  editBtn.addEventListener('click', ()=>openModal('update'));
  delBtn.addEventListener('click', ()=>openModal('delete'));
  document.querySelectorAll('.close-button').forEach(btn => btn.addEventListener('click', closeAllModals));
  window.addEventListener('click', e => { if (e.target.classList.contains('modal')) closeAllModals(); });

  // Init
  closeAllModals();
  fetchRegistrations();
  setInterval(()=>fetch(`${API_BASE_URL}/ping`).catch(()=>{}), 5*60*1000);
});