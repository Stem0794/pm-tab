
document.addEventListener('DOMContentLoaded', () => {
    updateDate();
    loadSettings();
    setupEventListeners();
});

function updateDate() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('date-text').textContent = now.toLocaleDateString('en-US', options);
}

function setupEventListeners() {
    const settingsBtn = document.getElementById('settings-btn');
    const modal = document.getElementById('settings-modal');
    const closeBtn = document.getElementById('close-settings');
    const saveBtn = document.getElementById('save-settings');

    settingsBtn.addEventListener('click', () => {
        modal.classList.add('active');
        // Load keys into inputs
        chrome.storage.local.get(['linearId', 'everhourId'], (result) => {
            if (result.linearId) {
                document.getElementById('linear-api').value = result.linearId;
                loadLinearProjectsUI(); // Try to load projects if key exists
            }
            if (result.everhourId) {
                document.getElementById('everhour-api').value = result.everhourId;
                loadEverhourProjectsUI(); // Try to load projects if key exists
            }
        });
    });

    // Filter listeners
    document.getElementById('linear-search').addEventListener('input', (e) => {
        filterProjects('linear-projects-list', e.target.value);
    });

    document.getElementById('everhour-search').addEventListener('input', (e) => {
        filterProjects('everhour-projects-list', e.target.value);
    });

    closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });

    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });

    saveBtn.addEventListener('click', () => {
        const linearKey = document.getElementById('linear-api').value.trim();
        const everhourKey = document.getElementById('everhour-api').value.trim();

        // Collect selected projects
        const selectedLinear = Array.from(document.querySelectorAll('.linear-project-checkbox:checked')).map(cb => cb.value);
        const selectedEverhour = Array.from(document.querySelectorAll('.everhour-project-checkbox:checked')).map(cb => cb.value);

        chrome.storage.local.set({
            linearId: linearKey,
            everhourId: everhourKey,
            linearProjects: selectedLinear, // Saves empty array if none selected (logic should interpret empty as "all" or specific handling)
            everhourProjects: selectedEverhour
        }, () => {
            modal.classList.remove('active');
            alert('Settings saved!');
            loadDashboard(); // Reload data
        });
    });

    // Refresh projects button or logic? For now, we load on open if key is there.
    // Maybe verify key change? For simplicity, we assume hitting "Save" updates everything.
    // If they change key, they might need to re-open settings or we should detect blur?
    // Let's add a blur listener to API inputs to fetch projects
    document.getElementById('linear-api').addEventListener('blur', () => {
        // Temporarily save to local to allow fetch to work or pass key directly? 
        // Our api.js uses storage. let's set it if changed?
        // Better: update logic in future. For now, rely on existing key or user pressing save once.
        // Actually, without saving the new key, fetchProjects won't work if we use storage.
        // Let's just rely on the user having a valid key saved or re-opening.
    });
}

async function loadLinearProjectsUI() {
    const list = document.getElementById('linear-projects-list');
    list.innerHTML = '<p class="small-text">Loading...</p>';

    try {
        const projects = await window.fetchLinearProjects();
        chrome.storage.local.get(['linearProjects'], (result) => {
            const selected = new Set(result.linearProjects || []);

            list.innerHTML = '';
            if (projects.length === 0) {
                list.innerHTML = '<p class="small-text">No projects found</p>';
                return;
            }

            projects.forEach(p => {
                const div = document.createElement('div');
                div.className = 'project-item';
                const isChecked = selected.has(p.id) ? 'checked' : '';
                div.innerHTML = `
                    <label>
                        <input type="checkbox" class="linear-project-checkbox" value="${p.id}" ${isChecked}>
                        ${p.name}
                    </label>
                `;
                list.appendChild(div);
            });
        });
    } catch (e) {
        list.innerHTML = `<p class="small-text" style="color:red">${e.message || 'Error'}</p>`;
    }
}

