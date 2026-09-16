/**
 * High-Fidelity Aerospace 3D Astrodynamics Scene Engine
 * Renders Earth with photorealistic NASA textures, realistic 3D satellite models,
 * ground tracking stations (without disruptive cones), and multi-model trajectories.
 */

class SpaceScene {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.width = this.container.clientWidth;
        this.height = this.container.clientHeight;

        this.earthRadius = 10.0; // Scaled Earth radius (6378 km -> 10.0 units)
        this.scaleRatio = this.earthRadius / 6378137.0; // 1 meter = scaleRatio units

        this.currentSatId = 'cartosat2';
        this.cameraMode = 'FREE'; // 'FREE', 'FOLLOW', 'CLOSEUP', 'STATION'
        this.activeStation = null;

        this.initThree();
        this.createStarfield();
        this.createEarth();
        this.createAtmosphere();
        this.createSatelliteModel(this.currentSatId);
        this.initOrbitLines();
        this.createGroundStations();
        this.createTrackingBeam();
        this.initApsidesMarkers();

        this.syntheticMarkersGroup = new THREE.Group();
        this.scene.add(this.syntheticMarkersGroup);

        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);

        window.addEventListener('resize', () => this.onWindowResize());
    }

    initThree() {
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x080c14, 0.0015);

        this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 0.1, 2000);
        this.camera.position.set(20, 12, 24);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.15;
        this.container.appendChild(this.renderer.domElement);

        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.06;
        this.controls.minDistance = 10.4;
        this.controls.maxDistance = 250.0;

        // Space Lighting
        this.ambientLight = new THREE.AmbientLight(0x283244, 1.4);
        this.scene.add(this.ambientLight);

        // Sun Directional Light (illuminates Earth & Satellite)
        this.sunLight = new THREE.DirectionalLight(0xffffff, 2.8);
        this.sunLight.position.set(60, 25, 45);
        this.scene.add(this.sunLight);

        // Subtle fill light from deep space
        this.fillLight = new THREE.DirectionalLight(0x4a6fa5, 0.5);
        this.fillLight.position.set(-50, -20, -30);
        this.scene.add(this.fillLight);
    }

    createStarfield() {
        const starCount = 3500;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);

        for (let i = 0; i < starCount * 3; i += 3) {
            const r = 350 + Math.random() * 300;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);

            positions[i] = r * Math.sin(phi) * Math.cos(theta);
            positions[i + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i + 2] = r * Math.cos(phi);

            const tint = 0.75 + Math.random() * 0.25;
            colors[i] = tint * 0.85;
            colors[i + 1] = tint * 0.92;
            colors[i + 2] = tint;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 1.1,
            vertexColors: true,
            transparent: true,
            opacity: 0.85
        });

        this.starfield = new THREE.Points(geometry, material);
        this.scene.add(this.starfield);
    }

    createEarth() {
        const textureLoader = new THREE.TextureLoader();

        // 1. Photorealistic NASA Blue Marble Daylight Surface Texture
        const earthMap = textureLoader.load('textures/earth_blue_marble.jpg', (tex) => {
            tex.anisotropy = 8;
        });

        // 2. Water Specular Reflection Texture
        const specularMap = textureLoader.load('textures/earth_specular.jpg');

        const earthGeometry = new THREE.SphereGeometry(this.earthRadius, 64, 64);
        const earthMaterial = new THREE.MeshPhongMaterial({
            map: earthMap,
            specularMap: specularMap,
            specular: new THREE.Color(0x334466),
            shininess: 24,
            flatShading: false
        });

        this.earthMesh = new THREE.Mesh(earthGeometry, earthMaterial);
        // Earth axial tilt (23.44 degrees)
        this.earthMesh.rotation.z = THREE.MathUtils.degToRad(-23.44);
        this.scene.add(this.earthMesh);

        // 3. Realistic Dynamic Cloud Layer
        const cloudMap = textureLoader.load('textures/earth_clouds.png');
        const cloudGeo = new THREE.SphereGeometry(this.earthRadius * 1.009, 64, 64);
        const cloudMat = new THREE.MeshLambertMaterial({
            map: cloudMap,
            transparent: true,
            opacity: 0.52,
            blending: THREE.NormalBlending,
            depthWrite: false
        });
        this.cloudsMesh = new THREE.Mesh(cloudGeo, cloudMat);
        this.cloudsMesh.rotation.z = THREE.MathUtils.degToRad(-23.44);
        this.scene.add(this.cloudsMesh);
    }

    createAtmosphere() {
        // Subtle, realistic atmospheric rim glow
        const atmoGeometry = new THREE.SphereGeometry(this.earthRadius * 1.018, 48, 48);
        const atmoMaterial = new THREE.MeshLambertMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.15,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending
        });
        this.atmosphere = new THREE.Mesh(atmoGeometry, atmoMaterial);
        this.scene.add(this.atmosphere);
    }

    // =========================================================================
    // Realistic 3D Satellite Models Builder
    // =========================================================================

    createSatelliteModel(satId = 'cartosat2') {
        if (this.satGroup) {
            this.scene.remove(this.satGroup);
        }

        this.currentSatId = satId;
        this.satGroup = new THREE.Group();

        switch (satId.toLowerCase()) {
            case 'tiangong':
                this.buildTiangongModel(this.satGroup);
                break;
            case 'iss':
                this.buildISSModel(this.satGroup);
                break;
            case 'beidou':
                this.buildBeidouModel(this.satGroup);
                break;
            case 'starlink':
                this.buildStarlinkModel(this.satGroup);
                break;
            case 'cartosat2':
            default:
                this.buildCartosatModel(this.satGroup);
                break;
        }

        // Add shared thruster flare nozzle
        this.attachThrusterFlame(this.satGroup);

        this.satGroup.scale.set(0.65, 0.65, 0.65);
        this.scene.add(this.satGroup);
    }

    switchSatelliteModel(satId) {
        this.createSatelliteModel(satId);
        if (this.cameraMode === 'CLOSEUP') {
            this.setCameraMode('CLOSEUP');
        }
    }

    // Model 1: CartoSat-2 (High-Resolution Earth Observation Satellite)
    buildCartosatModel(group) {
        // Main Bus (Gold Multi-Layer Insulation MLI Foil)
        const busGeo = new THREE.BoxGeometry(0.55, 0.55, 0.75);
        const busMat = new THREE.MeshStandardMaterial({
            color: 0xd4af37, // Gold Kapton foil
            metalness: 0.88,
            roughness: 0.28
        });
        const bus = new THREE.Mesh(busGeo, busMat);
        group.add(bus);

        // Nadir Optical Earth Observation Telescope (Facing +Z)
        const tubeGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.45, 24);
        const tubeMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.2 });
        const tube = new THREE.Mesh(tubeGeo, tubeMat);
        tube.position.set(0, 0, 0.48);
        tube.rotation.x = Math.PI / 2;
        group.add(tube);

        // Optical Lens Mirror with blue reflection
        const lensGeo = new THREE.CircleGeometry(0.16, 24);
        const lensMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, metalness: 0.95, roughness: 0.05 });
        const lens = new THREE.Mesh(lensGeo, lensMat);
        lens.position.set(0, 0, 0.71);
        group.add(lens);

        // Solar Array Wings (Deployable dual-wing articulated panels)
        const wingMat = new THREE.MeshStandardMaterial({
            color: 0x0c1b33, // Deep space photovoltaic blue
            metalness: 0.95,
            roughness: 0.12
        });
        const frameMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8, roughness: 0.4 });

        [-1, 1].forEach(side => {
            const wingGroup = new THREE.Group();
            // Solar Panel
            const panel = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.03, 0.55), wingMat);
            panel.position.set(side * 0.95, 0, 0);
            wingGroup.add(panel);

            // Gimbal boom & SADM drive
            const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 12), frameMat);
            boom.rotation.z = Math.PI / 2;
            boom.position.set(side * 0.2, 0, 0);
            wingGroup.add(boom);

            group.add(wingGroup);
        });

        // S-Band Dish Antenna (White Parabolic Reflector)
        const dishGeo = new THREE.SphereGeometry(0.24, 16, 12, 0, Math.PI);
        const dishMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.4, roughness: 0.3 });
        const dish = new THREE.Mesh(dishGeo, dishMat);
        dish.position.set(0, 0.38, 0);
        dish.rotation.x = -Math.PI / 2;
        group.add(dish);

        // Star Tracker Dual Baffles
        const stGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.12, 12);
        const stMat = new THREE.MeshStandardMaterial({ color: 0x1e293b });
        const st1 = new THREE.Mesh(stGeo, stMat);
        st1.position.set(0.22, 0.28, 0.15);
        st1.rotation.z = Math.PI / 4;
        group.add(st1);
    }

    // Model 2: China Space Station Tiangong (天宫空间站 - T-Configuration)
    buildTiangongModel(group) {
        const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.35, roughness: 0.45 });
        const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.3 });
        const flexibleSolarMat = new THREE.MeshStandardMaterial({
            color: 0xc2410c, // Flexible GaAs Solar Array (orange/copper)
            metalness: 0.9,
            roughness: 0.2
        });

        // 1. Tianhe Core Module (天和核心舱)
        const tianheBody = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 1.8, 20), whiteMat);
        tianheBody.rotation.x = Math.PI / 2;
        group.add(tianheBody);

        // Forward Docking Hub (5-port sphere)
        const hub = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 16), whiteMat);
        hub.position.set(0, 0, 1.0);
        group.add(hub);

        // 2. Wentian & Mengtian Lab Modules (问天与梦天实验舱 - Lateral ports)
        [-1, 1].forEach((side, idx) => {
            const lab = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 1.4, 16), whiteMat);
            lab.rotation.z = Math.PI / 2;
            lab.position.set(side * 0.95, 0, 1.0);
            group.add(lab);

            // Massive Flexible Solar Wings on Wentian/Mengtian ends
            const wing = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.02, 0.7), flexibleSolarMat);
            wing.position.set(side * 2.2, 0, 1.0);
            group.add(wing);

            // Truss mount
            const truss = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), darkMetalMat);
            truss.rotation.z = Math.PI / 2;
            truss.position.set(side * 1.5, 0, 1.0);
            group.add(truss);
        });

        // 3. Shenzhou Manned Spaceship (神舟飞船 docked at forward port)
        const shenzhouGroup = new THREE.Group();
        const reentryCapsule = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.3, 16), darkMetalMat);
        reentryCapsule.rotation.x = -Math.PI / 2;
        reentryCapsule.position.set(0, 0, 1.45);
        shenzhouGroup.add(reentryCapsule);

        const szWings = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.02, 0.25), flexibleSolarMat);
        szWings.position.set(0, 0, 1.6);
        shenzhouGroup.add(szWings);
        group.add(shenzhouGroup);
    }

    // Model 3: BeiDou-3 Navigation Satellite (北斗三号导航卫星)
    buildBeidouModel(group) {
        const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.85, roughness: 0.3 });
        const silverMat = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.9, roughness: 0.25 });
        const solarMat = new THREE.MeshStandardMaterial({ color: 0x091a36, metalness: 0.95, roughness: 0.1 });

        // Satellite Bus (CAST4000 platform cube)
        const bus = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.65, 0.85), goldMat);
        group.add(bus);

        // Nadir Phased-Array Navigation Antenna Array (Facing +Z)
        const phasedArray = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.08, 32), silverMat);
        phasedArray.position.set(0, 0, 0.46);
        phasedArray.rotation.x = Math.PI / 2;
        group.add(phasedArray);

        // Inter-Satellite Link (ISL) Ka-band Steerable Mini-Dishes
        [-1, 1].forEach(side => {
            const islDish = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10, 0, Math.PI), silverMat);
            islDish.position.set(side * 0.35, 0.38, 0.2);
            islDish.rotation.set(-Math.PI / 3, side * 0.3, 0);
            group.add(islDish);
        });

        // Extended Dual Solar Array Wings
        [-1, 1].forEach(side => {
            const wing = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.03, 0.6), solarMat);
            wing.position.set(side * 1.35, 0, 0);
            group.add(wing);

            // SADM hinge
            const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 12), silverMat);
            hinge.rotation.z = Math.PI / 2;
            hinge.position.set(side * 0.45, 0, 0);
            group.add(hinge);
        });
    }

    // Model 4: International Space Station (ISS 国际空间站)
    buildISSModel(group) {
        const metalMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.35 });
        const solarMat = new THREE.MeshStandardMaterial({ color: 0x9a3412, metalness: 0.9, roughness: 0.2 });

        // Central Integrated Truss Structure (ITS)
        const truss = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.08, 0.08), metalMat);
        group.add(truss);

        // Pressurized Habitation Modules (Zarya / Unity / Destiny cluster along Z)
        const moduleMain = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.4, 16), metalMat);
        moduleMain.rotation.x = Math.PI / 2;
        group.add(moduleMain);

        // Giant Solar Array Wings (4 pairs = 8 panels)
        [-1.6, -1.0, 1.0, 1.6].forEach(x => {
            [-1, 1].forEach(zSide => {
                const wing = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.02, 1.2), solarMat);
                wing.position.set(x, 0, zSide * 0.75);
                group.add(wing);
            });
        });

        // Radiator Panels (White thermal radiators)
        const rad = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.6, 0.02), new THREE.MeshStandardMaterial({ color: 0xffffff }));
        rad.position.set(0.3, 0.3, 0);
        group.add(rad);
    }

    // Model 5: Starlink Satellite (星链扁平折叠架构)
    buildStarlinkModel(group) {
        const darkAlloy = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85, roughness: 0.3 });
        const solarMat = new THREE.MeshStandardMaterial({ color: 0x0a192f, metalness: 0.95, roughness: 0.1 });

        // Flat-pack single chassis
        const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.65), darkAlloy);
        group.add(chassis);

        // Single expansive folding solar array extending vertically
        const wing = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.02, 1.8), solarMat);
        wing.position.set(0, 0, 1.25);
        group.add(wing);

        // Krypton Hall-effect electric ion thruster nozzle on rear edge
        const thruster = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.04, 0.1, 16), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
        thruster.position.set(0, 0, -0.38);
        thruster.rotation.x = Math.PI / 2;
        group.add(thruster);
    }

    attachThrusterFlame(group) {
        // Maneuver Thruster Flame Flare
        const flameGeo = new THREE.ConeGeometry(0.12, 0.55, 12);
        const flameMat = new THREE.MeshBasicMaterial({
            color: 0x00e5ff,
            transparent: true,
            opacity: 0.0,
            blending: THREE.AdditiveBlending
        });
        this.thrusterFlame = new THREE.Mesh(flameGeo, flameMat);
        this.thrusterFlame.position.set(0, 0, -0.65);
        this.thrusterFlame.rotation.x = -Math.PI / 2;
        group.add(this.thrusterFlame);
    }

    // =========================================================================
    // Trajectory Visualization
    // =========================================================================

    initOrbitLines() {
        this.orbitLines = {};

        // SGP4 Baseline: Coral/Orange (Analytical reference)
        this.orbitLines.sgp4 = this.createOrbitLineMesh(0xf97316, 1.8, false);
        // Cowell RKF78 Truth: High-Fidelity Green (Numerical Truth)
        this.orbitLines.truth = this.createOrbitLineMesh(0x10b981, 2.2, false);
        // Hybrid ML Corrected: Purple/Magenta (AI-corrected orbit)
        this.orbitLines.hybrid = this.createOrbitLineMesh(0xa855f7, 2.4, false);
        // Drifted Orbit: Dashed Red
        this.orbitLines.drifted = this.createOrbitLineMesh(0xef4444, 1.5, true);
        // Station-Keeping Maneuver Path: Gold
        this.orbitLines.maneuver = this.createOrbitLineMesh(0xf59e0b, 3.0, false);
        // Calibrated Orbit: Electric Cyan
        this.orbitLines.calibrated = this.createOrbitLineMesh(0x06b6d4, 2.6, false);
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
                opacity: 0.88
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

    updateSyntheticObservationMarkers(obsList) {
        if (!this.syntheticMarkersGroup) return;

        while (this.syntheticMarkersGroup.children.length > 0) {
            const child = this.syntheticMarkersGroup.children[0];
            if (child.geometry) child.geometry.dispose();
            this.syntheticMarkersGroup.remove(child);
        }

        if (!obsList || obsList.length === 0) return;

        const octaGeo = new THREE.OctahedronGeometry(0.16, 0);
        const octaMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });

        obsList.forEach(obs => {
            const pt = obs.pos_eci;
            if (pt) {
                const mesh = new THREE.Mesh(octaGeo, octaMat);
                mesh.position.set(pt[0] * this.scaleRatio, pt[2] * this.scaleRatio, -pt[1] * this.scaleRatio);
                this.syntheticMarkersGroup.add(mesh);
            }
        });
    }

    // =========================================================================
    // Ground Tracking Stations (Clean Radar Pedestals, NO ugly giant cones!)
    // =========================================================================

    createGroundStations() {
        this.stationMarkers = [];
        this.stationGroup = new THREE.Group();

        const stations = [
            { name: "Beijing Station", lat: 40.05, lon: 116.32 },
            { name: "Kashi Station", lat: 39.47, lon: 75.99 },
            { name: "Sanya Station", lat: 18.25, lon: 109.51 },
            { name: "Svalbard Station", lat: 78.22, lon: 15.40 },
            { name: "Malindi Station", lat: -2.99, lon: 40.19 }
        ];

        stations.forEach(st => {
            const phi = THREE.MathUtils.degToRad(90 - st.lat);
            const theta = THREE.MathUtils.degToRad(st.lon + 180);

            const x = -(this.earthRadius * Math.sin(phi) * Math.cos(theta));
            const y = this.earthRadius * Math.cos(phi);
            const z = this.earthRadius * Math.sin(phi) * Math.sin(theta);
            const normal = new THREE.Vector3(x, y, z).normalize();

            // 1. Sleek Radar Pedestal and Parabolic Dish
            const dishGroup = new THREE.Group();
            const pedestal = new THREE.Mesh(
                new THREE.CylinderGeometry(0.06, 0.09, 0.18, 12),
                new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.6, roughness: 0.3 })
            );
            pedestal.position.y = 0.09;
            dishGroup.add(pedestal);

            const dish = new THREE.Mesh(
                new THREE.SphereGeometry(0.14, 16, 10, 0, Math.PI),
                new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.7, roughness: 0.25 })
            );
            dish.position.y = 0.22;
            dish.rotation.x = -Math.PI / 4;
            dishGroup.add(dish);

            dishGroup.position.set(x, y, z);
            dishGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
            this.stationGroup.add(dishGroup);

            // 2. Subtle Conformal Horizon Footprint Ring on Earth's surface (thin ring, NO huge cone!)
            const ringGeo = new THREE.RingGeometry(0.7, 0.75, 32);
            const ringMat = new THREE.MeshBasicMaterial({
                color: 0x38bdf8,
                transparent: true,
                opacity: 0.3,
                side: THREE.DoubleSide
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.set(x * 1.002, y * 1.002, z * 1.002);
            ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
            this.stationGroup.add(ring);

            this.stationMarkers.push({
                dishGroup,
                ring,
                name: st.name,
                position: new THREE.Vector3(x, y, z)
            });
        });

        this.scene.add(this.stationGroup);
    }

    createTrackingBeam() {
        const mat = new THREE.LineBasicMaterial({
            color: 0x10b981,
            transparent: true,
            opacity: 0.95,
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

        const st = this.stationMarkers.find(s => s.name.toLowerCase().includes(stationName.toLowerCase()));
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
        const periGeo = new THREE.SphereGeometry(0.18, 16, 16);
        const periMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
        this.periMarker = new THREE.Mesh(periGeo, periMat);
        this.periMarker.visible = false;
        this.scene.add(this.periMarker);

        const apogGeo = new THREE.SphereGeometry(0.18, 16, 16);
        const apogMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
        this.apogMarker = new THREE.Mesh(apogGeo, apogMat);
        this.apogMarker.visible = false;
        this.scene.add(this.apogMarker);
    }

    updateApsides(perigeeData, apogeeData) {
        const pEci = perigeeData ? (perigeeData.pos_eci || perigeeData.r_eci) : null;
        if (pEci) {
            this.periMarker.position.set(pEci[0] * this.scaleRatio, pEci[2] * this.scaleRatio, -pEci[1] * this.scaleRatio);
            this.periMarker.visible = true;
        } else {
            this.periMarker.visible = false;
        }

        const aEci = apogeeData ? (apogeeData.pos_eci || apogeeData.r_eci) : null;
        if (aEci) {
            this.apogMarker.position.set(aEci[0] * this.scaleRatio, aEci[2] * this.scaleRatio, -aEci[1] * this.scaleRatio);
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
            this.controls.minDistance = 10.4;
            this.controls.maxDistance = 250.0;
            this.controls.target.set(0, 0, 0);
            this.controls.enableRotate = true;
        } else if (mode === 'FOLLOW') {
            this.controls.minDistance = 1.5;
            this.controls.maxDistance = 80.0;
            if (this.satGroup) {
                this.controls.target.copy(this.satGroup.position);
            }
        } else if (mode === 'CLOSEUP') {
            // High-precision inspection of the realistic 3D satellite model
            this.controls.minDistance = 0.5;
            this.controls.maxDistance = 15.0;
            if (this.satGroup) {
                this.controls.target.copy(this.satGroup.position);
                const satPos = this.satGroup.position.clone();
                const offset = satPos.clone().normalize().multiplyScalar(2.2);
                this.camera.position.copy(satPos).add(new THREE.Vector3(1.4, 0.8, 1.6));
            }
        } else if (mode === 'STATION') {
            this.controls.minDistance = 0.5;
            const st = this.activeStation || this.stationMarkers[0];
            if (st) {
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

        const x = r_eci[0] * this.scaleRatio;
        const y = r_eci[2] * this.scaleRatio;
        const z = -r_eci[1] * this.scaleRatio;
        this.satGroup.position.set(x, y, z);

        if (quaternion) {
            this.satGroup.quaternion.set(quaternion[1], quaternion[3], -quaternion[2], quaternion[0]);
        }
    }

    setThrusterFiring(isFiring) {
        if (this.thrusterFlame) {
            this.thrusterFlame.material.opacity = isFiring ? 0.95 : 0.0;
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

        // Slow Earth rotation & realistic atmospheric cloud drift
        if (this.earthMesh) {
            this.earthMesh.rotation.y += 0.00025;
        }
        if (this.cloudsMesh) {
            this.cloudsMesh.rotation.y += 0.00032;
        }

        // Camera follow & closeup mode tracking
        if ((this.cameraMode === 'FOLLOW' || this.cameraMode === 'CLOSEUP') && this.satGroup) {
            this.controls.target.lerp(this.satGroup.position, 0.15);
        } else if (this.cameraMode === 'STATION' && this.satGroup) {
            this.controls.target.lerp(this.satGroup.position, 0.1);
        }

        // Update tracking laser beam
        if (this.trackingBeam && this.trackingBeam.visible && this.activeStation && this.satGroup) {
            const st = this.activeStation;
            const positions = new Float32Array([
                st.position.x, st.position.y, st.position.z,
                this.satGroup.position.x, this.satGroup.position.y, this.satGroup.position.z
            ]);
            this.trackingBeam.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        }

        // Thruster flicker
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
