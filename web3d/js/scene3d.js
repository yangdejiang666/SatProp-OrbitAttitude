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
        this.cameraMode = 'FREE'; // 'FREE', 'ECEF', 'FOLLOW', 'CLOSEUP', 'STATION', 'CELESTIAL'
        this.viewFrame = 'ECI'; // 'ECI' (Space Inertial) or 'ECEF' (Earth-Fixed Ground Projection)
        this.lastGmstRad = undefined;
        this.currentGmstRad = 0;
        this.groundTrackVisible = true;
        this.celestialRingsVisible = true;
        this.activeStation = null;
        this.celestialData = null;

        this.initThree();
        this.createDeepSpaceSkybox();
        this.createEarth();
        this.createAtmosphere();
        this.createSun();
        this.createMoon();
        this.createPlanets();
        this.createCelestialRings();
        this.createNadirProjector();
        this.initGroundTrack();
        this.createSatelliteModel(this.currentSatId);
        this.initConstellation();
        this.initOrbitLines();
        this.createGroundStations();
        this.createTrackingBeam();
        this.initApsidesMarkers();
        this.initGhostSatellite();

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
    // 1. Deep Space Milky Way Galaxy Skybox (NASA Official Deep Sky & Tycho Starfield)
    // =========================================================================
    createDeepSpaceSkybox() {
        const textureLoader = new THREE.TextureLoader();

        // 1. Panoramic NASA 4K Deep Sky & Tycho Starfield Sphere (1800 radius)
        const skyGeo = new THREE.SphereGeometry(1800, 64, 40);
        const skyTex = textureLoader.load('textures/nasa_deep_sky_4k.jpg', (tex) => {
            tex.anisotropy = 4;
        });

        const skyMat = new THREE.MeshBasicMaterial({
            map: skyTex,
            side: THREE.BackSide,
            depthWrite: false,
            transparent: false
        });

        this.deepSpaceSky = new THREE.Mesh(skyGeo, skyMat);
        this.scene.add(this.deepSpaceSky);

        // 2. Auxiliary fine star field points for parallax motion depth
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
    // 2. High-Resolution Earth with Real NASA Day/Night Lighting & City Lights
    // =========================================================================
    createEarth() {
        const textureLoader = new THREE.TextureLoader();

        // High-resolution NASA Blue Marble (Day) & BeiDou Satellite Map & Black Marble (Night Lights)
        this.dayTexNasa = textureLoader.load('textures/earth_blue_marble.jpg');
        this.dayTexNasa.anisotropy = 4;
        this.dayTexBeidou = textureLoader.load('textures/beidou_satellite_map.jpg');
        this.dayTexBeidou.anisotropy = 4;
        this.currentEarthMapLayer = 'NASA';

        const nightTex = textureLoader.load('textures/earth_night_lights.png');
        nightTex.anisotropy = 4;
        const specTex = textureLoader.load('textures/earth_specular.jpg');

        this.earthUniforms = {
            uDayMap: { value: this.dayTexNasa },
            uNightMap: { value: nightTex },
            uSpecularMap: { value: specTex },
            uSunDirection: { value: new THREE.Vector3(-0.95, 0.25, -0.15).normalize() },
            uTime: { value: 0.0 }
        };

        const earthVertexShader = `
            varying vec2 vUv;
            varying vec3 vNormalWorld;
            varying vec3 vViewDir;

            void main() {
                vUv = uv;
                vNormalWorld = normalize(mat3(modelMatrix) * normal);
                vec4 worldPos = modelMatrix * vec4(position, 1.0);
                vViewDir = normalize(cameraPosition - worldPos.xyz);
                gl_Position = projectionMatrix * viewMatrix * worldPos;
            }
        `;

        const earthFragmentShader = `
            uniform sampler2D uDayMap;
            uniform sampler2D uNightMap;
            uniform sampler2D uSpecularMap;
            uniform vec3 uSunDirection;
            uniform float uTime;

            varying vec2 vUv;
            varying vec3 vNormalWorld;
            varying vec3 vViewDir;

            void main() {
                vec3 N = normalize(vNormalWorld);
                vec3 L = normalize(uSunDirection);
                vec3 V = normalize(vViewDir);

                float sunDot = dot(N, L);

                // Day / Night transition curve
                float dayFactor = smoothstep(-0.12, 0.18, sunDot);

                // Daylight color & specular highlights
                vec3 dayColor = texture2D(uDayMap, vUv).rgb;
                float oceanMask = texture2D(uSpecularMap, vUv).r;

                vec3 H = normalize(L + V);
                float spec = pow(max(0.0, dot(N, H)), 24.0) * oceanMask * max(0.0, sunDot) * 1.6;
                dayColor += vec3(0.92, 0.96, 1.0) * spec;

                float diffuse = max(0.0, sunDot);
                vec3 litDay = dayColor * (diffuse * 0.92 + 0.08);

                // Night lights with subtle golden twinkling
                vec3 nightLights = texture2D(uNightMap, vUv).rgb;
                float twinkle = 0.90 + 0.10 * sin(uTime * 4.0 + vUv.x * 500.0 + vUv.y * 350.0);
                vec3 litNight = nightLights * (twinkle * 1.85);

                // Sunset / Twilight orange rim at the terminator
                float twilight = smoothstep(-0.12, 0.02, sunDot) * (1.0 - smoothstep(0.02, 0.20, sunDot));
                vec3 sunsetRim = vec3(1.0, 0.42, 0.12) * (twilight * 0.55);

                // Blend Day and Night
                vec3 surfaceColor = mix(litNight, litDay, dayFactor) + sunsetRim;

                // Atmospheric Rayleigh limb scattering (blue Fresnel haze)
                float fresnel = pow(1.0 - max(0.0, dot(N, V)), 3.2);
                float atmoSun = max(0.0, sunDot * 0.5 + 0.5);
                vec3 atmoHaze = vec3(0.24, 0.60, 0.96) * (fresnel * atmoSun * 0.82);
                surfaceColor += atmoHaze;

                gl_FragColor = vec4(surfaceColor, 1.0);
            }
        `;

        const earthGeo = new THREE.SphereGeometry(this.earthRadius, 64, 64);
        const earthMat = new THREE.ShaderMaterial({
            uniforms: this.earthUniforms,
            vertexShader: earthVertexShader,
            fragmentShader: earthFragmentShader
        });

        this.earthMesh = new THREE.Mesh(earthGeo, earthMat);
        this.scene.add(this.earthMesh);

        // Dynamic cloud layer
        const cloudsTex = textureLoader.load('textures/earth_clouds_dense.jpg');
        const cloudsGeo = new THREE.SphereGeometry(this.earthRadius * 1.012, 64, 64);
        const cloudsMat = new THREE.MeshLambertMaterial({
            map: cloudsTex,
            transparent: true,
            opacity: 0.40,
            blending: THREE.NormalBlending,
            depthWrite: false
        });
        this.cloudsMesh = new THREE.Mesh(cloudsGeo, cloudsMat);
        this.scene.add(this.cloudsMesh);
    }

    createAtmosphere() {
        const atmoGeo = new THREE.SphereGeometry(this.earthRadius * 1.025, 64, 64);
        const atmoMat = new THREE.MeshLambertMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.20,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending
        });
        this.atmosphere = new THREE.Mesh(atmoGeo, atmoMat);
        this.scene.add(this.atmosphere);
    }

    // =========================================================================
    // 3. Astronomical Real Sun (NASA SDO Photosphere + Dynamic Corona)
    // =========================================================================
    createSun() {
        this.sunGroup = new THREE.Group();
        const textureLoader = new THREE.TextureLoader();

        // 1. 3D Sun Photosphere Sphere with NASA SDO Texture & Limb Darkening
        const sunGeo = new THREE.SphereGeometry(22.0, 48, 48);
        const sunTex = textureLoader.load('textures/sun_sdo_nasa.jpg');

        this.sunUniforms = {
            uSunMap: { value: sunTex },
            uTime: { value: 0.0 }
        };

        const sunVertexShader = `
            varying vec2 vUv;
            varying vec3 vNormal;
            varying vec3 vViewDir;

            void main() {
                vUv = uv;
                vNormal = normalize(normalMatrix * normal);
                vec4 worldPos = modelMatrix * vec4(position, 1.0);
                vViewDir = normalize(cameraPosition - worldPos.xyz);
                gl_Position = projectionMatrix * viewMatrix * worldPos;
            }
        `;

        const sunFragmentShader = `
            uniform sampler2D uSunMap;
            uniform float uTime;

            varying vec2 vUv;
            varying vec3 vNormal;
            varying vec3 vViewDir;

            void main() {
                vec3 N = normalize(vNormal);
                vec3 V = normalize(vViewDir);
                float cosTheta = max(0.0, dot(N, V));

                // Solar Limb Darkening: I(theta) = I0 * (1 - u * (1 - cosTheta^0.8))
                float limb = 1.0 - 0.50 * pow(1.0 - cosTheta, 0.85);

                // Subtle convection drift
                vec2 uvDrift = vUv + vec2(uTime * 0.0012, 0.0);
                vec3 texColor = texture2D(uSunMap, uvDrift).rgb;

                // High-temperature solar radiation
                vec3 solarColor = texColor * (limb * 1.22);
                solarColor += vec3(0.25, 0.15, 0.05) * pow(cosTheta, 3.5);

                gl_FragColor = vec4(solarColor, 1.0);
            }
        `;

        const sunMat = new THREE.ShaderMaterial({
            uniforms: this.sunUniforms,
            vertexShader: sunVertexShader,
            fragmentShader: sunFragmentShader
        });
        const sunMesh = new THREE.Mesh(sunGeo, sunMat);
        this.sunGroup.add(sunMesh);

        // 2. Chromosphere Solar Prominence Halo
        const coronaGeo = new THREE.SphereGeometry(25.0, 32, 32);
        const coronaMat = new THREE.MeshBasicMaterial({
            color: 0xff8811,
            transparent: true,
            opacity: 0.35,
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide
        });
        const corona = new THREE.Mesh(coronaGeo, coronaMat);
        this.sunGroup.add(corona);

        // 3. Dynamic Outer Corona Flare Streamers (NASA Coronal Rays)
        const flareTex = textureLoader.load('textures/sun_corona_flare.png');
        const flareMat = new THREE.SpriteMaterial({
            map: flareTex,
            color: 0xffdd66,
            transparent: true,
            opacity: 0.80,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        this.sunFlareSprite = new THREE.Sprite(flareMat);
        this.sunFlareSprite.scale.set(135, 135, 1.0);
        this.sunGroup.add(this.sunFlareSprite);

        // Position Sun at 750 units away
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
    // =========================================================================
    // Real-Time High-Precision Astrodynamical Celestial Motion (Every Frame)
    // Earth Spin (GMST), Solar Revolution (Meeus Ephemeris), Lunar Orbit
    // =========================================================================
    updateCelestialRealtime(simEpochMs, simTimeSec = 0) {
        if (!simEpochMs) return;
        const jd = (simEpochMs / 86400000.0) + 2440587.5;
        const T = (jd - 2451545.0) / 36525.0;

        // 1. Greenwich Mean Sidereal Time (GMST) - IAU 1982 Model
        let gmstDeg = (280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - (T * T * T) / 38710000.0) % 360.0;
        if (gmstDeg < 0) gmstDeg += 360.0;
        const gmstRad = THREE.MathUtils.degToRad(gmstDeg);

        if (this.earthMesh) {
            this.earthMesh.rotation.y = gmstRad;
        }
        if (this.cloudsMesh) {
            this.cloudsMesh.rotation.y = gmstRad + (simTimeSec * 0.00002) + 0.04;
        }

        // 2. Real Solar Ephemeris (Meeus Astronomical Algorithms)
        const L0 = (280.46646 + 36000.76983 * T) % 360.0;
        const M_sun = (357.52911 + 35999.05029 * T) % 360.0;
        const M_rad = THREE.MathUtils.degToRad(M_sun);
        const C_sun = (1.914602 - 0.004817 * T) * Math.sin(M_rad) +
                      (0.019993 - 0.000101 * T) * Math.sin(2 * M_rad) +
                      0.000289 * Math.sin(3 * M_rad);
        const lambdaSun = THREE.MathUtils.degToRad((L0 + C_sun) % 360.0);
        const eps = THREE.MathUtils.degToRad(23.439291 - 0.0130042 * T);

        const sunX = Math.cos(lambdaSun);
        const sunY = Math.sin(lambdaSun) * Math.cos(eps);
        const sunZ = Math.sin(lambdaSun) * Math.sin(eps);

        // Convert ECI to Three.js coordinates (X, Z, -Y)
        const sx = sunX;
        const sy = sunZ;
        const sz = -sunY;

        if (this.sunLight) {
            this.sunLight.position.set(sx * 100, sy * 100, sz * 100);
        }
        if (this.earthUniforms && this.earthUniforms.uSunDirection) {
            this.earthUniforms.uSunDirection.value.set(sx, sy, sz).normalize();
        }
        if (this.sunGroup) {
            this.sunGroup.position.set(sx * this.sunDistance, sy * this.sunDistance, sz * this.sunDistance);
        }

        // 3. Real Lunar Ephemeris (Meeus Lunar Orbit ~27.32 days period)
        const Lp = (218.3164477 + 481267.88123421 * T) % 360.0;
        const D_moon = (297.8501921 + 445267.1114034 * T) % 360.0;
        const M_moon = (134.9633964 + 477198.8675055 * T) % 360.0;
        const F_moon = (93.2720950 + 483202.0175233 * T) % 360.0;

        const D_rad = THREE.MathUtils.degToRad(D_moon);
        const Mm_rad = THREE.MathUtils.degToRad(M_moon);
        const Fm_rad = THREE.MathUtils.degToRad(F_moon);

        const lamMoonDeg = Lp + 6.289 * Math.sin(Mm_rad) - 1.274 * Math.sin(2 * D_rad - Mm_rad) + 0.658 * Math.sin(2 * D_rad) - 0.214 * Math.sin(2 * Mm_rad) - 0.186 * Math.sin(M_rad);
        const betMoonDeg = 5.128 * Math.sin(Fm_rad) + 0.280 * Math.sin(Mm_rad + Fm_rad) + 0.277 * Math.sin(Mm_rad - Fm_rad) + 0.173 * Math.sin(2 * D_rad - Fm_rad);

        const lamMoonRad = THREE.MathUtils.degToRad(lamMoonDeg % 360.0);
        const betMoonRad = THREE.MathUtils.degToRad(betMoonDeg);

        const cosBet = Math.cos(betMoonRad);
        const sinBet = Math.sin(betMoonRad);
        const cosLam = Math.cos(lamMoonRad);
        const sinLam = Math.sin(lamMoonRad);

        const mX = cosBet * cosLam;
        const mY = cosBet * sinLam * Math.cos(eps) - sinBet * Math.sin(eps);
        const mZ = cosBet * sinLam * Math.sin(eps) + sinBet * Math.cos(eps);

        if (this.moonGroup) {
            this.moonGroup.position.set(mX * this.moonDisplayDist, mZ * this.moonDisplayDist, -mY * this.moonDisplayDist);
        }

        // 4. Astronomical Major Planets (Venus, Mars, Jupiter) Real Heliocentric/Geocentric Motion
        if (this.planetMeshes) {
            const tDays = simEpochMs / 86400000.0;
            // Venus: Mean anomaly ~224.7 days period, a=0.723 AU, displayDist=240
            const M_venus = THREE.MathUtils.degToRad((50.115 + (360.0 / 224.701) * tDays) % 360.0);
            const vX = Math.cos(M_venus);
            const vY = Math.sin(M_venus) * Math.cos(eps);
            const vZ = Math.sin(M_venus) * Math.sin(eps);
            if (this.planetMeshes.venus) {
                this.planetMeshes.venus.group.position.set(vX * 240, vZ * 240, -vY * 240);
            }

            // Mars: Mean anomaly ~686.98 days period, a=1.524 AU, displayDist=320
            const M_mars = THREE.MathUtils.degToRad((19.373 + (360.0 / 686.980) * tDays) % 360.0);
            const marsX = Math.cos(M_mars);
            const marsY = Math.sin(M_mars) * Math.cos(eps);
            const marsZ = Math.sin(M_mars) * Math.sin(eps);
            if (this.planetMeshes.mars) {
                this.planetMeshes.mars.group.position.set(marsX * 320, marsZ * 320, -marsY * 320);
            }

            // Jupiter: Mean anomaly ~4332.59 days period, a=5.204 AU, displayDist=500
            const M_jup = THREE.MathUtils.degToRad((20.020 + (360.0 / 4332.589) * tDays) % 360.0);
            const jupX = Math.cos(M_jup);
            const jupY = Math.sin(M_jup) * Math.cos(eps);
            const jupZ = Math.sin(M_jup) * Math.sin(eps);
            if (this.planetMeshes.jupiter) {
                this.planetMeshes.jupiter.group.position.set(jupX * 500, jupZ * 500, -jupY * 500);
            }
        }

        this.currentGmstRad = gmstRad;
    }

    // =========================================================================
    // Dynamic Celestial Rings (Ecliptic, Celestial Equator, Lunar Orbit)
    // =========================================================================
    createCelestialRings() {
        this.celestialRingsGroup = new THREE.Group();

        // 1. Golden Amber Ecliptic Plane Ring (Earth's orbital plane / Sun's apparent path)
        const eps = THREE.MathUtils.degToRad(23.439291); // Obliquity 23.44 deg
        const eclipticRadius = this.sunDistance || 750.0;
        const eclipticCurve = new THREE.EllipseCurve(0, 0, eclipticRadius, eclipticRadius, 0, 2 * Math.PI, false, 0);
        const eclipticPts = eclipticCurve.getPoints(128);
        const eclipticGeo = new THREE.BufferGeometry().setFromPoints(eclipticPts.map(p => new THREE.Vector3(p.x, 0, p.y)));
        const eclipticMat = new THREE.LineBasicMaterial({
            color: 0xf59e0b,
            transparent: true,
            opacity: 0.65,
            linewidth: 2
        });
        this.eclipticRing = new THREE.Line(eclipticGeo, eclipticMat);
        this.eclipticRing.rotation.x = eps;
        this.celestialRingsGroup.add(this.eclipticRing);

        // 2. Cyan Celestial Equator Ring (Earth's equator projected to deep space)
        const equatorRadius = 720.0;
        const equatorCurve = new THREE.EllipseCurve(0, 0, equatorRadius, equatorRadius, 0, 2 * Math.PI, false, 0);
        const equatorPts = equatorCurve.getPoints(128);
        const equatorGeo = new THREE.BufferGeometry().setFromPoints(equatorPts.map(p => new THREE.Vector3(p.x, 0, p.y)));
        const equatorMat = new THREE.LineDashedMaterial({
            color: 0x06b6d4,
            dashSize: 10.0,
            gapSize: 5.0,
            transparent: true,
            opacity: 0.40
        });
        this.equatorRing = new THREE.Line(equatorGeo, equatorMat);
        this.equatorRing.computeLineDistances();
        this.celestialRingsGroup.add(this.equatorRing);

        // 3. Silver-White Lunar Orbit Ring (白道面)
        const moonRadius = this.moonDisplayDist || 70.0;
        const moonCurve = new THREE.EllipseCurve(0, 0, moonRadius, moonRadius, 0, 2 * Math.PI, false, 0);
        const moonPts = moonCurve.getPoints(96);
        const moonGeo = new THREE.BufferGeometry().setFromPoints(moonPts.map(p => new THREE.Vector3(p.x, 0, p.y)));
        const moonMat = new THREE.LineBasicMaterial({
            color: 0xe2e8f0,
            transparent: true,
            opacity: 0.55,
            linewidth: 1.5
        });
        this.lunarRing = new THREE.Line(moonGeo, moonMat);
        this.lunarRing.rotation.x = eps + THREE.MathUtils.degToRad(5.14);
        this.celestialRingsGroup.add(this.lunarRing);

        this.scene.add(this.celestialRingsGroup);
    }

    setCelestialRingsVisibility(visible) {
        this.celestialRingsVisible = visible;
        if (this.celestialRingsGroup) {
            this.celestialRingsGroup.visible = visible;
        }
    }

    // =========================================================================
    // Nadir Ground Projector Beam & Footprint (True Earth Projection)
    // =========================================================================
    createNadirProjector() {
        // 1. Nadir Laser Beam (from satellite straight down to Earth surface)
        const beamMat = new THREE.LineBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending,
            linewidth: 2
        });
        const beamGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
        this.nadirBeam = new THREE.Line(beamGeo, beamMat);
        this.nadirBeam.visible = false;
        this.scene.add(this.nadirBeam);

        // 2. Nadir Footprint on rotating Earth surface (attached directly as child of earthMesh)
        this.nadirFootprint = new THREE.Group();

        // Glowing footprint swath ring (optical / SAR ground swath)
        const ringGeo = new THREE.RingGeometry(0.38, 0.45, 32);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        this.nadirFootprint.add(ring);

        // Footprint inner concentric reticle
        const innerRingGeo = new THREE.RingGeometry(0.18, 0.22, 24);
        const innerRingMat = new THREE.MeshBasicMaterial({
            color: 0x06b6d4,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.90
        });
        const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
        this.nadirFootprint.add(innerRing);

        // Center pulsating nadir spot
        const spotGeo = new THREE.SphereGeometry(0.09, 16, 16);
        const spotMat = new THREE.MeshStandardMaterial({
            color: 0x00f0ff,
            emissive: 0x38bdf8,
            emissiveIntensity: 1.0,
            roughness: 0.1
        });
        const spot = new THREE.Mesh(spotGeo, spotMat);
        spot.position.z = 0.02;
        this.nadirFootprint.add(spot);

        this.earthMesh.add(this.nadirFootprint);
        this.nadirFootprint.visible = false;
    }

    updateNadirProjector(r_eci, latDeg, lonDeg) {
        if (!this.satGroup || !this.earthMesh || latDeg === undefined || lonDeg === undefined) return;

        const phi = THREE.MathUtils.degToRad(90 - latDeg);
        const theta = THREE.MathUtils.degToRad(lonDeg + 180);

        const R = this.earthRadius * 1.0025;
        const lx = -(R * Math.sin(phi) * Math.cos(theta));
        const ly = R * Math.cos(phi);
        const lz = R * Math.sin(phi) * Math.sin(theta);

        this.nadirFootprint.position.set(lx, ly, lz);
        const normal = new THREE.Vector3(lx, ly, lz).normalize();
        this.nadirFootprint.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
        this.nadirFootprint.visible = this.groundTrackVisible;

        // Connect nadir laser beam from satellite world pos to footprint world pos
        const fpWorld = new THREE.Vector3();
        this.nadirFootprint.getWorldPosition(fpWorld);
        const satPos = this.satGroup.position;

        const posArr = new Float32Array([
            satPos.x, satPos.y, satPos.z,
            fpWorld.x, fpWorld.y, fpWorld.z
        ]);
        this.nadirBeam.geometry.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
        this.nadirBeam.visible = this.groundTrackVisible;
    }

    // =========================================================================
    // Dynamic Sub-Satellite Ground Track Curve on Rotating Earth Sphere
    // =========================================================================
    initGroundTrack() {
        // groundTrackGroup is a child of earthMesh so it co-rotates with Earth
        this.groundTrackGroup = new THREE.Group();
        this.earthMesh.add(this.groundTrackGroup);

        // Material prototypes (reused across dynamic segments)
        this._pastTrackMat = new THREE.LineBasicMaterial({
            color: 0x06b6d4, transparent: true, opacity: 0.85, linewidth: 2
        });
        this._futureTrackMat = new THREE.LineDashedMaterial({
            color: 0xf59e0b, dashSize: 0.30, gapSize: 0.15,
            transparent: true, opacity: 0.90
        });

        // Dynamic segment pools — rebuilt each updateGroundTrack call
        this._pastSegments = [];   // Array<THREE.Line>
        this._futureSegments = []; // Array<THREE.Line>
    }

    // -------------------------------------------------------------------------
    // Helper: split a list of sphere-surface points at antimeridian crossings.
    // Returns an array of sub-arrays (segments), each containing continuous pts.
    // -------------------------------------------------------------------------
    _splitAtAntimeridian(points, lons) {
        const segments = [];
        if (points.length === 0) return segments;
        let current = [points[0]];
        for (let i = 1; i < points.length; i++) {
            const dLon = Math.abs(lons[i] - lons[i - 1]);
            if (dLon > 150.0) {
                // Antimeridian crossing detected — break segment here
                if (current.length >= 2) segments.push(current);
                current = [points[i]];
            } else {
                current.push(points[i]);
            }
        }
        if (current.length >= 2) segments.push(current);
        return segments;
    }

    // -------------------------------------------------------------------------
    // Rebuild Line objects in a pool to match segment count, reusing existing.
    // -------------------------------------------------------------------------
    _rebuildSegmentPool(pool, segmentArrays, mat, isDashed, group, visible) {
        // Remove all old Lines from group
        pool.forEach(l => { group.remove(l); l.geometry.dispose(); });
        pool.length = 0;

        segmentArrays.forEach(pts => {
            if (pts.length < 2) return;
            const geo = new THREE.BufferGeometry().setFromPoints(pts);
            const line = new THREE.Line(geo, mat);
            if (isDashed) line.computeLineDistances();
            line.visible = visible;
            group.add(line);
            pool.push(line);
        });
    }

    updateGroundTrack(trajectoryStatesEci, simTimeSec, baseEpochMs, periodS = 5500.0) {
        if (!trajectoryStatesEci || trajectoryStatesEci.length < 2 || !baseEpochMs) return;

        const N = trajectoryStatesEci.length;
        // Raise slightly above Earth surface to avoid Z-fighting
        const R = this.earthRadius * 1.004;
        const states = trajectoryStatesEci;

        const pastPoints = [];
        const futurPoints = [];
        const pastLons   = [];
        const futurLons  = [];

        // Sample past 0.6 orbit + future 1.3 orbits with finer resolution
        const pastSamples   = 72;
        const futureSamples = 144;

        const computePoint = (tEvalSec) => {
            const tEvalMs = baseEpochMs + tEvalSec * 1000;
            const jd = (tEvalMs / 86400000.0) + 2440587.5;
            const T  = (jd - 2451545.0) / 36525.0;
            let gmstDeg = (280.46061837 + 360.98564736629 * (jd - 2451545.0) +
                           0.000387933 * T * T) % 360.0;
            if (gmstDeg < 0) gmstDeg += 360.0;
            const gmstRad = THREE.MathUtils.degToRad(gmstDeg);

            const tNorm  = ((tEvalSec % periodS) + periodS) % periodS;
            const frac   = (tNorm / periodS) * (N - 1);
            const k0     = Math.min(Math.floor(frac), N - 1);
            const k1     = Math.min(k0 + 1, N - 1);
            const alpha  = frac - k0;
            const p0     = states[k0], p1 = states[k1];
            const r_x    = (1 - alpha) * p0[0] + alpha * p1[0];
            const r_y    = (1 - alpha) * p0[1] + alpha * p1[1];
            const r_z    = (1 - alpha) * p0[2] + alpha * p1[2];

            // ECI → ECEF (Z-rotation by GMST)
            const cosG   = Math.cos(gmstRad), sinG = Math.sin(gmstRad);
            const x_ecef = r_x * cosG + r_y * sinG;
            const y_ecef = -r_x * sinG + r_y * cosG;
            const z_ecef = r_z;

            // ECEF → geographic lat/lon
            const pLen   = Math.hypot(x_ecef, y_ecef);
            const lonDeg = Math.atan2(y_ecef, x_ecef) * (180.0 / Math.PI);
            const latDeg = Math.atan2(z_ecef, pLen)  * (180.0 / Math.PI);

            // Sphere surface point in earthMesh local frame
            // (earthMesh rotates by GMST, so ECEF coords become correct
            //  world positions after the parent transform)
            const phi   = THREE.MathUtils.degToRad(90.0 - latDeg);
            const theta = THREE.MathUtils.degToRad(lonDeg + 180.0);
            const gx    = -(R * Math.sin(phi) * Math.cos(theta));
            const gy    =   R * Math.cos(phi);
            const gz    =   R * Math.sin(phi) * Math.sin(theta);
            return { pt: new THREE.Vector3(gx, gy, gz), lon: lonDeg };
        };

        // Build past track
        for (let i = pastSamples; i >= 0; i--) {
            const dtRel = -(i / pastSamples) * periodS * 0.6;
            const { pt, lon } = computePoint(simTimeSec + dtRel);
            pastPoints.push(pt); pastLons.push(lon);
        }

        // Build future track
        for (let i = 0; i <= futureSamples; i++) {
            const dtRel = (i / futureSamples) * periodS * 1.3;
            const { pt, lon } = computePoint(simTimeSec + dtRel);
            futurPoints.push(pt); futurLons.push(lon);
        }

        // Split at antimeridian and rebuild segment pools
        const pastSegs  = this._splitAtAntimeridian(pastPoints,  pastLons);
        const futureSegs = this._splitAtAntimeridian(futurPoints, futurLons);

        this._rebuildSegmentPool(
            this._pastSegments,   pastSegs,   this._pastTrackMat,
            false, this.groundTrackGroup, this.groundTrackVisible
        );
        this._rebuildSegmentPool(
            this._futureSegments, futureSegs, this._futureTrackMat,
            true,  this.groundTrackGroup, this.groundTrackVisible
        );
    }

    setGroundTrackVisibility(visible) {
        this.groundTrackVisible = visible;
        if (this.groundTrackGroup) {
            this.groundTrackGroup.visible = visible;
        }
        if (this.nadirBeam) {
            this.nadirBeam.visible = visible;
        }
        if (this.nadirFootprint) {
            this.nadirFootprint.visible = visible;
        }
    }

    setViewFrame(frame) {
        this.viewFrame = (frame === 'ECEF') ? 'ECEF' : 'ECI';
        return this.viewFrame;
    }

    setEarthMapLayer(layerName) {
        if (layerName === 'BEIDOU') {
            if (this.dayTexBeidou && this.earthUniforms) {
                this.earthUniforms.uDayMap.value = this.dayTexBeidou;
                this.currentEarthMapLayer = 'BEIDOU';
            }
        } else {
            if (this.dayTexNasa && this.earthUniforms) {
                this.earthUniforms.uDayMap.value = this.dayTexNasa;
                this.currentEarthMapLayer = 'NASA';
            }
        }
        return this.currentEarthMapLayer;
    }

    flyToRegion(latDeg, lonDeg, altitudeScale = 1.85) {
        const phi = THREE.MathUtils.degToRad(90 - latDeg);
        const theta = THREE.MathUtils.degToRad(lonDeg + 180);

        const x = -(this.earthRadius * Math.sin(phi) * Math.cos(theta));
        const y = this.earthRadius * Math.cos(phi);
        const z = this.earthRadius * Math.sin(phi) * Math.sin(theta);

        const localPos = new THREE.Vector3(x, y, z);
        const worldPos = localPos.clone();
        if (this.earthMesh) {
            worldPos.applyEuler(this.earthMesh.rotation);
        }

        const camPos = worldPos.clone().multiplyScalar(altitudeScale);

        const startPos = this.camera.position.clone();
        const startTarget = this.controls.target.clone();
        const startTime = performance.now();
        const duration = 1400.0;

        const animateFly = (t) => {
            const elapsed = t - startTime;
            const progress = Math.min(1.0, elapsed / duration);
            const ease = 0.5 - 0.5 * Math.cos(progress * Math.PI);

            this.camera.position.lerpVectors(startPos, camPos, ease);
            this.controls.target.lerpVectors(startTarget, worldPos, ease);

            if (progress < 1.0) {
                requestAnimationFrame(animateFly);
            }
        };
        requestAnimationFrame(animateFly);
    }

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

            // Update Earth day/night shader sun direction
            if (this.earthUniforms) {
                this.earthUniforms.uSunDirection.value.set(sx, sy, sz).normalize();
            }

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
            case 'sentinel2a':
                this.buildSentinel2AModel(this.satGroup);
                break;
            case 'landsat9':
                this.buildLandsat9Model(this.satGroup);
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
        this.satGroup.scale.set(0.20, 0.20, 0.20);
        this.scene.add(this.satGroup);
    }

    switchSatelliteModel(satId) {
        this.currentSatId = satId;
        this.createSatelliteModel(satId);
        if (this.constellationSatellites) {
            Object.keys(this.constellationSatellites).forEach(id => {
                if (this.constellationSatellites[id] && this.constellationSatellites[id].group) {
                    this.constellationSatellites[id].group.visible = (id !== satId);
                }
            });
        }
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

    // Model: ESA Sentinel-2A Multispectral Optical Remote Sensing Satellite
    buildSentinel2AModel(group) {
        const busMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.3 });
        const goldMliMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.25 });
        const solarMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.95, roughness: 0.1 });

        // Hexagonal / box bus
        const bus = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.65, 1.1), busMat);
        group.add(bus);

        // Gold foil insulation payload compartment
        const payloadBay = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.58, 0.4), goldMliMat);
        payloadBay.position.set(0, 0, 0.5);
        group.add(payloadBay);

        // Multispectral Instrument (MSI) aperture lens (Nadir pointing)
        const msiBaffle = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.24, 0.35, 24),
            new THREE.MeshStandardMaterial({ color: 0x020617, metalness: 0.9, roughness: 0.2 })
        );
        msiBaffle.position.set(0, -0.32, 0.35);
        msiBaffle.rotation.x = Math.PI / 2;
        group.add(msiBaffle);

        const msiLens = new THREE.Mesh(
            new THREE.CircleGeometry(0.16, 24),
            new THREE.MeshStandardMaterial({ color: 0x1d4ed8, metalness: 0.95, roughness: 0.05 })
        );
        msiLens.position.set(0, -0.32, 0.53);
        group.add(msiLens);

        // Single asymmetric deployable solar array wing (Sentinel-2 hallmark)
        const wingArm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 12), busMat);
        wingArm.rotation.z = Math.PI / 2;
        wingArm.position.set(0.5, 0, -0.2);
        group.add(wingArm);

        const solarWing = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.03, 0.85), solarMat);
        solarWing.position.set(1.8, 0, -0.2);
        group.add(solarWing);
    }

    // Model: NASA/USGS Landsat 9 Earth Observation Satellite
    buildLandsat9Model(group) {
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.85, roughness: 0.3 });
        const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.92, roughness: 0.2 });
        const solarMat = new THREE.MeshStandardMaterial({ color: 0x0a192f, metalness: 0.96, roughness: 0.1 });

        // Octagonal main instrument bus
        const bus = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.25, 8), bodyMat);
        bus.rotation.x = Math.PI / 2;
        group.add(bus);

        // OLI-2 (Operational Land Imager 2) telescope cylinder
        const oli2 = new THREE.Mesh(
            new THREE.CylinderGeometry(0.22, 0.22, 0.45, 20),
            goldMat
        );
        oli2.position.set(0, -0.22, 0.6);
        oli2.rotation.x = Math.PI / 2;
        group.add(oli2);

        // TIRS-2 (Thermal Infrared Sensor 2) cylinder
        const tirs2 = new THREE.Mesh(
            new THREE.CylinderGeometry(0.14, 0.14, 0.35, 18),
            new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85, roughness: 0.2 })
        );
        tirs2.position.set(0.2, 0.15, 0.6);
        tirs2.rotation.x = Math.PI / 2;
        group.add(tirs2);

        // Deployable solar wing
        const wing = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.04, 0.9), solarMat);
        wing.position.set(-1.5, 0, 0);
        group.add(wing);

        // High gain communication gimbaled dish
        const hgaDish = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12, 0, Math.PI), bodyMat);
        hgaDish.position.set(0, 0.42, -0.3);
        hgaDish.rotation.x = Math.PI / 3;
        group.add(hgaDish);
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
    // Real Multi-Satellite Constellation & Orbits
    // =========================================================================
    initConstellation() {
        this.constellationGroup = new THREE.Group();
        this.scene.add(this.constellationGroup);
        this.constellationOrbits = {};
        this.constellationSatellites = {};
    }

    updateConstellation(data) {
        if (!data) return;
        this.constellationData = data;

        Object.keys(data).forEach(satId => {
            const satInfo = data[satId];
            const pts = satInfo.orbit_points_eci;
            const colorHex = parseInt((satInfo.color || '#38bdf8').replace('#', '0x'), 16);

            // 1. Build or update continuous 3D Orbit Ring
            if (!this.constellationOrbits[satId]) {
                const lineMat = new THREE.LineBasicMaterial({
                    color: colorHex,
                    transparent: true,
                    opacity: 0.85,
                    linewidth: 2
                });
                const lineGeo = new THREE.BufferGeometry();
                const orbitLine = new THREE.Line(lineGeo, lineMat);
                this.constellationOrbits[satId] = orbitLine;
                this.constellationGroup.add(orbitLine);
            }

            if (pts && pts.length > 0) {
                const positions = new Float32Array(pts.length * 3);
                for (let i = 0; i < pts.length; i++) {
                    positions[i * 3] = pts[i][0] * this.scaleRatio;
                    positions[i * 3 + 1] = pts[i][2] * this.scaleRatio;
                    positions[i * 3 + 2] = -pts[i][1] * this.scaleRatio;
                }
                const line = this.constellationOrbits[satId];
                line.geometry.dispose();
                line.geometry = new THREE.BufferGeometry();
                line.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                line.visible = true;
            }

            // 2. Build or update 3D Mini Satellite Model + Radiant Beacon
            if (!this.constellationSatellites[satId]) {
                const satMiniGroup = new THREE.Group();

                // Core satellite bus
                const busMat = new THREE.MeshStandardMaterial({
                    color: 0x94a3b8,
                    metalness: 0.8,
                    roughness: 0.3
                });
                const bus = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.35), busMat);
                satMiniGroup.add(bus);

                // Solar panels
                const solarMat = new THREE.MeshStandardMaterial({
                    color: 0x0f172a,
                    metalness: 0.95,
                    roughness: 0.1
                });
                const wing1 = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.02, 0.22), solarMat);
                wing1.position.set(-0.36, 0, 0);
                satMiniGroup.add(wing1);

                const wing2 = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.02, 0.22), solarMat);
                wing2.position.set(0.36, 0, 0);
                satMiniGroup.add(wing2);

                // Radiant Beacon Sphere
                const beaconGeo = new THREE.SphereGeometry(0.12, 16, 16);
                const beaconMat = new THREE.MeshBasicMaterial({
                    color: colorHex
                });
                const beacon = new THREE.Mesh(beaconGeo, beaconMat);
                satMiniGroup.add(beacon);

                // Halo Ring
                const haloGeo = new THREE.RingGeometry(0.18, 0.24, 24);
                const haloMat = new THREE.MeshBasicMaterial({
                    color: colorHex,
                    transparent: true,
                    opacity: 0.7,
                    side: THREE.DoubleSide
                });
                const halo = new THREE.Mesh(haloGeo, haloMat);
                satMiniGroup.add(halo);

                satMiniGroup.scale.set(0.22, 0.22, 0.22);
                this.constellationSatellites[satId] = {
                    group: satMiniGroup,
                    halo: halo,
                    beacon: beacon,
                    info: satInfo
                };
                this.constellationGroup.add(satMiniGroup);
            }

            // Hide the mini-model if this satellite is currently the focused satellite
            if (satId === this.currentSatId) {
                this.constellationSatellites[satId].group.visible = false;
            } else {
                this.constellationSatellites[satId].group.visible = true;
            }
        });
    }

    updateConstellationSatellitePosition(satId, r_eci, quat = null) {
        if (!r_eci) return;
        const x = r_eci[0] * this.scaleRatio;
        const y = r_eci[2] * this.scaleRatio;
        const z = -r_eci[1] * this.scaleRatio;

        if (satId === this.currentSatId) {
            this.setSatelliteState(r_eci, quat);
            if (this.constellationSatellites[satId]) {
                this.constellationSatellites[satId].group.visible = false;
            }
        } else {
            const satObj = this.constellationSatellites[satId];
            if (satObj) {
                satObj.group.position.set(x, y, z);
                satObj.group.visible = true;
                if (satObj.halo) {
                    satObj.halo.lookAt(this.camera.position);
                }
            }
        }
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
        this.orbitLines.prediction = this.createOrbitLineMesh(0xfbbf24, 3.0, false);

        // Future Orbit Prediction: Nominal Reference Orbit (Cyan Dashed) & Perturbed Offset Orbit (Amber Glow)
        this.orbitLines.nominal = this.createOrbitLineMesh(0x38bdf8, 2.0, true);
        this.orbitLines.offset = this.createOrbitLineMesh(0xf59e0b, 3.2, false);

        // Spatial Offset Drift Line (Red/Orange Line connecting nominal and offset target points)
        const driftMat = new THREE.LineDashedMaterial({ color: 0xef4444, dashSize: 0.25, gapSize: 0.15, transparent: true, opacity: 0.95 });
        const driftGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
        this.offsetDriftLine = new THREE.Line(driftGeo, driftMat);
        this.offsetDriftLine.visible = false;
        this.scene.add(this.offsetDriftLine);
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

    showPredictionOrbit(eciPoints) {
        if (!this.orbitLines.prediction) {
            this.orbitLines.prediction = this.createOrbitLineMesh(0xfbbf24, 3.0, false);
        }
        this.updateOrbitGeometry('prediction', eciPoints);
        this.setOrbitVisibility('prediction', true);
    }

    showOffsetOrbitPrediction(nominalArc, offsetArc, nominalTarget, offsetTarget, driftMetrics) {
        if (nominalArc && nominalArc.length > 0) {
            this.updateOrbitGeometry('nominal', nominalArc);
            this.setOrbitVisibility('nominal', true);
        }
        if (offsetArc && offsetArc.length > 0) {
            this.updateOrbitGeometry('offset', offsetArc);
            this.setOrbitVisibility('offset', true);
        }

        // Draw dashed drift line between nominal and offset target positions
        if (nominalTarget && offsetTarget && nominalTarget.state_eci && offsetTarget.state_eci && this.offsetDriftLine) {
            const nomX = nominalTarget.state_eci[0] * this.scaleRatio;
            const nomY = nominalTarget.state_eci[2] * this.scaleRatio;
            const nomZ = -nominalTarget.state_eci[1] * this.scaleRatio;
            const offX = offsetTarget.state_eci[0] * this.scaleRatio;
            const offY = offsetTarget.state_eci[2] * this.scaleRatio;
            const offZ = -offsetTarget.state_eci[1] * this.scaleRatio;
            const pos = new Float32Array([nomX, nomY, nomZ, offX, offY, offZ]);
            this.offsetDriftLine.geometry.dispose();
            this.offsetDriftLine.geometry = new THREE.BufferGeometry();
            this.offsetDriftLine.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            this.offsetDriftLine.computeLineDistances();
            this.offsetDriftLine.visible = true;
        }

        // Show prediction target marker
        if (offsetTarget && offsetTarget.state_eci) {
            this.setPredictionTargetPoint(offsetTarget.state_eci);
        }

        // Show ghost satellite at predicted position WITHOUT moving the real satellite
        if (offsetTarget && offsetTarget.state_eci) {
            const quat = offsetTarget.attitude ? offsetTarget.attitude.quaternion : null;
            this.showGhostSatellite(offsetTarget.state_eci, quat);
        }
    }

    hidePredictionOrbit() {
        this.setOrbitVisibility('prediction', false);
        this.setOrbitVisibility('nominal', false);
        this.setOrbitVisibility('offset', false);
        if (this.offsetDriftLine) this.offsetDriftLine.visible = false;
        if (this.predictionTargetMarker) this.predictionTargetMarker.visible = false;
        this.hideGhostSatellite();
    }

    // =========================================================================
    // Ghost Satellite — semi-transparent predicted-position duplicate
    // =========================================================================
    initGhostSatellite() {
        // A simple octahedron stands in for the real model; replaced by a
        // low-poly translucent hull so it is always visible regardless of which
        // satellite model is loaded.
        const geo = new THREE.OctahedronGeometry(0.55, 1);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x38bdf8,
            emissive: 0x0ea5e9,
            emissiveIntensity: 0.6,
            transparent: true,
            opacity: 0.38,
            wireframe: false,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        this.ghostSatMesh = new THREE.Mesh(geo, mat);
        this.ghostSatMesh.visible = false;
        this.ghostSatMesh.renderOrder = 10;

        // Pulsating outer shell
        const shellGeo = new THREE.OctahedronGeometry(0.72, 1);
        const shellMat = new THREE.MeshBasicMaterial({
            color: 0x7dd3fc,
            transparent: true,
            opacity: 0.18,
            wireframe: true
        });
        this.ghostShellMesh = new THREE.Mesh(shellGeo, shellMat);
        this.ghostShellMesh.visible = false;
        this.ghostShellMesh.renderOrder = 11;

        this.ghostGroup = new THREE.Group();
        this.ghostGroup.add(this.ghostSatMesh);
        this.ghostGroup.add(this.ghostShellMesh);
        this.ghostGroup.visible = false;
        this.scene.add(this.ghostGroup);
    }

    showGhostSatellite(r_eci, quaternion) {
        if (!this.ghostGroup || !r_eci) return;
        const x = r_eci[0] * this.scaleRatio;
        const y = r_eci[2] * this.scaleRatio;
        const z = -r_eci[1] * this.scaleRatio;
        this.ghostGroup.position.set(x, y, z);
        this.ghostGroup.scale.set(0.22, 0.22, 0.22);
        if (quaternion) {
            this.ghostGroup.quaternion.set(
                quaternion[1], quaternion[3], -quaternion[2], quaternion[0]);
        }
        this.ghostSatMesh.visible = true;
        this.ghostShellMesh.visible = true;
        this.ghostGroup.visible = true;
    }

    hideGhostSatellite() {
        if (this.ghostGroup) this.ghostGroup.visible = false;
        if (this.ghostSatMesh) this.ghostSatMesh.visible = false;
        if (this.ghostShellMesh) this.ghostShellMesh.visible = false;
    }

    setPredictionTargetPoint(r_eci) {
        if (!r_eci) return;
        if (!this.predictionTargetMarker) {
            const group = new THREE.Group();
            
            // Glowing reticle ring
            const ringGeo = new THREE.RingGeometry(0.32, 0.40, 32);
            const ringMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            group.add(ring);
            
            // Center pulsating marker
            const beaconGeo = new THREE.SphereGeometry(0.14, 16, 16);
            const beaconMat = new THREE.MeshStandardMaterial({
                color: 0xf59e0b,
                emissive: 0xfbbf24,
                emissiveIntensity: 0.85,
                roughness: 0.15
            });
            const beacon = new THREE.Mesh(beaconGeo, beaconMat);
            group.add(beacon);

            this.scene.add(group);
            this.predictionTargetMarker = group;
        }

        const x = r_eci[0] * this.scaleRatio;
        const y = r_eci[2] * this.scaleRatio;
        const z = -r_eci[1] * this.scaleRatio;
        this.predictionTargetMarker.position.set(x, y, z);
        this.predictionTargetMarker.visible = true;
    }

    // =========================================================================
    // Aerospace Radar/Optical Observation Fix Entities (Ground Pass Tracking Reticles)
    // =========================================================================
    updateSyntheticObservationMarkers(obsList) {
        if (!this.syntheticMarkersGroup) return;

        while (this.syntheticMarkersGroup.children.length > 0) {
            const child = this.syntheticMarkersGroup.children[0];
            if (child.geometry) child.geometry.dispose();
            this.syntheticMarkersGroup.remove(child);
        }

        if (!obsList || obsList.length === 0) return;

        const textureLoader = new THREE.TextureLoader();
        const reticleTex = textureLoader.load('textures/obs_target_reticle.png');

        // Shared geometries & materials
        const coreGeo = new THREE.SphereGeometry(0.08, 16, 16);
        const coreMat = new THREE.MeshStandardMaterial({
            color: 0x0284c7,
            metalness: 0.90,
            roughness: 0.15
        });

        const lensGeo = new THREE.SphereGeometry(0.045, 12, 12);
        const lensMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });

        const ringGeo = new THREE.RingGeometry(0.16, 0.20, 32);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x06b6d4,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide
        });

        obsList.forEach(obs => {
            const pt = obs.pos_eci;
            if (pt) {
                const obsGroup = new THREE.Group();

                // 1. Central Radar Retro-Reflector Target Sphere
                const coreMesh = new THREE.Mesh(coreGeo, coreMat);
                obsGroup.add(coreMesh);

                // 2. Luminous Optical Sensor Core
                const lensMesh = new THREE.Mesh(lensGeo, lensMat);
                obsGroup.add(lensMesh);

                // 3. 3D Concentric Radar Range Ring
                const ringMesh = new THREE.Mesh(ringGeo, ringMat);
                ringMesh.rotation.x = Math.PI / 2;
                obsGroup.add(ringMesh);
                obsGroup.ringMesh = ringMesh;

                // 4. Tactical Radar Reticle Crosshair Sprite
                const spriteMat = new THREE.SpriteMaterial({
                    map: reticleTex,
                    color: 0x22d3ee,
                    transparent: true,
                    opacity: 0.92,
                    blending: THREE.AdditiveBlending
                });
                const reticleSprite = new THREE.Sprite(spriteMat);
                reticleSprite.scale.set(0.65, 0.65, 1.0);
                obsGroup.add(reticleSprite);
                obsGroup.reticleSprite = reticleSprite;

                obsGroup.position.set(pt[0] * this.scaleRatio, pt[2] * this.scaleRatio, -pt[1] * this.scaleRatio);
                this.syntheticMarkersGroup.add(obsGroup);
            }
        });
    }

    // =========================================================================
    // High-Fidelity Deep Space Satellite Ground Tracking Antenna Stations
    // =========================================================================
    createGroundStations() {
        this.stationMarkers = [];
        this.stationGroup = new THREE.Group();
        const textureLoader = new THREE.TextureLoader();

        const dishTex = textureLoader.load('textures/station_dish.png');
        const baseTex = textureLoader.load('textures/station_base.png');

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

            const stationRoot = new THREE.Group();

            // 1. Octagonal Concrete Base Building (hazard stripes & panel seams)
            const bunkerGeo = new THREE.CylinderGeometry(0.24, 0.29, 0.13, 8);
            const bunkerMat = new THREE.MeshStandardMaterial({
                map: baseTex,
                roughness: 0.70,
                metalness: 0.25
            });
            const bunker = new THREE.Mesh(bunkerGeo, bunkerMat);
            bunker.position.y = 0.065;
            stationRoot.add(bunker);

            // 2. Azimuth Turntable Bearing Ring
            const turntable = new THREE.Mesh(
                new THREE.CylinderGeometry(0.18, 0.19, 0.04, 16),
                new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.85, roughness: 0.20 })
            );
            turntable.position.y = 0.15;
            stationRoot.add(turntable);

            // 3. Central Yoke Pedestal & Az-El Gimbal
            const pedestal = new THREE.Mesh(
                new THREE.CylinderGeometry(0.07, 0.09, 0.12, 12),
                new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.65, roughness: 0.35 })
            );
            pedestal.position.y = 0.22;
            stationRoot.add(pedestal);

            // Dual Elevation Fork Stanchions
            const armGeo = new THREE.BoxGeometry(0.035, 0.16, 0.06);
            const armMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.70, roughness: 0.30 });
            const armL = new THREE.Mesh(armGeo, armMat);
            armL.position.set(-0.12, 0.27, 0);
            stationRoot.add(armL);
            const armR = new THREE.Mesh(armGeo, armMat);
            armR.position.set(0.12, 0.27, 0);
            stationRoot.add(armR);

            // 4. Parabolic Dish Assembly (Articulates in elevation)
            const dishAimGroup = new THREE.Group();
            dishAimGroup.position.set(0, 0.30, 0);

            // True Parabolic Lathe Surface
            const lathePoints = [];
            for (let i = 0; i <= 16; i++) {
                const r = (i / 16) * 0.28;
                const py = (r * r) / (0.28 * 0.28) * 0.07;
                lathePoints.push(new THREE.Vector2(r, py));
            }
            const dishGeo = new THREE.LatheGeometry(lathePoints, 32);
            const dishMat = new THREE.MeshStandardMaterial({
                map: dishTex,
                metalness: 0.65,
                roughness: 0.32,
                side: THREE.DoubleSide
            });
            const dish = new THREE.Mesh(dishGeo, dishMat);
            dish.rotation.x = Math.PI; // Concave side faces upward
            dishAimGroup.add(dish);

            // Backside Structural Truss Ring
            const trussRing = new THREE.Mesh(
                new THREE.TorusGeometry(0.27, 0.010, 8, 24),
                new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.80, roughness: 0.25 })
            );
            trussRing.rotation.x = Math.PI / 2;
            trussRing.position.y = -0.01;
            dishAimGroup.add(trussRing);

            // 5. Cassegrain Primary Feed Horn & Quadripod Support Struts
            const feedHorn = new THREE.Mesh(
                new THREE.CylinderGeometry(0.02, 0.032, 0.06, 12),
                new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.90, roughness: 0.15 })
            );
            feedHorn.position.y = 0.02;
            dishAimGroup.add(feedHorn);

            // Quadripod struts to focal sub-reflector
            const strutGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.24, 6);
            const strutMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.70, roughness: 0.30 });
            for (let a = 0; a < 4; a++) {
                const ang = a * (Math.PI / 2);
                const strut = new THREE.Mesh(strutGeo, strutMat);
                const rx = 0.22 * Math.cos(ang);
                const rz = 0.22 * Math.sin(ang);
                strut.position.set(rx * 0.5, 0.10, rz * 0.5);
                strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-rx, 0.18, -rz).normalize());
                dishAimGroup.add(strut);
            }

            // Cassegrain Sub-reflector Apex Cone
            const subReflector = new THREE.Mesh(
                new THREE.ConeGeometry(0.042, 0.032, 12),
                new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.85, roughness: 0.20 })
            );
            subReflector.position.y = 0.18;
            subReflector.rotation.x = Math.PI;
            dishAimGroup.add(subReflector);

            // Red FAA Obstruction Warning Beacon at apex
            const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff1e1e, transparent: true, opacity: 1.0 });
            const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), beaconMat);
            beacon.position.y = 0.205;
            dishAimGroup.add(beacon);

            // Default elevation tilt (~35 degrees)
            dishAimGroup.rotation.x = -Math.PI * 0.20;
            stationRoot.add(dishAimGroup);

            // Position and align station normal to Earth surface
            stationRoot.position.set(x, y, z);
            stationRoot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
            this.stationGroup.add(stationRoot);

            // 6. Cyan Radar Coverage Horizon Ground Ring
            const ringGeo = new THREE.RingGeometry(0.75, 0.82, 32);
            const ringMat = new THREE.MeshBasicMaterial({
                color: 0x06b6d4,
                transparent: true,
                opacity: 0.35,
                side: THREE.DoubleSide
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.set(x * 1.002, y * 1.002, z * 1.002);
            ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
            this.stationGroup.add(ring);

            this.stationMarkers.push({
                dishGroup: stationRoot,
                dishAimGroup: dishAimGroup,
                beaconMesh: beacon,
                ring: ring,
                name: st.name,
                position: new THREE.Vector3(x, y, z)
            });
        });

        this.earthMesh.add(this.stationGroup);
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
        const stWorld = new THREE.Vector3();
        st.dishGroup.getWorldPosition(stWorld);

        const positions = new Float32Array([
            stWorld.x, stWorld.y, stWorld.z,
            this.satGroup.position.x, this.satGroup.position.y, this.satGroup.position.z
        ]);
        this.trackingBeam.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.trackingBeam.visible = true;

        // Dynamically slew ground tracking dish towards satellite
        if (st.dishAimGroup && st.dishGroup) {
            const worldSat = this.satGroup.position.clone();
            const localSat = st.dishGroup.worldToLocal(worldSat);
            st.dishAimGroup.lookAt(localSat);
        }
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
            this.viewFrame = 'ECI';
            this.controls.minDistance = 10.4;
            this.controls.maxDistance = 1200.0;
            this.controls.target.set(0, 0, 0);
            this.controls.enableRotate = true;
        } else if (mode === 'ECEF') {
            this.viewFrame = 'ECEF';
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
            this.controls.minDistance = 0.2;
            this.controls.maxDistance = 20.0;
            if (this.satGroup) {
                this.controls.target.copy(this.satGroup.position);
                const satPos = this.satGroup.position.clone();
                this.camera.position.copy(satPos).add(new THREE.Vector3(0.55, 0.28, 0.65));
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
        if (r_eci) {
            const x = r_eci[0] * this.scaleRatio;
            const y = r_eci[2] * this.scaleRatio;
            const z = -r_eci[1] * this.scaleRatio;
            this.satGroup.position.set(x, y, z);
        }

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

        // 0. ECEF Camera Frame Sync (Keep camera locked with Earth's real-time rotation)
        if (this.viewFrame === 'ECEF' && this.lastGmstRad !== undefined && this.currentGmstRad !== undefined) {
            const deltaGmst = this.currentGmstRad - this.lastGmstRad;
            if (Math.abs(deltaGmst) > 1e-9 && Math.abs(deltaGmst) < 0.25) {
                const x = this.camera.position.x;
                const z = this.camera.position.z;
                const cosD = Math.cos(deltaGmst);
                const sinD = Math.sin(deltaGmst);
                this.camera.position.x = x * cosD + z * sinD;
                this.camera.position.z = -x * sinD + z * cosD;
            }
        }
        this.lastGmstRad = this.currentGmstRad;

        const nowSec = performance.now() * 0.001;

        // 1a. Earth self-rotation — frame-level wall-clock GMST drive.
        //     Ensures Earth spins continuously at the true sidereal rate
        //     (1 rev / 86164.1 s) regardless of simulation playback state.
        //     tick() in main.js overrides with the authoritative epoch-locked
        //     GMST; this fills the gap between tick() calls (every ~33ms).
        {
            const nowMs  = Date.now();
            const dtMs   = this._lastFrameMs !== undefined ? (nowMs - this._lastFrameMs) : 0;
            this._lastFrameMs = nowMs;
            // Sidereal angular velocity: 2π / 86164.1 rad/s
            const OMEGA_EARTH = 7.2921150e-5; // rad/s
            if (dtMs > 0 && dtMs < 200) {
                const dtSec = dtMs * 0.001;
                if (this.earthMesh) {
                    this.earthMesh.rotation.y += OMEGA_EARTH * dtSec;
                    this.currentGmstRad = this.earthMesh.rotation.y;
                }
                if (this.cloudsMesh) {
                    // Clouds rotate slightly faster than the surface
                    this.cloudsMesh.rotation.y += OMEGA_EARTH * dtSec * 1.002;
                }
            }
        }

        // 1b. Ghost satellite pulsation
        if (this.ghostGroup && this.ghostGroup.visible && this.ghostShellMesh) {
            const pulse = 0.20 + 0.06 * Math.sin(nowSec * 2.8);
            this.ghostShellMesh.material.opacity = pulse;
            const scalePulse = 0.20 + 0.02 * Math.sin(nowSec * 2.0);
            this.ghostGroup.scale.setScalar(scalePulse);
        }

        // 2. Dynamic Earth Day/Night Shader Animation (City Lights Twinkle)
        if (this.earthUniforms) {
            this.earthUniforms.uTime.value = nowSec;
        }

        // 3. Dynamic Sun Photosphere & Corona Streamers Animation
        if (this.sunUniforms) {
            this.sunUniforms.uTime.value = nowSec;
        }
        if (this.sunFlareSprite) {
            this.sunFlareSprite.material.rotation += 0.0003;
            const flarePulse = 135.0 + 3.5 * Math.sin(nowSec * 1.6);
            this.sunFlareSprite.scale.set(flarePulse, flarePulse, 1.0);
        }

        // 4. Ground Tracking Stations FAA Obstruction Beacons & Slew Tracking
        const beaconBlink = Math.sin(nowSec * 5.0) > 0.0;
        if (this.stationMarkers) {
            this.stationMarkers.forEach(st => {
                if (st.beaconMesh) {
                    st.beaconMesh.material.opacity = beaconBlink ? 1.0 : 0.2;
                }
            });
        }

        // 5. Tactical Radar Observation Markers Pulse & Reticle Rotation
        if (this.syntheticMarkersGroup && this.syntheticMarkersGroup.children.length > 0) {
            this.syntheticMarkersGroup.children.forEach((child, idx) => {
                if (child.ringMesh) {
                    child.ringMesh.rotation.z += 0.015;
                }
                if (child.reticleSprite) {
                    const scalePulse = 0.65 + 0.04 * Math.sin(nowSec * 3.5 + idx * 1.2);
                    child.reticleSprite.scale.set(scalePulse, scalePulse, 1.0);
                }
            });
        }

        // Camera follow & closeup mode tracking
        if ((this.cameraMode === 'FOLLOW' || this.cameraMode === 'CLOSEUP') && this.satGroup) {
            this.controls.target.lerp(this.satGroup.position, 0.15);
        } else if (this.cameraMode === 'STATION' && this.satGroup) {
            this.controls.target.lerp(this.satGroup.position, 0.1);
        }

        // Update tracking laser beam & antenna boresight alignment
        if (this.trackingBeam && this.trackingBeam.visible && this.activeStation && this.satGroup) {
            const st = this.activeStation;
            const stWorld = new THREE.Vector3();
            st.dishGroup.getWorldPosition(stWorld);

            const positions = new Float32Array([
                stWorld.x, stWorld.y, stWorld.z,
                this.satGroup.position.x, this.satGroup.position.y, this.satGroup.position.z
            ]);
            this.trackingBeam.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

            // Continuously orient dish towards satellite during tracking pass
            if (st.dishAimGroup && st.dishGroup) {
                const worldSat = this.satGroup.position.clone();
                const localSat = st.dishGroup.worldToLocal(worldSat);
                st.dishAimGroup.lookAt(localSat);
            }
        }

        // Thruster flicker
        if (this.thrusterFlame && this.thrusterFlame.material.opacity > 0) {
            this.thrusterFlame.scale.set(0.9 + Math.random() * 0.3, 0.8 + Math.random() * 0.4, 0.9 + Math.random() * 0.3);
        }

        this.renderer.render(this.scene, this.camera);
    }
}
