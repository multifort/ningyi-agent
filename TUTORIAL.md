# 全流程简易教程

从零把一个项目交给 Hermes 管理,再把这套模式**复制到新工程**。命令照抄即可。

---

## 0. 前置(每台机器一次)
1. 安装 Hermes Agent —— https://hermes-agent.nousresearch.com/docs ,确认 `hermes --version` 可用。
2. 准备 DeepSeek API Key(`sk-...`,在 https://platform.deepseek.com 申请)。
3. (可选)实现车道:默认用 Hermes 自身实现(DeepSeek V4 编码能力强,够用)。想额外用
   Claude Code 车道才装 `claude` CLI——它走 Anthropic、与 Hermes 的 DeepSeek provider
   相互独立,需你自己有可用的 Claude 访问;没有就忽略,不影响主流程。

> 身份(`~/.hermes/SOUL.md`)、模型/后端配置、API Key 都是**全局**的(在 `~/.hermes/` 下)。
> 所以同一台机器上,从第二个项目起,这些都已就绪,可跳过。

---

## 1. 第一个项目:从克隆到跑起来
```bash
# 1) 取得脚手架(下面任选一种,见第 4 节的复制方式)
cd my-project

# 2) 一键初始化:写全局配置、装身份、把 repo 的 skills/ 注册成 external_dir
./bootstrap.sh

# 3) 设置 Key 并锁定 DeepSeek provider(key 写入 ~/.hermes/.env)
hermes config set DEEPSEEK_API_KEY sk-...
hermes setup            # 选 DeepSeek;Base URL https://api.deepseek.com;模型 deepseek-v4-pro
hermes model            # 确认当前模型 / provider

# 4) 填三件「项目事实」——这是 Hermes 认识你项目的入口:
#    - .hermes.md 里的 "Project facts"
#    - docs/context.md(一页项目概览 + 如何 run/test/build)
#    - docs/architecture.md(组件、约束)

# 5) 填 Makefile 的命令(语言无关的统一入口):
#    TEST_CMD / LINT_CMD / RUN_CMD / BUILD_CMD

# 6) (可选)装 pre-commit 闸门;再做一次脚手架自检
make install-hooks
make validate            # 应输出 RESULT: PASS

# 7) 从 repo 根目录启动,Hermes 会自动把 .hermes.md 当「项目大脑」加载
hermes
```

---

## 2. 跑通第一个开发循环
进到 `hermes` 后,直接用自然语言提需求,例如:

> 「给用户登录加上失败重试,最多 3 次,带指数退避;补测试。」

Hermes 会按固定循环走(详见 `workflows/dev-loop.md`):
1. **澄清**:复述范围,必要时只问一个关键问题。
2. **写规格**(非琐碎改动):落到 `docs/specs/`。
3. **做计划**:plan 模式产出任务清单(写到 `.hermes/plans/`),先不执行。
4. **实现**:小改自己做;独立任务用 `delegate_task` 并行子 agent;大块功能可委派 Claude Code 车道。
5. **测试**:新逻辑走 TDD,跑 `make test`。
6. **评审**:`make review`(lint+test)+ 走 `definition-of-done` 闸门。
7. **交付**:开 PR、同步更新 `docs/` 和 ADR、给出变更摘要。

你随时可以打断、追问、让它改计划——它会保留上下文。

---

## 3. 日常使用速查
- **何时让它并行**:2-3 个互不影响、改不同文件的任务 → 让它 `delegate_task` 批处理。
- **何时上 Claude Code 车道(可选)**:仅当你有独立的 Claude 访问时——范围明确的大块实现 → 它调 `claude -p ...`,Hermes 收口评审(见 `workflows/claude-code-lane.md`);否则让 Hermes 自身实现即可。
- **新增可复用流程**:在 `skills/<name>/SKILL.md` 写一个;因走 external_dirs,**存盘即生效,无需重装**。用 `hermes --toolsets skills -q "Use the <name> skill to ..."` 测。
- **定时任务**(健康检查、依赖审计、standup):见 `automation/cron-jobs.md`,需要先 `hermes gateway install`。
- **记忆纪律**:耐久事实写一行进 `~/.hermes/MEMORY.md`,细节进 `docs/`,过往怎么做的靠会话检索(自动)。

---

## 4. 把这套模式复制到新工程(核心)

### 方式 A:克隆 + 重置历史(推荐)
```bash
git clone --depth 1 <脚手架地址或路径> my-new-project
cd my-new-project
rm -rf .git && git init        # 丢掉脚手架历史,开始你自己的项目
./bootstrap.sh
# 然后照第 1 节的第 4~7 步:填三件事实 + Makefile,make install-hooks,hermes
```

### 方式 B:从打包文件展开
```bash
tar -xzf hermes-project-scaffold.tar.gz
mv hermes-project-scaffold my-new-project && cd my-new-project
git init && ./bootstrap.sh
# 同样填三件事实 + Makefile 后即可
```

### 方式 C:做成 GitHub Template
把脚手架推到一个 GitHub 仓库,在仓库设置里勾选 **Template repository**;
以后每个新项目点 **Use this template** 生成,再 `./bootstrap.sh` 即可。

> 复制到新项目时,你真正要改的只有**三件项目事实 + Makefile 命令**——
> 循环、skill、安全基线、约定都随脚手架自带,开局即用。

### 同一台机器跑多个项目
- 全局的身份/配置/Key 已就绪,新项目 `bootstrap.sh` 主要是**把新 repo 的 `skills/` 加进 `external_dirs`**。
- 注意:`external_dirs` 是**全局**的,所以各项目的 skill 在哪个项目里都可被发现(可能互相「串味」)。
  想要隔离,用 **profile**:`hermes --profile my-new-project`,每个 profile 有独立的配置、记忆、skill 空间。
- 多个 agent 在**同一** repo 并行,用 `hermes -w`(各自独立 git worktree)。

---

## 5. 升级已有项目到新版脚手架
脚手架本身迭代时,挑你需要的文件覆盖即可(它们大多是模板/约定):
```bash
# 在已有项目里,从新版脚手架拷你想更新的部分,例如工作流与脚本
cp -r <新版脚手架>/workflows ./ 
cp -r <新版脚手架>/scripts ./
cp    <新版脚手架>/Makefile ./
./bootstrap.sh        # 幂等:重新对齐配置 / external_dirs,不会覆盖你的 .hermes.md、docs、.env、SOUL.md
make validate
```
你自己填过的 `.hermes.md` / `docs/` / `Makefile` 命令保持不动,按需手动合并。

---

## 6. 验证与排错
- **自检**:`make validate`(脚手架结构、配置、skill、引用是否齐全)。
- **真机首跑清单**:见 `VALIDATION.md`,逐项确认(尤其两处待核实:`hermes model` 确认模型串、plan 写盘路径)。
- **常见坑**:
  - Key 设了还报鉴权失败 → DeepSeek provider 只读环境变量 `DEEPSEEK_API_KEY`(在 `~/.hermes/.env`),会忽略 config.yaml 里的 api_key;用 `hermes config set DEEPSEEK_API_KEY ...` 设置,别放 repo 的 `.env`。
  - 模型/provider 不对(401/404 或模型名报错)→ 跑 `hermes setup` 选 DeepSeek 重新锁定(Base URL `https://api.deepseek.com`、模型 `deepseek-v4-pro`),再用 `hermes model` 确认。
  - skill 没被发现 → `hermes config` 看 `skills.external_dirs` 是否指向本 repo 的 `skills/` 绝对路径。
  - cron 不触发 → gateway 守护进程没起;`hermes gateway install` 后 `hermes cron status`。
  - 版本不符告警 → 脚手架锚定 v0.14.x,新版本 CLI/路径可能变,以你那版文档为准。

---

更系统的设计说明见 `GUIDE.md`;循环细节见 `workflows/dev-loop.md`。
