---
name: db-design
description: |
  为 FinClaw Platform AO 创建或更新符合 FiT 规范的 MySQL 表设计、DDL 与 docs/db 设计文档。
  当用户提出数据库设计、建表、改表、字段或索引设计、DDL、自检 FiT 数据库规范时使用。
---

# FinClaw 数据库设计

根据用户需求进行数据库设计，输出符合 FiT 数据库设计规范的库表设计文档与 DDL 语句。

若用户未指定需求文档，提示用户提供业务需求描述或指定 Spec 文件路径。
若用户指定了迭代编号（如 `9`），自动匹配 `docs/astack/version/Iteration{N}_*_SPEC.md` 中的数据模型章节。

## 上下文准备

设计前必须获取：
- `CLAUDE.md`（以及兼容软链 `AGENTS.md`）：项目约束、业务子领域定义、分层规范
- `docs/astack/INDEX.md` 与相关 `docs/astack/version/Iteration*_SPEC.md`
- 相关 Spec 文档中的「数据模型」「接口定义」章节
- 现有 Entity 代码（若有）：`domain/*/entity/` 下的 Java 类
- 现有 Repository 接口（若有）：`domain/*/repository/` 下的 Java 接口
- 现有 `docs/db/` 文档与 `docs/asset/script/finclaw_master_db_ddl.sql`

---

## FiT 数据库设计规范（强制约束）

以下规范摘自 FiT 数据库设计规范（iwiki/p/268867096），**所有设计必须严格遵守原则类条目**。

### 一、库表设计约束

#### 原则（必须遵守）
1. **存储引擎**：实时交易表必须使用 InnoDB。同一张表主备机须使用相同的存储引擎。
2. **建表语句**：必须显式指定字符集和存储引擎。禁止使用 `CREATE TABLE IF NOT EXISTS`。
3. **主键必设且由单号服务生成**：所有表必须设定主键，**禁止自增（`AUTO_INCREMENT`）**，主键值统一由单号服务生成。主键字段的类型与命名规范见「二、字段设计约束」。
4. **表关联限制**：实时交易业务一个 SQL 只能关联一张表；非实时交易最多关联 2 张表。适当使用反范式设计。
5. **禁止 text/blob**：实时交易表不允许使用 text/blob 数据类型。
6. **记录大小**：单条记录严禁大于 8K。
7. **字符集**：只允许 `latin1` 或 `utf8mb4`。**当字符集为 `utf8mb4` 时，必须显式指定 `COLLATE = utf8mb4_general_ci`**（包括 `CREATE DATABASE` 和 `CREATE TABLE` 语句），写法：`CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci`。原因：① 可能导致 MySQL 8.0 升级过程中复制异常；② 不同 collate 的表无法连接查询，需统一。除 `utf8mb4` 之外的字符集不指定 COLLATE，使用默认。
8. **读写分离**：写入和批量读取不能在同一实例操作。多个独立业务共用一台机器时，采用多实例部署隔离。
9. **禁止高级特性**：实时交易业务不允许使用分区表、存储过程、自定义函数、触发器、视图。
10. **禁止操作系统库**：禁止操作 mysql、sys、information_schema、performance_schema。
11. **禁止危险操作**：不允许 drop、truncate、rename 库表。禁止 `create table ... like ...`。

#### 分库分表选型

| 库表类型 | 适用场景 | 命名示例 |
|---------|---------|---------|
| 单库单表 | 日新增 < 1W 笔，无需定期清理 | `db.t_table` |
| 百库十表 | 无明显增长，总记录 > 1 亿 | `db_xx.t_table_y` |
| 单库按年分表 | 日新增 1W~10W 笔 | `db.t_table_yyyy` |
| 单库按月分表 | 日新增 10W~100W 笔 | `db.t_table_yyyymm` |
| 单库按天分表 | 日新增 > 100W 笔 | `db.t_table_yyyymmdd` |
| 按天百库十表 | 日新增 > 1000W 笔，多实例 | `db_yyyymm_xx.t_table_dd_y` |
| 按天十表 | 日新增 > 1000W 笔，单实例 | `db_yyyymm.t_table_dd_x` |

**注意**：
- 包含时间类型的库表要求**建到年底最后一天**。
- 百库十表结构调整必须保证调整后所有库表结构一致；时间分表须保证从调整开始到线上截止日期的库表结构一致。

### 二、字段设计约束