async function loadEverhourProjectsUI() {
    const list = document.getElementById('everhour-projects-list');
    list.innerHTML = '<p class="small-text">Loading...</p>';

    try {
        const projects = await window.fetchEverhourProjects();
        chrome.storage.local.get(['everhourProjects'], (result) => {
            const selected = new Set(result.everhourProjects || []);

            list.innerHTML = '';
            if (projects.length === 0) {
                list.innerHTML = '<p class="small-text">No projects found</p>';
                return;
            }

            projects.forEach(p => {
                const div = document.createElement('div');
                div.className = 'project-item';
                const isChecked = selected.has(p.id) ? 'checked' : '';
                div.innerHTML = `
                    <label>
                        <input type="checkbox" class="everhour-project-checkbox" value="${p.id}" ${isChecked}>
                        ${p.name}
                    </label>
                `;
                list.appendChild(div);
            });
        });
    } catch (e) {
        list.innerHTML = `<p class="small-text" style="color:red">${e.message || 'Error'}</p>`;
    }
}

function loadSettings() {
    chrome.storage.local.get(['linearId', 'everhourId'], (result) => {
        if (!result.linearId || !result.everhourId) {
            document.getElementById('greeting-text').textContent = "Welcome! Please configure API Keys.";
            document.getElementById('settings-modal').classList.add('active');
        } else {
            loadDashboard();
        }
    });
}

