
// Feature: Active Cycle Filtering

describe('Feature: Active Cycle Filtering', () => {

    // reset mocks before each test ideally, but simplicity here
    chrome.storage.local.data = {
        linearId: 'mock-key',
        linearProjects: ['proj_123']
    };

    it('Scenario: User has an active cycle with issues in selected project', async () => {
        // Given existing Linear projects 'proj_123'
        // And an active cycle 'Cycle 10' containing an issue in 'proj_123'

        window.fetchMocks['https://api.linear.app/graphql'] = async (url, options) => {
            const body = JSON.parse(options.body);
            if (body.query.includes('cycles')) {
                return {
                    ok: true,
                    json: async () => ({
                        data: {
                            cycles: {
                                nodes: [
                                    {
                                        id: 'cycle_1',
                                        number: 10,
                                        name: 'Cycle 10',
                                        startsAt: '2023-01-01',
                                        endsAt: '2023-12-31',
                                        progress: 0.5,
                                        team: { name: 'Team A' },
                                        issues: {
                                            nodes: [
                                                { state: { type: 'started' }, project: { id: 'proj_123', name: 'My Project' } }
                                            ]
                                        }
                                    }
                                ]
                            }
                        }
                    })
                };
            }
            return { ok: false };
        };

        // When I fetch active cycles
        const cycles = await window.fetchLinearCycles();

        // Then I should receive 1 cycle
        expect(cycles.length).toBe(1);

        // And the cycle should contain issues
        expect(cycles[0].issues.nodes.length).toBeGreaterThan(0);

        // And the script logic (simulation) should accept it
        const selectedProjects = new Set(['proj_123']);
        const filtered = cycles.filter(c => c.issues && c.issues.nodes && c.issues.nodes.length > 0);

        expect(filtered.length).toBe(1);
    });

    it('Scenario: User has an active cycle but NO issues in selected project', async () => {
        // Given existing Linear projects 'proj_123'
        // And an active cycle 'Cycle 11' with NO issues (filtered out by API)

        window.fetchMocks['https://api.linear.app/graphql'] = async (url, options) => {
            const body = JSON.parse(options.body);
            // Simulate API returning empty issues because of the filter
            return {
                ok: true,
                json: async () => ({
                    data: {
                        cycles: {
                            nodes: [
                                {
                                    id: 'cycle_2',
                                    number: 11,
                                    name: 'Cycle 11',
                                    issues: {
                                        nodes: [] // Empty because API filter excluded issues from other projects
                                    }
                                }
                            ]
                        }
                    }
                })
            };
        };

        // When I fetch active cycles
        const cycles = await window.fetchLinearCycles();

        // Then I should receive 1 cycle (the API returns it because the cycle itself matches 'endsAt')
        // BUT the issues list should be empty
        expect(cycles.length).toBe(1);
        expect(cycles[0].issues.nodes.length).toBe(0);

        // And the script logic should filter it out
        const filtered = cycles.filter(c => c.issues && c.issues.nodes && c.issues.nodes.length > 0);
        expect(filtered.length).toBe(0);
    });
});
