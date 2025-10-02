document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = 'https://cfanalistik.up.railway.app';

    // --- DOM Elements ---
    // General Stats
    const pingStatusEl = document.getElementById('ping-status-val');
    const pingUptimeEl = document.getElementById('ping-uptime-val');
    const totalRequestsEl = document.getElementById('stats-total-req-val');
    const successRateEl = document.getElementById('stats-success-rate-val');
    const metricsEl = document.getElementById('metrics-val');

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
            totalRequestsEl.textContent = statsData.total_requests;
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

            if (response.ok && result.success) {
                renderCloudflareStats(result.data);
                saveAndRenderStoredIds(uniqueId);
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

        if (data.type === 'zone') {
            cfDataDisplayEl.innerHTML = `
                <div class="card">
                    <h3>Zone Stats: ${data.zone_id}</h3>
                    <p>Total Requests (Today): <strong>${data.total_requests_today.toLocaleString()}</strong></p>
                    <p>Total Bandwidth (Today): <strong>${(data.total_bandwidth_today_bytes / 1e9).toFixed(2)} GB</strong></p>
                </div>
                <div class="card">
                    <h3>Bandwidth Usage</h3>
                    <canvas id="bandwidthChart"></canvas>
                </div>
            `;
            // Render chart
            new Chart(document.getElementById('bandwidthChart'), {
                type: 'doughnut',
                data: {
                    labels: ['Used Bandwidth (GB)'],
                    datasets: [{
                        data: [(data.total_bandwidth_today_bytes / 1e9)],
                        backgroundColor: ['#3498db'],
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });

        } else if (data.type === 'worker') {
            cfDataDisplayEl.innerHTML = `
                <div class="card">
                    <h3>Worker Stats: ${data.worker_name}</h3>
                    <p>Total Requests: <strong>${data.total_requests_today.toLocaleString()}</strong></p>
                    <p>Total Subrequests: <strong>${data.total_subrequests_today.toLocaleString()}</strong></p>
                    <p>Errors: <strong class="${data.total_errors_today > 0 ? 'status-down' : ''}">${data.total_errors_today.toLocaleString()}</strong></p>
                </div>
                <div class="card">
                    <h3>CPU Time (µs)</h3>
                    <canvas id="cpuChart"></canvas>
                </div>
            `;
            // Render chart
            new Chart(document.getElementById('cpuChart'), {
                type: 'bar',
                data: {
                    labels: ['P50', 'P90', 'P99'],
                    datasets: [{
                        label: 'CPU Time (µs)',
                        data: [data.cpu_time_p50, data.cpu_time_p90, data.cpu_time_p99],
                        backgroundColor: ['#3498db', '#2ecc71', '#f1c40f'],
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
            });
        }
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