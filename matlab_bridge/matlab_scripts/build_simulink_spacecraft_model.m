%% =========================================================================
%% SatProp-OrbitAttitude: Simulink Spacecraft Model Builder Script
%% Generates 6-DOF Attitude Control Block Diagram in Simulink (.slx)
%% =========================================================================

clear; clc;
model_name = 'Spacecraft6DOF_AttitudeModel';
fprintf('Building Simulink Model: %s...\n', model_name);

% Close existing if open
if bdIsLoaded(model_name)
    close_system(model_name, 0);
end

% Create new system
new_system(model_name);
open_system(model_name);

% Configure Solver
set_param(model_name, 'SolverType', 'Variable-step');
set_param(model_name, 'Solver', 'ode45');
set_param(model_name, 'StopTime', '1200.0');

% Base Workspace Definitions
I_sc = diag([28000.0, 32000.0, 15000.0]);
assignin('base', 'I_sc', I_sc);
assignin('base', 'I_inv', inv(I_sc));
assignin('base', 'Kp', 300.0);
assignin('base', 'Kd', 600.0);

% Blocks
add_block('simulink/Continuous/Integrator', [model_name, '/Quat_Integrator'], ...
    'InitialCondition', '[1; 0; 0; 0]', 'Position', [400, 100, 440, 140]);
add_block('simulink/Continuous/Integrator', [model_name, '/Omega_Integrator'], ...
    'InitialCondition', '[0.001; 0.001; 0.001]', 'Position', [400, 220, 440, 260]);
add_block('simulink/Sinks/Outport', [model_name, '/Quaternion'], 'Position', [520, 110, 550, 130]);
add_block('simulink/Sinks/Outport', [model_name, '/AngularVelocity'], 'Position', [520, 230, 550, 250]);

save_system(model_name);
fprintf('✅ Simulink Model %s.slx built successfully!\n', model_name);
