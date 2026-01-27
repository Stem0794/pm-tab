
// api.js

async function fetchLinearProjects() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(['linearId'], async (result) => {
            if (!result.linearId) return reject('No Linear API Key');

            const query = `
            query {
                projects(first: 250, filter: { state: { in: ["started", "planned", "paused"] } }) {
                    nodes {
                        id
                        name
                        state
                    }
                }
            }`;

            try {
                const response = await fetch('https://api.linear.app/graphql', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': result.linearId
                    },
                    body: JSON.stringify({ query })
                });

                const data = await response.json();
                if (data.errors) throw new Error(data.errors[0].message);

                resolve(data.data.projects.nodes);
            } catch (e) {
                reject(e);
            }
        });
    });
}


// Everhour doesn't have a simple "projects" endpoint that maps 1:1 easily without extra scopes usually, 
// but we can fetch projects from GET /projects
async function fetchEverhourProjects() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(['everhourId'], async (result) => {
            if (!result.everhourId) return reject('No Everhour API Key');

            try {
                // Fetch projects with budget details if possible. 
                // Creating a separate function for detailed dashboard data might be better, 
                // but let's see if we can reuse or just fetch all here.
                const response = await fetch('https://api.everhour.com/projects?limit=250', {
                    headers: { 'X-Api-Key': result.everhourId }
                });

                if (!response.ok) throw new Error('Failed to fetch projects');
                const data = await response.json();

                // Debug: Log first project to check structure
                if (data.length > 0) console.log('Everhour Project Sample:', data[0]);

                // Filter out archived projects (permissive check)
                // Some APIs use 'status': 'active'/'archived', others use boolean 'archived': true
                const activeProjects = data.filter(p => p.status !== 'archived' && p.archived !== true);

                resolve(activeProjects);
            } catch (e) {
                reject(e);
            }
        });
    });
}

async function fetchLinearCycles() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(['linearId', 'linearProjects'], async (result) => {
            if (!result.linearId) return reject('No Linear API Key');

            const now = new Date().toISOString();
            const projectIds = result.linearProjects || [];

            let query;

            // Strategy: 
            // If projects are selected, fetch the activeCycle for EACH project.
            // This guarantees we find the relevant cycle for the selected projects.
            // If no projects selected, fetch the global active cycles (limit 10).

            if (projectIds.length > 0) {
                // Step 1: Fetch Team IDs for the selected projects
                // We split this into two queries to avoid "Query too complex" error from Linear
                const idsString = JSON.stringify(projectIds);
                const teamsQuery = `
                query {
                    projects(filter: { id: { in: ${idsString} } }) {
                        nodes {
                            teams {
                                nodes {
                                    id
                                }
                            }
                        }
                    }
                }`;

                try {
                    const teamsResponse = await fetch('https://api.linear.app/graphql', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': result.linearId
                        },
                        body: JSON.stringify({ query: teamsQuery })
                    });

                    const teamsData = await teamsResponse.json();
                    if (teamsData.errors) throw new Error(teamsData.errors[0].message);

                    // Collect unique team IDs
                    const teamIds = new Set();
                    teamsData.data.projects.nodes.forEach(p => {
                        if (p.teams && p.teams.nodes) {
                            p.teams.nodes.forEach(t => teamIds.add(t.id));
                        }
                    });

                    if (teamIds.size === 0) {
                        return resolve([]);
                    }

                    // Step 2: Fetch Active Cycles for these Teams
                    const teamIdsString = JSON.stringify(Array.from(teamIds));
                    query = `
                    query {
                        teams(filter: { id: { in: ${teamIdsString} } }) {
                            nodes {
                                name
                                activeCycle {
                                    id
                                    number
                                    name
                                    startsAt
                                    endsAt
                                    progress
                                    team { name }
                                }
                            }
                        }
                    }`;

                } catch (e) {
                    return reject(e);
                }
            } else {
                // Global fetch fallback
                query = `
                query {
                    cycles(first: 10, filter: { endsAt: { gt: "${now}" } }) {
                        nodes {
                            id
                            number
                            name
                            startsAt
                            endsAt
                            progress
                            team { name }
                        }
                    }
                }`;
            }

            try {
                const response = await fetch('https://api.linear.app/graphql', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': result.linearId
                    },
                    body: JSON.stringify({ query })
                });

                const data = await response.json();
                if (data.errors) throw new Error(data.errors[0].message);

                let cycles = [];
                if (projectIds.length > 0) {
                    // Extract active cycles from teams
                    const teams = data.data.teams.nodes;
                    teams.forEach(team => {
                        if (team.activeCycle) {
                            cycles.push(team.activeCycle);
                        }
                    });
                } else {
                    cycles = data.data.cycles.nodes;
                }

                resolve(cycles);
            } catch (e) {
                reject(e);
            }
        });
    });
}

async function fetchCycleBurnupData(cycleId, startDate, endDate) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(['linearId'], async (result) => {
            if (!result.linearId) return reject('No Linear API Key');

            // Fetch all issues in the cycle with their timestamps and estimates
            const query = `
            query {
                cycle(id: "${cycleId}") {
                    issues {
                        nodes {
                            id
                            estimate
                            createdAt
                            startedAt
                            completedAt
                            state { type }
                        }
                    }
                }
            }`;

            try {
                const response = await fetch('https://api.linear.app/graphql', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': result.linearId
                    },
                    body: JSON.stringify({ query })
                });

                const data = await response.json();
                if (data.errors) throw new Error(data.errors[0].message);

                const issues = data.data.cycle.issues.nodes;
                const burnup = processBurnupData(issues, startDate, endDate);
                resolve(burnup);
            } catch (e) {
                reject(e);
            }
        });
    });
}

