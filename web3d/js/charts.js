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
                    labels: ['RK4 定步长', 'RKF78 自适应', 'ABM4 多步法'],
                    datasets: [
                        {
                            label: '耗时 Time (ms)',
                            backgroundColor: 'rgba(56, 189, 248, 0.65)',
                            borderColor: '#38bdf8',
                            borderWidth: 1,
                            borderRadius: 3,
                            data: [15.5, 8.4, 9.2],
                            yAxisID: 'y',
                            barPercentage: 0.65,
                            categoryPercentage: 0.72
                        },
                        {
                            label: '最大误差 Error (m)',
                            backgroundColor: 'rgba(251, 191, 36, 0.65)',
                            borderColor: '#fbbf24',
                            borderWidth: 1,
                            borderRadius: 3,
                            data: [5761.4, 0.08, 5761.4],
                            yAxisID: 'y1',
                            barPercentage: 0.65,
                            categoryPercentage: 0.72
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: {
                        padding: { top: 6, bottom: 2, left: 2, right: 2 }
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: {
                                color: '#cbd5e1',
                                font: { size: 10, family: 'Inter', weight: '600' },
                                maxRotation: 0,
                                minRotation: 0,
                                autoSkip: false
                            }
                        },
                        y: {
                            type: 'linear',
                            position: 'left',
                            ticks: { color: '#38bdf8', font: { size: 9, family: 'JetBrains Mono' } },
                            title: { display: true, text: 'Time (ms)', color: '#38bdf8', font: { size: 9 } }
                        },
                        y1: {
                            type: 'logarithmic',
                            position: 'right',
                            grid: { drawOnChartArea: false },
                            ticks: { color: '#fbbf24', font: { size: 9, family: 'JetBrains Mono' } },
                            title: { display: true, text: 'Error (m)', color: '#fbbf24', font: { size: 9 } }
                        }
                    },
                    plugins: {
                        legend: { labels: { color: '#cbd5e1', boxWidth: 10, font: { size: 9.5 } } }
                    }
                }
            });
            this.loadBenchmarkData();
        }
    }

    async loadBenchmarkData(satId = 'tiangong') {
        try {
            const res = await fetch(`/api/benchmark?sat_id=${satId}&hours=1.0&dt=30.0`);
            const data = await res.json();
            if (this.benchmarkChart && data.methods) {
                const methodLabelMap = {
                    'RK4 (Fixed Step)': 'RK4 定步长',
                    'RKF78 (Adaptive)': 'RKF78 自适应',
                    'ABM4 (Predictor-Corrector)': 'ABM4 多步法'
                };
                const labels = [];
                const times = [];
                const errors = [];
                for (const [mName, mStats] of Object.entries(data.methods)) {
                    labels.push(methodLabelMap[mName] || mName.split(' ')[0]);
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

    resetRicStreaming() {
        if (!this.ricChart) return;
        this.ricChart.data.labels = [];
        this.ricChart.data.datasets[0].data = [];
        this.ricChart.data.datasets[1].data = [];
        this.ricChart.data.datasets[2].data = [];
        this.ricChart.update('none');
    }

    pushLiveRicSample(timeLabel, dr, di, dc) {
        if (!this.ricChart) return;
        const d = this.ricChart.data;
        const maxLivePoints = 32;

        d.labels.push(timeLabel);
        d.datasets[0].data.push(dr);
        d.datasets[1].data.push(di);
        d.datasets[2].data.push(dc);

        if (d.labels.length > maxLivePoints) {
            d.labels.shift();
            d.datasets[0].data.shift();
            d.datasets[1].data.shift();
            d.datasets[2].data.shift();
        }
        this.ricChart.update('none');
    }

    updateRicChart(times_s, ric_residuals) {
        if (!this.ricChart || !ric_residuals || ric_residuals.length === 0) return;

        // Initialize with initial slice of points for instant visual feedback
        const initPoints = Math.min(25, ric_residuals.length);
        const labels = [];
        const dr_r = [];
        const dr_i = [];
        const dr_c = [];

        for (let i = 0; i < initPoints; i++) {
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

    resetAttitudeStreaming() {
        if (!this.attChart) return;
        this.attChart.data.labels = [];
        this.attChart.data.datasets[0].data = [];
        this.attChart.data.datasets[1].data = [];
        this.attChart.data.datasets[2].data = [];
        this.attChart.update('none');
    }

    pushLiveAttitudeSample(timeLabel, roll, pitch, yaw) {
        if (!this.attChart) return;
        const d = this.attChart.data;
        const maxLivePoints = 32;

        d.labels.push(timeLabel);
        d.datasets[0].data.push(roll);
        d.datasets[1].data.push(pitch);
        d.datasets[2].data.push(yaw);

        if (d.labels.length > maxLivePoints) {
            d.labels.shift();
            d.datasets[0].data.shift();
            d.datasets[1].data.shift();
            d.datasets[2].data.shift();
        }
        this.attChart.update('none');
    }

    updateAttitudeChart(times_s, euler_deg) {
        if (!this.attChart || !euler_deg || euler_deg.length === 0) return;

        const initPoints = Math.min(25, euler_deg.length);
        const labels = [];
        const roll = [];
        const pitch = [];
        const yaw = [];

        for (let i = 0; i < initPoints; i++) {
            const mm = String(Math.floor(times_s[i] / 60)).padStart(2, '0');
            const ss = String(Math.floor(times_s[i] % 60)).padStart(2, '0');
            labels.push(`+${mm}:${ss}`);
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

    initMatlabCharts() {
        const commonOptions = {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 300 },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.06)' },
                    ticks: { color: '#94a3b8', font: { size: 9, family: 'JetBrains Mono' }, maxTicksLimit: 10 }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.06)' },
                    ticks: { color: '#94a3b8', font: { size: 9, family: 'JetBrains Mono' } }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#cbd5e1', font: { size: 10, family: 'Inter' }, boxWidth: 10 }
                }
            }
        };

        const ctxEul = document.getElementById('chart-matlab-euler')?.getContext('2d');
        if (ctxEul && !this.matlabEulerChart) {
            this.matlabEulerChart = new Chart(ctxEul, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        { label: 'Roll (°)', borderColor: '#f43f5e', data: [], borderWidth: 1.5, pointRadius: 0 },
                        { label: 'Pitch (°)', borderColor: '#06b6d4', data: [], borderWidth: 1.5, pointRadius: 0 },
                        { label: 'Yaw (°)', borderColor: '#10b981', data: [], borderWidth: 1.5, pointRadius: 0 },
                    ]
                },
                options: commonOptions
            });
        }

        const ctxWheels = document.getElementById('chart-matlab-wheels')?.getContext('2d');
        if (ctxWheels && !this.matlabWheelsChart) {
            this.matlabWheelsChart = new Chart(ctxWheels, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        { label: 'RW1 (RPM)', borderColor: '#38bdf8', data: [], borderWidth: 1.5, pointRadius: 0 },
                        { label: 'RW2 (RPM)', borderColor: '#fbbf24', data: [], borderWidth: 1.5, pointRadius: 0 },
                        { label: 'RW3 (RPM)', borderColor: '#a855f7', data: [], borderWidth: 1.5, pointRadius: 0 },
                        { label: 'RW4 (RPM)', borderColor: '#34d399', data: [], borderWidth: 1.5, pointRadius: 0 },
                    ]
                },
                options: commonOptions
            });
        }
    }

    updateMatlabCharts(simData) {
        if (!simData || !simData.times_s) return;
        this.initMatlabCharts();

        const times = simData.times_s;
        const eulers = simData.euler_angles_deg || [];
        const wheels = simData.wheel_rpm || [];
        const step = Math.max(1, Math.floor(times.length / 60));

        const labels = [];
        const roll = [];
        const pitch = [];
        const yaw = [];

        const rw1 = [];
        const rw2 = [];
        const rw3 = [];
        const rw4 = [];

        for (let i = 0; i < times.length; i += step) {
            const mm = String(Math.floor(times[i] / 60)).padStart(2, '0');
            const ss = String(Math.floor(times[i] % 60)).padStart(2, '0');
            labels.push(`${mm}:${ss}`);

            if (eulers[i]) {
                roll.push(eulers[i][0]);
                pitch.push(eulers[i][1]);
                yaw.push(eulers[i][2]);
            }

            if (wheels[i]) {
                rw1.push(wheels[i][0] || 0);
                rw2.push(wheels[i][1] || 0);
                rw3.push(wheels[i][2] || 0);
                rw4.push(wheels[i][3] || 0);
            }
        }

        if (this.matlabEulerChart) {
            this.matlabEulerChart.data.labels = labels;
            this.matlabEulerChart.data.datasets[0].data = roll;
            this.matlabEulerChart.data.datasets[1].data = pitch;
            this.matlabEulerChart.data.datasets[2].data = yaw;
            this.matlabEulerChart.update();
        }

        if (this.matlabWheelsChart) {
            this.matlabWheelsChart.data.labels = labels;
            this.matlabWheelsChart.data.datasets[0].data = rw1;
            this.matlabWheelsChart.data.datasets[1].data = rw2;
            this.matlabWheelsChart.data.datasets[2].data = rw3;
            this.matlabWheelsChart.data.datasets[3].data = rw4;
            this.matlabWheelsChart.update();
        }
    }

    resizeCharts() {
        try {
            if (this.ricChart) this.ricChart.resize();
            if (this.attChart) this.attChart.resize();
            if (this.benchmarkChart) this.benchmarkChart.resize();
            if (this.matlabEulerChart) this.matlabEulerChart.resize();
            if (this.matlabWheelsChart) this.matlabWheelsChart.resize();
        } catch (e) {
            console.debug('Chart resize handled:', e);
        }
    }
}
