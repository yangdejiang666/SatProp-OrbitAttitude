%% =========================================================================
%% SatProp-OrbitAttitude: MATLAB Spacecraft 6-DOF Attitude Control Script
%% Quaternions, Euler Angles, Gyroscopic Couplings & Reaction Wheel Control
%% =========================================================================

clear; clc;
fprintf('=================================================================\n');
fprintf('🔄 Spacecraft 6-DOF Attitude Control Simulation (MATLAB/Simulink)\n');
fprintf('=================================================================\n');

% Inertia Matrix [kg * m^2]
I_sc = diag([28000.0, 32000.0, 15000.0]);
I_inv = inv(I_sc);

% Controller Gains
Kp = 320.0;
Kd = 750.0;

% Initial Attitude State: [q0; q1; q2; q3; wx; wy; wz; hwx; hwy; hwz]
q0 = [1.0; 0.05; -0.03; 0.02];
q0 = q0 / norm(q0);
w0 = [0.002; -0.001; 0.003]; % rad/s
h0 = [0.0; 0.0; 0.0];
state0 = [q0; w0; h0];

t_span = [0, 600]; % 10 minutes simulation
[t_out, state_out] = ode45(@(t, s) att_dynamics(t, s, I_sc, I_inv, Kp, Kd), t_span, state0);

fprintf('✅ Simulation Finished: Final Quaternion [%.4f, %.4f, %.4f, %.4f]\n', ...
    state_out(end, 1), state_out(end, 2), state_out(end, 3), state_out(end, 4));

function dsdt = att_dynamics(t, s, I, I_inv, Kp, Kd)
    q = s(1:4) / norm(s(1:4));
    w = s(5:7);
    hw = s(8:10);

    % Quaternion Kinematics
    Omega = [
         0,    -w(1), -w(2), -w(3);
        w(1),   0,     w(3), -w(2);
        w(2), -w(3),   0,     w(1);
        w(3),  w(2),  -w(1),  0
    ];
    q_dot = 0.5 * Omega * q;

    % Control Torque (PD law)
    q_err = q(2:4) * sign(q(1));
    T_ctrl = -Kp * q_err - Kd * w;
    T_ctrl = max(min(T_ctrl, 0.25), -0.25); % Torque saturation

    % Euler Equation
    H_tot = I * w + hw;
    w_dot = I_inv * (T_ctrl - cross(w, H_tot));
    hw_dot = -T_ctrl;

    dsdt = [q_dot; w_dot; hw_dot];
end
