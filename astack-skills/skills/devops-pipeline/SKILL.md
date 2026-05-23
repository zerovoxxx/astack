---
name: devops-pipeline
description: 管理蓝盾流水线的构建操作，包括查询流水线列表、查询构建历史、获取启动参数、查看构建状态、启动构建。当用户提及流水线、构建、部署、CI/CD、蓝盾或需要触发构建任务时使用。
---

# 蓝盾流水线管理

通过 Python 脚本直接调用蓝盾 API 管理流水线构建。

## 脚本参考

**获取流水线列表**：参阅 [reference/pipeline-list.md](reference/pipeline-list.md)
**获取启动参数**：参阅 [reference/build-startinfo.md](reference/build-startinfo.md)
**启动构建**：参阅 [reference/build-start.md](reference/build-start.md)
**查看构建状态**：参阅 [reference/build-status.md](reference/build-status.md)
**获取构建历史**：参阅 [reference/build-list.md](reference/build-list.md)

## 核心概念

- **projectId**：项目英文名（如 `myproject`）
- **pipelineId**：流水线 ID，以 `p-` 开头（如 `p-abc123`）
- **buildId**：构建 ID，以 `b-` 开头（如 `b-xyz789`）

## 重要规则

**启动构建前必须获得用户确认**：在调用启动构建脚本之前，必须向用户展示完整的构建入参并获得明确确认。未经用户确认，禁止执行构建操作。

**访问令牌配置**：需要用户预先设置环境变量 `BK_CI_ACCESS_TOKEN`。

## 常用工作流

### 1. 启动构建

```
步骤 1：获取启动参数 → 参阅 [reference/build-startinfo.md](reference/build-startinfo.md)
步骤 2：向用户展示构建参数，等待用户确认 ⚠️ 必须执行
步骤 3：用户确认后启动构建 → 参阅 [reference/build-start.md](reference/build-start.md)
步骤 4：查看状态 → 参阅 [reference/build-status.md](reference/build-status.md)
```

**步骤 2 确认模板**：
```
即将启动构建，请确认以下参数：
- 项目：{projectId}
- 流水线：{pipelineId}
- 构建参数：
  {列出所有参数的 key-value}

是否确认启动？
```

## 常用流水线

用户配置的常用流水线，参阅 [config.json](config.json)

**URL 解析规则**：从 `https://devops.woa.com/console/pipeline/{projectId}/{pipelineId}` 提取：
- `projectId`：`/pipeline/` 后的第一段
- `pipelineId`：以 `p-` 开头的最后一段

## 快速示例

### 获取流水线列表

```bash
# 获取项目所有流水线
python scripts/pipeline_client.py pipelines \
  --project-id myproject

# 按名称搜索流水线
python scripts/pipeline_client.py pipelines \
  --project-id myproject \
  --filter-by-pipeline-name "my-pipeline"

# 排序并限制返回数量
python scripts/pipeline_client.py pipelines \
  --project-id myproject \
  --sort-type UPDATE_TIME \
  --collation DESC \
  --page-size 10
```

### 查询最近构建

```bash
python scripts/pipeline_client.py list \
  --project-id myproject \
  --pipeline-id p-abc123 \
  --page 1 \
  --page-size 10
```

### 获取启动参数

```bash
python scripts/pipeline_client.py startup-info \
  --project-id myproject \
  --pipeline-id p-abc123
```

### 启动一次构建

```bash
python scripts/pipeline_client.py start \
  --project-id myproject \
  --pipeline-id p-abc123 \
  --params '{"branch": "master"}'
```

### 查看构建状态

```bash

python scripts/pipeline_client.py status \
  --project-id myproject \
  --pipeline-id p-abc123 \
  --build-id b-xyz789
```

## 构建状态枚举

| 状态 | 说明 |
|------|------|
| SUCCEED | 成功 |
| FAILED | 失败 |
| CANCELED | 已取消 |
| RUNNING | 运行中 |
| QUEUE | 排队中 |
| STAGE_SUCCESS | 阶段成功 |

## 如果执行python脚本报错 BK_CI_ACCESS_TOKEN 找不到，获取访问令牌步骤如下

1. 参照https://iwiki.woa.com/p/4016670096 获取访问令牌
2. 设置环境变量: `export BK_CI_ACCESS_TOKEN="your_token"`