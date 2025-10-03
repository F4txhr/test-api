document.addEventListener('DOMContentLoaded', () => {
    // --- Chart.js Global Settings for Dark Theme ---
    if (typeof Chart !== 'undefined') {
        Chart.defaults.color = 'rgba(224, 224, 224, 0.8)';
        Chart.defaults.borderColor = 'rgba(51, 51, 51, 0.8)';
    }

    const API_BASE_URL = 'https://cfanalistik.up.railway.app';

    // --- DOM Elements ---
    // General Stats
    const pingStatusEl = document.getElementById('ping-status-val');
    const pingUptimeEl = document.getElementById('ping-uptime-val');
    const pingTimeEl = document.getElementById('ping-time-val');
    const totalRequestsEl = document.getElementById('stats-total-req-val');
    const successRateEl = document.getElementById('stats-success-rate-val');
    const metricsEl = document.getElementById('metrics-val');
    const apiStatsTitleEl = document.getElementById('api-stats-title');
    const successCountEl = document.getElementById('stats-success-val');
    const failureCountEl = document.getElementById('stats-failed-val');

    // CF Registration
    const registerForm = document.getElementById('register-form');
    const registerResponseEl = document.getElementById('register-response');

    // CF Monitoring
    const cfDataDisplayEl = document.getElementById('cf-data-display');
    const savedAccountsListEl = document.getElementById('saved-accounts-list');

    // Proxy Tester
    const proxyTestForm = document.getElementById('proxy-test-form');
    const proxyAddressInput = document.getElementById('proxy-address');
    const proxyTestResultEl = document.getElementById('proxy-test-result');

    // Edit Modal
    const editModal = document.getElementById('edit-modal');
    const editForm = document.getElementById('edit-form');
    const closeModalBtn = document.getElementById('close-modal-btn');

    // Load by ID form
    const monitorForm = document.getElementById('monitor-form');

    let uptimeInterval = null;

    // --- Helper Functions ---
    function animateCountUp(element, endValue) {
        const startValue = parseInt(element.dataset.previousValue || '0', 10);
        const countUp = new CountUp(element, endValue, {
            startVal: startValue,
            duration: 1.5,
            useEasing: true,
            separator: ',',
        });
        if (!countUp.error) {
            countUp.start();
        } else {
            console.error(countUp.error);
            element.textContent = endValue;
        }
        element.dataset.previousValue = endValue;
    }

    function formatUptime(totalSeconds) {
        const days = Math.floor(totalSeconds / 86400);
        totalSeconds %= 86400;
        const hours = Math.floor(totalSeconds / 3600);
        totalSeconds %= 3600;
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = Math.floor(totalSeconds % 60);

        return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    }

    // --- API Fetch Functions ---

    // Fetch general API stats (/ping, /stats, /metrics)
    async function fetchGeneralStats() {
        const cacheBust = `?_=${new Date().getTime()}`;
        // Fetch /ping
        try {
            const pingRes = await fetch(`${API_BASE_URL}/ping${cacheBust}`, {
                headers: { 'Accept': 'application/json' }
            });
            const pingData = await pingRes.json();
            pingStatusEl.textContent = pingData.status;
            pingStatusEl.className = pingData.status === 'Alive' ? 'status-up' : 'status-down';
            pingTimeEl.textContent = pingData.time_wib;

            if (uptimeInterval) clearInterval(uptimeInterval);
            let currentUptime = pingData.uptime_seconds;
            pingUptimeEl.textContent = formatUptime(currentUptime);
            uptimeInterval = setInterval(() => {
                currentUptime++;
                pingUptimeEl.textContent = formatUptime(currentUptime);
            }, 1000);
        } catch (error) {
            showToast(`Failed to fetch /ping: ${error.message}`, 'error');
            pingStatusEl.textContent = 'Error';
            pingStatusEl.className = 'status-down';
            pingTimeEl.textContent = 'N/A';
        }

        // Fetch /stats
        try {
            const statsRes = await fetch(`${API_BASE_URL}/stats${cacheBust}`, {
                headers: { 'Accept': 'application/json' }
            });
            const statsData = await statsRes.json();
            apiStatsTitleEl.textContent = `API Stats (${statsData.service})`;
            animateCountUp(totalRequestsEl, statsData.total_requests);
            animateCountUp(successCountEl, statsData.success_count);
            animateCountUp(failureCountEl, statsData.failure_count);
            successRateEl.textContent = `${statsData.success_rate_percent}%`;
        } catch (error) {
            showToast(`Failed to fetch /stats: ${error.message}`, 'error');
            apiStatsTitleEl.textContent = 'API Stats';
            totalRequestsEl.textContent = 'N/A';
            successCountEl.textContent = 'N/A';
            failureCountEl.textContent = 'N/A';
            successRateEl.textContent = 'N/A';
        }

        // Fetch /metrics
        try {
            const metricsRes = await fetch(`${API_BASE_URL}/metrics${cacheBust}`);
            const metricsData = await metricsRes.text();
            metricsEl.textContent = metricsData.trim();
        } catch (error) {
            showToast(`Failed to fetch /metrics: ${error.message}`, 'error');
            metricsEl.textContent = 'Failed to load.';
        }
    }

    // Handle Cloudflare registration
    async function handleRegistration(event) {
        event.preventDefault();
        const formData = new FormData(registerForm);
    const accountName = formData.get('cf-account-name');
    const apiToken = formData.get('cf-api-token');
    const accountId = formData.get('cf-account-id');
    const zoneId = formData.get('cf-zone-id');
    const workerName = formData.get('cf-worker-name');

    const submitButton = registerForm.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.innerHTML;
    submitButton.innerHTML = '<span class="spinner"></span> Registering...';
    submitButton.disabled = true;

    const apiData = {
        cf_api_token: apiToken,
        cf_account_id: accountId,
        cf_zone_id: zoneId,
        cf_worker_name: workerName,
        };

        try {
            const response = await fetch(`${API_BASE_URL}/statscf`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(apiData),
            });
            const result = await response.json();

            if (response.ok && result.success) {
            const newAccount = {
                id: result.unique_id,
                name: accountName,
                api_token: apiToken,
                account_id: accountId,
                zone_id: zoneId,
                worker_name: workerName
            };
            saveAccount(newAccount);
            renderSavedAccounts();
            showToast(`Account "${accountName}" registered successfully!`, 'success');
                registerForm.reset();
            } else {
            showToast(`Error: ${result.error || 'Unknown error'}`, 'error');
            }
        } catch (error) {
        showToast(`Network Error: ${error.message}`, 'error');
    } finally {
        submitButton.innerHTML = originalButtonText;
        submitButton.disabled = false;
        }
    }

// Fetch Cloudflare monitoring data
async function fetchCloudflareStats(accountId) {
    cfDataDisplayEl.innerHTML = `<div class="card placeholder"><p>Loading stats for account...</p></div>`;
    try {
        const response = await fetch(`${API_BASE_URL}/statscf/data/${accountId}`);
        const result = await response.json();

        if (response.ok && result.success && result.data) {
            renderCloudflareStats(result.data); // Pass the data OBJECT
            return result; // Return the full result for "Load & Save"
        } else {
            renderError(`Failed to load stats: ${result.error || 'ID not found or no data'}`);
            return null;
        }
    } catch (error) {
        renderError(`Network Error: ${error.message}`);
        return null;
    }
}

// --- UI Rendering Functions ---

function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: 'fa-solid fa-check-circle',
        error: 'fa-solid fa-times-circle',
        info: 'fa-solid fa-info-circle',
    };

    toast.innerHTML = `
        <i class="toast-icon ${icons[type] || icons.info}"></i>
        <span>${message}</span>
    `;

    toastContainer.appendChild(toast);

    toast.addEventListener('animationend', (event) => {
        if (event.animationName === 'fadeOut') {
            toast.remove();
        }
    });
}