#### 原则（必须遵守）
1. **主键字段规范**：主键字段类型统一为 `varchar(64) NOT NULL`，字段命名必须带有业务语义缩写且**最多 3 个单词拼接**（如 `Fuser_id`、`Forder_id`、`Finvt_code_id`），禁止使用 `Fid`、`Fpk` 等无语义名称。主键值由单号服务生成，**禁止自增（`AUTO_INCREMENT`）**。外键引用字段的类型和长度必须与主键一致（`varchar(64)`）。
2. **时间审计字段**：每张表必须包含 `Fcreate_time` 和 `Fmodify_time`（datetime 类型）。`Fmodify_time` 必须设默认值 `DEFAULT CURRENT_TIMESTAMP`，且上面创建索引。后续所有 UPDATE 操作必须由业务代码显式更新 `Fmodify_time`，不依赖 `ON UPDATE CURRENT_TIMESTAMP`。⚠️ `CURRENT_TIMESTAMP` 受时区影响，涉及跨时区业务须与 DBA 确认。
3. **金额字段**：统一使用 `bigint`（单位：分），不使用浮点数。可通过乘以系数将小数转为整型存储。
4. **字段变更**：已有数据的表字段类型只允许变长不允许变短；新增字段必须加在表最后面；禁止删除和重命名字段。
5. **字符集一致**：字段字符集须与表字符集一致。
6. **字段数上限**：一张表字段数不能超过 100 个。
7. **datetime 默认值**：datetime 字段必须指定有意义合法的 default 值，不能为 `'0000-00-00 00:00:00'`。
8. **逻辑删除标识**：每张表必须包含 `Flstate` 字段（`tinyint NOT NULL DEFAULT 1`），1 = 正常，2 = 已删除。生产数据只允许逻辑删除（将 `Flstate` 置为 2），**严禁物理 DELETE**。
9. **业务状态字段**：涉及业务状态的表统一使用 `Fstatus` 字段（`varchar(32) NOT NULL`），存储枚举值的字符串形式（如 `'PENDING'`、`'SUCCESS'`、`'FAILED'`）。Java 代码中必须定义对应的枚举类进行映射，禁止使用魔法字符串。同一业务域内状态值命名风格保持一致（全大写下划线分隔）。

#### 建议
- 字段长度遵循最小化原则（状态用 `tinyint`，不用 `int`）。
- 能用数字类型不用 varchar；能用 date/datetime 不用 varchar。
- 非定长数据避免 char。
- where 条件字段建议设为 NOT NULL 并设默认值。
- 所有字段建议加注释。
- 建议所有字段不使用 NULL，定义有意义的 DEFAULT 值。

### 三、索引设计约束

#### 原则（必须遵守）
1. 所有表必须设定主键。
2. 禁止使用随机类型值用于主键。
3. **索引上限**：索引个数不允许超过 5 个。
4. **索引列上限**：索引列个数不允许超过 4 个。
5. 避免重复索引和冗余索引。
6. 唯一索引有防重功能时，对应字段必须设为 NOT NULL。
7. 索引列唯一值个数不允许低于 10 个。

#### 建议
- 主键越短越好，避免 3 个以上字段的复合主键。
- 主键值统一由 单号服务生成，**禁止自增主键**。
- 选择最常用的唯一键作为主键。
- 主键列插入后不再修改或极少修改。
- 组合索引中常用字段放前面，选择性高的字段放前面。
- 较长字符字段优先考虑前缀索引。

### 四、命名规范

#### 原则（必须遵守）
1. **通用规则**：只允许 `a-z`、`0-9`、下划线；使用英文不用拼音；不能用保留词；控制在 30 字符内。
2. **分隔方式**：用下划线分割，不用驼峰。如 `Fcreate_time` ✅，`FcreateTime` ❌。
3. **数据库名**：全小写。百库编号 2 位（00~99），月份格式 YYYYMM。
4. **表名**：以 `t_` 开头，全小写，不超过 32 字符。分表编号 1 位（0~9）。
5. **字段名**：以大写 `F` 开头，其余全小写，不超过 26 字符。如 `Fcreate_time`、`Forder_id`。
6. **索引名**：唯一索引 `uk_<字段缩写>`，普通索引 `idx_<字段缩写>`。不超过 26 字符。分表须去掉表名后缀（如 `t_order_1` 的索引名为 `uk_t_order` 而非 `uk_t_order_1`，确保同系列表索引名一致）。
7. **表名前缀一致性**：相同业务领域的表必须使用统一的表名前缀。例如用户领域的表统一使用 `t_user_` 前缀（如 `t_user_profile`、`t_user_token`），订单领域统一使用 `t_order_` 前缀，以此类推。禁止同一领域下的表使用不同前缀。
8. **字段语义全局一致性**：相同语义的字段在所有表中必须使用相同的字段名。例如「用户 ID」在所有需要关联的表中统一命名为 `Fuser_id`，不允许出现 `Fuid`、`Faccount_id` 等不同名称表达相同语义的情况。设计新表时须对照已有表的字段命名，确保语义一致。
9. **业务流水表后缀**：业务流水/记录类表统一使用 `_record` 后缀命名。禁止使用 `_log`、`_history`、`_flow`、`_transaction`、`_journal` 等不一致的后缀。适用场景包括但不限于：
   - **操作行为记录**：如 `t_llm_call_record`（大模型调用记录）、`t_login_record`（登录记录）
   - **资产变动流水**：如 `t_token_record`（Token 资产变动流水）、`t_payment_record`（支付记录）
   - **状态变更记录**：如 `t_order_status_record`（订单状态变更记录）

