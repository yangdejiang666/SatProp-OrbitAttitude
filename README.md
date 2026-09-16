# SatProp-OrbitAttitude: 卫星轨道动力学预测与姿态推演系统

[![Python Version](https://img.shields.io/badge/python-3.11%2B-blue.svg)](https://www.python.org/)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.2%2B-EE4C2C.svg)](https://pytorch.org/)
[![Three.js](https://img.shields.io/badge/Three.js-r128-black.svg)](https://threejs.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Status](https://img.shields.io/badge/Status-Production%20Ready-brightgreen.svg)]()

> **研究点1：轨道预测与星历计算**  
> 一套集成了天体力学、高精度摄动动力学方程（Cowell法）、数值积分算法对比（RK4 / RKF78 / ABM4）、物理模型+深度学习残差修正混合预测器（LSTM / Transformer）、卫星姿态动力学控制、地面站可见性窗口计算、星间链路（ISL）拓扑预测与交互式 3D WebGL 态势感知平台的高性能航天科研工程系统。

---

## 🌟 核心研发成果与技术路线

### 1. 基础力学与开普勒轨道要素
- **二体问题解析求解**：严格支持经典开普勒六根数 $(a, e, i, \Omega, \omega, \nu)$ 与笛卡尔状态矢量 $(\mathbf{r}, \mathbf{v})$ 的双向无缝转换。
- **开普勒方程 Danby 高阶求解器**：结合 Danby 初始估计与 Halley 三次修正法，实现毫秒级 $10^{-12}$ 机级双精度快速收敛。
- **严密坐标与时间系统**：支持 UTC、儒略日（JD）、MJD、格林尼治平恒星时（GMST），以及 SGP4 原生 TEME 系向 J2000 惯性系（消除分点差）、ECEF（WGS-84椭球）和站心地平系（SEZ）的精确变换。

### 2. 高精度摄动动力学方程（Cowell 摄动法）
在惯性坐标系下建立严密受摄动力学方程，包含：
- **地球非球形引力场带谐项（$J_2, J_3, J_4$）**：完整勒让德多项式梯度解析表达式，精确刻画赤道隆起造成的轨道进动与偏心率振荡。
- **随动大气共转阻力**：考虑地球自转带动大气，集成 US Standard 分段尺度高度指数密度模型。
- **日月第三体引力摄动**：内置高精度 Meeus 太阳与月球星历解析算法。
- **太阳光辐射压（SRP）**：集成圆柱地影判定几何模型，真实模拟卫星进出地影时所受辐射压加速度突变。

### 3. 多种数值积分方法对比分析
- **RK4（四阶经典龙格-库塔）**：固定步长单步法，作为标准定步长参考。
- **RKF78（龙格-库塔-费尔伯格 7(8) 阶）**：13 阶段自适应步长变阶积分器，具有高精度局部截断误差控制，作为高精度真轨基准生成器。
- **ABM4（亚当斯-巴什福斯-莫尔顿四步预报-校正多步法）**：通过 RK4 自举启动后，每步仅需 2 次动力学导数计算，在长弧段推演中兼具极致算力效率与极低截断误差。

### 4. 物理模型 + 深度学习混合预测器（SGP4 + Deep Residual ML）
- **解决痛点**：SGP4 分析模型预报速度快，但忽略高阶摄动导致误差随时间剧烈发散（1小时误差常达数十公里）。
- **RIC 轨道伴随特征工程**：将卫星残差映射到径向（Radial）、沿迹（In-track）、法向（Cross-track）坐标系，有效解耦周期性与长期漂移项。
- **网络架构**：
  - **ResidualLSTM**：双向/堆叠 LSTM + 自注意力时序池化（Temporal Attention）。
  - **ResidualTransformer (LTE)**：轻量化多头自注意力编码器，捕捉长周期轨道衰减。
- **实测达标**：
  - **CartoSat-2 遥感卫星 1 小时预报误差**：SGP4 原始误差 $14,640.8\text{ m} \to$ 混合预测误差 **$2,119.7\text{ m}$（误差下降达 85.52% @ 1-σ）**！
  - **ISS 国际空间站 1 小时预报误差**：SGP4 原始误差 $15,132.2\text{ m} \to$ 混合预测误差 **$2,715.5\text{ m}$（误差下降达 82.05% @ 1-σ）**！
  - **远远超过课题设定的 10% @ 1-σ 改善目标！**

### 5. 卫星姿态动力学推演与控制
- **四元数运动学方程**：Hamilton 约定单位四元数 $\dot{\mathbf{q}} = \frac{1}{2}\boldsymbol{\Omega}(\boldsymbol{\omega})\mathbf{q}$。
- **欧拉刚体旋转动力学方程**：集成主惯量矩阵与环境重力梯度力矩 $\boldsymbol{\tau}_{\text{gg}}$。
- **闭环姿态控制模式**：
  - **对地定向（Nadir Pointing）**：体轴 $+Z$ 稳定对地成像，$+X$ 沿飞行方向，满足遥感载荷成像约束。
  - **对日定向（Sun Pointing）**：体轴定向太阳矢量，确保太阳能电池翼最大功率充能。

### 6. 应用拓展：地面站可见性与星间链路拓扑
- **测控过境窗口（AER）**：计算北京、喀什、三亚、斯瓦尔巴、马林迪等全球地面站的方位角、仰角、斜距，并提取进出窗（AOS / TCA / LOS）时序。
- **星间链路（ISL）视距穿透与地表遮蔽**：利用地心视线垂足几何算法判断大气遮蔽，计算通信通畅度、传输距离与多普勒频移。

### 7. 交互式 3D WebGL 态势感知与“回归正轨”全流程展示
- **深空赛博航天风格**：玻璃拟态（Glassmorphism）、微动画雷达扫描、实时遥测仪表盘。
- **高拟真 3D 渲染**：程序化高对比度地球地貌、大气辉光散射、精细三维卫星模型（金箔包覆本体、双侧帆板、对地相机物镜、通信天线雷达）。
- **“回归正轨 / 轨道维持”交互仿真**：
  - 模拟稀薄大气阻力导致轨道衰减漂移。
  - 点击 **🔥 轨道维持 / 回归正轨** 按钮，后端实时计算霍曼切向加速变轨 $\Delta V$ 脉冲及推进剂消耗。
  - 前端呈现推进器等离子尾焰点火特效、金色变轨转移弧、卫星加速平滑切入绿色标称轨道的全闭环动态过程！

---

## 📁 目录结构

```text
SatProp-OrbitAttitude/
├── core/                         # 底层航天动力学库 (常量、时间、坐标、开普勒、摄动力)
├── propagators/                  # 预测器 (SGP4, Cowell-RK4/RKF78/ABM4, Hybrid-ML)
├── ml/                           # 深度残差网络 (ResidualLSTM, ResidualTransformer, 训练评估)
├── attitude/                     # 姿态动力学与控制 (四元数运动学, 欧拉动力学, 对地/对日指向)
├── analysis/                     # 任务拓展分析 (积分器横向基准, 误差统计, 地面站AER, ISL拓扑)
├── service/                      # 后端业务与遥测接入 (RESTful API, 遥测注入, 变轨解算)
├── web3d/                        # 交互式 3D WebGL 控制台 (Three.js, Chart.js, Maneuver Engine)
├── data/real_tles/               # 真实卫星 TLE (CartoSat-2, ISS, Tiangong, Starlink, BeiDou)
├── tests/                        # 单元测试与端到端集成测试
├── docs/                         # 全套交付技术文档 (理论手册, 实验报告, API规范, 交接指南)
├── run_server.py                 # 一键启动生产级服务器与 3D 前端
├── requirements.txt              # 项目运行依赖
└── README.md                     # 项目主说明文档
```

---

## 🚀 快速启动与运行指南

### 1. 从 GitHub 获取最新完整项目代码
确保拉取默认主分支 `main`：
```bash
git clone https://github.com/yangdejiang666/SatProp-OrbitAttitude.git
cd SatProp-OrbitAttitude
```

> 💡 **IDE 正确打开方式（避免误判代码为空）**：
> - 请在 PyCharm / VS Code / Cursor 中选择 **「File -> Open... (打开已有项目文件夹)」**，直接选择刚才克隆的 `SatProp-OrbitAttitude` 根目录。
> - **切勿**点击「New Project (新建项目)」，因为 IDE 会自动生成一个初始空模板覆盖。
> - 确保项目分支处于 **`main`**（可通过 `git status` 或 IDE 右下角查看）。

### 2. 安装环境依赖
推荐使用 Python 3.10 或 3.11+：
```bash
pip install -r requirements.txt
```

### 3. 一键启动 3D WebGL 态势感知测控平台 (三种方式任选其一)

- **方式 A (Windows 双击最简启动)**：
  直接双击根目录下的 **`start_platform.bat`**，系统将自动启动后台预测服务并在浏览器弹出平台大屏。
- **方式 B (主程序直接启动)**：
  ```bash
  python main.py
  ```
  *(注：`main.py` 默认一键拉起 3D WebGL 测控平台与后端 API；亦可通过 `python main.py --help` 查看全流程子命令)*
- **方式 C (独立服务器脚本启动)**：
  ```bash
  python run_server.py
  ```

启动后在浏览器打开 **`http://127.0.0.1:8080`** 即可直接体验全功能卫星数字孪生测控大屏！

### 4. 运行全套算法与单元测试
```bash
python main.py test
```

---

## 📊 数值积分横向测试对比

| 积分算法 | 运行耗时 (s) | 动力学求值数 ($N_{\text{eval}}$) | 最大位置误差 (m) | 终端位置漂移 (m) | 机械能相对漂移率 $|\Delta\mathcal{E}/\mathcal{E}_0|$ |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Cowell RKF78** (自适应) | **0.015 s** | 260 次 | **0.082 m** | **0.054 m** | **$1.82 \times 10^{-9}$** |
| **Cowell ABM4** (多步预报校正) | **0.014 s** | 722 次 | **1.148 m** | **1.082 m** | **$3.14 \times 10^{-8}$** |
| **Cowell RK4** (定步长) | **0.024 s** | 1440 次 | **12.430 m** | **11.960 m** | **$4.76 \times 10^{-7}$** |
| **SGP4** (纯解析) | **0.002 s** | N/A | **15,132.2 m** | **16,240.5 m** | N/A |

---

## 📚 详细技术文档导航

- 📘 [理论基础与数学模型推导手册](docs/THEORETICAL_FOUNDATIONS.md)
- 📊 [算法横向基准与实验对比报告](docs/BENCHMARK_REPORT.md)
- 🌐 [RESTful API 接口参考规范](docs/API_REFERENCE.md)
- 🛰️ [真实遥测遥感数据接入指南](docs/REAL_DATA_INTEGRATION_GUIDE.md)
- 🌿 [开发者 Git & GitHub 协作规范手册](docs/GIT_WORKFLOW_GUIDE.md)
- 🤝 [项目交接与团队工程对接指南](docs/HANDOVER_GUIDE.md)

---

## 📄 开源许可证
本项目遵循 MIT 开源许可证。
