# SatProp-OrbitAttitude 开发者 Git & GitHub 协作规范手册

欢迎加入 **SatProp-OrbitAttitude**（卫星轨道动力学预测与姿态推演系统）研发团队！  
为了保证科研代码的高质量演进、实验可复现性以及多人在同一个代码仓库中的协同效率，请各位开发人员在开展工作前仔细阅读本手册。

---

## 📌 0. 仓库基本信息与开发准备

- **GitHub 仓库主页**：[`https://github.com/yangdejiang666/SatProp-OrbitAttitude`](https://github.com/yangdejiang666/SatProp-OrbitAttitude)
- **HTTPS 克隆地址**：`https://github.com/yangdejiang666/SatProp-OrbitAttitude.git`
- **SSH 克隆地址**：`git@github.com:yangdejiang666/SatProp-OrbitAttitude.git`
- **接受协作者邀请**：
  - 如果项目负责人已向你发送邀请，请查收你的 GitHub 绑定邮箱并点击 **Accept Invitation**。
  - 或者直接在已登录 GitHub 的浏览器中访问：[`https://github.com/yangdejiang666/SatProp-OrbitAttitude/invitations`](https://github.com/yangdejiang666/SatProp-OrbitAttitude/invitations) 进行确认接受。

---

## 📥 1. 拉取相应的文件（Clone & Pull）

### 1.1 首次克隆完整项目到本地
在你希望存放项目的本地文件夹下打开终端（Windows PowerShell 或 Git Bash），执行：
```bash
# 使用 HTTPS 克隆
git clone https://github.com/yangdejiang666/SatProp-OrbitAttitude.git

# 进入项目目录
cd SatProp-OrbitAttitude
```

克隆完成后，安装依赖并验证环境：
```bash
# 安装 Python 依赖
pip install -r requirements.txt

# 运行自动化测试套件验证环境是否正常
py -3 main.py test
```

---

### 1.2 日常开发：同步远程最新更新
在每次开始新一天的编码或着手写新功能之前，**务必先拉取远程最新代码**，避免落后主干产生严重冲突：
```bash
# 切换到主分支
git checkout main

# 拉取最新代码并合并
git pull origin main
```

> **💡 进阶建议（推荐使用 rebase 保持提交历史整洁）**：
> ```bash
> git pull --rebase origin main
> ```

---

### 1.3 放弃本地未提交的修改，恢复特定文件
如果本地不小心改乱了某个文件，想重新从仓库中恢复为最新版本：
```bash
# 仅恢复单个文件（例如恢复 run_pipeline.py）
git restore run_pipeline.py

# 恢复整个目录的文件
git restore core/
```

---

### 1.4 本地有正在修改的内容，临时需要拉取最新代码
如果代码写到一半不想提交，但急需拉取远程更新：
```bash
# 1. 暂存当前未完成的工作
git stash

# 2. 拉取最新代码
git pull origin main

# 3. 恢复刚才暂存的工作
git stash pop
```

---

## 📤 2. 上传文件与提交变更（Add, Commit & Push）

### 2.1 查看文件变动状态
随时可以使用以下命令查看当前修改了哪些文件、有哪些新增文件：
```bash
# 查看工作区变动概要
git status

# 查看具体的行级别改动差异
git diff
```

---

### 2.2 暂存文件（Stage）
把需要提交的文件加入暂存区：
```bash
# 方式 A：暂存指定文件（推荐，精准提交）
git add core/constants.py propagators/unified_predictor.py

# 方式 B：暂存全部改动文件
git add .
```

---

### 2.3 提交文件到本地版本库（Commit）
提交时必须附带清晰、规范的提交信息（建议采用行业通用的 Conventional Commits 规范）：
```bash
git commit -m "feat(propagator): 加入日月第三体引力摄动计算模块"
```

#### 常用提交类型前缀规范：
| 前缀 | 说明 | 示例 |
| :--- | :--- | :--- |
| `feat:` | 新增功能或算法模块 | `feat(models): 新增 Transformer 轨道残差学习网络` |
| `fix:` | 修复已知 Bug 或算法精度漂移 | `fix(integrator): 修复 RKF78 阶数步长溢出问题` |
| `refactor:` | 代码重构（不改变功能逻辑） | `refactor(core): 优化坐标系转换性能与内存占用` |
| `perf:` | 性能优化 | `perf(math): 使用 Numba 加速引力势梯度计算` |
| `test:` | 新增或修改单元测试 | `test(attitude): 补全四元数姿态积分单测用例` |
| `docs:` | 文档更新 | `docs: 更新理论模型推导与 API 参考文档` |

---

### 2.4 推送本地提交到远程 GitHub 仓库（Push）
```bash
# 如果在当前分支已有对应的上游分支：
git push

# 首次将新分支推送到远程：
git push -u origin 分支名
```

> **⚠️ 注意：严禁上传的内容（已配置在 `.gitignore`）**：
> - 绝对不要提交 `__pycache__/`、`*.pyc` 编译缓存文件。
> - 绝对不要提交虚拟环境目录（如 `.venv/`, `env/`）。
> - 临时大体积日志或超过 100MB 的单文件不要直接 `git push`（必要时使用 Git LFS 或通过数据脚本下载）。

---

## 🧩 3. 加入相应的功能（Feature Development Workflow）

在向本项目添加新算法、模型、接口或页面时，请遵循本项目的**工程目录分工架构**：

### 3.1 仓库核心目录分工
```text
SatProp-OrbitAttitude/
├── core/               # 底层物理模型（常数、开普勒根数、坐标系/时间转换、姿态动力学）
├── propagators/        # 核心轨道外推器（Cowell摄动方程、RKF78/ABM4积分器、统一预测器）
├── models/             # 机器学习残差预测网络（LSTM / Transformer 混合模型架构）
├── service/            # 后端服务与对外遥测接口（Flask 路由、遥测数据接入管理器）
├── web3d/              # 3D WebGL 态势感知与前端交互可视化平台（Three.js）
├── scripts/            # 算法独立实验、基准对比与遥测验证脚本
├── tests/              # 严密的自动化回归测试套件
├── docs/               # 体系化理论推导、API 规范与开发协作文档
└── main.py             # 统一 CLI 总入口调度器
```

---

### 3.2 规范化新增功能四步法

#### 步骤 1：明确放置位置与接口规范
- **新增一种摄动外推或数值积分算法**：在 `propagators/` 下新建或扩展类，统一实现 `propagate(t_span, y0, ...)` 接口，并在 `propagators/unified_predictor.py` 中注册。
- **新增遥测/遥感数据源解析支持**：在 `service/telemetry_interface.py` 中扩充 `TelemetryDataFormat` 枚举与对应的状态解算逻辑。
- **新增一种姿态控制模式**：在 `core/` 下扩展四元数姿态运动学与目标对齐算法。
- **新增独立验证脚本**：统一放置于 `scripts/` 目录，并在 `main.py` 的子命令解析器中添加转发命令。

#### 步骤 2：编写单元测试（必须）
任何新增的核心算法或数据解析逻辑，必须在 `tests/` 目录下添加对应的单元测试用例，确保计算结果可验证且不破坏现有功能。

#### 步骤 3：运行全套测试验证
提交代码前，**必须**在本地执行全量测试，确保所有用例通过：
```bash
# 运行全部自动化回归测试
py -3 main.py test
```
只有当输出为 `OK` 且 100% 测试通过（目前为 14/14 项通过）时，方可准备提交。

#### 步骤 4：更新文档
如果增加了新的 API 接口或核心力学参数，请同步更新 `docs/API_REFERENCE.md` 或相关说明文档。

---

## 🌿 4. 拉分支做实验与合并（Branching & Experiments）

**核心原则**：**主分支 `main` 必须始终保持稳定、可运行的状态！**  
所有探究性研究、算法参数调优、新模型训练或大型重构，**必须在独立分支上进行**。

---

### 4.1 创建并切换到实验分支
分支命名建议遵循：`experiment/<研究主题>` 或 `feature/<功能名称>`。

```bash
# 1. 确保基于最新的 main 分支切出
git checkout main
git pull origin main

# 2. 创建并立即切换到新的实验分支
# 示例：尝试用卡尔曼滤波（EKF）做轨道确定实验
git checkout -b experiment/ekf-orbit-determination

# （新版 Git 亦可使用）：
# git switch -c experiment/ekf-orbit-determination
```

现在你已经位于 `experiment/ekf-orbit-determination` 分支上了！在这里你可以自由修改代码、新增脚本、调试实验，完全不会影响到 `main` 分支。

---

### 4.2 在实验分支上提交代码并推送到远程
在实验过程中，随时提交并备份你的实验进展到 GitHub：
```bash
# 暂存并提交实验代码
git add .
git commit -m "feat(ekf): 建立 EKF 状态转移矩阵与观测雅可比方程"

# 首次推送到远程（在 GitHub 上创建对应的分支备份）
git push -u origin experiment/ekf-orbit-determination
```
以后在该分支后续提交只需直接输入：`git push`。

---

### 4.3 实验完成：合并回主干（2 种方式）

#### 方式 A：通过 GitHub 发起 Pull Request（PR，强烈推荐 ⭐⭐⭐）
1. 打开 GitHub 仓库页面 [`https://github.com/yangdejiang666/SatProp-OrbitAttitude`](https://github.com/yangdejiang666/SatProp-OrbitAttitude)。
2. 页面顶部会出现你刚刚推送的分支提示，点击 **Compare & pull request**。
3. 填写实验背景、改动说明以及测试结果（如：精度提升指标、运行耗时）。
4. 邀请团队成员进行代码审查（Review）。
5. 审查确认无误后，点击 **Merge pull request** 合并到 `main`。

#### 方式 B：本地直接合并（限负责人或已确认无冲突的小改动）
```bash
# 1. 切换回 main 分支
git checkout main

# 2. 确保本地 main 与远程同步
git pull origin main

# 3. 将实验分支合并进 main
git merge experiment/ekf-orbit-determination

# 4. 再次运行全套测试验证
py -3 main.py test

# 5. 测试通过后推送到远程 main
git push origin main
```

---

### 4.4 实验结束后的分支清理
合并完成后，可以清理已完成历史使命的分支：
```bash
# 删除本地分支
git branch -d experiment/ekf-orbit-determination

# 删除远程已合并的分支
git push origin --delete experiment/ekf-orbit-determination
```

---

### 4.5 实验失败/放弃该思路时的清理
如果某个实验方案经过验证效果不理想，决定彻底放弃：
```bash
# 切换回 main 分支
git checkout main

# 强制删除该本地实验分支（注意：分支内的未合并改动将被丢弃）
git branch -D experiment/ekf-orbit-determination
```

---

## 🛠️ 5. 常见问题与急救速查（Troubleshooting）

### Q1: `git push` 时提示 `rejected ... fetch first`
- **原因**：其他人往远程仓库推送了新提交，你本地的版本落后了。
- **解决办法**：
  ```bash
  git pull --rebase origin main
  # 如果出现冲突，根据提示打开冲突文件手动解决
  # 解决完后：
  git add <冲突文件>
  git rebase --continue
  # 最后再推：
  git push
  ```

### Q2: 刚才写的 commit 信息写错了，想修改
```bash
git commit --amend -m "fix(srp): 更正为正确的提交说明"
```

### Q3: 不小心把还没做完的修改误提交（commit）了，想撤销提交但保留代码修改
```bash
# 撤销最近一次 commit，但保留工作区修改
git reset --soft HEAD~1
```

### Q4: 如何查看分支图谱与提交历史？
```bash
# 查看美观的单行提交树
git log --graph --oneline --decorate -n 15
```

---

## 🚀 6. 开发者核心 CLI 快速启动清单

团队成员拉取代码后，可通过项目统一调度入口 `main.py` 快速执行各类功能：

```bash
# 1. 启动 3D WebGL 态势感知交互平台 (http://127.0.0.1:8080)
py -3 main.py server

# 2. 运行自动化全量测试套件 (14/14 单元测试)
py -3 main.py test

# 3. 运行多模型全流程端到端预测流水线 (SGP4 / Cowell / Hybrid / Calibrated)
py -3 main.py pipeline

# 4. 运行数值积分器横向基准性能评测 (RK4 vs RKF78 vs ABM4)
py -3 main.py benchmark

# 5. 测试真实遥测数据接入与外推验证 (GPS / 状态矢量 / 雷达AER / TLE)
py -3 main.py ingest
```

如遇任何 Git 或工程架构问题，请随时在 GitHub Issues 或团队协作群中提出！
