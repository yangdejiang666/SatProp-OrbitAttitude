/**
 * Orbit Station-Keeping and Maneuver Simulation Engine ("回归正轨 / 轨道矫正")
 * Visualizes thruster burns, transfer arcs, and satellite return to nominal slot.
 */

class ManeuverController {
    constructor(scene, appState) {
        this.scene = scene;
        this.appState = appState;
        this.isManeuvering = false;
    }

    async initiateStationKeeping(satId) {
        try {
            const resp = await fetch('/api/station_keeping/maneuver', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sat_id: satId,
                    nominal_sma_km: 7000.0
                })
            });
            const plan = await resp.json();
            this.showManeuverModal(plan);
        } catch (err) {
            console.error('Failed to plan station keeping:', err);
            alert('Maneuver calculation failed: ' + err.message);
        }
    }

    showManeuverModal(plan) {
        const modal = document.getElementById('maneuver-modal');
        const content = document.getElementById('maneuver-content');
        if (!modal || !content) return;

        content.innerHTML = `
            <div><strong>目标半长轴:</strong> ${plan.target_semi_major_axis_km.toFixed(2)} km</div>
            <div><strong>当前漂移偏差 (Δa):</strong> ${plan.delta_a_km.toFixed(3)} km</div>
            <div><strong>所需脉冲增量 (ΔV):</strong> <span style="color:#ffd700; font-weight:700;">${plan.delta_v_magnitude_ms.toFixed(2)} m/s</span></div>
            <div><strong>点火机动模式:</strong> ${plan.burn_type} (切向加速)</div>
            <div><strong>轨道偏心率矫正:</strong> ${plan.initial_coe.e.toFixed(5)} → ${plan.corrected_coe.e.toFixed(5)}</div>
            <div><strong>预计燃料消耗:</strong> ${(plan.delta_v_magnitude_ms * 0.22).toFixed(2)} kg (肼推进剂)</div>
        `;
        modal.style.display = 'block';

        const confirmBtn = document.getElementById('btn-confirm-burn');
        if (confirmBtn) {
            confirmBtn.onclick = () => {
                modal.style.display = 'none';
                this.executeBurnSequence(plan);
            };
        }
    }

    executeBurnSequence(plan) {
        this.isManeuvering = true;

        // 1. Show thruster ignition
        this.scene.setThrusterFiring(true);

        const statusEl = document.getElementById('live-status-text');
        if (statusEl) {
            statusEl.innerHTML = '<span style="color:#ffd700;">🔥 点火机动中: 回归正轨...</span>';
        }

        // 2. Generate golden transfer arc points
        const r_start = plan.initial_state_eci.slice(0, 3);
        const r_end = plan.corrected_state_eci.slice(0, 3);
        const arcPoints = [];

        for (let t = 0; t <= 1.0; t += 0.05) {
            const pt = [
                (1 - t) * r_start[0] + t * r_end[0],
                (1 - t) * r_start[1] + t * r_end[1],
                (1 - t) * r_start[2] + t * r_end[2],
            ];
            arcPoints.push(pt);
        }
        this.scene.updateOrbitGeometry('maneuver', arcPoints);

        // 3. Burn duration simulation (3.5 seconds animation)
        setTimeout(() => {
            this.scene.setThrusterFiring(false);
            this.isManeuvering = false;

            if (statusEl) {
                statusEl.innerHTML = '<span style="color:#00ff88;">✅ 已回归正轨 (NOMINAL SLOT RESTORED)</span>';
            }

            // Hide maneuver arc after 4s
            setTimeout(() => {
                if (this.scene.orbitLines.maneuver) {
                    this.scene.orbitLines.maneuver.visible = false;
                }
            }, 4000);
        }, 3500);
    }
}