---

## 设计流程

### 第 1 步：需求分析

1. 通读业务需求或 Spec 中的数据模型章节
2. 确认涉及的 domain 子领域（必须属于 `CLAUDE.md` 当前定义的业务子领域之一）
3. 识别核心实体、实体关系、关键业务流程
4. 预估数据量级（日新增笔数），确定分库分表策略

### 第 2 步：实体关系设计

输出实体关系说明：
- 核心实体列表及所属 domain 子领域
- 实体间关系（1:1 / 1:N / M:N）
- 关键业务流程中的数据流向

### 第 3 步：逐表设计

对每张表输出以下内容：

```markdown
### 表：t_<表名>

**所属领域**：{domain 子领域}
**业务说明**：{一句话描述}
**预估数据量**：{日新增笔数}
**分表策略**：{单库单表 / 百库十表 / 按月分表 / ...}
**字符集**：utf8mb4
**存储引擎**：InnoDB

| 字段名 | 类型 | 是否为空 | 默认值 | 注释 |
|--------|------|---------|--------|------|
| F{biz}_id | varchar(64) | NO | - | 主键（单号服务生成） |
| ... | ... | ... | ... | ... |
| Flstate | tinyint | NO | 1 | 数据状态：1-正常 2-删除 |
| Fcreate_time | datetime | NO | CURRENT_TIMESTAMP | 创建时间 |
| Fmodify_time | datetime | NO | CURRENT_TIMESTAMP | 修改时间 |

**主键**：PRIMARY KEY (F{biz}_id)
**索引**：
- `uk_xxx` UNIQUE (Fxxx)
- `idx_modify_time` (Fmodify_time)
```

### 第 4 步：生成 DDL

输出完整的建表 DDL 语句，必须包含：
- 字符集和存储引擎声明
- 所有字段必须有 COMMENT 注释
- 索引定义
- 表注释

DDL 脚本编写规范：
- **禁止** `CREATE TABLE IF NOT EXISTS` —— 必须明确建表，避免执行结果不确定。
- **禁止** ALTER 语句使用 `AFTER` 和 `FIRST` 来指定字段位置（新增字段必须加在表最后面）。
- 同一张表的多个结构修改（同时加多个字段、同时加字段改索引等）**必须合并为一条 ALTER** 执行。
- **禁止** `insert into ... select from ...` 语法。
- insert 语句必须写清字段与值的对应关系，不允许 `insert into table_name values()` 方式。

DDL 模板：

```sql
-- 主键策略说明：
-- 主键统一由 单号服务生成，禁止使用 AUTO_INCREMENT。
-- 主键字段类型为 varchar(64)，命名必须带有业务语义缩写。
CREATE TABLE `t_<表名>` (
    `F<biz>_id`     varchar(64) NOT NULL COMMENT '<业务>ID（单号服务生成）',
    -- 业务字段 ...
    `Flstate`       tinyint NOT NULL DEFAULT 1 COMMENT '数据状态：1-正常 2-删除',
    `Fcreate_time`  datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `Fmodify_time`  datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '修改时间（业务代码每次UPDATE须显式赋值）',
    PRIMARY KEY (`F<biz>_id`),
    UNIQUE KEY `uk_xxx` (`Fxxx`),
    KEY `idx_modify_time` (`Fmodify_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='表注释';
