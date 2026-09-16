/**
 * Main Application Orchestrator for SatProp-OrbitAttitude
 * Coordinates backend API calls, 3D WebGL rendering, Chart telemetry, and timeline animation.
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Scene & Charts
    const scene = new SpaceScene('canvas-container');
    const charts = new DashboardCharts();
    const maneuvers = new ManeuverController(scene, {});

    // Application state
    const state = {
        currentSatId: 'cartosat2',
        currentPropagator: 'HYBRID_ML',
        attitudeMode: 'NADIR',
        isPlaying: true,
        playbackSpeed: 1.0,
        currentStepIdx: 0,
        trajectoryData: null,
        attitudeData: null,
    };

    // UI elements
    const satSelect = document.getElementById('select-satellite');
    const propSelect = document.getElementById('select-propagator');
    const attModeSelect = document.getElementById('select-attitude-mode');
    const playPauseBtn = document.getElementById('btn-play-pause');
    const speedBadge = document.getElementById('badge-speed');
    const timeSlider = document.getElementById('time-slider');
    const btnManeuver = document.getElementById('btn-maneuver');
    const btnToggleStations = document.getElementById('btn-toggle-stations');
    const btnToggleIsl = document.getElementById('btn-toggle-isl');

    // Telemetry display DOM elements
    const elAlt = document.getElementById('val-alt');
    const elVel = document.getElementById('val-vel');
    const elLat = document.getElementById('val-lat');
    const elLon = document.getElementById('val-lon');
    const elInc = document.getElementById('val-inc');
    const elEcc = document.getElementById('val-ecc');
    const elSma = document.getElementById('val-sma');
    const elPeriod = document.getElementById('val-period');

    const elRoll = document.getElementById('val-roll');
    const elPitch = document.getElementById('val-pitch');
    const elYaw = document.getElementById('val-yaw');

    const elBarRoll = document.getElementById('fill-roll');
    const elBarPitch = document.getElementById('fill-pitch');
    const elBarYaw = document.getElementById('fill-yaw');

    const elHeroReduction = document.getElementById('hero-reduction-val');
    const elHeroSgp4Err = document.getElementById('hero-sgp4-err');
    const elHeroHybridErr = document.getElementById('hero-hybrid-err');

    // 2. Load Satellites list
    async function loadSatellites() {
        try {
            const res = await fetch('/api/satellites');
            const sats = await res.json();
            satSelect.innerHTML = '';
            sats.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.id;
                opt.textContent = `${s.name} (NORAD #${s.satnum})`;
                satSelect.appendChild(opt);
            });
            satSelect.value = state.currentSatId;
        } catch (e) {
            console.error('Failed to load satellites:', e);
        }
    }

    // 3. Fetch Trajectory & Run Propagation
    async function updatePropagation() {
        const loadingIndicator = document.getElementById('live-status-text');
        if (loadingIndicator) loadingIndicator.textContent = 'PROPAGATING DYNAMICS...';

        try {
            const res = await fetch('/api/propagate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sat_id: state.currentSatId,
                    propagator: state.currentPropagator,
                    duration_hours: 2.0,
                    dt_step: 30.0
                })
            });

            const data = await res.json();
            state.trajectoryData = data;
            state.currentStepIdx = 0;
            timeSlider.max = data.times_s.length - 1;
            timeSlider.value = 0;

            // Update 3D Orbits
            if (data.states_eci) {
                const eciPoints = data.states_eci.map(s => s.slice(0, 3));
                if (state.currentPropagator === 'HYBRID_ML') {
                    scene.updateOrbitGeometry('hybrid', eciPoints);
                    // Also draw baseline SGP4 for visual comparison
                    if (data.baseline_sgp4_eci) {
                        scene.updateOrbitGeometry('sgp4', data.baseline_sgp4_eci.map(s => s.slice(0, 3)));
                    }
                } else if (state.currentPropagator === 'SGP4') {
                    scene.updateOrbitGeometry('sgp4', eciPoints);
                } else {
                    scene.updateOrbitGeometry('truth', eciPoints);
                }
            }

            // Update ML Metrics in HUD
            if (data.ml_metrics) {
                const m = data.ml_metrics;
                elHeroReduction.textContent = `${m.reduction_pos_pct_1sigma.toFixed(1)}%`;
                elHeroSgp4Err.textContent = `${m.uncorrected.pos_sigma_1_m.toFixed(0)} m`;
                elHeroHybridErr.textContent = `${m.corrected.pos_sigma_1_m.toFixed(0)} m`;
            }

            // Update RIC Residual Charts
            if (data.predicted_ric_residuals) {
                charts.updateRicChart(data.times_s, data.predicted_ric_residuals);
            }

            if (loadingIndicator) loadingIndicator.innerHTML = '<span class="live-pulse"></span> TELEMETRY LIVE';
        } catch (e) {
            console.error('Propagation error:', e);
            if (loadingIndicator) loadingIndicator.textContent = 'PROPAGATION FAILED';
        }
    }

    // 4. Fetch Attitude Simulation
    async function updateAttitude() {
        try {
            const res = await fetch('/api/attitude/simulate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sat_id: state.currentSatId,
                    mode: state.attitudeMode,
                    duration_s: 7200.0,
                    dt: 30.0
                })
            });
            const data = await res.json();
            state.attitudeData = data;
            charts.updateAttitudeChart(data.times_s, data.euler_angles_deg);
        } catch (e) {
            console.error('Attitude error:', e);
        }
    }

    // 5. Real-time Telemetry Tick & Satellite Position Update
    function tick() {
        if (!state.trajectoryData || state.trajectoryData.states_eci.length === 0) return;

        const maxIdx = state.trajectoryData.states_eci.length - 1;

        if (state.isPlaying) {
            state.currentStepIdx = (state.currentStepIdx + 1) % (maxIdx + 1);
            timeSlider.value = state.currentStepIdx;
        }

        const idx = state.currentStepIdx;
        const r_eci = state.trajectoryData.states_eci[idx].slice(0, 3);
        const v_eci = state.trajectoryData.states_eci[idx].slice(3, 6);
        const geod = state.trajectoryData.geodetic[idx];

        // Attitude quaternion at current step
        let quat = null;
        let euler = [0, 0, 0];
        if (state.attitudeData && state.attitudeData.quaternions.length > idx) {
            quat = state.attitudeData.quaternions[idx];
            euler = state.attitudeData.euler_angles_deg[idx];
        }

        // Update 3D satellite position and orientation
        scene.setSatelliteState(r_eci, quat);

        // Update HUD labels
        const alt_km = geod[2] / 1000.0;
        const vel_kms = Math.sqrt(v_eci[0]**2 + v_eci[1]**2 + v_eci[2]**2) / 1000.0;

        elAlt.textContent = alt_km.toFixed(1);
        elVel.textContent = vel_kms.toFixed(3);
        elLat.textContent = geod[0].toFixed(2);
        elLon.textContent = geod[1].toFixed(2);

        // Keplerian orbital elements
        if (state.trajectoryData.coes && state.trajectoryData.coes.length > 0) {
            const coe = state.trajectoryData.coes[0];
            elInc.textContent = coe.i_deg.toFixed(2);
            elEcc.textContent = coe.e.toFixed(5);
            elSma.textContent = (coe.a / 1000.0).toFixed(1);
            elPeriod.textContent = (coe.period_s / 60.0).toFixed(1);
        }

        // Attitude Euler
        elRoll.textContent = euler[0].toFixed(1);
        elPitch.textContent = euler[1].toFixed(1);
        elYaw.textContent = euler[2].toFixed(1);

        elBarRoll.style.width = Math.min(100, Math.abs(euler[0]) * 2) + '%';
        elBarPitch.style.width = Math.min(100, Math.abs(euler[1]) * 2) + '%';
        elBarYaw.style.width = Math.min(100, Math.abs(euler[2]) * 2) + '%';
    }

    // 6. Event Handlers
    satSelect.addEventListener('change', (e) => {
        state.currentSatId = e.target.value;
        updatePropagation();
        updateAttitude();
    });

    propSelect.addEventListener('change', (e) => {
        state.currentPropagator = e.target.value;
        updatePropagation();
    });

    attModeSelect.addEventListener('change', (e) => {
        state.attitudeMode = e.target.value;
        updateAttitude();
    });

    playPauseBtn.addEventListener('click', () => {
        state.isPlaying = !state.isPlaying;
        playPauseBtn.textContent = state.isPlaying ? '⏸' : '▶';
    });

    speedBadge.addEventListener('click', () => {
        const speeds = [1, 5, 20, 50];
        const nextIdx = (speeds.indexOf(state.playbackSpeed) + 1) % speeds.length;
        state.playbackSpeed = speeds[nextIdx];
        speedBadge.textContent = `${state.playbackSpeed}x`;
    });

    timeSlider.addEventListener('input', (e) => {
        state.currentStepIdx = parseInt(e.target.value, 10);
    });

    btnManeuver.addEventListener('click', () => {
        maneuvers.initiateStationKeeping(state.currentSatId);
    });

    btnToggleStations.addEventListener('click', () => {
        const active = btnToggleStations.classList.toggle('active');
        scene.stationGroup.visible = active;
    });

    btnToggleIsl.addEventListener('click', async () => {
        const active = btnToggleIsl.classList.toggle('active');
        if (active) {
            try {
                const res = await fetch('/api/isl');
                const islData = await res.json();
                console.log('Active ISL Links:', islData.total_active_links, islData.active_links);
                alert(`ISL 拓扑计算完成:\n共发现 ${islData.total_active_links} 条可见星间通信链路!`);
            } catch (err) {
                console.error(err);
            }
        }
    });

    // Close modal
    document.getElementById('btn-cancel-burn')?.addEventListener('click', () => {
        document.getElementById('maneuver-modal').style.display = 'none';
    });

    // 7. Initialize Application
    loadSatellites().then(() => {
        updatePropagation();
        updateAttitude();
    });

    // Main telemetry tick timer (25Hz)
    setInterval(tick, 120);
});