function processBurnupData(issues, startDateStr, endDateStr) {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    const now = new Date();

    // Normalize dates to midnight
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);

    // If cycle end is far in future, maybe cap at "today" for the graph?
    // But burnup usually shows the whole planned duration.
    // Let's generate dates for the whole cycle range
    const dates = [];
    const dateLabels = [];
    let current = new Date(start);

    // If start is invalid, return empty
    if (isNaN(current.getTime())) return null;

    while (current <= end) {
        dates.push(new Date(current));
        dateLabels.push(current.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
        current.setDate(current.getDate() + 1);
    }

    // Series
    const scopeSeries = [];
    const startedSeries = [];
    const completedSeries = [];

    // Pre-calculate issue data
    // Issue "Scope" logic: If issue was created before or on Day X, it counts? 
    // Simplified: All issues currently in cycle count towards scope for all days (Scope line usually flat or stepped up).
    // Better: Issue counts if `createdAt` <= Day X. 
    // Actually, `createdAt` is when issue was made in Linear, not necessarily added to cycle.
    // Without `addedAt`, let's assume all issues currently in cycle were there or added. 
    // Simply using TOTAL current estimate as a constant scope is common approximation if history missing.
    // BUT, let's try to be slightly smart: if created *during* cycle, add it then.

    // Total stats for header
    let totalScope = 0;
    let totalStarted = 0;
    let totalCompleted = 0;

    issues.forEach(i => {
        const est = i.estimate || 0;
        totalScope += est;
        if (i.startedAt) totalStarted += est;
        if (i.completedAt) totalCompleted += est;
    });

    dates.forEach(date => {
        // We only plot up to "today" ? Or project future?
        // Burnup Usually projects. But "started/completed" lines stop at today.
        // Scope line goes to end.

        const isFuture = date > now;

        let dailyScope = 0;
        let dailyStarted = 0;
        let dailyCompleted = 0;

        issues.forEach(issue => {
            const est = issue.estimate || 0;
            const created = new Date(issue.createdAt);
            const started = issue.startedAt ? new Date(issue.startedAt) : null;
            const completed = issue.completedAt ? new Date(issue.completedAt) : null;

            // Scope: simplified, count all. (Or check createdAt <= date)
            if (created <= date || true) {
                dailyScope += est;
            }

            // Started: startedAt <= date
            if (started && started <= date) {
                dailyStarted += est;
            }

            // Completed: completedAt <= date
            if (completed && completed <= date) {
                dailyCompleted += est;
            }
        });

        scopeSeries.push(dailyScope);

        if (!isFuture) {
            startedSeries.push(dailyStarted);
            completedSeries.push(dailyCompleted);
        } else {
            startedSeries.push(null);
            completedSeries.push(null);
        }
    });

    return {
        labels: dateLabels,
        scope: scopeSeries,
        started: startedSeries,
        completed: completedSeries,
        meta: {
            totalScope,
            totalStarted,
            totalCompleted
        }
    };
}

window.fetchLinearData = async function (projectId = 'all') {
    const statsContainer = document.getElementById('linear-stats');
    chrome.storage.local.get(['linearId'], async (result) => {
        if (!result.linearId) return;

        statsContainer.innerHTML = '<p class="loading">Syncing Inbox...</p>';

        try {
            const query = `
            query {
                notifications(first: 30) {
                    nodes {
                        id
                        type
                        readAt
                        createdAt
                        actor {
                            name
                            avatarUrl
                        }
                        ... on IssueNotification {
                            issue {
                                id
                                identifier
                                title
                                url
                                project {
                                    id
                                    name
                                }
                                team {
                                    key
                                }
                            }
                        }
                    }
                }
            }`;

            const response = await fetch('https://api.linear.app/graphql', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': result.linearId
                },
                body: JSON.stringify({ query })
            });

            const data = await response.json();

            if (data.errors) {
                throw new Error(data.errors[0].message);
            }

            const notifications = data.data.notifications.nodes;

            // Re-map for easier filtering/access
            const processedNotifications = notifications.map(n => ({
                id: n.id,
                type: n.type,
                readAt: n.readAt,
                createdAt: n.createdAt,
                actor: n.actor?.name || 'Linear',
                issueTitle: n.issue?.title || 'Unknown Issue',
                issueId: n.issue?.identifier,
                issueUrl: n.issue?.url,
                projectId: n.issue?.project?.id,
                projectName: n.issue?.project?.name,
                teamKey: n.issue?.team?.key
            }));

            // Update UI
            if (window.renderLinearNotifications) {
                window.renderLinearNotifications(processedNotifications);
            }

            const unreadCount = processedNotifications.filter(n => !n.readAt).length;
            statsContainer.innerHTML = `<p>${unreadCount} Unread • Showing ${processedNotifications.length}</p>`;
            // Populate filter if needed
            if (window.updateLinearProjectFilter) {
                // The 'projects' map is no longer collected as filtering is removed.
                // If this function is still needed, it would require re-collecting projects
                // or passing an empty array if no filter is desired.
                // For now, removing the call as per the instruction's implied removal of filtering.
            }

        } catch (error) {
            console.error(error);
            statsContainer.innerHTML = `<p style="color: #ef4444; font-size: 0.8rem;">Inbox Error: ${error.message}</p>`;
        }
    });
};





// Chart rendering removed as we are using a list now
function renderLinearChart(data) {
    console.log("Legacy chart rendering suppressed.");
}

// Expose these for script.js
window.fetchLinearProjects = fetchLinearProjects;
window.fetchEverhourProjects = fetchEverhourProjects;
window.fetchLinearCycles = fetchLinearCycles;