```

### 第 5 步：合规性自检

逐项检查设计是否满足以下清单：

| # | 检查项 | 规范来源 |
|---|--------|---------|
| 1 | 所有表使用 InnoDB 引擎 | 库表原则 |
| 2 | 建表语句显式指定字符集和存储引擎 | 库表原则 |
| 3 | 所有表设定了主键 | 库表/索引原则 |
| 4 | 主键为 `varchar(64)` 且由 单号服务生成，无 `AUTO_INCREMENT` | 字段原则/库表原则 |
| 4.1 | 主键字段命名带有业务语义缩写（如 `Fuser_id`），无 `Fid` 等无语义名 | 字段原则 |
| 5 | 每张表有 Fcreate_time 和 Fmodify_time | 字段原则 |
| 5.1 | 每张表有 Flstate 逻辑删除标识（tinyint, DEFAULT 1） | 字段原则 |
| 6 | Fmodify_time 有 DEFAULT CURRENT_TIMESTAMP 且有索引 | 字段原则 |
| 7 | 金额字段使用 bigint（单位：分） | 字段原则 |
| 8 | 无 text/blob 字段（实时交易表） | 库表原则 |
| 9 | 单条记录 < 8K | 库表原则 |
| 10 | 字符集为 utf8mb4 或 latin1 | 库表原则 |
| 11 | utf8mb4 字符集必须显式指定 COLLATE=utf8mb4_general_ci | 库表原则 |
| 12 | 字段数 ≤ 100 | 字段原则 |
| 13 | 索引数 ≤ 5 | 索引原则 |
| 14 | 索引列数 ≤ 4 | 索引原则 |
| 15 | 表名以 t_ 开头、全小写、≤ 32 字符 | 命名原则 |
| 16 | 字段名以 F 开头、≤ 26 字符 | 命名原则 |
| 17 | 索引命名 uk_/idx_ 前缀、≤ 26 字符 | 命名原则 |
| 18 | datetime 字段有合法默认值（非 0000-00-00） | 字段原则 |
| 19 | 分库分表策略与数据量匹配 | 库表原则 |
| 20 | 时间分表建到年底最后一天 | 库表原则 |
| 21 | 无冗余/重复索引 | 索引原则 |
| 22 | DDL 不含 `IF NOT EXISTS` | SQL 编写原则 |
| 23 | 所有字段有 COMMENT 注释 | 字段建议 |
| 24 | where 条件字段设为 NOT NULL 并有默认值 | 字段建议 |
| 25 | 无 Fstandby 等无业务含义的预留字段 | 项目约束 |
| 26 | 同一领域的表使用统一的表名前缀 | 命名原则 |
| 27 | 相同语义的字段在所有表中命名一致 | 命名原则 |
| 28 | 业务流水/记录类表使用 `_record` 后缀 | 命名原则 |
| 29 | 业务状态字段统一命名 Fstatus（varchar(32)），代码有对应枚举类 | 字段原则 |

自检全部通过后方可输出最终设计。

### 第 6 步：生成设计文档

在 `docs/db/` 下创建设计文档，命名为 `{业务域}_db_design.md`（如 `order_db_design.md`）。

文档结构：

```markdown
# {业务域} 数据库设计文档

## 1. 文档信息
- 日期: {YYYY-MM-DD}
- 关联 Spec: {关联的 Spec 文件路径，无则写"无"}
- 涉及领域: {domain 子领域列表}

## 2. 业务背景
{简述业务场景和数据需求}

## 3. 数据量预估
| 表名 | 日新增笔数 | 分表策略 |
|------|-----------|---------|

## 4. 实体关系
{实体关系说明}

## 5. 表设计明细
{逐表设计，包含字段、索引、说明}

## 6. DDL 语句
{完整建表 SQL}

## 7. 合规性自检
{自检清单及结果}

## 8. Java Entity 映射建议
{字段与 Java Entity 的映射关系、类型对应}

## 9. 变更记录
| 日期 | 版本 | 变更说明 |
|------|------|---------|
```

### 第 7 步：Java Entity 映射建议

根据表设计，给出对应的 domain Entity 类建议：
- 字段映射关系（MySQL 类型 → Java 类型）
- Entity 类放置位置（`domain/{子领域}/entity/`）
- 必要的类型转换说明（如 bigint 金额字段 → `long` / `Long`）

### 第 8 步：汇报

输出：
1. 设计文档路径
2. 涉及的表数量和领域
3. 分库分表策略概述
4. 合规性自检结果
5. 建议的下一步（填充 Entity 代码 / 创建 Repository 接口 / 发起 DBA 评审）

---

## 约束

1. **规范至上**：所有设计必须通过 FiT 数据库规范自检清单，原则类条目零容忍。
2. **领域归属**：表必须归属于 `CLAUDE.md` 定义的现行业务子领域之一，不允许创建游离于领域之外的表。
3. **不执行 DDL**：本 skill 只输出设计文档和 DDL 语句，不在数据库中执行任何操作。
4. **命名一致**：表名、字段名、索引名严格遵守 FiT 命名规范。
5. **命名全局一致**：同领域表前缀统一、同语义字段全局命名统一、流水表统一 `_record` 后缀。设计新表时须对照已有表命名，避免出现不一致。
6. **最小设计原则**：只设计业务需求涉及的表，不扩散设计无关表。
7. **反范式有度**：为满足单表查询要求可适当反范式，但必须说明冗余字段的同步策略。
8. **禁止预留字段**：禁止 Fstandby 等无明确业务含义的预留字段，所有字段必须有明确的业务语义。需要扩展时通过 ALTER TABLE 新增字段。（注：iWiki 建议单库单表/百库十表预留 standby 字段，本项目采用更严格策略以保证字段语义清晰）
9. **逻辑删除**：生产数据只允许逻辑删除，严禁物理 DELETE。所有表必须包含 `Flstate`（tinyint, DEFAULT 1），1 = 正常、2 = 已删除。业务查询默认过滤 `Flstate = 1`。