function filterProjects(listId, query) {
    const list = document.getElementById(listId);
    const items = list.getElementsByClassName('project-item');
    const term = query.toLowerCase();

    Array.from(items).forEach(item => {
        const text = item.textContent.trim().toLowerCase();
        if (text.includes(term)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

function loadDashboard() {
    document.getElementById('dashboard').classList.remove('hidden');
    document.getElementById('greeting-text').textContent = "Here is your overview";

    if (window.fetchLinearData) window.fetchLinearData();

    if (window.loadBudgets) window.loadBudgets();
    if (window.loadCycle) window.loadCycle();
}

window.loadBudgets = async function () {
    const tableBody = document.getElementById('budget-list');
    chrome.storage.local.get(['everhourId', 'everhourProjects'], async (result) => {
        if (!result.everhourId) return;

        try {
            const projects = await window.fetchEverhourProjects();
            const selectedSet = new Set(result.everhourProjects || []);

            // Filter
            const displayProjects = projects.filter(p => !selectedSet.size || selectedSet.has(p.id));

            tableBody.innerHTML = '';

            // Sort by % used descending
            displayProjects.sort((a, b) => {
                const aBudget = a.budget?.budget || 0;
                const bBudget = b.budget?.budget || 0;
                if (!aBudget) return 1;
                if (!bBudget) return -1;

                // Use budget.progress from the API response
                const aSpent = a.budget?.progress || 0;
                const bSpent = b.budget?.progress || 0;

                return (bSpent / bBudget) - (aSpent / aBudget);
            });

            let shownCount = 0;
            let noBudgetCount = 0;

            displayProjects.forEach(p => {
                const budgetTotal = p.budget?.budget;
                if (!budgetTotal) {
                    noBudgetCount++;
                    return;
                }

                shownCount++;
                const budgetType = p.budget?.type; // 'money' or 'time'? 
                // Based on JSON: type="money", budget=5157700 (cents), progress=2709117 (cents)
                // If type="time", probably seconds.

                const progress = p.budget?.progress || 0;
                const percentage = (progress / budgetTotal) * 100;

                const row = document.createElement('tr');

                let spentDisplay = '';
                let budgetDisplay = '';

                if (budgetType === 'money') {
                    // Cents to currency (assuming USD/Euro default or just formatted number)
                    // If rate provided, maybe we can deduce currency, but let's just use standard number format
                    // Divide by 100 for cents
                    const spentVal = (progress / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                    const budgetVal = (budgetTotal / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                    spentDisplay = `${spentVal}`; // Could add currency symbol if known
                    budgetDisplay = `${budgetVal}`;
                    // Add a hint somewhere it's money? Or just number is fine. Used the mock style.
                } else {
                    // Time (seconds) => Hours
                    spentDisplay = (progress / 3600).toFixed(0) + 'h';
                    budgetDisplay = (budgetTotal / 3600).toFixed(0) + 'h';
                }

                let colorClass = '';
                if (percentage > 100) colorClass = 'danger';
                else if (percentage > 80) colorClass = 'warning';

                row.innerHTML = `
                    <td>
                        <div style="font-weight: 500;">${p.name}</div>
                        <div class="budget-bar-container">
                            <div class="budget-bar ${colorClass}" style="width: ${Math.min(percentage, 100)}%"></div>
                        </div>
                    </td>
                    <td>${spentDisplay}</td>
                    <td>${budgetDisplay}</td>
                    <td style="${percentage > 100 ? 'color: #ef4444' : ''}">${percentage.toFixed(0)}%</td>
                `;
                tableBody.appendChild(row);
            });

            if (shownCount === 0) {
                tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem;">No budgeted projects found.</td></tr>';
            }

            // Add summary row if hidden projects exist
            if (noBudgetCount > 0) {
                const summaryRow = document.createElement('tr');
                summaryRow.innerHTML = `<td colspan="4" style="text-align: center; font-size: 0.8rem; opacity: 0.6; padding-top: 1rem;">
                    Showing ${shownCount} with budgets. (${noBudgetCount} hidden)
                </td>`;
                tableBody.appendChild(summaryRow);
            }
        } catch (e) {
            console.error(e);
            tableBody.innerHTML = `<tr><td colspan="4" style="color: red;">Error: ${e.message}</td></tr>`;
        }
    });
};

window.loadCycle = async function () {
    const container = document.getElementById('cycle-container');
    try {
        const cycles = await window.fetchLinearCycles();
        if (!cycles || cycles.length === 0) {
            container.innerHTML = '<p>No active cycles found.</p>';
            return;
        }
        // Get selected projects
        const stored = await chrome.storage.local.get(['linearProjects']);
        const selectedProjects = new Set(stored.linearProjects || []);

        // Since API looks up cycles by selected project's teams, we assume all returned cycles are relevant.
        // We no longer filter by issues since we removed issues from the query to save complexity.

        if (cycles.length === 0) {
            container.innerHTML = '<p>No active cycles found.</p>';
            return;
        }

        container.innerHTML = ''; // Clear loading state

        cycles.forEach(cycle => {
            const start = new Date(cycle.startsAt);
            const end = new Date(cycle.endsAt);
            const now = new Date();

            const burnup = cycle.burnup;

            // Calculate progress and "weekdays left"
            // Simple weekdays calculation (ignoring holidays)
            let weekdaysLeft = 0;
            let d = new Date(now); // Start from today
            while (d <= end) {
                const day = d.getDay();
                if (day !== 0 && day !== 6) weekdaysLeft++; // 0 is Sun, 6 is Sat
                d.setDate(d.getDate() + 1);
            }
            if (now > end) weekdaysLeft = 0;

            // Stats from burnup
            const totalScope = burnup ? burnup.meta.totalScope : 0;
            const totalStarted = burnup ? burnup.meta.totalStarted : 0;
            const totalCompleted = burnup ? burnup.meta.totalCompleted : 0;

            const startedPct = totalScope ? ((totalStarted / totalScope) * 100).toFixed(0) : 0;
            const completedPct = totalScope ? ((totalCompleted / totalScope) * 100).toFixed(0) : 0;

            // "Capacity" metric usually requires team settings. We'll simulate "100% of capacity" if unknown, 
            // or maybe just show "Scope: X points". 
            // The user wanted "385% of capacity" style. Without capacity data, let's show "X Points Scoped".
            // OR we can leave the "Capacity" text but hardcode/hide it if unknown.
            // Let's use "Current" label and points.

            // Create widget for this cycle
            const cycleDiv = document.createElement('div');
            cycleDiv.className = 'cycle-item';
            cycleDiv.style.marginBottom = '2rem';
            cycleDiv.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
            cycleDiv.style.paddingBottom = '1rem';
            cycleDiv.innerHTML = `
                <div class="linear-cycle-header">
                    <div class="cycle-title-group">
                        <div class="cycle-status-badge">Current</div>
                        <h3 class="cycle-name">${cycle.name || 'Cycle ' + cycle.number}</h3>
                    </div>
                    <div class="cycle-meta-info">
                        <span class="capacity-info"><span class="accent-text">${totalScope}</span> points</span>
                        <span class="separator">•</span>
                        <span class="time-left">${weekdaysLeft} weekdays left</span>
                    </div>
                </div>

                <div class="linear-graph-layout">
                    <!-- Graph Area -->
                    <div class="graph-wrapper">
                         <canvas id="cycle-chart-${cycle.id}"></canvas>
                    </div>

                    <!-- Legend / Stats Side Panel -->
                    <div class="linear-legend">
                        <div class="legend-item">
                            <span class="dot scope-dot"></span>
                            <span class="label">Scope</span>
                            <span class="value">${totalScope}</span>
                            <!-- <span class="delta"></span> -->
                        </div>
                        <div class="legend-item">
                            <span class="dot started-dot"></span>
                            <span class="label">Started</span>
                            <span class="value">${totalStarted}</span>
                            <span class="percentage">${startedPct}%</span>
                        </div>
                        <div class="legend-item">
                            <span class="dot completed-dot"></span>
                            <span class="label">Completed</span>
                            <span class="value">${totalCompleted}</span>
                            <span class="percentage">${completedPct}%</span>
                        </div>
                    </div>
                </div>
            `;
            container.appendChild(cycleDiv);

            if (burnup && burnup.labels.length > 0) {
                const ctx = document.getElementById(`cycle-chart-${cycle.id}`).getContext('2d');

                new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: burnup.labels,
                        datasets: [
                            {
                                label: 'Scope',
                                data: burnup.scope,
                                borderColor: '#52525b', // Zinc-600
                                borderWidth: 2,
                                borderDash: [4, 4],
                                pointRadius: 0,
                                fill: false,
                                tension: 0.1
                            },
                            {
                                label: 'Started',
                                data: burnup.started,
                                borderColor: '#fbbf24', // Amber-400
                                backgroundColor: 'rgba(251, 191, 36, 0.05)',
                                borderWidth: 2,
                                pointRadius: 0,
                                fill: true,
                                tension: 0.3
                            },
                            {
                                label: 'Completed',
                                data: burnup.completed,
                                borderColor: '#60a5fa', // Blue-400
                                backgroundColor: 'rgba(96, 165, 250, 0.1)',
                                borderWidth: 2,
                                pointRadius: 0,
                                fill: true,
                                tension: 0.3
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                mode: 'index',
                                intersect: false,
                                backgroundColor: '#1e293b',
                                titleColor: '#f8fafc',
                                bodyColor: '#cbd5e1',
                                borderColor: 'rgba(255,255,255,0.1)',
                                borderWidth: 1,
                                padding: 10
                            }
                        },
                        scales: {
                            x: {
                                display: true,
                                grid: {
                                    color: 'rgba(255,255,255,0.02)',
                                    drawBorder: false
                                },
                                ticks: {
                                    color: '#64748b',
                                    font: { size: 10 },
                                    maxTicksLimit: 6,
                                    maxRotation: 0
                                }
                            },
                            y: {
                                display: false, // Minimilist look
                                min: 0
                            }
                        },
                        interaction: {
                            mode: 'nearest',
                            axis: 'x',
                            intersect: false
                        }
                    }
                });
            }
        });

        // Remove border from last item
        if (container.lastElementChild) {
            container.lastElementChild.style.borderBottom = 'none';
        }

    } catch (e) {
        console.error(e);
        container.innerHTML = `<p style="color: red">Error: ${e.message}</p>`;
    }
};
