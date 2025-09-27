document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = 'https://cfanalistik.up.railway.app';

    const select = document.getElementById('registration-select');
    const refreshButton = document.getElementById('refresh-button');
    const statsContainer = document.getElementById('stats-container');
    const statsDisplay = document.getElementById('stats-display');
    const loadingIndicator = document.getElementById('loading-indicator');
    const errorMessage = document.getElementById('error-message');

    // Fungsi untuk mengambil daftar semua pendaftaran
    async function fetchRegistrations() {
        try {
            const response = await fetch(`${API_BASE_URL}/statscf/registrations`);
            if (!response.ok) {
                throw new Error('Gagal mengambil daftar pendaftaran.');
            }
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

    // Fungsi untuk mengisi menu dropdown
    function populateSelect(registrations) {
        select.innerHTML = '<option value="">-- Silakan pilih --</option>'; // Reset
        registrations.forEach(reg => {
            const option = document.createElement('option');
            option.value = reg.unique_id;
            option.textContent = reg.name;
            select.appendChild(option);
        });
    }

    // Fungsi untuk mengambil data statistik berdasarkan ID
    async function fetchStats() {
        const selectedId = select.value;
        if (!selectedId) {
            statsDisplay.classList.add('hidden');
            return;
        }

        showLoading(true);
        showError(''); // Sembunyikan error lama

        try {
            const response = await fetch(`${API_BASE_URL}/statscf/data/${selectedId}`);
            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Gagal mengambil data statistik.');
            }

            displayStats(result.data[0]); // Ambil objek pertama dari array data

        } catch (error) {
            showError(error.message);
        } finally {
            showLoading(false);
        }
    }

    // Fungsi untuk menampilkan data statistik di halaman
    function displayStats(data) {
        statsDisplay.innerHTML = ''; // Kosongkan tampilan lama

        const globalStats = data.global_stats;
        const zoneStats = data.zone_stats;
        const workerStats = data.worker_stats;

        let html = '<h2>Ringkasan Statistik</h2>';

        if (globalStats) {
            html += `
                <div class="stat-card">
                    <h3>Statistik Global Akun</h3>
                    <p><strong>Total Permintaan:</strong> ${globalStats.total_requests.toLocaleString('id-ID')}</p>
                </div>
            `;
        }

        if (zoneStats) {
            html += `
                <div class="stat-card">
                    <h3>Statistik Zona</h3>
                    <p><strong>Total Bandwidth:</strong> ${formatBytes(zoneStats.bandwidth_bytes)}</p>
                </div>
            `;
        }

        if (workerStats) {
            html += `
                <div class="stat-card">
                    <h3>Statistik Worker</h3>
                    <p><strong>Permintaan:</strong> ${workerStats.requests.toLocaleString('id-ID')}</p>
                    <p><strong>Sub-Permintaan:</strong> ${workerStats.subrequests.toLocaleString('id-ID')}</p>
                    <p><strong>Error:</strong> ${workerStats.errors.toLocaleString('id-ID')}</p>
                    <p><strong>CPU Time (P50/P90/P99):</strong> ${workerStats.cpu_time_p50?.toFixed(2)}µs / ${workerStats.cpu_time_p90?.toFixed(2)}µs / ${workerStats.cpu_time_p99?.toFixed(2)}µs</p>
                </div>
            `;
        }

        statsDisplay.innerHTML = html;
        statsDisplay.classList.remove('hidden');
    }

    // Fungsi utilitas untuk format byte
    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    // Fungsi untuk menampilkan/menyembunyikan indikator loading
    function showLoading(isLoading) {
        if (isLoading) {
            loadingIndicator.classList.remove('hidden');
            statsDisplay.classList.add('hidden');
        } else {
            loadingIndicator.classList.add('hidden');
        }
    }

    // Fungsi untuk menampilkan pesan error
    function showError(message) {
        if (message) {
            errorMessage.textContent = message;
            errorMessage.classList.remove('hidden');
            statsDisplay.classList.add('hidden');
        } else {
            errorMessage.classList.add('hidden');
        }
    }

    // Fungsi untuk menjaga server tetap aktif
    async function pingServer() {
        try {
            await fetch(`${API_BASE_URL}/ping`);
            console.log('Server pinged to prevent sleep.');
        } catch (error) {
            console.error('Ping failed:', error.message);
        }
    }

    // --- Referensi Elemen Modal Pendaftaran ---
    const registrationModal = document.getElementById('registration-modal');
    const addNewButton = document.getElementById('add-new-button');
    const closeRegistrationModalButton = registrationModal.querySelector('.close-button');
    const registrationForm = document.getElementById('registration-form');
    const registrationModalError = document.getElementById('modal-error-message');

    // --- Referensi Elemen Modal Pembaruan ---
    const updateModal = document.getElementById('update-modal');
    const editButton = document.getElementById('edit-button');
    const closeUpdateModalButton = updateModal.querySelector('.close-button');
    const updateForm = document.getElementById('update-form');
    const updateModalError = document.getElementById('update-modal-error-message');

    // --- Referensi Elemen Modal Penghapusan ---
    const deleteModal = document.getElementById('delete-modal');
    const deleteButton = document.getElementById('delete-button');
    const closeDeleteModalButton = deleteModal.querySelector('.close-button');
    const deleteForm = document.getElementById('delete-form');
    const deleteModalError = document.getElementById('delete-modal-error-message');


    // --- Logika Modal ---
    function openModal(modal) {
        modal.classList.remove('hidden');
    }

    function closeModal(modal) {
        modal.classList.add('hidden');
    }

    // --- Logika Pendaftaran ---
    async function handleRegistrationSubmit(event) {
        event.preventDefault();
        registrationModalError.classList.add('hidden');
        const formData = new FormData(registrationForm);
        const data = Object.fromEntries(formData.entries());

        if (!data.cf_worker_name) delete data.cf_worker_name;
        if (!data.cf_zone_id) delete data.cf_zone_id;
        if (!data.error_threshold) delete data.error_threshold;

        try {
            const response = await fetch(`${API_BASE_URL}/statscf`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Terjadi kesalahan.');
            }

            alert('Registrasi berhasil!');
            closeModal(registrationModal);
            fetchRegistrations();

        } catch (error) {
            registrationModalError.textContent = error.message;
            registrationModalError.classList.remove('hidden');
        }
    }

    // --- Logika Pembaruan ---
    async function handleUpdateSubmit(event) {
        event.preventDefault();
        updateModalError.classList.add('hidden');
        const selectedId = select.value;
        if (!selectedId) return;

        const formData = new FormData(updateForm);
        const data = Object.fromEntries(formData.entries());

        if (!data.cf_worker_name) delete data.cf_worker_name;
        if (!data.cf_zone_id) delete data.cf_zone_id;
        if (!data.error_threshold) delete data.error_threshold;

        try {
            const response = await fetch(`${API_BASE_URL}/statscf/${selectedId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Gagal memperbarui.');
            }

            alert('Pembaruan berhasil!');
            closeModal(updateModal);
            fetchRegistrations();

        } catch (error) {
            updateModalError.textContent = error.message;
            updateModalError.classList.remove('hidden');
        }
    }


    // --- Logika Penghapusan ---
    async function handleDeleteSubmit(event) {
        event.preventDefault();
        deleteModalError.classList.add('hidden');
        const selectedId = select.value;
        if (!selectedId) return;

        const formData = new FormData(deleteForm);
        const data = Object.fromEntries(formData.entries());

        try {
            const response = await fetch(`${API_BASE_URL}/statscf/${selectedId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cf_api_token: data.cf_api_token }),
            });

            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Gagal menghapus.');
            }

            alert('Penghapusan berhasil!');
            closeModal(deleteModal);
            fetchRegistrations(); // Muat ulang daftar
            statsDisplay.classList.add('hidden'); // Sembunyikan tampilan data lama

        } catch (error) {
            deleteModalError.textContent = error.message;
            deleteModalError.classList.remove('hidden');
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

    // Pendaftaran
    addNewButton.addEventListener('click', () => {
        registrationForm.reset();
        openModal(registrationModal);
    });
    closeRegistrationModalButton.addEventListener('click', () => closeModal(registrationModal));
    registrationForm.addEventListener('submit', handleRegistrationSubmit);

    // Pembaruan
    editButton.addEventListener('click', () => {
        updateForm.reset();
        openModal(updateModal);
    });
    closeUpdateModalButton.addEventListener('click', () => closeModal(updateModal));
    updateForm.addEventListener('submit', handleUpdateSubmit);

    // Penghapusan
    deleteButton.addEventListener('click', () => {
        deleteForm.reset();
        openModal(deleteModal);
    });
    closeDeleteModalButton.addEventListener('click', () => closeModal(deleteModal));
    deleteForm.addEventListener('submit', handleDeleteSubmit);

    // Tutup modal jika mengklik di luar kontennya
    window.addEventListener('click', (event) => {
        if (event.target === registrationModal) closeModal(registrationModal);
        if (event.target === updateModal) closeModal(updateModal);
        if (event.target === deleteModal) closeModal(deleteModal);
    });

    async function handleRegistrationSubmit(event) {
        event.preventDefault();
        const formData = new FormData(registrationForm);
        const data = Object.fromEntries(formData.entries());

        if (!data.cf_worker_name) delete data.cf_worker_name;
        if (!data.cf_zone_id) delete data.cf_zone_id;
        if (!data.error_threshold) delete data.error_threshold;

        try {
            const response = await fetch(`${API_BASE_URL}/statscf`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Terjadi kesalahan.');
            }

            alert('Registrasi berhasil!');
            closeModal();
            fetchRegistrations();

        } catch (error) {
            modalErrorMessage.textContent = error.message;
            modalErrorMessage.classList.remove('hidden');
        }
    }

    // Event listeners
    select.addEventListener('change', fetchStats);
    refreshButton.addEventListener('click', fetchStats);
    addNewButton.addEventListener('click', openModal);
    closeModalButton.addEventListener('click', closeModal);
    registrationForm.addEventListener('submit', handleRegistrationSubmit);

    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeModal();
        }
    });

    // Muat daftar pendaftaran saat halaman pertama kali dibuka
    fetchRegistrations();

    // Set interval untuk ping server setiap 5 menit
    setInterval(pingServer, 5 * 60 * 1000);
});