"""
NASA General Mission Analysis Tool (GMAT) Script Generator & Audit Bridge
========================================================================
Synthesizes valid NASA GMAT (.script) mission definition files compliant with:
- NASA GSFC GMAT R2022a / R2020a
- High-precision numerical integrators (PrinceDormand78, RungeKutta89)
- Earth gravity harmonics (JGM-2 / EGM-96 up to degree/order 4x4 or 8x8)
- Atmospheric density models (Jacchia-Roberts / MSISE-90)
- Third-body gravitational perturbations (Sun, Moon)
- Solar Radiation Pressure (Spherical model)
"""

from typing import Dict, Any, List, Optional
import numpy as np


class GMATMissionBridge:
    """
    Constructs NASA GMAT mission scripts for independent institutional verification.
    """

    @classmethod
    def generate_gmat_script(
        cls,
        sat_name: str = "CSS_Tiangong",
        epoch_str: str = "01 Jan 2026 12:00:00.000",
        state_eci: Optional[List[float]] = None,
        dry_mass_kg: float = 66000.0,
        drag_coeff_cd: float = 2.2,
        drag_area_m2: float = 45.0,
        srp_coeff_cr: float = 1.8,
        srp_area_m2: float = 60.0,
        duration_days: float = 1.0,
        step_size_s: float = 60.0,
    ) -> str:
        """
        Generates standard, executable NASA GMAT mission script.
        """
        if state_eci is None:
            # Nominal Tiangong state [X, Y, Z, Vx, Vy, Vz] in km and km/s
            r_km = [-4444.629, 5100.168, -0.396]
            v_km_s = [-5.772, -5.029, 0.0]
        else:
            r_km = [round(state_eci[0] / 1000.0, 4), round(state_eci[1] / 1000.0, 4), round(state_eci[2] / 1000.0, 4)]
            v_km_s = [round(state_eci[3] / 1000.0, 5), round(state_eci[4] / 1000.0, 5), round(state_eci[5] / 1000.0, 5)]

        script = f"""%--------------------------------------------------------------------------
% NASA Goddard Space Flight Center - General Mission Analysis Tool (GMAT)
% Mission Verification Script for SatProp-OrbitAttitude
% Generated for Spacecraft: {sat_name}
%--------------------------------------------------------------------------

%--------------------------------------------------------------------------
% Spacecraft Configuration
%--------------------------------------------------------------------------
Create Spacecraft {sat_name};
GMAT {sat_name}.DateFormat = UTCGregorian;
GMAT {sat_name}.Epoch = '{epoch_str}';
GMAT {sat_name}.CoordinateSystem = EarthMJ2000Eq;
GMAT {sat_name}.DisplayStateType = Cartesian;
GMAT {sat_name}.X = {r_km[0]};
GMAT {sat_name}.Y = {r_km[1]};
GMAT {sat_name}.Z = {r_km[2]};
GMAT {sat_name}.VX = {v_km_s[0]};
GMAT {sat_name}.VY = {v_km_s[1]};
GMAT {sat_name}.VZ = {v_km_s[2]};
GMAT {sat_name}.DryMass = {dry_mass_kg};
GMAT {sat_name}.Cd = {drag_coeff_cd};
GMAT {sat_name}.DragArea = {drag_area_m2};
GMAT {sat_name}.Cr = {srp_coeff_cr};
GMAT {sat_name}.SRPArea = {srp_area_m2};

%--------------------------------------------------------------------------
% Propagators & Force Models
%--------------------------------------------------------------------------
Create ForceModel HighFidelityForceModel;
GMAT HighFidelityForceModel.CentralBody = Earth;
GMAT HighFidelityForceModel.PrimaryBodies = {{Earth}};
GMAT HighFidelityForceModel.PointMasses = {{Luna, Sun}};
GMAT HighFidelityForceModel.SRP = On;
GMAT HighFidelityForceModel.RelativisticCorrection = Off;
GMAT HighFidelityForceModel.ErrorControl = RSSStep;

GMAT HighFidelityForceModel.GravityField.Earth.Type = JGM2;
GMAT HighFidelityForceModel.GravityField.Earth.Degree = 4;
GMAT HighFidelityForceModel.GravityField.Earth.Order = 4;

GMAT HighFidelityForceModel.Drag.AtmosphereModel = JacchiaRoberts;
GMAT HighFidelityForceModel.Drag.HistoricWeatherSource = ConstantFluxAndGeoMag;

Create Propagator PrinceDormand78;
GMAT PrinceDormand78.FM = HighFidelityForceModel;
GMAT PrinceDormand78.Type = PrinceDormand78;
GMAT PrinceDormand78.InitialStepSize = {step_size_s};
GMAT PrinceDormand78.Accuracy = 1e-11;
GMAT PrinceDormand78.MinStep = 0.01;
GMAT PrinceDormand78.MaxStep = 300;
GMAT PrinceDormand78.MaxStepAttempts = 50;

%--------------------------------------------------------------------------
% Coordinate Systems & Views
%--------------------------------------------------------------------------
Create CoordinateSystem EarthFixed;
GMAT EarthFixed.Origin = Earth;
GMAT EarthFixed.Axes = BodyFixed;

Create OrbitView Enhanced3DView;
GMAT Enhanced3DView.SolverIterations = Current;
GMAT Enhanced3DView.UpperLeft = [ 0.1 0.1 ];
GMAT Enhanced3DView.Size = [ 0.8 0.8 ];
GMAT Enhanced3DView.Add = {{ {sat_name}, Earth, Luna }};
GMAT Enhanced3DView.CoordinateSystem = EarthMJ2000Eq;
GMAT Enhanced3DView.ViewPointRef = Earth;
GMAT Enhanced3DView.ViewPointVector = [ 0 0 30000 ];
GMAT Enhanced3DView.ViewDirection = Earth;

Create ReportFile TrajectoryAuditReport;
GMAT TrajectoryAuditReport.Filename = '{sat_name}_GMAT_Audit.txt';
GMAT TrajectoryAuditReport.Precision = 16;
GMAT TrajectoryAuditReport.Add = {{ {sat_name}.A1ModJulian, {sat_name}.EarthMJ2000Eq.X, {sat_name}.EarthMJ2000Eq.Y, {sat_name}.EarthMJ2000Eq.Z, {sat_name}.EarthMJ2000Eq.VX, {sat_name}.EarthMJ2000Eq.VY, {sat_name}.EarthMJ2000Eq.VZ }};

%--------------------------------------------------------------------------
% Mission Sequence
%--------------------------------------------------------------------------
BeginMissionSequence;
Propagate PrinceDormand78({sat_name}) {{ {sat_name}.ElapsedDays = {duration_days} }};
"""
        return script


def generate_gmat_script(**kwargs) -> str:
    return GMATMissionBridge.generate_gmat_script(**kwargs)
