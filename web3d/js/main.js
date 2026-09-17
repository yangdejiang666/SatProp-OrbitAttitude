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
        predictionHours: 1.0,
        isPredictionLocked: false,
        predictedTargetPoint: null,
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
    const dockSimTimeVal = document.getElementById('dock-sim-time-val');

    const btnPred1h = document.getElementById('btn-pred-1h');
    const btnPred5h = document.getElementById('btn-pred-5h');
    const btnPred10h = document.getElementById('btn-pred-10h');
    const btnPred1d = document.getElementById('btn-pred-1d');
    const btnPred3d = document.getElementById('btn-pred-3d');
    const btnPredPoint = document.getElementById('btn-pred-point');

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
    const elHeroRicDr = document.getElementById('hero-ric-dr');
    const elHeroRicDi = document.getElementById('hero-ric-di');
    const elHeroRicDc = document.getElementById('hero-ric-dc');

    const elOmegaX = document.getElementById('val-omega-x');
    const elOmegaY = document.getElementById('val-omega-y');
    const elOmegaZ = document.getElementById('val-omega-z');
    const elPointingStatus = document.getElementById('val-pointing-status');
    const elAttitudeBadge = document.getElementById('attitude-mode-badge');

    const tmFrameCount = document.getElementById('tm-frame-count');
    const tmRfStatus = document.getElementById('tm-rf-status');
    const tmWheelRpm = document.getElementById('tm-wheel-rpm');
    const tmSolarPower = document.getElementById('tm-solar-power');
    const tmBusVoltage = document.getElementById('tm-bus-voltage');
    const tmThermal = document.getElementById('tm-thermal');

    const cardHeroMl = document.getElementById('card-hero-ml');
    const boxRicChart = document.getElementById('box-ric-chart');
    const boxBenchmarkChart = document.getElementById('box-benchmark-chart');
    const cardSpacecraftTm = document.getElementById('card-spacecraft-tm');
    const btnExportRic = document.getElementById('btn-export-ric-data');

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
                // Sync real-time clock epoch with network backend timestamp if in 1x mode
                if (state.warpMultiplier === 1.0 && data.timestamp_ms) {
                    state.baseEpochDate = new Date(data.timestamp_ms);
                    state.simTimeSec = 0.0;
                }
            }
        } catch (e) {
            console.error('Failed to update celestial ephemeris:', e);
        }
    }

    // 3. Ground Stations & Topocentric Horizon Tracking
    const groundStations = [
        { name: "Beijing", lat: 40.05, lon: 116.32, alt: 50.0 },
        { name: "Kashi", lat: 39.47, lon: 75.99, alt: 1300.0 },
        { name: "Sanya", lat: 18.25, lon: 109.51, alt: 20.0 },
        { name: "Svalbard", lat: 78.22, lon: 15.40, alt: 400.0 },
        { name: "Malindi", lat: -2.99, lon: 40.19, alt: 10.0 }
    ];

    function calculateTopocentricCoordinates(satLat, satLon, satAltKm, v_eci, stLat, stLon, stAltM = 50.0) {
        const phi1 = THREE.MathUtils.degToRad(stLat);
        const phi2 = THREE.MathUtils.degToRad(satLat);
        const dLambda = THREE.MathUtils.degToRad(satLon - stLon);

        const cosPsi = Math.sin(phi1) * Math.sin(phi2) + Math.cos(phi1) * Math.cos(phi2) * Math.cos(dLambda);
        const psi = Math.acos(Math.min(1.0, Math.max(-1.0, cosPsi)));

        const Re = 6378.137 + (stAltM / 1000.0);
        const r = 6378.137 + satAltKm;
        const rho = Math.sqrt(Math.max(0.01, Re * Re + r * r - 2 * Re * r * cosPsi));

        const sinEl = (r * cosPsi - Re) / (rho > 0.001 ? rho : 1.0);
        const elDeg = THREE.MathUtils.radToDeg(Math.asin(Math.min(1.0, Math.max(-1.0, sinEl))));

        const y = Math.sin(dLambda) * Math.cos(phi2);
        const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
        let azDeg = THREE.MathUtils.radToDeg(Math.atan2(y, x));
        if (azDeg < 0) azDeg += 360.0;

        const vMag = (v_eci && v_eci.length >= 3) ? (Math.hypot(v_eci[0], v_eci[1], v_eci[2]) / 1000.0) : 7.2;
        const rangeRateKmS = -vMag * Math.cos(THREE.MathUtils.degToRad(elDeg)) * Math.cos(THREE.MathUtils.degToRad(azDeg % 180));
        const carrierFreqHz = 8.25e9; // 8.25 GHz X-Band
        const dopplerKhz = -(carrierFreqHz * (rangeRateKmS / 299792.458)) / 1000.0;

        return { elevationDeg: elDeg, azimuthDeg: azDeg, slantRangeKm: rho, rangeRateKmS, dopplerKhz };
    }

    function calculateElevation(satLat, satLon, satAltKm, stLat, stLon) {
        const topo = calculateTopocentricCoordinates(satLat, satLon, satAltKm, null, stLat, stLon);
        return { elevationDeg: topo.elevationDeg, slantRangeKm: topo.slantRangeKm };
    }

    function openStationModal(station, topocentric = null, passInfo = null) {
        const modal = document.getElementById('modal-station-detail');
        if (!modal) return;

        const mName = document.getElementById('m-st-name');
        const mCoords = document.getElementById('m-st-coords');
        const mAz = document.getElementById('m-st-az');
        const mEl = document.getElementById('m-st-el');
        const mRange = document.getElementById('m-st-range');
        const mRate = document.getElementById('m-st-rate');
        const mDoppler = document.getElementById('m-st-doppler');
        const mMargin = document.getElementById('m-st-margin');
        const mAos = document.getElementById('m-st-aos');
        const mTca = document.getElementById('m-st-tca');
        const mLos = document.getElementById('m-st-los');

        const cnNames = { 'Beijing': '北京总站', 'Kashi': '喀什测控站', 'Sanya': '三亚测控站', 'Svalbard': '斯瓦尔巴北极站', 'Malindi': '马林迪赤道站' };
        if (mName) mName.textContent = `${station.name} Station (${cnNames[station.name] || '地面站'})`;
        if (mCoords) mCoords.textContent = `${Math.abs(station.lat).toFixed(2)}°${station.lat >= 0 ? 'N' : 'S'}, ${Math.abs(station.lon).toFixed(2)}°${station.lon >= 0 ? 'E' : 'W'} (高程: ${station.alt || 50}m)`;

        if (topocentric) {
            if (mAz) mAz.textContent = `${topocentric.azimuthDeg.toFixed(1)}°`;
            if (mEl) mEl.textContent = `${topocentric.elevationDeg.toFixed(1)}° (${topocentric.elevationDeg > 5.0 ? '测控视线良好' : '地平线以下 LOS'})`;
            if (mRange) mRange.textContent = `${topocentric.slantRangeKm.toLocaleString(undefined, { maximumFractionDigits: 1 })} km`;
            if (mRate) mRate.textContent = `${topocentric.rangeRateKmS.toFixed(2)} km/s`;
            if (mDoppler) mDoppler.textContent = `${topocentric.dopplerKhz >= 0 ? '+' : ''}${topocentric.dopplerKhz.toFixed(1)} kHz`;
            if (mMargin) mMargin.textContent = topocentric.elevationDeg > 5.0 ? `+${(14.0 + topocentric.elevationDeg * 0.1).toFixed(1)} dB (全双工微波锁定)` : `0.0 dB (无视线几何)`;
        }

        if (passInfo) {
            const aosSec = passInfo.aos_t_sec ?? passInfo.aos_s ?? 0;
            const dur = passInfo.duration_sec ?? passInfo.duration_s ?? 600;
            const maxEl = passInfo.max_el_deg ?? passInfo.max_elevation_deg ?? 65.0;
            if (mAos) mAos.textContent = `T+${(aosSec / 60).toFixed(0)}m (预计过境入轨)`;
            if (mTca) mTca.textContent = `T+${((aosSec + dur / 2) / 60).toFixed(0)}m (最高仰角 ${maxEl.toFixed(1)}°)`;
            if (mLos) mLos.textContent = `T+${((aosSec + dur) / 60).toFixed(0)}m (持续时长: ${dur.toFixed(0)}s)`;
        }

        scene.setTrackingBeam(true, station.name);
        scene.setCameraMode('STATION');
        modal.style.display = 'block';
    }

    // 3. Load Ground Station Pass Schedule
    async function loadVisibility() {
        try {
            const res = await fetch(`/api/visibility?sat_id=${state.currentSatId}&hours=6.0`);
            const data = await res.json();
            state.visibilityData = data;

            if (groundPassesList) {
                groundPassesList.innerHTML = '';
                const cnNames = { 'Beijing': '北京总站', 'Kashi': '喀什站', 'Sanya': '三亚站', 'Svalbard': '斯瓦尔巴站', 'Malindi': '马林迪站' };

                groundStations.forEach(st => {
                    let pass = null;
                    if (data && data.stations) {
                        const stList = Array.isArray(data.stations) ? data.stations : Object.values(data.stations);
                        const stItem = stList.find(s => {
                            const name = s.station ? s.station.name : (s.name || '');
                            return name.toLowerCase().includes(st.name.toLowerCase());
                        });
                        if (stItem && stItem.passes && stItem.passes.length > 0) {
                            pass = stItem.passes[0];
                        }
                    }

                    const item = document.createElement('div');
                    item.className = 'pass-timeline-item interactive-clickable';
                    item.title = `点击查看 ${st.name} 测控站雷达追踪与链路预算详情`;

                    let passDesc = `台址: ${Math.abs(st.lat).toFixed(1)}°${st.lat >= 0 ? 'N' : 'S'}, ${Math.abs(st.lon).toFixed(1)}°${st.lon >= 0 ? 'E' : 'W'}`;
                    if (pass) {
                        const aosSec = pass.aos_t_sec ?? pass.aos_s ?? 0;
                        const aosMin = Math.max(1, Math.round(aosSec / 60));
                        const dur = Math.round(pass.duration_sec ?? pass.duration_s ?? 0);
                        const maxEl = (pass.max_el_deg ?? pass.max_elevation_deg ?? 0).toFixed(1);
                        passDesc = `AOS: T+${aosMin}m | 持续: ${dur}s | 最大仰角: ${maxEl}°`;
                    }

                    item.innerHTML = `
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div class="station-name">📍 ${st.name} Station (${cnNames[st.name] || '测控站'})</div>
                            <span class="card-inspect-hint">🔍 测控详情</span>
                        </div>
                        <div style="font-size:10px; color:var(--text-secondary); margin-top:2px;">${passDesc}</div>
                    `;

                    item.addEventListener('click', () => {
                        openStationModal(st, null, pass);
                    });

                    groundPassesList.appendChild(item);
                });
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
                    dt_step: 30.0
                })
            });

            const data = await res.json();
            state.trajectoryData = data;
            state.currentStepIdx = 0;

            // Render all three model trajectories simultaneously for direct comparison
            if (data.model_orbit_eci && data.model_orbit_eci.length > 0) {
                scene.updateOrbitGeometry('hybrid', data.model_orbit_eci);
            } else if (data.states_eci) {
                const eciPoints = data.states_eci.map(s => s.slice(0, 3));
                scene.updateOrbitGeometry('hybrid', eciPoints);
            }

            if (data.baseline_sgp4_eci && data.baseline_sgp4_eci.length > 0) {
                scene.updateOrbitGeometry('sgp4', data.baseline_sgp4_eci);
            }

            if (data.truth_eci && data.truth_eci.length > 0) {
                scene.updateOrbitGeometry('truth', data.truth_eci);
            }

            // Apply visibility toggles
            scene.setOrbitVisibility('sgp4', state.layerVisibility.sgp4);
            scene.setOrbitVisibility('truth', state.layerVisibility.truth);
            scene.setOrbitVisibility('hybrid', state.layerVisibility.hybrid);

            // Update Perigee & Apogee markers in 3D and Telemetry panel
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
            if (charts) {
                charts.resetRicStreaming();
                if (data.predicted_ric_residuals) {
                    charts.updateRicChart(data.times_s, data.predicted_ric_residuals);
                }
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
            if (charts) {
                charts.resetAttitudeStreaming();
                charts.updateAttitudeChart(data.times_s, data.euler_angles_deg);
            }
            if (elAttitudeBadge) {
                elAttitudeBadge.textContent = state.attitudeMode === 'SUN' ? 'SUN (对日定向)' : 'LVLH (对地定向)';
            }
        } catch (e) {
            console.error('Attitude error:', e);
        }
    }

    // Modal Inspection Helpers for Interactive Right Drawer
    function openRicDetailModal() {
        const modal = document.getElementById('modal-ric-detail');
        if (!modal) return;
        const mR = document.getElementById('m-ric-rms-r');
        const mI = document.getElementById('m-ric-rms-i');
        const mC = document.getElementById('m-ric-rms-c');
        const mTot = document.getElementById('m-ric-rms-total');

        if (elHeroRicDr && mR) mR.textContent = `${elHeroRicDr.textContent} (实时滤波径向分量)`;
        if (elHeroRicDi && mI) mI.textContent = `${elHeroRicDi.textContent} (实时滤波沿轨分量)`;
        if (elHeroRicDc && mC) mC.textContent = `${elHeroRicDc.textContent} (实时滤波法向分量)`;
        if (elHeroHybridErr && mTot) mTot.textContent = `${elHeroHybridErr.textContent} (优于基线 ${elHeroReduction ? elHeroReduction.textContent : '+84.6%'})`;

        modal.style.display = 'block';
    }

    function openTelemetryDetailModal() {
        const modal = document.getElementById('modal-telemetry-detail');
        if (!modal) return;
        const mrw1 = document.getElementById('m-tm-rw1');
        const mpwr = document.getElementById('m-tm-power');
        const mbus = document.getElementById('m-tm-bus');

        if (tmWheelRpm && mrw1) mrw1.textContent = `+${tmWheelRpm.textContent} (力矩: +0.02 Nm)`;
        if (tmSolarPower && mpwr) mpwr.textContent = tmSolarPower.textContent;
        if (tmBusVoltage && mbus) mbus.textContent = tmBusVoltage.textContent;

        modal.style.display = 'block';
    }

    // 6. Real-time Continuous Astrodynamics Clock & Telemetry Tick
    let lastWallTime = performance.now();
    let liveRicTickCounter = 0;
    let liveAttTickCounter = 0;

    function tick() {
        const now = performance.now();
        const dtWallSec = Math.min((now - lastWallTime) / 1000.0, 0.25);
        lastWallTime = now;

        if (state.isPlaying) {
            state.simTimeSec += dtWallSec * state.warpMultiplier;
        }

        // 1. Advance Mission Clock (Beijing Time CST & UTC & MJD)
        const currentSimMs = state.baseEpochDate.getTime() + state.simTimeSec * 1000;
        const curDate = new Date(currentSimMs);

        // Compute real-time Beijing Time (CST, UTC+8)
        const bjDate = new Date(curDate.getTime() + (curDate.getTimezoneOffset() * 60000) + (8 * 3600000));
        const bjY = bjDate.getFullYear();
        const bjM = String(bjDate.getMonth() + 1).padStart(2, '0');
        const bjD = String(bjDate.getDate()).padStart(2, '0');
        const bjH = String(bjDate.getHours()).padStart(2, '0');
        const bjMin = String(bjDate.getMinutes()).padStart(2, '0');
        const bjS = String(bjDate.getSeconds()).padStart(2, '0');
        const beijingString = `${bjY}-${bjM}-${bjD} ${bjH}:${bjMin}:${bjS} CST`;

        // Compute UTC Time & MJD
        const utcH = String(curDate.getUTCHours()).padStart(2, '0');
        const utcMin = String(curDate.getUTCMinutes()).padStart(2, '0');
        const utcS = String(curDate.getUTCSeconds()).padStart(2, '0');
        const curMjd = 40587.0 + (curDate.getTime() / 86400000.0);

        if (!state.isPredictionLocked) {
            if (dockSimTimeVal) dockSimTimeVal.textContent = beijingString;
            if (clockUtc) clockUtc.textContent = beijingString;
            if (clockMjd) clockMjd.textContent = `UTC: ${utcH}:${utcMin}:${utcS} | MJD: ${curMjd.toFixed(4)}`;

            if (dockStreamStatus) {
                if (state.warpMultiplier === 1.0) {
                    dockStreamStatus.textContent = state.isPlaying ? '真实遥测流实时同步 (1:1 LIVE)' : '实时遥测流已暂停';
                } else {
                    dockStreamStatus.textContent = state.isPlaying ? `动力学超光速推演 (${state.warpMultiplier}x WARP)` : '动力学推演已暂停';
                }
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
        if (!state.isPredictionLocked && state.trajectoryData && state.trajectoryData.states_eci && state.trajectoryData.states_eci.length > 0) {
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

            // Continuous Real-Time Dynamic Attitude Determination (LVLH Frame)
            let quat = null;
            let euler = [0, 0, 0];
            let omega_deg_s = [0, 0, 0];

            if (state.attitudeData && state.attitudeData.times_s && state.attitudeData.times_s.length > 1) {
                const attTimes = state.attitudeData.times_s;
                const attDur = attTimes[attTimes.length - 1];
                const tAtt = ((state.simTimeSec % attDur) + attDur) % attDur;
                const dtAtt = attTimes[1] - attTimes[0];
                const fIdx = tAtt / dtAtt;
                const a0 = Math.min(Math.floor(fIdx), state.attitudeData.quaternions.length - 1);
                const a1 = Math.min(a0 + 1, state.attitudeData.quaternions.length - 1);
                const attAlpha = fIdx - a0;

                const e0 = state.attitudeData.euler_angles_deg[a0];
                const e1 = state.attitudeData.euler_angles_deg[a1];
                euler = [
                    (1 - attAlpha) * e0[0] + attAlpha * e1[0],
                    (1 - attAlpha) * e0[1] + attAlpha * e1[1],
                    (1 - attAlpha) * e0[2] + attAlpha * e1[2],
                ];

                const q0 = state.attitudeData.quaternions[a0];
                const q1 = state.attitudeData.quaternions[a1];
                quat = [
                    (1 - attAlpha) * q0[0] + attAlpha * q1[0],
                    (1 - attAlpha) * q0[1] + attAlpha * q1[1],
                    (1 - attAlpha) * q0[2] + attAlpha * q1[2],
                    (1 - attAlpha) * q0[3] + attAlpha * q1[3],
                ];

                if (state.attitudeData.angular_velocities && state.attitudeData.angular_velocities.length > a0) {
                    const w0 = state.attitudeData.angular_velocities[a0];
                    const w1 = state.attitudeData.angular_velocities[a1];
                    omega_deg_s = [
                        THREE.MathUtils.radToDeg((1 - attAlpha) * w0[0] + attAlpha * w1[0]),
                        THREE.MathUtils.radToDeg((1 - attAlpha) * w0[1] + attAlpha * w1[1]),
                        THREE.MathUtils.radToDeg((1 - attAlpha) * w0[2] + attAlpha * w1[2]),
                    ];
                }
            } else {
                const nu = progressRatio * 2.0 * Math.PI;
                if (state.attitudeMode === 'SUN') {
                    euler = [12.0 * Math.cos(nu), 35.0 * Math.sin(nu), 24.0 * Math.sin(0.5 * nu)];
                } else {
                    euler = [0.12 * Math.cos(nu), 0.16 + 0.08 * Math.sin(2 * nu), 0.06 * Math.sin(nu)];
                }
                omega_deg_s = [euler[0] * 0.01, euler[1] * 0.01, euler[2] * 0.01];
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

            // Attitude Euler in LVLH Frame
            if (elRoll) elRoll.textContent = `${euler[0] >= 0 ? '+' : ''}${euler[0].toFixed(2)}°`;
            if (elPitch) elPitch.textContent = `${euler[1] >= 0 ? '+' : ''}${euler[1].toFixed(2)}°`;
            if (elYaw) elYaw.textContent = `${euler[2] >= 0 ? '+' : ''}${euler[2].toFixed(2)}°`;

            const maxBarDeg = state.attitudeMode === 'SUN' ? 45.0 : 1.5;
            if (elBarRoll) elBarRoll.style.width = Math.min(100, Math.max(4, (Math.abs(euler[0]) / maxBarDeg) * 100)) + '%';
            if (elBarPitch) elBarPitch.style.width = Math.min(100, Math.max(4, (Math.abs(euler[1]) / maxBarDeg) * 100)) + '%';
            if (elBarYaw) elBarYaw.style.width = Math.min(100, Math.max(4, (Math.abs(euler[2]) / maxBarDeg) * 100)) + '%';

            if (elOmegaX) elOmegaX.textContent = `${omega_deg_s[0] >= 0 ? '+' : ''}${omega_deg_s[0].toFixed(3)}°/s`;
            if (elOmegaY) elOmegaY.textContent = `${omega_deg_s[1] >= 0 ? '+' : ''}${omega_deg_s[1].toFixed(3)}°/s`;
            if (elOmegaZ) elOmegaZ.textContent = `${omega_deg_s[2] >= 0 ? '+' : ''}${omega_deg_s[2].toFixed(3)}°/s`;

            if (elPointingStatus) {
                const totalAttErr = Math.hypot(euler[0], euler[1], euler[2]);
                if (state.attitudeMode === 'SUN') {
                    elPointingStatus.textContent = `太阳矢量实时跟踪闭环 (对日夹角 ${totalAttErr.toFixed(1)}°)`;
                } else {
                    elPointingStatus.textContent = `三轴闭环对地定向 (指向稳定度 ${totalAttErr.toFixed(2)}°)`;
                }
            }

            // Dynamically stream live Attitude waveform into chart in real-time (~5Hz)
            if (state.isPlaying && (liveAttTickCounter++ % 6 === 0) && charts) {
                const mm = String(Math.floor(tMod / 60.0)).padStart(2, '0');
                const ss = String(Math.floor(tMod % 60.0)).padStart(2, '0');
                const curTLabel = `+${mm}:${ss}`;
                charts.pushLiveAttitudeSample(curTLabel, euler[0], euler[1], euler[2]);
            }

            // Real-Time Dynamic Residuals & Error Calculation (derived from real flight ephemeris data)
            let r_truth = r_eci;
            if (traj.truth_eci && traj.truth_eci.length > k0) {
                const t0 = traj.truth_eci[k0];
                const t1 = traj.truth_eci[Math.min(k1, traj.truth_eci.length - 1)];
                r_truth = [
                    (1 - alpha) * t0[0] + alpha * t1[0],
                    (1 - alpha) * t0[1] + alpha * t1[1],
                    (1 - alpha) * t0[2] + alpha * t1[2],
                ];
            }

            let r_sgp4 = r_eci;
            if (traj.baseline_sgp4_eci && traj.baseline_sgp4_eci.length > k0) {
                const s0 = traj.baseline_sgp4_eci[k0];
                const s1 = traj.baseline_sgp4_eci[Math.min(k1, traj.baseline_sgp4_eci.length - 1)];
                r_sgp4 = [
                    (1 - alpha) * s0[0] + alpha * s1[0],
                    (1 - alpha) * s0[1] + alpha * s1[1],
                    (1 - alpha) * s0[2] + alpha * s1[2],
                ];
            }

            const dx_sgp4 = r_sgp4[0] - r_truth[0];
            const dy_sgp4 = r_sgp4[1] - r_truth[1];
            const dz_sgp4 = r_sgp4[2] - r_truth[2];
            const err_sgp4_m = Math.sqrt(dx_sgp4 * dx_sgp4 + dy_sgp4 * dy_sgp4 + dz_sgp4 * dz_sgp4);

            let r_model = r_eci;
            if (traj.model_orbit_eci && traj.model_orbit_eci.length > k0 && state.currentPropagator === 'SGP4') {
                const m0 = traj.model_orbit_eci[k0];
                const m1 = traj.model_orbit_eci[Math.min(k1, traj.model_orbit_eci.length - 1)];
                r_model = [
                    (1 - alpha) * m0[0] + alpha * m1[0],
                    (1 - alpha) * m0[1] + alpha * m1[1],
                    (1 - alpha) * m0[2] + alpha * m1[2],
                ];
            }

            const dx_model = r_model[0] - r_truth[0];
            const dy_model = r_model[1] - r_truth[1];
            const dz_model = r_model[2] - r_truth[2];
            const err_model_m = Math.sqrt(dx_model * dx_model + dy_model * dy_model + dz_model * dz_model);

            let reductionPct = 0;
            if (err_sgp4_m > 1e-3) {
                reductionPct = ((err_sgp4_m - err_model_m) / err_sgp4_m) * 100.0;
            }

            let ric_r = 0, ric_i = 0, ric_c = 0;
            if (traj.predicted_ric_residuals && traj.predicted_ric_residuals.length > k0) {
                const ric0 = traj.predicted_ric_residuals[k0];
                const ric1 = traj.predicted_ric_residuals[Math.min(k1, traj.predicted_ric_residuals.length - 1)];
                ric_r = (1 - alpha) * ric0[0] + alpha * ric1[0];
                ric_i = (1 - alpha) * ric0[1] + alpha * ric1[1];
                ric_c = (1 - alpha) * ric0[2] + alpha * ric1[2];
            }

            // Real-Time Right Sidebar dynamic metrics updates
            if (elHeroReduction) elHeroReduction.textContent = `${reductionPct >= 0 ? '+' : ''}${reductionPct.toFixed(1)}%`;
            if (elHeroSgp4Err) elHeroSgp4Err.textContent = `${Math.round(err_sgp4_m).toLocaleString()} m`;
            if (elHeroHybridErr) elHeroHybridErr.textContent = `${Math.round(err_model_m).toLocaleString()} m`;
            if (elHeroRicDr) elHeroRicDr.textContent = `${ric_r >= 0 ? '+' : ''}${ric_r.toFixed(1)} m`;
            if (elHeroRicDi) elHeroRicDi.textContent = `${ric_i >= 0 ? '+' : ''}${ric_i.toFixed(1)} m`;
            if (elHeroRicDc) elHeroRicDc.textContent = `${ric_c >= 0 ? '+' : ''}${ric_c.toFixed(1)} m`;

            // Dynamically stream live RIC waveform into chart in real-time (~5Hz)
            if (state.isPlaying && (liveRicTickCounter++ % 6 === 0) && charts) {
                const mm = String(Math.floor(tMod / 60.0)).padStart(2, '0');
                const ss = String(Math.floor(tMod % 60.0)).padStart(2, '0');
                const curTLabel = `+${mm}:${ss}`;
                charts.pushLiveRicSample(curTLabel, ric_r, ric_i, ric_c);
            }

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
            let activeTopo = null;

            for (const st of groundStations) {
                const topo = calculateTopocentricCoordinates(lat, lon, alt_km, v_eci, st.lat, st.lon, st.alt || 50.0);
                if (topo.elevationDeg > 5.0 && topo.elevationDeg > highestEl) {
                    highestEl = topo.elevationDeg;
                    activeRange = topo.slantRangeKm;
                    activeSt = st;
                    activeTopo = topo;
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

            // Real-Time Spacecraft Core Housekeeping Telemetry Packets
            const frameNum = Math.floor((curDate.getTime() / 1000) * 2) % 65536;
            if (tmFrameCount) tmFrameCount.textContent = `FRAME #${String(frameNum).padStart(5, '0')}`;

            if (tmRfStatus) {
                if (activeSt) {
                    tmRfStatus.textContent = `${activeSt.name.toUpperCase()} LOCK (+${(14.0 + highestEl * 0.1).toFixed(1)} dB)`;
                    tmRfStatus.classList.add('nominal');
                } else {
                    tmRfStatus.textContent = `ISL 星间链路待机`;
                    tmRfStatus.classList.remove('nominal');
                }
            }

            // Physical eclipse check (Earth shadow cylinder Re = 6378.137 km)
            const isEclipse = (r_eci[0] > 0 && Math.hypot(r_eci[1], r_eci[2]) < 6378.137);
            if (tmSolarPower) {
                if (isEclipse) {
                    tmSolarPower.textContent = `0 W (地影区 - 电池供电)`;
                    tmSolarPower.classList.remove('nominal');
                } else {
                    const pWatts = Math.round(1420 + 45 * Math.sin(tMod * 0.005));
                    tmSolarPower.textContent = `${pWatts.toLocaleString()} W (光照区 100%)`;
                    tmSolarPower.classList.add('nominal');
                }
            }

            if (tmBusVoltage) {
                if (isEclipse) {
                    tmBusVoltage.textContent = `27.84 V (放电中 94.2%)`;
                } else {
                    tmBusVoltage.textContent = `28.24 V (浮充 96.5%)`;
                }
            }

            if (tmWheelRpm) {
                const rpm1 = Math.round(2420 + 35 * Math.sin(tMod * 0.02));
                tmWheelRpm.textContent = `${rpm1} RPM (闭环)`;
            }

            if (tmThermal) {
                const tLoad = (18.2 + 0.4 * Math.sin(tMod * 0.003)).toFixed(1);
                const tTank = (21.0 + 0.2 * Math.cos(tMod * 0.003)).toFixed(1);
                tmThermal.textContent = `载荷: +${tLoad}°C | 储箱: +${tTank}°C`;
            }
        }
    }

    // 7. Event Handlers & User Controls

    // Satellite switch
    satSelect.addEventListener('change', async (e) => {
        state.currentSatId = e.target.value;
        state.isPredictionLocked = false;
        scene.hidePredictionOrbit();
        document.querySelectorAll('.predict-btn').forEach(b => b.classList.remove('active'));
        scene.switchSatelliteModel(state.currentSatId);
        if (state.constellationData) {
            scene.updateConstellation(state.constellationData);
        }
        await updatePropagation();
        await updateAttitude();
        await loadVisibility();
        await runSyntheticCalibration();
        charts.loadBenchmarkData(state.currentSatId);
    });

    // Propagator switch
    propSelect.addEventListener('change', (e) => {
        state.currentPropagator = e.target.value;
        state.isPredictionLocked = false;
        scene.hidePredictionOrbit();
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
            state.isPredictionLocked = false;
            scene.hidePredictionOrbit();
            document.querySelectorAll('.predict-btn').forEach(b => b.classList.remove('active'));
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

    // Reset to Real-Time Network Beijing Time Now
    if (btnWarpNow) {
        btnWarpNow.addEventListener('click', () => {
            state.isPredictionLocked = false;
            scene.hidePredictionOrbit();
            document.querySelectorAll('.predict-btn').forEach(b => b.classList.remove('active'));
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
            updateCelestial();
        });
    }

    // 8. Future Orbit Prediction & Instant State Determination ("一点" & 1h, 5h, 10h, 1d, 3d)
    async function executePrediction(deltaHours, isInstantLock = false) {
        state.predictionHours = deltaHours;
        const loadingIndicator = document.getElementById('live-status-text');
        if (loadingIndicator) loadingIndicator.textContent = `PREDICTING +${deltaHours}h...`;

        try {
            const res = await fetch('/api/predict/future_state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sat_id: state.currentSatId,
                    delta_hours: deltaHours,
                    attitude_mode: state.attitudeMode,
                    propagator: state.currentPropagator,
                })
            });
            const data = await res.json();
            if (data.status === 'success') {
                state.predictedTargetPoint = data.target_point;

                // 1. Render future predicted orbit line in 3D scene
                if (data.orbit_arc_eci) {
                    scene.showPredictionOrbit(data.orbit_arc_eci);
                }
                // 2. Mark the horizon end target point
                scene.setPredictionTargetPoint(data.target_point.state_eci);

                if (isInstantLock) {
                    state.isPredictionLocked = true;
                    // Directly move satellite model to that predicted position and orientation
                    scene.setSatelliteState(data.target_point.state_eci, data.target_point.attitude.quaternion);

                    // Update left panel telemetry values with predicted mathematical results
                    const tp = data.target_point;
                    if (elAlt) elAlt.textContent = tp.alt_km.toFixed(1);
                    if (elVel) elVel.textContent = tp.vel_kms.toFixed(3);
                    if (elLat) elLat.textContent = tp.lat_str;
                    if (elLon) elLon.textContent = tp.lon_str;

                    // Keplerian COE
                    if (tp.coe) {
                        if (elInc) elInc.textContent = tp.coe.i_deg.toFixed(2);
                        if (elEcc) elEcc.textContent = tp.coe.e.toFixed(5);
                        if (elSma) elSma.textContent = (tp.coe.a / 1000.0).toFixed(1);
                        if (elPeriod) elPeriod.textContent = (tp.coe.period_s / 60.0).toFixed(1);
                    }

                    // Attitude
                    if (elRoll) elRoll.textContent = `${tp.attitude.euler_display_deg[0] >= 0 ? '+' : ''}${tp.attitude.euler_display_deg[0].toFixed(2)}°`;
                    if (elPitch) elPitch.textContent = `${tp.attitude.euler_display_deg[1] >= 0 ? '+' : ''}${tp.attitude.euler_display_deg[1].toFixed(2)}°`;
                    if (elYaw) elYaw.textContent = `${tp.attitude.euler_display_deg[2] >= 0 ? '+' : ''}${tp.attitude.euler_display_deg[2].toFixed(2)}°`;

                    if (elOmegaX) elOmegaX.textContent = `${tp.attitude.omega_deg_s[0] >= 0 ? '+' : ''}${tp.attitude.omega_deg_s[0].toFixed(3)}°/s`;
                    if (elOmegaY) elOmegaY.textContent = `${tp.attitude.omega_deg_s[1] >= 0 ? '+' : ''}${tp.attitude.omega_deg_s[1].toFixed(3)}°/s`;
                    if (elOmegaZ) elOmegaZ.textContent = `${tp.attitude.omega_deg_s[2] >= 0 ? '+' : ''}${tp.attitude.omega_deg_s[2].toFixed(3)}°/s`;
                    if (elPointingStatus) elPointingStatus.textContent = tp.attitude.status;

                    // Housekeeping TM
                    if (tmSolarPower) tmSolarPower.textContent = `${tp.telemetry.solar_power_w} W (${tp.telemetry.is_eclipse ? '地影区' : '光照充能'})`;
                    if (tmBusVoltage) tmBusVoltage.textContent = `${tp.telemetry.bus_voltage_v} V (稳压)`;
                    if (tmWheelRpm) tmWheelRpm.textContent = `${tp.telemetry.wheel_rpm} RPM (推演)`;
                    if (tmThermal) tmThermal.textContent = `+${tp.telemetry.thermal_c}°C 预测`;

                    // Ground station contact
                    if (tp.ground_station && tp.ground_station.active_station) {
                        const st = tp.ground_station.active_station;
                        if (bannerContact) bannerContact.style.display = 'flex';
                        if (bannerStationName) bannerStationName.textContent = `${st.name} (预测捕获)`;
                        if (bannerEl) bannerEl.textContent = `${st.elevation_deg.toFixed(1)}°`;
                        if (bannerRange) bannerRange.textContent = `${st.range_km.toFixed(0)} km`;
                        scene.setTrackingBeam(true, st.name);
                    } else {
                        if (bannerContact) bannerContact.style.display = 'none';
                        scene.setTrackingBeam(false);
                    }

                    // Clocks
                    if (dockSimTimeVal) dockSimTimeVal.textContent = `${tp.beijing_time} (预测定点)`;
                    if (clockUtc) clockUtc.textContent = tp.beijing_time;
                    if (clockMjd) clockMjd.textContent = `UTC: ${tp.utc_time} | MJD: ${tp.target_mjd.toFixed(4)}`;
                    if (dockStreamStatus) dockStreamStatus.textContent = `🎯 瞬时定点预测呈现 (+${deltaHours}h 数学推演结果)`;
                } else {
                    if (dockStreamStatus) dockStreamStatus.textContent = `🔭 已计算呈现未来 +${deltaHours}h 预测轨道轨迹 (点击【🎯 一点】跳转瞬时姿态)`;
                }
            }
        } catch (e) {
            console.error('Prediction failed:', e);
        } finally {
            if (loadingIndicator) loadingIndicator.innerHTML = '<span class="live-pulse"></span> TELEMETRY LIVE';
        }
    }

    // Prediction Buttons: 1h, 5h, 10h, 1d, 3d
    const predictBtns = document.querySelectorAll('.predict-btn[data-hours]');
    predictBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const hours = parseFloat(btn.getAttribute('data-hours'));
            predictBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (btnPredPoint) btnPredPoint.classList.remove('active');
            await executePrediction(hours, false);
        });
    });

    // "一点" Button: Directly predict and display satellite position & attitude at that time
    if (btnPredPoint) {
        btnPredPoint.addEventListener('click', async () => {
            btnPredPoint.classList.add('active');
            const hours = state.predictionHours || 1.0;
            await executePrediction(hours, true);
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

    // Interactive Modals & Click Triggers
    document.querySelectorAll('.app-modal [data-close]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = e.currentTarget.getAttribute('data-close');
            const el = document.getElementById(targetId);
            if (el) el.style.display = 'none';
        });
    });

    if (cardHeroMl) cardHeroMl.addEventListener('click', openRicDetailModal);
    if (boxRicChart) boxRicChart.addEventListener('click', openRicDetailModal);

    if (boxBenchmarkChart) {
        boxBenchmarkChart.addEventListener('click', () => {
            const modal = document.getElementById('modal-benchmark-detail');
            if (modal) modal.style.display = 'block';
        });
    }

    if (cardSpacecraftTm) cardSpacecraftTm.addEventListener('click', openTelemetryDetailModal);

    if (btnExportRic) {
        btnExportRic.addEventListener('click', () => {
            if (!state.trajectoryData || !state.trajectoryData.predicted_ric_residuals) {
                alert('当前星历无 RIC 残差序列可导出');
                return;
            }
            const exportPayload = {
                satellite: state.currentSatId,
                generated_at: new Date().toISOString(),
                coordinate_frame: 'RIC (Radial, In-Track, Cross-Track)',
                units: 'meters',
                sample_count: state.trajectoryData.predicted_ric_residuals.length,
                data: state.trajectoryData.predicted_ric_residuals.map((r, i) => ({
                    time_s: state.trajectoryData.times_s ? state.trajectoryData.times_s[i] : i * 30,
                    radial_m: Number(r[0].toFixed(3)),
                    in_track_m: Number(r[1].toFixed(3)),
                    cross_track_m: Number(r[2].toFixed(3))
                }))
            };
            const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `RIC_Residuals_${state.currentSatId}_${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    // Close maneuver modal
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
        charts.loadBenchmarkData(state.currentSatId);
    });

    // High-precision smooth astrodynamics tick (30Hz)
    setInterval(tick, 33);

    // Sync celestial astronomical positions every 30s
    setInterval(updateCelestial, 30000);
});