function renderError(errorMessage) {
    cfDataDisplayEl.innerHTML = `<div class="card placeholder"><p style="color: #c62828;">${errorMessage}</p></div>`;
}

function renderCloudflareStats(data) { // data is now the object from result.data
    cfDataDisplayEl.innerHTML = ''; // Clear previous content

    if (data.type === 'zone') {
        cfDataDisplayEl.innerHTML = `
            <div class="card">
                <h3><i class="fa-solid fa-server"></i> Zone Stats: ${data.zone_id}</h3>
                <p>Total Requests (Today): <strong>${data.total_requests_today.toLocaleString()}</strong></p>
                <p>Total Bandwidth (Today): <strong>${(data.total_bandwidth_today_bytes / 1e9).toFixed(2)} GB</strong></p>
            </div>
            <div class="card">
                <h3><i class="fa-solid fa-chart-pie"></i> Bandwidth Usage</h3>
                <canvas id="bandwidthChart"></canvas>
            </div>
        `;
        new Chart(document.getElementById('bandwidthChart'), {
            type: 'doughnut',
            data: {
                labels: ['Used Bandwidth (GB)'],
                datasets: [{
                    data: [(data.total_bandwidth_today_bytes / 1e9)],
                    backgroundColor: ['#bb86fc'],
                    borderColor: '#121212',
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { labels: { color: 'rgba(224, 224, 224, 0.8)' } } }
            }
        });

    } else if (data.type === 'worker') {
        cfDataDisplayEl.innerHTML = `
            <div class="card">
                <h3><i class="fa-solid fa-microchip"></i> Worker Stats: ${data.worker_name}</h3>
                <p>Total Requests: <strong>${data.total_requests_today.toLocaleString()}</strong></p>
                <p>Total Subrequests: <strong>${data.total_subrequests_today.toLocaleString()}</strong></p>
                <p>Errors: <strong class="${data.total_errors_today > 0 ? 'status-down' : ''}">${data.total_errors_today.toLocaleString()}</strong></p>
            </div>
            <div class="card">
                <h3><i class="fa-solid fa-chart-bar"></i> CPU Time (µs)</h3>
                <canvas id="cpuChart"></canvas>
            </div>
        `;
        new Chart(document.getElementById('cpuChart'), {
            type: 'bar',
            data: {
                labels: ['P50', 'P90', 'P99'],
                datasets: [{
                    label: 'CPU Time (µs)',
                    data: [data.cpu_time_p50, data.cpu_time_p90, data.cpu_time_p99],
                    backgroundColor: ['#bb86fc', '#03dac6', '#cf6679'],
                    borderColor: '#121212',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(224, 224, 224, 0.1)' } },
                    x: { grid: { display: false } }
                },
                plugins: { legend: { labels: { color: 'rgba(224, 224, 224, 0.8)' } } }
            }
        });
    } else {
        renderError("Unknown or invalid data type received from API.");
    }
}

    // --- Account Management Functions ---
    function getAccounts() {
        return JSON.parse(localStorage.getItem('cf_accounts')) || {};
    }

    function saveAccount(account) {
        const accounts = getAccounts();
        accounts[account.id] = account;
        localStorage.setItem('cf_accounts', JSON.stringify(accounts));
    }

    function deleteAccount(accountId) {
        const accounts = getAccounts();
        delete accounts[accountId];
        localStorage.setItem('cf_accounts', JSON.stringify(accounts));
    }

    function renderSavedAccounts() {
        savedAccountsListEl.innerHTML = '';
        const accounts = getAccounts();
        const accountIds = Object.keys(accounts);

        if (accountIds.length === 0) {
            savedAccountsListEl.innerHTML = '<p class="placeholder-text">No accounts saved yet.</p>';
            return;
        }

        accountIds.forEach(id => {
            const account = accounts[id];
            const accountEl = document.createElement('div');
            accountEl.className = 'saved-account-item';
            const editButton = account.loaded ? '' : `<button class="action-btn edit-btn" data-id="${id}"><i class="fas fa-edit"></i></button>`;
            accountEl.innerHTML = `
                <span class="account-name">${account.name}</span>
                <div class="account-actions">
                    ${editButton}
                    <button class="action-btn delete-btn" data-id="${id}"><i class="fas fa-trash"></i></button>
                </div>
            `;

            accountEl.querySelector('.account-name').addEventListener('click', () => {
                fetchCloudflareStats(id);
                // Optional: add a visual indicator for the selected account
                document.querySelectorAll('.saved-account-item').forEach(el => el.classList.remove('active'));
                accountEl.classList.add('active');
            });

            savedAccountsListEl.appendChild(accountEl);
        });
    }

    // --- Initial Load & Interval ---
    fetchGeneralStats();
    setInterval(fetchGeneralStats, 15000); // Refresh every 15 seconds
    renderSavedAccounts();

    // --- Proxy Test Function ---
    async function handleProxyTest(event) {
        event.preventDefault();
        const proxyAddress = proxyAddressInput.value.trim();
        if (!proxyAddress) {
            showToast('Please enter a proxy address.', 'error');
            return;
        }

        const submitButton = proxyTestForm.querySelector('button[type="submit"]');
        const originalButtonText = submitButton.innerHTML;
        submitButton.innerHTML = '<span class="spinner"></span> Testing...';
        submitButton.disabled = true;

        try {
            const response = await fetch(`${API_BASE_URL}/health?proxy=${encodeURIComponent(proxyAddress)}`);
            const result = await response.json();

            if (response.ok) {
                showToast(`Proxy UP | Latency: ${result.latency_ms}ms`, 'success');
            } else {
                showToast(`Proxy DOWN | Error: ${result.error || 'N/A'}`, 'error');
            }
        } catch (error) {
            showToast(`Network error: ${error.message}`, 'error');
        } finally {
            submitButton.innerHTML = originalButtonText;
            submitButton.disabled = false;
            // Refresh the general stats to show the new request count
            await fetchGeneralStats();
        }
    }

    // --- Event Listeners ---
    registerForm.addEventListener('submit', handleRegistration);
    proxyTestForm.addEventListener('submit', handleProxyTest);

    savedAccountsListEl.addEventListener('click', (event) => {
        const target = event.target.closest('.action-btn');
        if (!target) return;

        const accountId = target.dataset.id;

        if (target.classList.contains('delete-btn')) {
            if (confirm('Are you sure you want to delete this account?')) {
                deleteAccount(accountId);
                renderSavedAccounts();
                // Optionally clear the display if the deleted account was active
                cfDataDisplayEl.innerHTML = '<div class="card placeholder"><p>Select an account to view stats.</p></div>';
            }
        }

        if (target.classList.contains('edit-btn')) {
            openEditModal(accountId);
        }
    });

    function openEditModal(accountId) {
        const accounts = getAccounts();
        const account = accounts[accountId];
        if (!account) return;

        // Populate the form with existing data
        editForm.querySelector('#edit-account-id').value = account.id;
        editForm.querySelector('#edit-account-name').value = account.name;
        editForm.querySelector('#edit-api-token').value = account.api_token;
        editForm.querySelector('#edit-account-id-cf').value = account.account_id;
        editForm.querySelector('#edit-zone-id').value = account.zone_id || '';
        editForm.querySelector('#edit-worker-name').value = account.worker_name || '';

        editModal.style.display = 'flex';
    }

    function closeEditModal() {
        editModal.style.display = 'none';
    }

    closeModalBtn.addEventListener('click', closeEditModal);
    editModal.addEventListener('click', (event) => {
        if (event.target === editModal) {
            closeEditModal();
        }
    });

    editForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const accountId = editForm.querySelector('#edit-account-id').value;

        const updatedAccount = {
            id: accountId,
            name: editForm.querySelector('#edit-account-name').value,
            api_token: editForm.querySelector('#edit-api-token').value,
            account_id: editForm.querySelector('#edit-account-id-cf').value,
            zone_id: editForm.querySelector('#edit-zone-id').value,
            worker_name: editForm.querySelector('#edit-worker-name').value,
        };

        saveAccount(updatedAccount);
        renderSavedAccounts();
        closeEditModal();
    });

    monitorForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const uniqueId = monitorForm.querySelector('#monitor-unique-id').value.trim();
        const accountName = monitorForm.querySelector('#monitor-account-name').value.trim();

        if (!uniqueId) {
            showToast('Please enter a Unique ID.', 'error');
            return;
        }

        const submitButton = monitorForm.querySelector('button[type="submit"]');
        const originalButtonText = submitButton.innerHTML;
        submitButton.innerHTML = '<span class="spinner"></span> Loading...';
        submitButton.disabled = true;

        const result = await fetchCloudflareStats(uniqueId);

        if (result && accountName) {
            // If the fetch was successful and a name was provided, save the account
            const newAccount = {
                id: uniqueId,
                name: accountName,
                // We don't have full details, so mark it as 'loaded'
                // This prevents the 'Edit' button from showing
                loaded: true
            };
            saveAccount(newAccount);
            renderSavedAccounts();
            monitorForm.reset();
            showToast(`Account "${accountName}" saved and loaded!`, 'success');
        } else if (result) {
            showToast('Stats loaded successfully!', 'success');
        }

        submitButton.innerHTML = originalButtonText;
        submitButton.disabled = false;
    });
});