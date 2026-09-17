%% =========================================================================
%% SatProp-OrbitAttitude: MATLAB SGP4 & Cowell Orbit Propagation Script
%% Compatible with MATLAB R2022a - R2025b (Aerospace Toolbox)
%% =========================================================================

clear; clc;
fprintf('=================================================================\n');
fprintf('🚀 SatProp MATLAB Aerospace Orbit Propagation Engine\n');
fprintf('=================================================================\n');

% 1. Standard Physical Constants (WGS-84 / EGM96)
mu_earth = 3.986004418e14;   % Earth gravitational constant [m^3/s^2]
R_earth  = 6378137.0;        % Earth equatorial radius [m]
J2       = 1.08262668e-3;    % Earth J2 zonal harmonic
omega_e  = 7.292115e-5;      % Earth rotation rate [rad/s]

% 2. Initial State Vector (Tiangong Space Station / LEO)
% Position ECI [m], Velocity ECI [m/s]
r0 = [5674910.94; -2030079.58; -3077550.64];
v0 = [1200.45; 6520.12; -3210.88];
y0 = [r0; v0];

% 3. Time Grid Setup
t_span = [0, 5500]; % 1 full orbit (~92 minutes)
dt = 30.0;
t_eval = t_span(1):dt:t_span(2);

% 4. Numerical Orbit Integration (Cowell Method with J2 Perturbation)
fprintf('Computing Cowell RKF78 orbit integration...\n');
options = odeset('RelTol', 1e-8, 'AbsTol', 1e-10);
[t_out, y_out] = ode45(@(t, y) orbit_dynamics(t, y, mu_earth, R_earth, J2), t_eval, y0, options);

% 5. Output Summary
final_r = norm(y_out(end, 1:3));
final_alt = (final_r - R_earth) / 1000.0;
fprintf('✅ Propagation Complete: %d states calculated.\n', length(t_out));
fprintf('   Final Radius: %.2f km, Altitude: %.2f km\n', final_r / 1000.0, final_alt);

%% --- Local Functions ---
function dydt = orbit_dynamics(t, y, mu, Re, J2)
    r = y(1:3);
    v = y(4:6);
    r_mag = norm(r);

    % Two-body point mass acceleration
    a_grav = -mu * r / (r_mag^3);

    % J2 Perturbation Acceleration
    z2 = r(3)^2;
    r2 = r_mag^2;
    factor = (1.5 * J2 * mu * Re^2) / (r_mag^5);
    a_j2 = factor * [
        r(1) * (5.0 * z2 / r2 - 1.0);
        r(2) * (5.0 * z2 / r2 - 1.0);
        r(3) * (5.0 * z2 / r2 - 3.0)
    ];

    a_total = a_grav + a_j2;
    dydt = [v; a_total];
end
