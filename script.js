document.addEventListener('DOMContentLoaded', () => {
    // Gunakan path relatif. Semua permintaan akan diarahkan ke Worker itu sendiri.
    const API_BASE_URL = '';

    // --- Referensi Elemen Utama ---
    const select = document.getElementById('registration-select');
    const refreshButton = document.getElementById('refresh-button');
    const statsDisplay = document.getElementById('stats-display');
    const loadingIndicator = document.getElementById('loading-indicator');
    const errorMessage = document.getElementById('error-message');
    const addNewButton = document.getElementById('add-new-button');
    const editButton = document.getElementById('edit-button');
    const deleteButton = document.getElementById('delete-button');

    // --- Kumpulan Modal ---
    const modals = {
        registration: {
            element: document.getElementById('registration-modal'),
            form: document.getElementById('registration-form'),
            error: document.getElementById('modal-error-message'),
            openButton: addNewButton,
            closeButton: document.querySelector('#registration-modal .close-button'),
            submitHandler: handleRegistrationSubmit,
        },
        update: {
            element: document.getElementById('update-modal'),
            form: document.getElementById('update-form'),
            error: document.getElementById('update-modal-error-message'),
            openButton: editButton,
            closeButton: document.querySelector('#update-modal .close-button'),
            submitHandler: handleUpdateSubmit,
        },
        delete: {
            element: document.getElementById('delete-modal'),
            form: document.getElementById('delete-form'),
            error: document.getElementById('delete-modal-error-message'),
            openButton: deleteButton,
            closeButton: document.querySelector('#delete-modal .close-button'),
            submitHandler: handleDeleteSubmit,
        }
    };

    let activeModal = null;

    // --- MANAJER MODAL TERPUSAT ---
    function openModal(modalKey) {
        if (activeModal) closeModal(); // Tutup modal yang sedang aktif jika ada

        const modal = modals[modalKey];
        if (modal) {
            modal.form.reset();
            modal.error.classList.add('hidden');
            modal.element.classList.remove('hidden');
            activeModal = modal.element;
        }
    }

    function closeModal() {
        if (activeModal) {
            activeModal.classList.add('hidden');
            activeModal = null;
        }
    }

    // --- Fungsi API dan UI ---
    async function fetchRegistrations() {
        try {
            const response = await fetch(`${API_BASE_URL}/statscf/registrations`);
            if (!response.ok) throw new Error('Gagal mengambil daftar pendaftaran.');
            const result = await response.json();
            if (result.success) {
                populateSelect(result.data);
            } else {
                showError(result.error);
            }
        } catch (error) {
            showError(error.message);
        }
    }

    function populateSelect(registrations) {
        const currentVal = select.value;
        select.innerHTML = '<option value="">-- Silakan pilih --</option>';
        registrations.forEach(reg => {
            const option = document.createElement('option');
            option.value = reg.unique_id;
            option.textContent = reg.name;
            select.appendChild(option);
        });
        select.value = currentVal;
    }

    async function fetchStats() {
        const selectedId = select.value;
        if (!selectedId) {
            statsDisplay.classList.add('hidden');
            return;
        }
        showLoading(true);
        showError('');
        try {
            const response = await fetch(`${API_BASE_URL}/statscf/data/${selectedId}`);
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.error || 'Gagal mengambil data statistik.');
            displayStats(result.data[0]);
        } catch (error) {
            showError(error.message);
        } finally {
            showLoading(false);
        }
    }

    function displayStats(data) {
        if (!data) {
            statsDisplay.innerHTML = '<p>Tidak ada data untuk ditampilkan.</p>';
            statsDisplay.classList.remove('hidden');
            return;
        }
        statsDisplay.innerHTML = '';
        let html = '<h2>Ringkasan Statistik</h2>';
        if (data.global_stats) html += `<div class="stat-card"><h3>Statistik Global Akun</h3><p><strong>Total Permintaan:</strong> ${data.global_stats.total_requests.toLocaleString('id-ID')}</p></div>`;
        if (data.zone_stats) html += `<div class="stat-card"><h3>Statistik Zona</h3><p><strong>Total Bandwidth:</strong> ${formatBytes(data.zone_stats.bandwidth_bytes)}</p></div>`;
        if (data.worker_stats) html += `<div class="stat-card"><h3>Statistik Worker</h3><p><strong>Permintaan:</strong> ${data.worker_stats.requests.toLocaleString('id-ID')}</p><p><strong>Sub-Permintaan:</strong> ${data.worker_stats.subrequests.toLocaleString('id-ID')}</p><p><strong>Error:</strong> ${data.worker_stats.errors.toLocaleString('id-ID')}</p><p><strong>CPU Time (P50/P90/P99):</strong> ${data.worker_stats.cpu_time_p50?.toFixed(2)}µs / ${data.worker_stats.cpu_time_p90?.toFixed(2)}µs / ${data.worker_stats.cpu_time_p99?.toFixed(2)}µs</p></div>`;
        statsDisplay.innerHTML = html;
        statsDisplay.classList.remove('hidden');
    }

    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    function showLoading(isLoading) {
        loadingIndicator.classList.toggle('hidden', !isLoading);
        if (isLoading) statsDisplay.classList.add('hidden');
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.toggle('hidden', !message);
        if (message) statsDisplay.classList.add('hidden');
    }

    async function pingServer() {
        try {
            await fetch(`${API_BASE_URL}/ping`);
            console.log('Server pinged to prevent sleep.');
        } catch (error) {
            console.error('Ping failed:', error.message);
        }
    }

    // --- Logika Form Handlers ---
    async function handleRegistrationSubmit(event) {
        event.preventDefault();
        const modal = modals.registration;
        modal.error.classList.add('hidden');
        const formData = new FormData(modal.form);
        const data = Object.fromEntries(formData.entries());
        if (!data.cf_worker_name) delete data.cf_worker_name;
        if (!data.cf_zone_id) delete data.cf_zone_id;
        if (!data.error_threshold) delete data.error_threshold;
        try {
            const response = await fetch(`${API_BASE_URL}/statscf`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.error || 'Terjadi kesalahan.');
            alert('Registrasi berhasil!');
            closeModal();
            fetchRegistrations();
        } catch (error) {
            modal.error.textContent = error.message;
            modal.error.classList.remove('hidden');
        }
    }

    async function handleUpdateSubmit(event) {
        event.preventDefault();
        const modal = modals.update;
        modal.error.classList.add('hidden');
        const selectedId = select.value;
        if (!selectedId) return;
        const formData = new FormData(modal.form);
        const data = Object.fromEntries(formData.entries());
        if (!data.cf_worker_name) delete data.cf_worker_name;
        if (!data.cf_zone_id) delete data.cf_zone_id;
        if (!data.error_threshold) delete data.error_threshold;
        try {
            const response = await fetch(`${API_BASE_URL}/statscf/${selectedId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.error || 'Gagal memperbarui.');
            alert('Pembaruan berhasil!');
            closeModal();
            fetchRegistrations();
        } catch (error) {
            modal.error.textContent = error.message;
            modal.error.classList.remove('hidden');
        }
    }

    async function handleDeleteSubmit(event) {
        event.preventDefault();
        const modal = modals.delete;
        modal.error.classList.add('hidden');
        const selectedId = select.value;
        if (!selectedId) return;
        const formData = new FormData(modal.form);
        const data = Object.fromEntries(formData.entries());
        try {
            const response = await fetch(`${API_BASE_URL}/statscf/${selectedId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cf_api_token: data.cf_api_token }) });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.error || 'Gagal menghapus.');
            alert('Penghapusan berhasil!');
            closeModal();
            fetchRegistrations();
            statsDisplay.classList.add('hidden');
        } catch (error) {
            modal.error.textContent = error.message;
            modal.error.classList.remove('hidden');
        }
    }

    // --- Event Listeners ---
    select.addEventListener('change', () => {
        fetchStats();
        const isDisabled = !select.value;
        editButton.disabled = isDisabled;
        deleteButton.disabled = isDisabled;
    });

    refreshButton.addEventListener('click', fetchStats);

    // Setup listeners untuk setiap modal
    for (const key in modals) {
        const modal = modals[key];
        modal.openButton.addEventListener('click', () => openModal(key));
        modal.closeButton.addEventListener('click', closeModal);
        modal.form.addEventListener('submit', modal.submitHandler);
    }

    // Listener global untuk menutup modal saat mengklik di luar
    window.addEventListener('click', (event) => {
        if (event.target.classList.contains('modal')) {
            closeModal();
        }
    });

    // --- Inisialisasi ---
    fetchRegistrations();
    setInterval(pingServer, 5 * 60 * 1000);
});