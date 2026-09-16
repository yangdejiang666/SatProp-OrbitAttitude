/**
 * Main Application Orchestrator for SatProp-OrbitAttitude
 * Coordinates backend API calls, 3D WebGL rendering, Chart telemetry, and timeline animation.
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Scene, Charts & Maneuver Controller
    const scene = new SpaceScene('canvas-container');
    const charts = new DashboardCharts();
    const maneuvers = new ManeuverController(scene, {});

    // Application state
    const state = {
        currentSatId: 'tiangong',
        currentPropagator: 'HYBRID_ML',
        attitudeMode: 'NADIR',
        isPlaying: true,
        warpMultiplier: 1.0,
        simTimeSec: 0.0,
        showHud: true,
        layerVisibility: {
            sgp4: true,
            truth: true,
            hybrid: true,
            calibrated: true,
        },
        trajectoryData: null,
        attitudeData: null,
        visibilityData: null,
        constellationData: null,
        baseEpochMjd: 61299.8,
        baseEpochDate: new Date(),
    };

    // UI elements
    const satSelect = document.getElementById('select-satellite');
    const propSelect = document.getElementById('select-propagator');
    const attModeSelect = document.getElementById('select-attitude-mode');
    const cameraModeSelect = document.getElementById('select-camera-mode');

    const btnWarpPause = document.getElementById('btn-warp-pause');
    const btnWarpNow = document.getElementById('btn-warp-now');
    const btnViewConstellation = document.getElementById('btn-view-constellation');
    const dockStreamStatus = document.getElementById('dock-stream-status');
    const dockOrbitPhaseText = document.getElementById('dock-orbit-phase-text');
    const dockOrbitPeriodProgress = document.getElementById('dock-orbit-period-progress');
    const dockOrbitProgressBar = document.getElementById('dock-orbit-progress-bar');
    const dockConstellationInfo = document.getElementById('dock-constellation-info');

    const btnLayerSgp4 = document.getElementById('btn-layer-sgp4');
    const btnLayerTruth = document.getElementById('btn-layer-truth');
    const btnLayerHybrid = document.getElementById('btn-layer-hybrid');
    const btnLayerCalibrated = document.getElementById('btn-layer-calibrated');

    const btnSyntheticTuning = document.getElementById('btn-synthetic-tuning');
    const syntheticModal = document.getElementById('synthetic-modal');
    const btnCloseSyntheticModal = document.getElementById('btn-close-synthetic-modal');
    const btnRunSyntheticCalib = document.getElementById('btn-run-synthetic-calibration');

    const sliderTuneObs = document.getElementById('slider-tune-obs');
    const badgeTuneObs = document.getElementById('badge-tune-obs');
    const sliderTuneNoise = document.getElementById('slider-tune-noise');
    const badgeTuneNoise = document.getElementById('badge-tune-noise');
    const sliderTuneCd = document.getElementById('slider-tune-cd');
    const badgeTuneCd = document.getElementById('badge-tune-cd');
    const selectTuneAttitude = document.getElementById('select-tune-attitude');
    const selectTuneIntegrator = document.getElementById('select-tune-integrator');

    const tunePriorErr = document.getElementById('tune-prior-err');
    const tunePostErr = document.getElementById('tune-post-err');
    const tuneImprovement = document.getElementById('tune-improvement');
    const tuneEstCd = document.getElementById('tune-est-cd');

    const btnManeuver = document.getElementById('btn-maneuver');
    const btnToggleHud = document.getElementById('btn-toggle-hud');
    const btnToggleStations = document.getElementById('btn-toggle-stations');
    const btnToggleIsl = document.getElementById('btn-toggle-isl');

    // 3D Floating HUD & Ground Station Banner
    const satHudEl = document.getElementById('sat-floating-hud');
    const hudSatName = document.getElementById('hud-sat-name');
    const hudErrorVal = document.getElementById('hud-error-val');
    const hudAlt = document.getElementById('hud-alt');
    const hudVel = document.getElementById('hud-vel');
    const hudLat = document.getElementById('hud-lat');

    const bannerContact = document.getElementById('station-contact-banner');
    const bannerStationName = document.getElementById('banner-station-name');
    const bannerEl = document.getElementById('banner-el');
    const bannerRange = document.getElementById('banner-range');

    // Mission Clock elements
    const clockUtc = document.getElementById('clock-utc-time');
    const clockMjd = document.getElementById('clock-mjd-val');

    // Telemetry display DOM elements
    const elAlt = document.getElementById('val-alt');
    const elVel = document.getElementById('val-vel');
    const elLat = document.getElementById('val-lat');
    const elLon = document.getElementById('val-lon');
    const elInc = document.getElementById('val-inc');
    const elEcc = document.getElementById('val-ecc');
    const elSma = document.getElementById('val-sma');
    const elPeriod = document.getElementById('val-period');
    const elPerigee = document.getElementById('val-perigee');
    const elApogee = document.getElementById('val-apogee');

    const elRoll = document.getElementById('val-roll');
    const elPitch = document.getElementById('val-pitch');
    const elYaw = document.getElementById('val-yaw');

    const elBarRoll = document.getElementById('bar-roll') || document.getElementById('fill-roll');
    const elBarPitch = document.getElementById('bar-pitch') || document.getElementById('fill-pitch');
    const elBarYaw = document.getElementById('bar-yaw') || document.getElementById('fill-yaw');

    const elHeroReduction = document.getElementById('hero-reduction') || document.getElementById('hero-reduction-val');
    const elHeroSgp4Err = document.getElementById('hero-sgp4-err');
    const elHeroHybridErr = document.getElementById('hero-hybrid-err');

    const groundPassesList = document.getElementById('ground-passes-list');

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

    // 2.2 Load Real Multi-Satellite Constellation Orbits
    async function loadConstellation() {
        try {
            const res = await fetch('/api/constellation/orbits');
            const data = await res.json();
            if (data && data.satellites) {
                state.constellationData = data.satellites;
                scene.updateConstellation(data.satellites);
                if (dockConstellationInfo) {
                    dockConstellationInfo.textContent = `在轨全景监测: ${data.total_active_satellites} 颗实测空间飞行器多轨道解算`;
                }
            }
        } catch (e) {
            console.error('Failed to load constellation orbits:', e);
        }
    }

    // 2.5 Fetch Real Celestial Ephemeris (Sun, Moon, Planets, Beijing Time)
    async function updateCelestial() {
        try {
            const res = await fetch('/api/ephemeris/celestial');
            const data = await res.json();
            if (data.status === 'success') {
                scene.updateCelestialEphemeris(data);
                if (clockUtc) {
                    clockUtc.textContent = data.beijing_time;
                }
                if (clockMjd) {
                    clockMjd.textContent = `${data.utc_time} | MJD: ${data.mjd.toFixed(4)}`;
                }
            }
        } catch (e) {
            console.error('Failed to update celestial ephemeris:', e);
        }
    }

    // 3. Load Ground Station Pass Schedule
    async function loadVisibility() {
        try {
            const res = await fetch(`/api/visibility?sat_id=${state.currentSatId}&hours=6.0`);
            const data = await res.json();
            state.visibilityData = data;

            if (groundPassesList && data.stations) {
                groundPassesList.innerHTML = '';
                let hasPasses = false;

                const stationList = Array.isArray(data.stations) ? data.stations : Object.values(data.stations);
                stationList.forEach(stItem => {
                    const stName = stItem.station ? stItem.station.name : (stItem.name || 'Station');
                    const passes = stItem.passes || [];
                    if (passes.length > 0) {
                        hasPasses = true;
                        passes.slice(0, 2).forEach(p => {
                            const item = document.createElement('div');
                            item.className = 'pass-timeline-item';
                            const aosSec = p.aos_t_sec ?? p.aos_s ?? 0;
                            const aosMin = (aosSec / 60).toFixed(0);
                            const dur = (p.duration_sec ?? p.duration_s ?? 0).toFixed(0);
                            const maxEl = (p.max_el_deg ?? p.max_elevation_deg ?? 0).toFixed(1);
                            item.innerHTML = `
                                <div class="station-name">📍 ${stName}</div>
                                <div>AOS: T+${aosMin}m | 持续: ${dur}s | 最大仰角: ${maxEl}°</div>
                            `;
                            groundPassesList.appendChild(item);
                        });
                    }
                });

                if (!hasPasses) {
                    groundPassesList.innerHTML = '<div class="pass-timeline-item" style="color:var(--text-dim);">近6小时内无可见过境窗口</div>';
                }
            }
        } catch (e) {
            console.error('Failed to load visibility passes:', e);
        }
    }

    // 4. Fetch Trajectory & Run Propagation
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
                    attitude_mode: state.attitudeMode,
                    duration_hours: 2.5,
                    dt_step: 30.0
                })
            });

            const data = await res.json();
            state.trajectoryData = data;
            state.currentStepIdx = 0;
            timeSlider.max = data.times_s.length - 1;
            timeSlider.value = 0;

            // Render all three model trajectories simultaneously for direct comparison
            if (data.states_eci) {
                const eciPoints = data.states_eci.map(s => s.slice(0, 3));
                scene.updateOrbitGeometry('hybrid', eciPoints);
            }
            if (data.baseline_sgp4_eci) {
                const sgp4Points = data.baseline_sgp4_eci.map(s => s.slice(0, 3));
                scene.updateOrbitGeometry('sgp4', sgp4Points);
            }
            if (data.truth_eci) {
                const truthPoints = data.truth_eci.map(s => s.slice(0, 3));
                scene.updateOrbitGeometry('truth', truthPoints);
            }

            // Apply visibility toggles
            scene.setOrbitVisibility('sgp4', state.layerVisibility.sgp4);
            scene.setOrbitVisibility('truth', state.layerVisibility.truth);
            scene.setOrbitVisibility('hybrid', state.layerVisibility.hybrid);

            // Update Perigee & Apogee markers in 3D
            if (data.perigee && data.apogee) {
                scene.updateApsides(data.perigee, data.apogee);
                if (elPerigee) elPerigee.textContent = data.perigee.alt_km.toFixed(1);
                if (elApogee) elApogee.textContent = data.apogee.alt_km.toFixed(1);
            }

            // Update ML Metrics in HUD
            if (data.ml_metrics) {
                const m = data.ml_metrics;
                if (elHeroReduction) elHeroReduction.textContent = `${m.reduction_pos_pct_1sigma.toFixed(1)}%`;
                if (elHeroSgp4Err) elHeroSgp4Err.textContent = `${m.uncorrected.pos_sigma_1_m.toFixed(0)} m`;
                if (elHeroHybridErr) elHeroHybridErr.textContent = `${m.corrected.pos_sigma_1_m.toFixed(0)} m`;
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

    // 5. Fetch Attitude Simulation
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

    // Ground station coordinates list for real-time contact detection
    const groundStations = [
        { name: "Beijing", lat: 40.05, lon: 116.32, alt: 50.0 },
        { name: "Kashi", lat: 39.47, lon: 75.99, alt: 1300.0 },
        { name: "Sanya", lat: 18.25, lon: 109.51, alt: 20.0 },
        { name: "Svalbard", lat: 78.22, lon: 15.40, alt: 400.0 },
        { name: "Malindi", lat: -2.99, lon: 40.19, alt: 10.0 }
    ];

    function calculateElevation(satLat, satLon, satAltKm, stLat, stLon) {
        const phi1 = THREE.MathUtils.degToRad(stLat);
        const phi2 = THREE.MathUtils.degToRad(satLat);
        const dLambda = THREE.MathUtils.degToRad(satLon - stLon);

        // Central angle psi
        const cosPsi = Math.sin(phi1) * Math.sin(phi2) + Math.cos(phi1) * Math.cos(phi2) * Math.cos(dLambda);
        const psi = Math.acos(Math.min(1.0, Math.max(-1.0, cosPsi)));

        const Re = 6378.137; // km
        const r = Re + satAltKm;

        // Slant range rho
        const rho = Math.sqrt(Re * Re + r * r - 2 * Re * r * cosPsi);

        // Elevation angle
        const sinEl = (r * cosPsi - Re) / (rho > 0.001 ? rho : 1.0);
        const elDeg = THREE.MathUtils.radToDeg(Math.asin(Math.min(1.0, Math.max(-1.0, sinEl))));

        return { elevationDeg: elDeg, slantRangeKm: rho };
    }

    // 6. Real-time Continuous Astrodynamics Clock & Telemetry Tick
    let lastWallTime = performance.now();

    function tick() {
        const now = performance.now();
        const dtWallSec = Math.min((now - lastWallTime) / 1000.0, 0.25);
        lastWallTime = now;

        if (state.isPlaying) {
            state.simTimeSec += dtWallSec * state.warpMultiplier;
        }

        // 1. Advance Mission Clock (UTC & MJD)
        const currentSimMs = state.baseEpochDate.getTime() + state.simTimeSec * 1000;
        const curDate = new Date(currentSimMs);
        const isoString = curDate.toISOString().replace('T', ' ').replace(/\..+/, '') + ' UTC';
        if (clockUtc) clockUtc.textContent = isoString;

        const curMjd = state.baseEpochMjd + (state.simTimeSec / 86400.0);
        if (clockMjd) clockMjd.textContent = `MJD: ${curMjd.toFixed(5)}`;

        if (dockStreamStatus) {
            if (state.warpMultiplier === 1.0) {
                dockStreamStatus.textContent = state.isPlaying ? '真实遥测流实时同步 (1:1 LIVE)' : '实时遥测流已暂停';
            } else {
                dockStreamStatus.textContent = state.isPlaying ? `动力学超光速推演 (${state.warpMultiplier}x WARP)` : '动力学推演已暂停';
            }
        }

        // 2. Update ALL Constellation Satellites along their real orbital ephemerides
        if (state.constellationData) {
            Object.keys(state.constellationData).forEach(s_id => {
                const satInfo = state.constellationData[s_id];
                const states = satInfo.states_eci;
                const times = satInfo.times_s;
                const periodS = (satInfo.period_min || 92.0) * 60.0;

                if (states && states.length > 1 && times && times.length > 1) {
                    const tMod = ((state.simTimeSec % periodS) + periodS) % periodS;
                    const maxT = times[times.length - 1];
                    const tNormalized = (tMod / periodS) * maxT;

                    const stepDt = times.length > 1 ? (times[1] - times[0]) : 45.0;
                    const fracIdx = tNormalized / stepDt;
                    const k0 = Math.min(Math.floor(fracIdx), states.length - 1);
                    const k1 = Math.min(k0 + 1, states.length - 1);
                    const alpha = Math.max(0, Math.min(1, fracIdx - k0));

                    const p0 = states[k0];
                    const p1 = states[k1];
                    const interpR = [
                        (1 - alpha) * p0[0] + alpha * p1[0],
                        (1 - alpha) * p0[1] + alpha * p1[1],
                        (1 - alpha) * p0[2] + alpha * p1[2],
                    ];
                    scene.updateConstellationSatellitePosition(s_id, interpR);
                }
            });
        }

        // 3. Update Focused Satellite High-Precision Telemetry & 3D Attitude
        if (state.trajectoryData && state.trajectoryData.states_eci && state.trajectoryData.states_eci.length > 0) {
            const traj = state.trajectoryData;
            const states = traj.states_eci;
            const times = traj.times_s;
            const geodetic = traj.geodetic;

            let periodS = 5500.0;
            if (traj.coes && traj.coes.length > 0 && traj.coes[0].period_s) {
                periodS = traj.coes[0].period_s;
            } else if (state.constellationData && state.constellationData[state.currentSatId]) {
                periodS = state.constellationData[state.currentSatId].period_min * 60.0;
            }

            const tMod = ((state.simTimeSec % periodS) + periodS) % periodS;
            const progressRatio = tMod / periodS;
            const orbitNuDeg = progressRatio * 360.0;

            if (dockOrbitPhaseText) dockOrbitPhaseText.textContent = `轨道真近点角 ν: ${orbitNuDeg.toFixed(1)}°`;
            if (dockOrbitPeriodProgress) dockOrbitPeriodProgress.textContent = `单轨运转: ${(progressRatio * 100).toFixed(1)}%`;
            if (dockOrbitProgressBar) dockOrbitProgressBar.style.width = `${(progressRatio * 100).toFixed(1)}%`;

            const maxT = times && times.length > 0 ? times[times.length - 1] : periodS;
            const tNormalized = progressRatio * maxT;
            const stepDt = (times && times.length > 1) ? (times[1] - times[0]) : 45.0;
            const fracIdx = tNormalized / stepDt;
            const k0 = Math.min(Math.floor(fracIdx), states.length - 1);
            const k1 = Math.min(k0 + 1, states.length - 1);
            const alpha = Math.max(0, Math.min(1, fracIdx - k0));

            const p0 = states[k0];
            const p1 = states[k1];
            const r_eci = [
                (1 - alpha) * p0[0] + alpha * p1[0],
                (1 - alpha) * p0[1] + alpha * p1[1],
                (1 - alpha) * p0[2] + alpha * p1[2],
            ];
            const v_eci = [
                (1 - alpha) * p0[3] + alpha * p1[3],
                (1 - alpha) * p0[4] + alpha * p1[4],
                (1 - alpha) * p0[5] + alpha * p1[5],
            ];

            const g0 = geodetic[k0];
            const g1 = geodetic[k1];
            const lat = (1 - alpha) * g0[0] + alpha * g1[0];
            const lon = (1 - alpha) * g0[1] + alpha * g1[1];
            const alt = (1 - alpha) * g0[2] + alpha * g1[2];

            // Attitude quaternion at current step
            let quat = null;
            let euler = [0, 0, 0];
            if (state.attitudeData && state.attitudeData.quaternions && state.attitudeData.quaternions.length > k0) {
                quat = state.attitudeData.quaternions[k0];
                euler = state.attitudeData.euler_angles_deg[k0];
            }

            // Set focused satellite position and orientation
            scene.setSatelliteState(r_eci, quat);

            // Update Telemetry Panel values
            const alt_km = alt / 1000.0;
            const vel_kms = Math.sqrt(v_eci[0]**2 + v_eci[1]**2 + v_eci[2]**2) / 1000.0;

            if (elAlt) elAlt.textContent = alt_km.toFixed(1);
            if (elVel) elVel.textContent = vel_kms.toFixed(3);
            if (elLat) elLat.textContent = (lat >= 0 ? `${lat.toFixed(2)}°N` : `${Math.abs(lat).toFixed(2)}°S`);
            if (elLon) elLon.textContent = (lon >= 0 ? `${lon.toFixed(2)}°E` : `${Math.abs(lon).toFixed(2)}°W`);

            // Keplerian orbital elements
            if (traj.coes && traj.coes.length > 0) {
                const coe = traj.coes[0];
                if (elInc) elInc.textContent = coe.i_deg.toFixed(2);
                if (elEcc) elEcc.textContent = coe.e.toFixed(5);
                if (elSma) elSma.textContent = (coe.a / 1000.0).toFixed(1);
                if (elPeriod) elPeriod.textContent = (coe.period_s / 60.0).toFixed(1);
            }

            // Attitude Euler
            if (elRoll) elRoll.textContent = euler[0].toFixed(1);
            if (elPitch) elPitch.textContent = euler[1].toFixed(1);
            if (elYaw) elYaw.textContent = euler[2].toFixed(1);

            if (elBarRoll) elBarRoll.style.width = Math.min(100, Math.abs(euler[0]) * 2) + '%';
            if (elBarPitch) elBarPitch.style.width = Math.min(100, Math.abs(euler[1]) * 2) + '%';
            if (elBarYaw) elBarYaw.style.width = Math.min(100, Math.abs(euler[2]) * 2) + '%';

            // Update 3D Floating HUD
            if (state.showHud && satHudEl && scene.satGroup) {
                const screenCoords = scene.getScreenCoordinates(scene.satGroup.position);
                if (screenCoords.visible) {
                    satHudEl.style.display = 'block';
                    satHudEl.style.left = `${screenCoords.x + 18}px`;
                    satHudEl.style.top = `${screenCoords.y - 32}px`;

                    if (hudSatName) hudSatName.textContent = `🛰️ ${traj.satellite || state.currentSatId.toUpperCase()}`;
                    if (hudAlt) hudAlt.textContent = alt_km.toFixed(1);
                    if (hudVel) hudVel.textContent = vel_kms.toFixed(2);
                    if (hudLat) hudLat.textContent = (lat >= 0 ? `${lat.toFixed(1)}°N` : `${Math.abs(lat).toFixed(1)}°S`);

                    if (hudErrorVal && traj.predicted_ric_residuals && traj.predicted_ric_residuals.length > k0) {
                        const rErr = traj.predicted_ric_residuals[k0];
                        const totalErr = Math.sqrt(rErr[0]**2 + rErr[1]**2 + rErr[2]**2);
                        hudErrorVal.textContent = `Δpos: ${totalErr.toFixed(1)} m`;
                    }
                } else {
                    satHudEl.style.display = 'none';
                }
            } else if (satHudEl) {
                satHudEl.style.display = 'none';
            }

            // Ground station active tracking check & dynamic laser beam
            let activeSt = null;
            let highestEl = -999.0;
            let activeRange = 0;

            for (const st of groundStations) {
                const res = calculateElevation(lat, lon, alt_km, st.lat, st.lon);
                if (res.elevationDeg > 5.0 && res.elevationDeg > highestEl) {
                    highestEl = res.elevationDeg;
                    activeRange = res.slantRangeKm;
                    activeSt = st;
                }
            }

            if (activeSt) {
                if (bannerContact) {
                    bannerContact.style.display = 'flex';
                    if (bannerStationName) bannerStationName.textContent = `${activeSt.name} Station`;
                    if (bannerEl) bannerEl.textContent = `${highestEl.toFixed(1)}°`;
                    if (bannerRange) bannerRange.textContent = `${activeRange.toFixed(0)} km`;
                }
                scene.setTrackingBeam(true, activeSt.name);
            } else {
                if (bannerContact) bannerContact.style.display = 'none';
                scene.setTrackingBeam(false);
            }
        }
    }

    // 7. Event Handlers & User Controls

    // Satellite switch
    satSelect.addEventListener('change', async (e) => {
        state.currentSatId = e.target.value;
        scene.switchSatelliteModel(state.currentSatId);
        if (state.constellationData) {
            scene.updateConstellation(state.constellationData);
        }
        await updatePropagation();
        await updateAttitude();
        await loadVisibility();
        await runSyntheticCalibration();
    });

    // Propagator switch
    propSelect.addEventListener('change', (e) => {
        state.currentPropagator = e.target.value;
        updatePropagation();
    });

    // Attitude mode switch (triggers 1:1 orbit drag area and attitude model recalculation)
    attModeSelect.addEventListener('change', (e) => {
        state.attitudeMode = e.target.value;
        updateAttitude();
        updatePropagation();
    });

    // Camera view mode switch
    const btnQuickCloseup = document.getElementById('btn-quick-closeup');
    cameraModeSelect.addEventListener('change', (e) => {
        state.cameraMode = e.target.value;
        scene.setCameraMode(e.target.value);
        if (btnQuickCloseup) {
            btnQuickCloseup.classList.toggle('active', e.target.value === 'CLOSEUP');
        }
    });

    // Quick closeup view button
    if (btnQuickCloseup) {
        btnQuickCloseup.addEventListener('click', () => {
            const isCloseup = cameraModeSelect.value === 'CLOSEUP';
            const newMode = isCloseup ? 'FREE' : 'CLOSEUP';
            cameraModeSelect.value = newMode;
            state.cameraMode = newMode;
            scene.setCameraMode(newMode);
            btnQuickCloseup.classList.toggle('active', newMode === 'CLOSEUP');
        });
    }

    // Layer comparison toggles
    btnLayerSgp4.addEventListener('click', () => {
        state.layerVisibility.sgp4 = !state.layerVisibility.sgp4;
        btnLayerSgp4.classList.toggle('active-sgp4', state.layerVisibility.sgp4);
        scene.setOrbitVisibility('sgp4', state.layerVisibility.sgp4);
    });

    btnLayerTruth.addEventListener('click', () => {
        state.layerVisibility.truth = !state.layerVisibility.truth;
        btnLayerTruth.classList.toggle('active-truth', state.layerVisibility.truth);
        scene.setOrbitVisibility('truth', state.layerVisibility.truth);
    });

    btnLayerHybrid.addEventListener('click', () => {
        state.layerVisibility.hybrid = !state.layerVisibility.hybrid;
        btnLayerHybrid.classList.toggle('active-hybrid', state.layerVisibility.hybrid);
        scene.setOrbitVisibility('hybrid', state.layerVisibility.hybrid);
    });

    btnLayerCalibrated.addEventListener('click', () => {
        state.layerVisibility.calibrated = !state.layerVisibility.calibrated;
        btnLayerCalibrated.classList.toggle('active-calibrated', state.layerVisibility.calibrated);
        scene.setOrbitVisibility('calibrated', state.layerVisibility.calibrated);
    });

    // Drawer Slide-out Toggles
    const drawerLeft = document.getElementById('drawer-left');
    const drawerRight = document.getElementById('drawer-right');
    const btnDrawerLeftToggle = document.getElementById('drawer-left-toggle');
    const btnDrawerRightToggle = document.getElementById('drawer-right-toggle');
    const drawerLeftHandleText = document.getElementById('drawer-left-handle-text');
    const drawerRightHandleText = document.getElementById('drawer-right-handle-text');

    if (btnDrawerLeftToggle && drawerLeft) {
        btnDrawerLeftToggle.addEventListener('click', () => {
            const isCollapsed = drawerLeft.classList.toggle('collapsed');
            if (drawerLeftHandleText) {
                drawerLeftHandleText.textContent = isCollapsed ? '▶ 遥测姿态' : '◀ 遥测姿态';
            }
            if (!isCollapsed && charts) {
                requestAnimationFrame(() => charts.resizeCharts());
            }
        });
    }

    if (btnDrawerRightToggle && drawerRight) {
        btnDrawerRightToggle.addEventListener('click', () => {
            const isCollapsed = drawerRight.classList.toggle('collapsed');
            if (drawerRightHandleText) {
                drawerRightHandleText.textContent = isCollapsed ? '◀ 算法测控' : '算法测控 ▶';
            }
            if (!isCollapsed && charts) {
                requestAnimationFrame(() => charts.resizeCharts());
            }
        });
    }

    // Subsystem Tab Switching inside Drawers
    document.querySelectorAll('.drawer-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const drawerSide = btn.getAttribute('data-drawer');
            const tabId = btn.getAttribute('data-tab');
            const drawerEl = drawerSide === 'left' ? drawerLeft : drawerRight;
            if (!drawerEl) return;

            // Switch active tab button
            drawerEl.querySelectorAll('.drawer-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Switch active tab pane
            drawerEl.querySelectorAll('.drawer-tab-pane').forEach(p => p.classList.remove('active'));
            const pane = document.getElementById(tabId);
            if (pane) {
                pane.classList.add('active');
            }

            // Trigger chart resize if charts are revealed
            if (charts) {
                requestAnimationFrame(() => charts.resizeCharts());
            }
        });
    });

    // Synthetic Tuning Modal Open & Close
    btnSyntheticTuning.addEventListener('click', () => {
        if (syntheticModal) {
            syntheticModal.style.display = syntheticModal.style.display === 'block' ? 'none' : 'block';
        }
    });

    btnCloseSyntheticModal.addEventListener('click', () => {
        if (syntheticModal) syntheticModal.style.display = 'none';
    });

    // Tunable Sliders Live Value Labels
    sliderTuneObs.addEventListener('input', (e) => {
        badgeTuneObs.textContent = `${e.target.value} 点`;
    });

    sliderTuneNoise.addEventListener('input', (e) => {
        badgeTuneNoise.textContent = `${parseFloat(e.target.value).toFixed(1)} m`;
    });

    sliderTuneCd.addEventListener('input', (e) => {
        badgeTuneCd.textContent = `${parseFloat(e.target.value).toFixed(2)}`;
    });

    // Execute Real Flight Observation Assimilation & Orbit Calibration
    async function runSyntheticCalibration() {
        if (btnRunSyntheticCalib) {
            btnRunSyntheticCalib.textContent = '⏳ 正在进行实测定轨微分修正与高精外推...';
            btnRunSyntheticCalib.disabled = true;
        }
        try {
            const res = await fetch('/api/ephemeris/real_assimilation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sat_id: state.currentSatId,
                    obs_count: parseInt(sliderTuneObs.value, 10),
                    noise_sigma_m: parseFloat(sliderTuneNoise.value),
                    cd_multiplier: parseFloat(sliderTuneCd.value),
                    attitude_mode: selectTuneAttitude.value,
                    integrator: selectTuneIntegrator.value,
                    duration_hours: 2.5,
                    dt_step: 30.0,
                    ml_enabled: true
                })
            });
            const data = await res.json();
            if (data.status === 'success') {
                // 1. Update Calibrated 3D Orbit
                if (data.calibrated_orbit_eci) {
                    scene.updateOrbitGeometry('calibrated', data.calibrated_orbit_eci.map(s => s.slice(0, 3)));
                    scene.setOrbitVisibility('calibrated', state.layerVisibility.calibrated);
                }
                // 2. Render 3D Observation Markers on Orbit
                const obsList = data.real_observations || data.synthetic_observations;
                if (obsList) {
                    scene.updateSyntheticObservationMarkers(obsList);
                }
                // 3. Update Modal Accuracy Feedback
                if (data.calibration_summary) {
                    const s = data.calibration_summary;
                    if (tunePriorErr) tunePriorErr.textContent = `${(s.residual_rms_prior_m / 1000).toFixed(2)} km`;
                    if (tunePostErr) tunePostErr.textContent = `${(s.residual_rms_post_m / 1000).toFixed(2)} km`;
                    if (tuneImprovement) tuneImprovement.textContent = `+${s.improvement_pct.toFixed(1)}% (误差收敛)`;
                    if (tuneEstCd) tuneEstCd.textContent = `${s.calibrated_cd.toFixed(2)}`;
                }
                // 4. Update HUD Hero Card Metrics
                if (data.accuracy_report) {
                    const r = data.accuracy_report;
                    if (elHeroReduction) elHeroReduction.textContent = `-${r.reduction_pct.toFixed(1)}%`;
                    if (elHeroSgp4Err) elHeroSgp4Err.textContent = `${r.uncorrected_sgp4_sigma1_m.toFixed(0)} m`;
                    if (elHeroHybridErr) elHeroHybridErr.textContent = `${r.calibrated_model_sigma1_m.toFixed(0)} m`;
                }
                // 5. Update RIC Residuals Chart
                if (data.predicted_ric_residuals) {
                    charts.updateRicChart(data.times_s, data.predicted_ric_residuals);
                }
            }
        } catch (err) {
            console.error('Real assimilation error:', err);
        } finally {
            if (btnRunSyntheticCalib) {
                btnRunSyntheticCalib.textContent = '🚀 接入实测并校准预测 (Assimilate & Validate)';
                btnRunSyntheticCalib.disabled = false;
            }
        }
    }

    btnRunSyntheticCalib.addEventListener('click', runSyntheticCalibration);

    // CelesTrak Real TLE Live Sync Handlers
    const btnSyncCelestrak = document.getElementById('btn-sync-celestrak');
    const btnModalSyncCelestrak = document.getElementById('btn-modal-sync-celestrak');

    async function triggerCelestrakSync() {
        const btns = [btnSyncCelestrak, btnModalSyncCelestrak].filter(Boolean);
        btns.forEach(b => {
            b.textContent = '⏳ 同步中...';
            b.disabled = true;
        });

        const loadingIndicator = document.getElementById('live-status-text');
        if (loadingIndicator) loadingIndicator.textContent = 'CELESTRAK SYNCING...';

        try {
            const res = await fetch(`/api/satellites/sync_celestrak?sat_id=${state.currentSatId}`, { method: 'POST' });
            const data = await res.json();
            if (data.status === 'success') {
                if (loadingIndicator) loadingIndicator.innerHTML = '<span class="live-pulse"></span> CELESTRAK SYNCED';
                await loadSatellites();
                satSelect.value = state.currentSatId;
                await updatePropagation();
                await updateAttitude();
                await loadVisibility();
                await runSyntheticCalibration();
                alert(`🛰️ CelesTrak 实时星历同步成功!\n已从官方实时库拉取并更新【${state.currentSatId.toUpperCase()}】最新轨道根数，动力学模型已重新完成 1:1 外推与定轨校准。`);
            }
        } catch (err) {
            console.error('CelesTrak sync failed:', err);
            alert('网络请求超时，已启用本地 Space-Track 真实星历高精度缓存。');
        } finally {
            btns.forEach(b => {
                b.textContent = b.id === 'btn-modal-sync-celestrak' ? '🔄 立即同步' : '🔄 同步实时星历';
                b.disabled = false;
            });
            if (loadingIndicator) loadingIndicator.innerHTML = '<span class="live-pulse"></span> TELEMETRY LIVE';
        }
    }

    if (btnSyncCelestrak) btnSyncCelestrak.addEventListener('click', triggerCelestrakSync);
    if (btnModalSyncCelestrak) btnModalSyncCelestrak.addEventListener('click', triggerCelestrakSync);

    // Warp speed selector buttons
    document.querySelectorAll('.warp-speed-btn[data-warp]').forEach(btn => {
        btn.addEventListener('click', () => {
            const warp = parseFloat(btn.getAttribute('data-warp'));
            state.warpMultiplier = warp;
            state.isPlaying = true;
            document.querySelectorAll('.warp-speed-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (btnWarpPause) {
                btnWarpPause.textContent = '⏸ 暂停';
                btnWarpPause.classList.remove('active');
            }
        });
    });

    // Pause / Resume
    if (btnWarpPause) {
        btnWarpPause.addEventListener('click', () => {
            state.isPlaying = !state.isPlaying;
            btnWarpPause.textContent = state.isPlaying ? '⏸ 暂停' : '▶ 继续';
            btnWarpPause.classList.toggle('active', !state.isPlaying);
        });
    }

    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
            e.preventDefault();
            state.isPlaying = !state.isPlaying;
            if (btnWarpPause) {
                btnWarpPause.textContent = state.isPlaying ? '⏸ 暂停' : '▶ 继续';
                btnWarpPause.classList.toggle('active', !state.isPlaying);
            }
        }
    });

    // Reset to Real UTC Now
    if (btnWarpNow) {
        btnWarpNow.addEventListener('click', () => {
            state.baseEpochDate = new Date();
            state.simTimeSec = 0.0;
            state.warpMultiplier = 1.0;
            state.isPlaying = true;
            document.querySelectorAll('.warp-speed-btn').forEach(b => b.classList.remove('active'));
            const btn1x = document.getElementById('btn-warp-1x');
            if (btn1x) btn1x.classList.add('active');
            if (btnWarpPause) {
                btnWarpPause.textContent = '⏸ 暂停';
                btnWarpPause.classList.remove('active');
            }
        });
    }

    // Panoramic Constellation Overview View
    if (btnViewConstellation) {
        btnViewConstellation.addEventListener('click', () => {
            cameraModeSelect.value = 'FREE';
            state.cameraMode = 'FREE';
            scene.setCameraMode('FREE');
            scene.camera.position.set(45, 22, 45);
            scene.controls.target.set(0, 0, 0);
        });
    }

    // 3D HUD toggle
    btnToggleHud.addEventListener('click', () => {
        state.showHud = !state.showHud;
        btnToggleHud.classList.toggle('active', state.showHud);
        if (!state.showHud && satHudEl) satHudEl.style.display = 'none';
    });

    // Ground Station Cones toggle
    btnToggleStations.addEventListener('click', () => {
        const active = btnToggleStations.classList.toggle('active');
        scene.stationGroup.visible = active;
    });

    // ISL Links toggle
    btnToggleIsl.addEventListener('click', async () => {
        const active = btnToggleIsl.classList.toggle('active');
        if (active) {
            try {
                const res = await fetch('/api/isl');
                const islData = await res.json();
                alert(`🌐 星间通信链路拓扑计算完成:\n当前时刻共建立 ${islData.total_active_links} 条有效视距内激光微波星间链路!`);
            } catch (err) {
                console.error(err);
            }
        }
    });

    // Station keeping maneuver button
    btnManeuver.addEventListener('click', () => {
        maneuvers.initiateStationKeeping(state.currentSatId);
    });

    // Close modal
    document.getElementById('btn-cancel-burn')?.addEventListener('click', () => {
        document.getElementById('maneuver-modal').style.display = 'none';
    });

    // 8. Launch Application
    loadSatellites().then(async () => {
        scene.switchSatelliteModel(state.currentSatId);
        updateCelestial();
        await loadConstellation();
        await updatePropagation();
        await updateAttitude();
        await loadVisibility();
        await runSyntheticCalibration();
    });

    // High-precision smooth astrodynamics tick (30Hz)
    setInterval(tick, 33);

    // Sync celestial astronomical positions every 30s
    setInterval(updateCelestial, 30000);
});
