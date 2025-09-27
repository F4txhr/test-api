document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('registration-select');
    const refreshButton = document.getElementById('refresh-button');
    const statsContainer = document.getElementById('stats-container');
    const statsDisplay = document.getElementById('stats-display');
    const loadingIndicator = document.getElementById('loading-indicator');
    const errorMessage = document.getElementById('error-message');

    // Fungsi untuk mengambil daftar semua pendaftaran
    async function fetchRegistrations() {
        try {
            const response = await fetch('/statscf/registrations');
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
            const response = await fetch(`/statscf/data/${selectedId}`);
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

    // Event listeners
    select.addEventListener('change', fetchStats);
    refreshButton.addEventListener('click', fetchStats);

    // Muat daftar pendaftaran saat halaman pertama kali dibuka
    fetchRegistrations();
});