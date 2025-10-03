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
    const monitorForm = document.getElementById('monitor-form');
    const monitorIdInput = document.getElementById('monitor-unique-id');
    const cfDataDisplayEl = document.getElementById('cf-data-display');
    const storedIdsContainer = document.getElementById('stored-ids');

    let uptimeInterval = null;

    // --- Helper Functions ---
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

    // Fetch general API stats (/ping and /stats)
    async function fetchGeneralStats() {
        try {
            // Fetch /ping
            const pingRes = await fetch(`${API_BASE_URL}/ping`);
            const pingData = await pingRes.json();
            pingStatusEl.textContent = pingData.status;
            pingStatusEl.className = pingData.status === 'Alive' ? 'status-up' : 'status-down';
            pingTimeEl.textContent = pingData.time_wib;

            // Start the realtime uptime counter
            if (uptimeInterval) clearInterval(uptimeInterval);
            let currentUptime = pingData.uptime_seconds;
            pingUptimeEl.textContent = formatUptime(currentUptime);
            uptimeInterval = setInterval(() => {
                currentUptime++;
                pingUptimeEl.textContent = formatUptime(currentUptime);
            }, 1000);


            // Fetch /stats
            const statsRes = await fetch(`${API_BASE_URL}/stats`);
            const statsData = await statsRes.json();
            apiStatsTitleEl.textContent = `API Stats (${statsData.service})`;
            totalRequestsEl.textContent = statsData.total_requests;
            successCountEl.textContent = statsData.success_count;
            failureCountEl.textContent = statsData.failure_count;
            successRateEl.textContent = `${statsData.success_rate_percent}%`;

            // Fetch /metrics
            const metricsRes = await fetch(`${API_BASE_URL}/metrics`);
            const metricsData = await metricsRes.text();
            metricsEl.textContent = metricsData.trim();

        } catch (error) {
            console.error('Error fetching general stats:', error);
            if (uptimeInterval) clearInterval(uptimeInterval);
            pingStatusEl.textContent = 'Error';
            pingStatusEl.className = 'status-down';
            pingTimeEl.textContent = 'N/A';
            apiStatsTitleEl.textContent = 'API Stats';
            totalRequestsEl.textContent = 'N/A';
            successCountEl.textContent = 'N/A';
            failureCountEl.textContent = 'N/A';
            successRateEl.textContent = 'N/A';
            metricsEl.textContent = 'Failed to load.';
        }
    }

    // Handle Cloudflare registration
    async function handleRegistration(event) {
        event.preventDefault();
        const formData = new FormData(registerForm);
        const data = {
            cf_api_token: formData.get('cf-api-token'),
            cf_account_id: formData.get('cf-account-id'),
            cf_zone_id: formData.get('cf-zone-id'),
            cf_worker_name: formData.get('cf-worker-name'),
        };

        displayResponse(registerResponseEl, 'Registering...', 'loading');

        try {
            const response = await fetch(`${API_BASE_URL}/statscf`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            const result = await response.json();

            if (response.ok && result.success) {
                displayResponse(registerResponseEl, `Success! Your Unique ID is: ${result.unique_id}`, 'success');
                saveAndRenderStoredIds(result.unique_id);
                monitorIdInput.value = result.unique_id; // Auto-fill monitor input
                registerForm.reset();
            } else {
                displayResponse(registerResponseEl, `Error: ${result.error || 'Unknown error'}`, 'error');
            }
        } catch (error) {
            displayResponse(registerResponseEl, `Network Error: ${error.message}`, 'error');
        }
    }

    // Handle Cloudflare monitoring
    async function handleMonitoring(event) {
        event.preventDefault();
        const uniqueId = monitorIdInput.value.trim();
        if (!uniqueId) {
            alert('Please enter a Unique ID.');
            return;
        }

        cfDataDisplayEl.innerHTML = '<div class="card"><p>Loading stats...</p></div>';

        try {
            const response = await fetch(`${API_BASE_URL}/statscf/data/${uniqueId}`);
            const result = await response.json();

            if (response.ok && result.success && result.data && result.data.length > 0) {
                renderCloudflareStats(result.data[0]); // Pass the first element of the data array
                saveAndRenderStoredIds(uniqueId);
            } else if (result.data && result.data.length === 0) {
                renderError('No analytics data found for this ID yet.');
            } else {
                renderError(`Failed to load stats: ${result.error || 'ID not found'}`);
            }
        } catch (error) {
            renderError(`Network Error: ${error.message}`);
        }
    }

    // --- UI Rendering Functions ---

    function displayResponse(element, message, type) {
        element.style.display = 'block';
        element.className = `response-message ${type}`;
        element.textContent = message;
    }

    function renderError(errorMessage) {
        cfDataDisplayEl.innerHTML = `<div class="card placeholder"><p style="color: #c62828;">${errorMessage}</p></div>`;
    }

    function renderCloudflareStats(data) {
        cfDataDisplayEl.innerHTML = ''; // Clear previous content

        const { global_stats, zone_stats, worker_stats } = data;

        // Create and append cards
        const globalCard = document.createElement('div');
        globalCard.className = 'card';
        globalCard.innerHTML = `
            <h3>Global Stats</h3>
            <p>Total Requests: <strong>${global_stats.total_requests.toLocaleString()}</strong></p>
        `;

        const zoneCard = document.createElement('div');
        zoneCard.className = 'card';
        zoneCard.innerHTML = `
            <h3>Zone Stats</h3>
            <p>Bandwidth Usage: <strong>${(zone_stats.bandwidth_bytes / 1e9).toFixed(4)} GB</strong></p>
            <canvas id="bandwidthChart"></canvas>
        `;

        const workerCard = document.createElement('div');
        workerCard.className = 'card';
        workerCard.innerHTML = `
            <h3>Worker Stats</h3>
            <p>Requests: <strong>${worker_stats.requests.toLocaleString()}</strong></p>
            <p>Subrequests: <strong>${worker_stats.subrequests.toLocaleString()}</strong></p>
            <p>Errors: <strong class="${worker_stats.errors > 0 ? 'status-down' : ''}">${worker_stats.errors.toLocaleString()}</strong></p>
            <canvas id="workerChart"></canvas>
        `;

        cfDataDisplayEl.appendChild(globalCard);
        cfDataDisplayEl.appendChild(zoneCard);
        cfDataDisplayEl.appendChild(workerCard);

        // Render Bandwidth Chart
        new Chart(document.getElementById('bandwidthChart'), {
            type: 'doughnut',
            data: {
                labels: ['Bandwidth (GB)'],
                datasets: [{
                    data: [(zone_stats.bandwidth_bytes / 1e9) || 0],
                    backgroundColor: ['#bb86fc'],
                    borderColor: '#1e1e1e',
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });

        // Render Worker Stats Chart
        new Chart(document.getElementById('workerChart'), {
            type: 'bar',
            data: {
                labels: ['Requests', 'Subrequests', 'Errors'],
                datasets: [{
                    label: 'Count',
                    data: [worker_stats.requests, worker_stats.subrequests, worker_stats.errors],
                    backgroundColor: ['#bb86fc', '#03dac6', '#cf6679'],
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(224, 224, 224, 0.1)' } },
                    x: { grid: { display: false } }
                },
                plugins: { legend: { display: false } }
            }
        });
    }

    // --- Local Storage Functions ---
    function getStoredIds() {
        return JSON.parse(localStorage.getItem('cf_monitor_ids')) || [];
    }

    function saveAndRenderStoredIds(newId) {
        let ids = getStoredIds();
        if (!ids.includes(newId)) {
            ids.unshift(newId); // Add to the beginning
            ids = ids.slice(0, 5); // Keep only the last 5
            localStorage.setItem('cf_monitor_ids', JSON.stringify(ids));
        }
        renderStoredIds();
    }

    function renderStoredIds() {
        const ids = getStoredIds();
        storedIdsContainer.innerHTML = '';
        if (ids.length > 0) {
            ids.forEach(id => {
                const btn = document.createElement('button');
                btn.className = 'stored-id-btn';
                btn.textContent = id.substring(0, 8) + '...';
                btn.title = id;
                btn.onclick = () => {
                    monitorIdInput.value = id;
                    handleMonitoring(new Event('submit'));
                };
                storedIdsContainer.appendChild(btn);
            });
        }
    }


    // --- Initial Load & Interval ---
    fetchGeneralStats();
    setInterval(fetchGeneralStats, 15000); // Refresh every 15 seconds

    renderStoredIds();

    // --- Event Listeners ---
    registerForm.addEventListener('submit', handleRegistration);
    monitorForm.addEventListener('submit', handleMonitoring);
});