/**
 * High-Precision Aerospace 3D Astrodynamics Scene Engine
 * - Real Deep Space Milky Way Galaxy Skybox (Solar System Scope / ESO)
 * - 4K Photorealistic Earth with true Day/Night lighting and dynamic clouds
 * - Astronomical Ephemeris-driven Real Sun (aligned with Beijing Time)
 * - Real Moon (Meeus ephemeris) and Major Planets (Venus, Mars, Jupiter)
 * - Museum-quality high-fidelity Space Station & Satellite 3D Models
 */

class SpaceScene {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.width = this.container.clientWidth;
        this.height = this.container.clientHeight;

        this.earthRadius = 10.0; // Scaled Earth radius (6378.137 km -> 10.0 units)
        this.scaleRatio = this.earthRadius / 6378137.0;

        this.currentSatId = 'tiangong';
        this.cameraMode = 'FREE'; // 'FREE', 'FOLLOW', 'CLOSEUP', 'STATION', 'CELESTIAL'
        this.activeStation = null;
        this.celestialData = null;

        this.initThree();
        this.createDeepSpaceSkybox();
        this.createEarth();
        this.createAtmosphere();
        this.createSun();
        this.createMoon();
        this.createPlanets();
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

        this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 0.1, 5000);
        this.camera.position.set(24, 14, 28);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.25;
        this.container.appendChild(this.renderer.domElement);

        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 10.4;
        this.controls.maxDistance = 1200.0;

        // Ambient deep space starlight
        this.ambientLight = new THREE.AmbientLight(0x1a2436, 1.2);
        this.scene.add(this.ambientLight);

        // Real Sun Directional Light (will be positioned dynamically by celestial ephemeris)
        this.sunLight = new THREE.DirectionalLight(0xfff8ee, 3.2);
        this.sunLight.position.set(-60, 15, -10);
        this.scene.add(this.sunLight);

        // Deep cosmos secondary fill light
        this.cosmicFill = new THREE.DirectionalLight(0x2d3a54, 0.6);
        this.cosmicFill.position.set(60, -20, 30);
        this.scene.add(this.cosmicFill);
    }

    // =========================================================================
    // 1. Deep Space Milky Way Galaxy Skybox
    // =========================================================================
    createDeepSpaceSkybox() {
        const textureLoader = new THREE.TextureLoader();

        // 1. Panoramic Milky Way Celestial Sphere (2000 units radius)
        const skyGeo = new THREE.SphereGeometry(1800, 64, 40);
        const skyTex = textureLoader.load('textures/milky_way_panorama.jpg', (tex) => {
            tex.anisotropy = 4;
        });

        const skyMat = new THREE.MeshBasicMaterial({
            map: skyTex,
            side: THREE.BackSide,
            depthWrite: false,
            transparent: true,
            opacity: 0.95
        });

        this.deepSpaceSky = new THREE.Mesh(skyGeo, skyMat);
        this.scene.add(this.deepSpaceSky);

        // 2. Auxiliary fine star field points
        const starCount = 2500;
        const starGeo = new THREE.BufferGeometry();
        const pos = new Float32Array(starCount * 3);
        const col = new Float32Array(starCount * 3);

        for (let i = 0; i < starCount * 3; i += 3) {
            const r = 1600 + Math.random() * 150;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);

            pos[i] = r * Math.sin(phi) * Math.cos(theta);
            pos[i + 1] = r * Math.sin(phi) * Math.sin(theta);
            pos[i + 2] = r * Math.cos(phi);

            const brightness = 0.6 + Math.random() * 0.4;
            col[i] = brightness * 0.9;
            col[i + 1] = brightness * 0.95;
            col[i + 2] = brightness;
        }

        starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        starGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));

        const starMat = new THREE.PointsMaterial({
            size: 1.2,
            vertexColors: true,
            transparent: true,
            opacity: 0.75
        });

        this.starField = new THREE.Points(starGeo, starMat);
        this.scene.add(this.starField);
    }

    // =========================================================================
    // 2. High-Resolution Earth with Day/Night Lighting
    // =========================================================================
    createEarth() {
        const textureLoader = new THREE.TextureLoader();

        // 1. High-resolution daylight surface map
        const earthMap = textureLoader.load('textures/earth_daymap.jpg');
        const specularMap = textureLoader.load('textures/earth_specular.jpg');

        const earthGeo = new THREE.SphereGeometry(this.earthRadius, 64, 64);
        const earthMat = new THREE.MeshPhongMaterial({
            map: earthMap,
            specularMap: specularMap,
            specular: new THREE.Color(0x445577),
            shininess: 28,
            roughness: 0.5
        });

        this.earthMesh = new THREE.Mesh(earthGeo, earthMat);
        // Earth axial tilt (-23.44 deg)
        this.earthMesh.rotation.z = THREE.MathUtils.degToRad(-23.44);
        this.scene.add(this.earthMesh);

        // 2. High-res dense dynamic cloud envelope
        const cloudsTex = textureLoader.load('textures/earth_clouds_dense.jpg');
        const cloudsGeo = new THREE.SphereGeometry(this.earthRadius * 1.01, 64, 64);
        const cloudsMat = new THREE.MeshLambertMaterial({
            map: cloudsTex,
            transparent: true,
            opacity: 0.45,
            blending: THREE.NormalBlending,
            depthWrite: false
        });
        this.cloudsMesh = new THREE.Mesh(cloudsGeo, cloudsMat);
        this.cloudsMesh.rotation.z = THREE.MathUtils.degToRad(-23.44);
        this.scene.add(this.cloudsMesh);
    }

    createAtmosphere() {
        const atmoGeo = new THREE.SphereGeometry(this.earthRadius * 1.022, 48, 48);
        const atmoMat = new THREE.MeshLambertMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.16,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending
        });
        this.atmosphere = new THREE.Mesh(atmoGeo, atmoMat);
        this.scene.add(this.atmosphere);
    }

    // =========================================================================
    // 3. Astronomical Real Sun (3D Celestial Body + Real Lighting)
    // =========================================================================
    createSun() {
        this.sunGroup = new THREE.Group();
        const textureLoader = new THREE.TextureLoader();

        // 1. 3D Sun Photosphere Sphere
        const sunGeo = new THREE.SphereGeometry(22.0, 32, 32);
        const sunTex = textureLoader.load('textures/sun_texture.jpg');
        const sunMat = new THREE.MeshBasicMaterial({
            map: sunTex,
            color: 0xffffff
        });
        const sunMesh = new THREE.Mesh(sunGeo, sunMat);
        this.sunGroup.add(sunMesh);

        // 2. Solar Corona Glow Halo
        const coronaGeo = new THREE.SphereGeometry(28.0, 24, 24);
        const coronaMat = new THREE.MeshBasicMaterial({
            color: 0xffa022,
            transparent: true,
            opacity: 0.28,
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide
        });
        const corona = new THREE.Mesh(coronaGeo, coronaMat);
        this.sunGroup.add(corona);

        // Position Sun at 750 units away (default direction along negative X)
        this.sunDistance = 750.0;
        this.sunGroup.position.set(-this.sunDistance, 30, 0);
        this.scene.add(this.sunGroup);
    }

    // =========================================================================
    // 4. Astronomical Real Moon (Meeus Ephemeris Position + Lunar Surface)
    // =========================================================================
    createMoon() {
        this.moonGroup = new THREE.Group();
        const textureLoader = new THREE.TextureLoader();

        const moonGeo = new THREE.SphereGeometry(2.7, 32, 32); // Scaled lunar radius
        const moonTex = textureLoader.load('textures/moon_texture.jpg');
        const moonMat = new THREE.MeshStandardMaterial({
            map: moonTex,
            roughness: 0.9,
            metalness: 0.1
        });
        this.moonMesh = new THREE.Mesh(moonGeo, moonMat);
        this.moonGroup.add(this.moonMesh);

        // Scaled display distance (~70 units from Earth)
        this.moonDisplayDist = 70.0;
        this.moonGroup.position.set(0, 20, -this.moonDisplayDist);
        this.scene.add(this.moonGroup);

        // Moon Orbit Ring Path
        const orbitCurve = new THREE.EllipseCurve(0, 0, this.moonDisplayDist, this.moonDisplayDist, 0, 2 * Math.PI, false, 0);
        const points = orbitCurve.getPoints(64);
        const orbitGeo = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(p.x, 0, p.y)));
        const orbitMat = new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.25 });
        this.moonOrbitLine = new THREE.Line(orbitGeo, orbitMat);
        this.moonOrbitLine.rotation.x = Math.PI / 2 + THREE.MathUtils.degToRad(5.14); // Moon inclination ~5.14 deg
        this.scene.add(this.moonOrbitLine);
    }

    // =========================================================================
    // 5. Astronomical Major Planets (Venus, Mars, Jupiter with JPL Sightlines)
    // =========================================================================
    createPlanets() {
        this.planetsGroup = new THREE.Group();
        const textureLoader = new THREE.TextureLoader();

        const planetDefs = [
            { id: 'venus', name: '♀ 金星 (Venus)', radius: 1.8, dist: 240, tex: 'textures/venus_texture.jpg' },
            { id: 'mars', name: '♂ 火星 (Mars)', radius: 1.4, dist: 320, tex: 'textures/mars_texture.jpg' },
            { id: 'jupiter', name: '♃ 木星 (Jupiter)', radius: 4.5, dist: 500, tex: 'textures/jupiter_texture.jpg' }
        ];

        this.planetMeshes = {};

        planetDefs.forEach(p => {
            const pGroup = new THREE.Group();
            const geo = new THREE.SphereGeometry(p.radius, 24, 24);
            const tex = textureLoader.load(p.tex);
            const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
            const mesh = new THREE.Mesh(geo, mat);
            pGroup.add(mesh);

            // Default placement
            pGroup.position.set(p.dist, 0, 0);
            this.planetsGroup.add(pGroup);
            this.planetMeshes[p.id] = { group: pGroup, dist: p.dist, def: p };
        });

        this.scene.add(this.planetsGroup);
    }

    // =========================================================================
    // Update Celestial Systems from Backend Real Ephemeris API
    // =========================================================================
    updateCelestialEphemeris(data) {
        if (!data || !data.sun) return;
        this.celestialData = data;

        // 1. Update Sun Direction & 3D Sun Body
        const sunDir = data.sun.direction_unit;
        if (sunDir) {
            // ECI to Three.js coordinates (X, Z, -Y)
            const sx = sunDir[0];
            const sy = sunDir[2];
            const sz = -sunDir[1];

            // Directional sunlight
            this.sunLight.position.set(sx * 100, sy * 100, sz * 100);

            // Position 3D Sun body along true celestial sightline
            if (this.sunGroup) {
                this.sunGroup.position.set(sx * this.sunDistance, sy * this.sunDistance, sz * this.sunDistance);
            }
        }

        // 2. Rotate Earth to Match Current Greenwich Mean Sidereal Time (GMST)
        if (data.gmst_deg !== undefined && this.earthMesh) {
            const gmstRad = THREE.MathUtils.degToRad(data.gmst_deg);
            this.earthMesh.rotation.y = gmstRad;
            if (this.cloudsMesh) {
                this.cloudsMesh.rotation.y = gmstRad + 0.05;
            }
        }

        // 3. Update Real Moon Position (Meeus Ephemeris)
        if (data.moon && data.moon.direction_unit && this.moonGroup) {
            const mDir = data.moon.direction_unit;
            const mx = mDir[0] * this.moonDisplayDist;
            const my = mDir[2] * this.moonDisplayDist;
            const mz = -mDir[1] * this.moonDisplayDist;
            this.moonGroup.position.set(mx, my, mz);
        }

        // 4. Update Planets (Venus, Mars, Jupiter) Real Sightlines
        if (data.planets && this.planetMeshes) {
            for (const [pId, pData] of Object.entries(data.planets)) {
                const target = this.planetMeshes[pId];
                if (target && pData.direction_unit) {
                    const u = pData.direction_unit;
                    const px = u[0] * target.dist;
                    const py = u[2] * target.dist;
                    const pz = -u[1] * target.dist;
                    target.group.position.set(px, py, pz);
                }
            }
        }
    }

    // =========================================================================
    // 6. Spacecraft & Space Station 3D Models
    // =========================================================================
    createSatelliteModel(satId = 'tiangong') {
        if (this.satGroup) {
            this.scene.remove(this.satGroup);
        }

        this.currentSatId = satId;
        this.satGroup = new THREE.Group();

        switch (satId.toLowerCase()) {
            case 'tiangong':
                this.buildHighDetailTiangongStation(this.satGroup);
                break;
            case 'iss':
                this.buildHighDetailISSStation(this.satGroup);
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

        this.attachThrusterFlame(this.satGroup);
        this.satGroup.scale.set(0.68, 0.68, 0.68);
        this.scene.add(this.satGroup);
    }

    switchSatelliteModel(satId) {
        this.createSatelliteModel(satId);
        if (this.cameraMode === 'CLOSEUP') {
            this.setCameraMode('CLOSEUP');
        }
    }

    // Model: High-Detail China Space Station Tiangong (中国天宫空间站 - T字构型全构型)
    buildHighDetailTiangongStation(group) {
        const whiteMat = new THREE.MeshStandardMaterial({
            color: 0xf8fafc,
            metalness: 0.35,
            roughness: 0.45
        });
        const darkMetalMat = new THREE.MeshStandardMaterial({
            color: 0x334155,
            metalness: 0.85,
            roughness: 0.25
        });
        const goldMliMat = new THREE.MeshStandardMaterial({
            color: 0xd4af37,
            metalness: 0.9,
            roughness: 0.25
        });
        // China Space Station flexible GaAs solar wings (copper-orange color)
        const gaAsSolarMat = new THREE.MeshStandardMaterial({
            color: 0xc2410c,
            metalness: 0.92,
            roughness: 0.18
        });

        // 1. Tianhe Core Module (天和核心舱)
        // Aft resource service section (diameter 2.8m -> scale 0.28)
        const resourceSection = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.8, 20), whiteMat);
        resourceSection.rotation.x = Math.PI / 2;
        resourceSection.position.set(0, 0, -0.6);
        group.add(resourceSection);

        // Control section (tapered adapter cone)
        const taperSection = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.4, 20), whiteMat);
        taperSection.rotation.x = Math.PI / 2;
        group.add(taperSection);

        // Forward living section (diameter 4.2m -> scale 0.35)
        const livingSection = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.32, 1.0, 20), whiteMat);
        livingSection.rotation.x = Math.PI / 2;
        livingSection.position.set(0, 0, 0.7);
        group.add(livingSection);

        // Spherical Forward Docking Hub (五向对接口节点舱)
        const nodeHub = new THREE.Mesh(new THREE.SphereGeometry(0.38, 20, 20), whiteMat);
        nodeHub.position.set(0, 0, 1.4);
        group.add(nodeHub);

        // Docking ports collars on node hub
        [
            [0, 0, 1.78, 0, 0, 0],         // Forward port
            [-0.38, 0, 1.4, 0, -Math.PI/2, 0], // Port port (Wentian)
            [0.38, 0, 1.4, 0, Math.PI/2, 0],  // Starboard port (Mengtian)
            [0, -0.38, 1.4, Math.PI/2, 0, 0]   // Nadir port (EVA airlock)
        ].forEach(pt => {
            const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 16), darkMetalMat);
            collar.position.set(pt[0], pt[1], pt[2]);
            collar.rotation.set(pt[3], pt[4], pt[5]);
            group.add(collar);
        });

        // 2. Wentian Lab Module (问天实验舱 - Port side)
        const wentianGroup = new THREE.Group();
        const wtBody = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 1.6, 18), whiteMat);
        wtBody.rotation.z = Math.PI / 2;
        wentianGroup.add(wtBody);

        // Wentian Airlock cabin
        const wtAirlock = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.5, 16), darkMetalMat);
        wtAirlock.position.set(-0.9, 0, 0);
        wtAirlock.rotation.z = Math.PI / 2;
        wentianGroup.add(wtAirlock);

        // Wentian Giant Flexible Solar Wings (双面展开式大展弦比帆板)
        const wtWing1 = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.02, 0.85), gaAsSolarMat);
        wtWing1.position.set(-2.5, 0, 0);
        wentianGroup.add(wtWing1);

        // Robotic arm (CSSRA) on Wentian exterior
        const armBase = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8), darkMetalMat);
        armBase.position.set(-0.4, 0.38, 0);
        wentianGroup.add(armBase);

        wentianGroup.position.set(-1.15, 0, 1.4);
        group.add(wentianGroup);

        // 3. Mengtian Lab Module (梦天实验舱 - Starboard side)
        const mengtianGroup = new THREE.Group();
        const mtBody = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 1.6, 18), whiteMat);
        mtBody.rotation.z = Math.PI / 2;
        mengtianGroup.add(mtBody);

        // Mengtian Giant Flexible Solar Wings
        const mtWing1 = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.02, 0.85), gaAsSolarMat);
        mtWing1.position.set(2.5, 0, 0);
        mengtianGroup.add(mtWing1);

        mengtianGroup.position.set(1.15, 0, 1.4);
        group.add(mengtianGroup);

        // 4. Shenzhou Manned Spaceship (神舟载人飞船 - Docked at forward port)
        const szGroup = new THREE.Group();
        // Orbital module (sphere)
        const szOrbital = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 14), whiteMat);
        szOrbital.position.set(0, 0, 1.95);
        szGroup.add(szOrbital);

        // Reentry capsule (bell shape)
        const szReentry = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.28, 14), darkMetalMat);
        szReentry.position.set(0, 0, 2.22);
        szReentry.rotation.x = -Math.PI / 2;
        szGroup.add(szReentry);

        // Propulsion service module with solar wings
        const szProp = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.38, 16), whiteMat);
        szProp.position.set(0, 0, 2.55);
        szProp.rotation.x = Math.PI / 2;
        szGroup.add(szProp);

        const szWings = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.02, 0.28), gaAsSolarMat);
        szWings.position.set(0, 0, 2.55);
        szGroup.add(szWings);
        group.add(szGroup);

        // 5. Tianzhou Cargo Craft (天舟货运飞船 - Docked at aft port)
        const tzGroup = new THREE.Group();
        const tzCargo = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.85, 18), whiteMat);
        tzCargo.position.set(0, 0, -1.35);
        tzCargo.rotation.x = Math.PI / 2;
        tzGroup.add(tzCargo);

        const tzWings = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.02, 0.35), gaAsSolarMat);
        tzWings.position.set(0, 0, -1.5);
        tzGroup.add(tzWings);
        group.add(tzGroup);
    }

    // Model: High-Detail International Space Station (ISS)
    buildHighDetailISSStation(group) {
        const metalMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.35 });
        const goldSolarMat = new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.9, roughness: 0.2 });
        const whiteTileMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.4, roughness: 0.4 });

        // Central Integrated Truss Structure (ITS)
        const truss = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.09, 0.09), metalMat);
        group.add(truss);

        // Pressurized Modules Cluster (Unity, Destiny, Harmony along Z axis)
        const usCluster = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.8, 16), whiteTileMat);
        usCluster.rotation.x = Math.PI / 2;
        group.add(usCluster);

        // Russian segment (Zarya & Zvezda)
        const rusSegment = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.2, 1.2, 16), metalMat);
        rusSegment.position.set(0, 0, -1.2);
        rusSegment.rotation.x = Math.PI / 2;
        group.add(rusSegment);

        // 8 Giant Solar Array Wings (4 pairs)
        [-1.8, -1.2, 1.2, 1.8].forEach(x => {
            [-1, 1].forEach(z => {
                const wing = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.02, 1.4), goldSolarMat);
                wing.position.set(x, 0, z * 0.85);
                group.add(wing);
            });
        });
    }

    // Model: BeiDou-3 MEO/IGSO Navigation Satellite
    buildBeidouModel(group) {
        const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.85, roughness: 0.3 });
        const silverMat = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.9, roughness: 0.25 });
        const solarMat = new THREE.MeshStandardMaterial({ color: 0x091a36, metalness: 0.95, roughness: 0.1 });

        const bus = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.65, 0.85), goldMat);
        group.add(bus);

        const phasedArray = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.08, 32), silverMat);
        phasedArray.position.set(0, 0, 0.46);
        phasedArray.rotation.x = Math.PI / 2;
        group.add(phasedArray);

        [-1, 1].forEach(side => {
            const islDish = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10, 0, Math.PI), silverMat);
            islDish.position.set(side * 0.35, 0.38, 0.2);
            islDish.rotation.set(-Math.PI / 3, side * 0.3, 0);
            group.add(islDish);

            const wing = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.03, 0.6), solarMat);
            wing.position.set(side * 1.35, 0, 0);
            group.add(wing);
        });
    }

    // Model: CartoSat-2 Remote Sensing Optical Satellite
    buildCartosatModel(group) {
        const busMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.88, roughness: 0.28 });
        const bus = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.75), busMat);
        group.add(bus);

        const tube = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.22, 0.45, 24),
            new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.2 })
        );
        tube.position.set(0, 0, 0.48);
        tube.rotation.x = Math.PI / 2;
        group.add(tube);

        const lens = new THREE.Mesh(
            new THREE.CircleGeometry(0.16, 24),
            new THREE.MeshStandardMaterial({ color: 0x1e3a8a, metalness: 0.95, roughness: 0.05 })
        );
        lens.position.set(0, 0, 0.71);
        group.add(lens);

        const wingMat = new THREE.MeshStandardMaterial({ color: 0x0c1b33, metalness: 0.95, roughness: 0.12 });
        [-1, 1].forEach(side => {
            const panel = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.03, 0.55), wingMat);
            panel.position.set(side * 0.95, 0, 0);
            group.add(panel);
        });
    }

    // Model: Starlink Communications Flat Pack
    buildStarlinkModel(group) {
        const chassis = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, 0.1, 0.65),
            new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85, roughness: 0.3 })
        );
        group.add(chassis);

        const wing = new THREE.Mesh(
            new THREE.BoxGeometry(1.1, 0.02, 1.8),
            new THREE.MeshStandardMaterial({ color: 0x0a192f, metalness: 0.95, roughness: 0.1 })
        );
        wing.position.set(0, 0, 1.25);
        group.add(wing);

        const thruster = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.04, 0.1, 16),
            new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
        );
        thruster.position.set(0, 0, -0.38);
        thruster.rotation.x = Math.PI / 2;
        group.add(thruster);
    }

    attachThrusterFlame(group) {
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
        this.orbitLines.sgp4 = this.createOrbitLineMesh(0xf97316, 1.8, false);
        this.orbitLines.truth = this.createOrbitLineMesh(0x10b981, 2.2, false);
        this.orbitLines.hybrid = this.createOrbitLineMesh(0xa855f7, 2.4, false);
        this.orbitLines.drifted = this.createOrbitLineMesh(0xef4444, 1.5, true);
        this.orbitLines.maneuver = this.createOrbitLineMesh(0xf59e0b, 3.0, false);
        this.orbitLines.calibrated = this.createOrbitLineMesh(0x06b6d4, 2.6, false);
    }

    createOrbitLineMesh(colorHex, linewidth, isDashed = false) {
        const material = isDashed
            ? new THREE.LineDashedMaterial({ color: colorHex, dashSize: 0.5, gapSize: 0.25, transparent: true, opacity: 0.8 })
            : new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: 0.88 });

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
    // Ground Stations
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

            const ringGeo = new THREE.RingGeometry(0.7, 0.75, 32);
            const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.set(x * 1.002, y * 1.002, z * 1.002);
            ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
            this.stationGroup.add(ring);

            this.stationMarkers.push({ dishGroup, ring, name: st.name, position: new THREE.Vector3(x, y, z) });
        });

        this.scene.add(this.stationGroup);
    }

    createTrackingBeam() {
        const mat = new THREE.LineBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.95, linewidth: 2, blending: THREE.AdditiveBlending });
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
            this.controls.maxDistance = 1200.0;
            this.controls.target.set(0, 0, 0);
            this.controls.enableRotate = true;
        } else if (mode === 'FOLLOW') {
            this.controls.minDistance = 1.5;
            this.controls.maxDistance = 120.0;
            if (this.satGroup) {
                this.controls.target.copy(this.satGroup.position);
            }
        } else if (mode === 'CLOSEUP') {
            this.controls.minDistance = 0.5;
            this.controls.maxDistance = 25.0;
            if (this.satGroup) {
                this.controls.target.copy(this.satGroup.position);
                const satPos = this.satGroup.position.clone();
                this.camera.position.copy(satPos).add(new THREE.Vector3(1.8, 0.9, 2.0));
            }
        } else if (mode === 'CELESTIAL') {
            // View deep space planets & Moon from Earth perspective
            this.controls.minDistance = 10.4;
            this.controls.maxDistance = 1500.0;
            if (this.moonGroup) {
                this.controls.target.copy(this.moonGroup.position);
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

        // Slow differential atmospheric cloud drift
        if (this.cloudsMesh) {
            this.cloudsMesh.rotation.y += 0.00015;
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
            this.thrusterFlame.scale.set(0.9 + Math.random() * 0.3, 0.8 + Math.random() * 0.4, 0.9 + Math.random() * 0.3);
        }

        this.renderer.render(this.scene, this.camera);
    }
}
