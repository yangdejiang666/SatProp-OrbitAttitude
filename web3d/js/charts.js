/**
 * Telemetry & Residual Error Visualization Charts using Chart.js
 */

class DashboardCharts {
    constructor() {
        this.ricChart = null;
        this.attChart = null;
        this.benchmarkChart = null;
        this.initCharts();
    }

    initCharts() {
        const commonOptions = {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 400 },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.06)' },
                    ticks: { color: '#94a3b8', font: { size: 9, family: 'JetBrains Mono' } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.06)' },
                    ticks: { color: '#94a3b8', font: { size: 9, family: 'JetBrains Mono' } }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#cbd5e1', font: { size: 10, family: 'Inter' }, boxWidth: 12 }
                }
            }
        };

        // 1. RIC Residual Error Chart
        const ricEl = document.getElementById('chart-ric') || document.getElementById('chart-ric-residuals');
        const ctxRic = ricEl?.getContext('2d');
        if (ctxRic) {
            this.ricChart = new Chart(ctxRic, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        { label: 'Radial (ΔR)', borderColor: '#ff0077', data: [], borderWidth: 1.5, pointRadius: 0 },
                        { label: 'In-Track (ΔI)', borderColor: '#00f0ff', data: [], borderWidth: 1.5, pointRadius: 0 },
                        { label: 'Cross-Track (ΔC)', borderColor: '#00ff88', data: [], borderWidth: 1.5, pointRadius: 0 },
                    ]
                },
                options: commonOptions
            });
        }

        // 2. Attitude Euler Angles Chart
        const ctxAtt = document.getElementById('chart-attitude')?.getContext('2d');
        if (ctxAtt) {
            this.attChart = new Chart(ctxAtt, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        { label: 'Roll (°)', borderColor: '#ff0077', data: [], borderWidth: 1.5, pointRadius: 0 },
                        { label: 'Pitch (°)', borderColor: '#00f0ff', data: [], borderWidth: 1.5, pointRadius: 0 },
                        { label: 'Yaw (°)', borderColor: '#00ff88', data: [], borderWidth: 1.5, pointRadius: 0 },
                    ]
                },
                options: commonOptions
            });
        }

        // 3. Integrator Benchmark Chart
        const ctxBench = document.getElementById('chart-benchmark')?.getContext('2d');
        if (ctxBench) {
            this.benchmarkChart = new Chart(ctxBench, {
                type: 'bar',
                data: {
                    labels: ['RK4', 'RKF78', 'ABM4'],
                    datasets: [
                        {
                            label: 'Execution Time (ms)',
                            backgroundColor: 'rgba(0, 240, 255, 0.6)',
                            borderColor: '#00f0ff',
                            borderWidth: 1,
                            data: [26, 15, 14],
                            yAxisID: 'y'
                        },
                        {
                            label: 'Max Pos Error (m)',
                            backgroundColor: 'rgba(255, 170, 0, 0.6)',
                            borderColor: '#ffaa00',
                            borderWidth: 1,
                            data: [12.4, 0.08, 1.15],
                            yAxisID: 'y1'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { grid: { display: false }, ticks: { color: '#cbd5e1' } },
                        y: {
                            type: 'linear',
                            position: 'left',
                            ticks: { color: '#00f0ff' },
                            title: { display: true, text: 'Time (ms)', color: '#00f0ff' }
                        },
                        y1: {
                            type: 'logarithmic',
                            position: 'right',
                            grid: { drawOnChartArea: false },
                            ticks: { color: '#ffaa00' },
                            title: { display: true, text: 'Error (m)', color: '#ffaa00' }
                        }
                    },
                    plugins: {
                        legend: { labels: { color: '#cbd5e1', boxWidth: 10 } }
                    }
                }
            });
            this.loadBenchmarkData();
        }
    }

    async loadBenchmarkData() {
        try {
            const res = await fetch('/api/benchmark?hours=3.0&dt=30.0');
            const data = await res.json();
            if (this.benchmarkChart && data.methods) {
                const labels = [];
                const times = [];
                const errors = [];
                for (const [mName, mStats] of Object.entries(data.methods)) {
                    labels.push(mName);
                    const tMs = mStats.wall_time_ms ?? (mStats.elapsed_s != null ? mStats.elapsed_s * 1000.0 : 15.0);
                    const eM = mStats.max_pos_error_m ?? 1.0;
                    times.push(parseFloat(tMs.toFixed(1)));
                    errors.push(parseFloat(eM.toFixed(3)));
                }
                this.benchmarkChart.data.labels = labels;
                this.benchmarkChart.data.datasets[0].data = times;
                this.benchmarkChart.data.datasets[1].data = errors;
                this.benchmarkChart.update();
            }
        } catch (e) {
            // Retain default data on offline/fallback
        }
    }

    updateRicChart(times_s, ric_residuals) {
        if (!this.ricChart || !ric_residuals || ric_residuals.length === 0) return;

        const maxPoints = 60;
        const step = Math.max(1, Math.floor(ric_residuals.length / maxPoints));

        const labels = [];
        const dr_r = [];
        const dr_i = [];
        const dr_c = [];

        for (let i = 0; i < ric_residuals.length; i += step) {
            labels.push(Math.round(times_s[i] / 60) + 'm');
            dr_r.push(ric_residuals[i][0]);
            dr_i.push(ric_residuals[i][1]);
            dr_c.push(ric_residuals[i][2]);
        }

        this.ricChart.data.labels = labels;
        this.ricChart.data.datasets[0].data = dr_r;
        this.ricChart.data.datasets[1].data = dr_i;
        this.ricChart.data.datasets[2].data = dr_c;
        this.ricChart.update();
    }

    updateAttitudeChart(times_s, euler_deg) {
        if (!this.attChart || !euler_deg || euler_deg.length === 0) return;

        const maxPoints = 50;
        const step = Math.max(1, Math.floor(euler_deg.length / maxPoints));

        const labels = [];
        const roll = [];
        const pitch = [];
        const yaw = [];

        for (let i = 0; i < euler_deg.length; i += step) {
            labels.push(Math.round(times_s[i]) + 's');
            roll.push(euler_deg[i][0]);
            pitch.push(euler_deg[i][1]);
            yaw.push(euler_deg[i][2]);
        }

        this.attChart.data.labels = labels;
        this.attChart.data.datasets[0].data = roll;
        this.attChart.data.datasets[1].data = pitch;
        this.attChart.data.datasets[2].data = yaw;
        this.attChart.update();
    }

    resizeCharts() {
        try {
            if (this.ricChart) this.ricChart.resize();
            if (this.attChart) this.attChart.resize();
            if (this.benchmarkChart) this.benchmarkChart.resize();
        } catch (e) {
            console.debug('Chart resize handled:', e);
        }
    }
}
