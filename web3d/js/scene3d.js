/**
 * High-Fidelity 3D Astrodynamics Scene Engine
 * Uses Three.js to render Earth, atmosphere, satellite 3D model, trajectories,
 * ground tracking stations, and inter-satellite links.
 */

class SpaceScene {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.width = this.container.clientWidth;
        this.height = this.container.clientHeight;

        this.earthRadius = 10.0; // Scaled Earth radius (6378 km -> 10.0 units)
        this.scaleRatio = this.earthRadius / 6378137.0; // 1 meter = scaleRatio units

        this.initThree();
        this.createStarfield();
        this.createEarth();
        this.createAtmosphere();
        this.createSatelliteModel();
        this.cameraMode = 'FREE'; // 'FREE', 'FOLLOW', 'STATION'
        this.activeStation = null;
        this.initOrbitLines();
        this.createGroundStations();
        this.createTrackingBeam();
        this.initApsidesMarkers();

        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);

        window.addEventListener('resize', () => this.onWindowResize());
    }

    initThree() {
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x050811, 0.002);

        this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 0.1, 1000);
        this.camera.position.set(22, 14, 25);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
        this.container.appendChild(this.renderer.domElement);

        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 10.5;
        this.controls.maxDistance = 140.0;

        // Space Lighting
        this.ambientLight = new THREE.AmbientLight(0x223355, 1.2);
        this.scene.add(this.ambientLight);

        // Sun Directional Light
        this.sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
        this.sunLight.position.set(50, 20, 40);
        this.scene.add(this.sunLight);
    }

    createStarfield() {
        const starCount = 3000;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);

        for (let i = 0; i < starCount * 3; i += 3) {
            const r = 250 + Math.random() * 200;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);

            positions[i] = r * Math.sin(phi) * Math.cos(theta);
            positions[i + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i + 2] = r * Math.cos(phi);

            // Subtle color tinting
            const tint = 0.7 + Math.random() * 0.3;
            colors[i] = tint * 0.8;
            colors[i + 1] = tint * 0.9;
            colors[i + 2] = tint;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 1.2,
            vertexColors: true,
            transparent: true,
            opacity: 0.85
        });

        this.starfield = new THREE.Points(geometry, material);
        this.scene.add(this.starfield);
    }

    createEarth() {
        // High-res procedural canvas texture for Earth
        const canvas = document.createElement('canvas');
        canvas.width = 2048;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');

        // Deep oceanic blue
        ctx.fillStyle = '#06132b';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Continental grid lines & glowing coastlines
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 1;

        // Longitudes
        for (let x = 0; x < canvas.width; x += 128) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
        // Latitudes
        for (let y = 0; y < canvas.height; y += 64) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }

        // Draw continents
        ctx.fillStyle = '#102d4f';
        // Eurasia/Africa
        ctx.beginPath();
        ctx.ellipse(canvas.width * 0.62, canvas.height * 0.35, 340, 160, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(canvas.width * 0.52, canvas.height * 0.58, 180, 200, 0, 0, Math.PI * 2);
        ctx.fill();
        // Americas
        ctx.beginPath();
        ctx.ellipse(canvas.width * 0.22, canvas.height * 0.32, 220, 140, -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(canvas.width * 0.30, canvas.height * 0.68, 140, 180, 0.3, 0, Math.PI * 2);
        ctx.fill();
        // Australia
        ctx.beginPath();
        ctx.ellipse(canvas.width * 0.82, canvas.height * 0.72, 100, 80, 0, 0, Math.PI * 2);
        ctx.fill();

        // Equator highlight
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();

        const earthTexture = new THREE.CanvasTexture(canvas);
        const geometry = new THREE.SphereGeometry(this.earthRadius, 64, 64);
        const material = new THREE.MeshPhongMaterial({
            map: earthTexture,
            specular: 0x224488,
            shininess: 30,
            wireframe: false,
        });

        this.earthMesh = new THREE.Mesh(geometry, material);
        // Tilt Earth axis (23.44 degrees)
        this.earthMesh.rotation.z = THREE.MathUtils.degToRad(-23.44);
        this.scene.add(this.earthMesh);
    }

    createAtmosphere() {
        // Glowing blue atmospheric envelope
        const atmoGeometry = new THREE.SphereGeometry(this.earthRadius * 1.025, 48, 48);
        const atmoMaterial = new THREE.MeshLambertMaterial({
            color: 0x00a8ff,
            transparent: true,
            opacity: 0.18,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending
        });
        this.atmosphere = new THREE.Mesh(atmoGeometry, atmoMaterial);
        this.scene.add(this.atmosphere);
    }

    createSatelliteModel() {
        this.satGroup = new THREE.Group();

        // 1. Spacecraft Main Body (Gold foil multi-layer insulation)
        const bodyGeo = new THREE.BoxGeometry(0.5, 0.5, 0.7);
        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0xd4af37,
            metalness: 0.85,
            roughness: 0.25
        });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        this.satGroup.add(body);

        // 2. Solar Panels (Dual Wings with solar cell pattern)
        const panelGeo = new THREE.BoxGeometry(1.6, 0.04, 0.5);
        const panelMat = new THREE.MeshStandardMaterial({
            color: 0x0033aa,
            metalness: 0.9,
            roughness: 0.1
        });
        const leftPanel = new THREE.Mesh(panelGeo, panelMat);
        leftPanel.position.set(-1.1, 0, 0);
        this.satGroup.add(leftPanel);

        const rightPanel = new THREE.Mesh(panelGeo, panelMat);
        rightPanel.position.set(1.1, 0, 0);
        this.satGroup.add(rightPanel);

        // 3. Parabolic High-Gain Dish Antenna
        const dishGeo = new THREE.ConeGeometry(0.25, 0.1, 16, 1, true);
        const dishMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.5, roughness: 0.3 });
        const dish = new THREE.Mesh(dishGeo, dishMat);
        dish.position.set(0, 0.35, 0);
        dish.rotation.x = Math.PI;
        this.satGroup.add(dish);

        // 4. Optical Remote Sensing Telescope Camera (Facing Nadir +Z)
        const lensGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.25, 16);
        const lensMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.1 });
        const lens = new THREE.Mesh(lensGeo, lensMat);
        lens.position.set(0, 0, 0.45);
        lens.rotation.x = Math.PI / 2;
        this.satGroup.add(lens);

        // 5. Thruster Nozzle & Flame Flare
        const nozzleGeo = new THREE.CylinderGeometry(0.06, 0.03, 0.12, 12);
        const nozzleMat = new THREE.MeshBasicMaterial({ color: 0x555555 });
        const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
        nozzle.position.set(0, 0, -0.4);
        nozzle.rotation.x = Math.PI / 2;
        this.satGroup.add(nozzle);

        // Thruster flame cone (hidden until maneuver ignited)
        const flameGeo = new THREE.ConeGeometry(0.12, 0.5, 12);
        const flameMat = new THREE.MeshBasicMaterial({
            color: 0xffaa00,
            transparent: true,
            opacity: 0.0,
            blending: THREE.AdditiveBlending
        });
        this.thrusterFlame = new THREE.Mesh(flameGeo, flameMat);
        this.thrusterFlame.position.set(0, 0, -0.7);
        this.thrusterFlame.rotation.x = -Math.PI / 2;
        this.satGroup.add(this.thrusterFlame);

        // Scale satellite model
        this.satGroup.scale.set(0.6, 0.6, 0.6);
        this.scene.add(this.satGroup);
    }

    initOrbitLines() {
        // Orbit lines registry
        this.orbitLines = {};

        // SGP4 Baseline: Red / Coral (Original drift orbit)
        this.orbitLines.sgp4 = this.createOrbitLineMesh(0xff3366, 1.8, false);
        // Cowell RKF78 Truth: Amber / Yellow (High-fidelity reference orbit)
        this.orbitLines.truth = this.createOrbitLineMesh(0xffaa00, 2.2, false);
        // Hybrid ML Corrected: Neon Emerald Green (AI-corrected orbit)
        this.orbitLines.hybrid = this.createOrbitLineMesh(0x00ff88, 2.5, false);
        // Drifted Orbit: Dashed Red
        this.orbitLines.drifted = this.createOrbitLineMesh(0xff0055, 1.5, true);
        // Station-Keeping Maneuver Path: Gold
        this.orbitLines.maneuver = this.createOrbitLineMesh(0xffd700, 3.2, false);
    }

    createOrbitLineMesh(colorHex, linewidth, isDashed = false) {
        const material = isDashed
            ? new THREE.LineDashedMaterial({
                color: colorHex,
                dashSize: 0.5,
                gapSize: 0.25,
                transparent: true,
                opacity: 0.8
            })
            : new THREE.LineBasicMaterial({
                color: colorHex,
                transparent: true,
                opacity: 0.85
            });

        const geometry = new THREE.BufferGeometry();
        const line = new THREE.Line(geometry, material);
        line.visible = false;
        this.scene.add(line);
        return line;
    }

    updateOrbitGeometry(lineKey, eciPoints) {
        const line = this.orbitLines[lineKey];
        if (!line || !eciPoints || eciPoints.length === 0) return;

        const positions = new Float32Array(eciPoints.length * 3);
        for (let i = 0; i < eciPoints.length; i++) {
            // Convert ECI [m] to Three.js coordinates (X, Z, -Y)
            positions[i * 3] = eciPoints[i][0] * this.scaleRatio;
            positions[i * 3 + 1] = eciPoints[i][2] * this.scaleRatio;
            positions[i * 3 + 2] = -eciPoints[i][1] * this.scaleRatio;
        }

        line.geometry.dispose();
        line.geometry = new THREE.BufferGeometry();
        line.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        if (line.material.isLineDashedMaterial) {
            line.computeLineDistances();
        }
        line.visible = true;
    }

    setOrbitVisibility(key, visible) {
        if (this.orbitLines && this.orbitLines[key]) {
            this.orbitLines[key].visible = visible;
        }
    }

    createGroundStations() {
        this.stationMarkers = [];
        this.stationGroup = new THREE.Group();

        const stations = [
            { name: "Beijing", lat: 40.05, lon: 116.32 },
            { name: "Kashi", lat: 39.47, lon: 75.99 },
            { name: "Sanya", lat: 18.25, lon: 109.51 },
            { name: "Svalbard", lat: 78.22, lon: 15.40 },
            { name: "Malindi", lat: -2.99, lon: 40.19 }
        ];

        stations.forEach(st => {
            const phi = THREE.MathUtils.degToRad(90 - st.lat);
            const theta = THREE.MathUtils.degToRad(st.lon + 180);

            const x = -(this.earthRadius * Math.sin(phi) * Math.cos(theta));
            const y = this.earthRadius * Math.cos(phi);
            const z = this.earthRadius * Math.sin(phi) * Math.sin(theta);

            // Ground dish pin
            const markerGeo = new THREE.CylinderGeometry(0.12, 0.02, 0.4, 8);
            const markerMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
            const marker = new THREE.Mesh(markerGeo, markerMat);
            marker.position.set(x, y, z);
            marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, y, z).normalize());
            this.stationGroup.add(marker);

            // Visibility cone (semi-transparent)
            const coneGeo = new THREE.ConeGeometry(3.5, 7.0, 16, 1, true);
            const coneMat = new THREE.MeshBasicMaterial({
                color: 0x00f0ff,
                transparent: true,
                opacity: 0.12,
                side: THREE.DoubleSide
            });
            const cone = new THREE.Mesh(coneGeo, coneMat);
            cone.position.copy(marker.position);
            cone.quaternion.copy(marker.quaternion);
            this.stationGroup.add(cone);

            this.stationMarkers.push({ marker, cone, name: st.name, position: new THREE.Vector3(x, y, z) });
        });

        this.scene.add(this.stationGroup);
    }

    createTrackingBeam() {
        const mat = new THREE.LineBasicMaterial({
            color: 0x00f0ff,
            transparent: true,
            opacity: 0.9,
            linewidth: 2,
            blending: THREE.AdditiveBlending
        });
        const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
        this.trackingBeam = new THREE.Line(geo, mat);
        this.trackingBeam.visible = false;
        this.scene.add(this.trackingBeam);
    }

    setTrackingBeam(active, stationName = null) {
        if (!this.trackingBeam) return;
        if (!active || !stationName || !this.satGroup) {
            this.trackingBeam.visible = false;
            this.activeStation = null;
            return;
        }

        const st = this.stationMarkers.find(s => s.name === stationName);
        if (!st) {
            this.trackingBeam.visible = false;
            return;
        }

        this.activeStation = st;
        const positions = new Float32Array([
            st.position.x, st.position.y, st.position.z,
            this.satGroup.position.x, this.satGroup.position.y, this.satGroup.position.z
        ]);
        this.trackingBeam.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.trackingBeam.visible = true;
    }

    initApsidesMarkers() {
        // 1. Perigee marker (Neon Green with glow ring)
        const periGeo = new THREE.SphereGeometry(0.2, 16, 16);
        const periMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
        this.periMarker = new THREE.Mesh(periGeo, periMat);
        this.periMarker.visible = false;
        this.scene.add(this.periMarker);

        // 2. Apogee marker (Neon Amber / Orange)
        const apogGeo = new THREE.SphereGeometry(0.2, 16, 16);
        const apogMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
        this.apogMarker = new THREE.Mesh(apogGeo, apogMat);
        this.apogMarker.visible = false;
        this.scene.add(this.apogMarker);
    }

    updateApsides(perigeeData, apogeeData) {
        const pEci = perigeeData ? (perigeeData.pos_eci || perigeeData.r_eci) : null;
        if (pEci) {
            const px = pEci[0] * this.scaleRatio;
            const py = pEci[2] * this.scaleRatio;
            const pz = -pEci[1] * this.scaleRatio;
            this.periMarker.position.set(px, py, pz);
            this.periMarker.visible = true;
        } else {
            this.periMarker.visible = false;
        }

        const aEci = apogeeData ? (apogeeData.pos_eci || apogeeData.r_eci) : null;
        if (aEci) {
            const ax = aEci[0] * this.scaleRatio;
            const ay = aEci[2] * this.scaleRatio;
            const az = -aEci[1] * this.scaleRatio;
            this.apogMarker.position.set(ax, ay, az);
            this.apogMarker.visible = true;
        } else {
            this.apogMarker.visible = false;
        }
    }

    getScreenCoordinates(threeVec) {
        const v = threeVec.clone();
        v.project(this.camera);

        const halfWidth = this.container.clientWidth / 2;
        const halfHeight = this.container.clientHeight / 2;

        return {
            x: (v.x * halfWidth) + halfWidth,
            y: -(v.y * halfHeight) + halfHeight,
            visible: v.z < 1.0 && v.z > -1.0
        };
    }

    setCameraMode(mode) {
        this.cameraMode = mode;
        if (mode === 'FREE') {
            this.controls.target.set(0, 0, 0);
            this.controls.enableRotate = true;
        } else if (mode === 'FOLLOW') {
            if (this.satGroup) {
                this.controls.target.copy(this.satGroup.position);
            }
        } else if (mode === 'STATION') {
            const st = this.activeStation || this.stationMarkers[0];
            if (st) {
                // Position camera near the ground station, looking upwards at the satellite
                const offset = st.position.clone().normalize().multiplyScalar(this.earthRadius + 1.2);
                this.camera.position.copy(offset);
                if (this.satGroup) {
                    this.controls.target.copy(this.satGroup.position);
                }
            }
        }
    }

    setSatelliteState(r_eci, quaternion = null) {
        if (!r_eci) return;

        // Position
        const x = r_eci[0] * this.scaleRatio;
        const y = r_eci[2] * this.scaleRatio;
        const z = -r_eci[1] * this.scaleRatio;
        this.satGroup.position.set(x, y, z);

        // Attitude quaternion [q0, q1, q2, q3]
        if (quaternion) {
            // Three.js quaternion is (x, y, z, w)
            this.satGroup.quaternion.set(quaternion[1], quaternion[3], -quaternion[2], quaternion[0]);
        }
    }

    setThrusterFiring(isFiring) {
        if (this.thrusterFlame) {
            this.thrusterFlame.material.opacity = isFiring ? 0.9 : 0.0;
        }
    }

    onWindowResize() {
        this.width = this.container.clientWidth;
        this.height = this.container.clientHeight;
        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.width, this.height);
    }

    animate() {
        requestAnimationFrame(this.animate);
        this.controls.update();

        // Slow Earth rotation
        if (this.earthMesh) {
            this.earthMesh.rotation.y += 0.0003;
        }

        // Camera follow modes
        if (this.cameraMode === 'FOLLOW' && this.satGroup) {
            this.controls.target.lerp(this.satGroup.position, 0.1);
        } else if (this.cameraMode === 'STATION' && this.satGroup) {
            this.controls.target.lerp(this.satGroup.position, 0.1);
        }

        // Update tracking laser beam dynamically if active
        if (this.trackingBeam && this.trackingBeam.visible && this.activeStation && this.satGroup) {
            const st = this.activeStation;
            const positions = new Float32Array([
                st.position.x, st.position.y, st.position.z,
                this.satGroup.position.x, this.satGroup.position.y, this.satGroup.position.z
            ]);
            this.trackingBeam.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        }

        // Thruster flicker if active
        if (this.thrusterFlame && this.thrusterFlame.material.opacity > 0) {
            this.thrusterFlame.scale.set(
                0.9 + Math.random() * 0.3,
                0.8 + Math.random() * 0.4,
                0.9 + Math.random() * 0.3
            );
        }

        this.renderer.render(this.scene, this.camera);
    }
}
