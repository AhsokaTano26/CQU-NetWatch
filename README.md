# CQU NetProbe

独立、公开访问的重庆大学校园网络监控面板。Vue 3 + Vite 前端与 Node.js 单服务部署在 Prometheus 同一内网，**服务器查询 Prometheus，用户浏览器只访问本服务**。

不需要 Go、Nginx、数据库、Pushgateway；不采集数据，不接收探针上报。后端只使用 Node 标准库，生产运行无需 `node_modules`。支持网络状态总览、楼栋比较、楼栋历史、探针和测量目标详情。

## 快速启动

需要 Node.js **22.12 或更新版本**。

```sh
npm ci
cp .env.example .env
# 编辑 .env 中的 PROMETHEUS_URL，例如 http://10.0.0.10:9090
npm run build
npm start
```

访问 `http://服务器地址:3000`。开发环境使用 `npm run dev`，打开 Vite 输出的地址；Vite 的开发代理只用于开发，生产直接由 Node 提供页面和 API。

没有设置 `PROMETHEUS_URL` 时，页面显示“等待连接监控数据”，所有楼栋为空白。**不要把 `https://netprobe-gateway.lanunion.org.cn/metrics` 设置为 Prometheus 地址**：它是已有采集链路的指标出口，应用需要真正的 Prometheus HTTP 查询服务。

## 数据与查询

需要先预览界面时，可在构建后运行 `npm run demo`，访问 `http://127.0.0.1:3001`。页面明确标注模拟数据，包含五种状态与历史曲线；该独立脚本不读取 `.env`、不修改正式配置、不访问真实 Prometheus，也不会进入生产 Docker 镜像。停止演示按 `Ctrl+C`，通过 `DEMO_PORT` 可调整端口。

默认配置已适配提供的真实 `campus_probe_*` 指标：

| 展示 | 指标 | 页面单位 |
| --- | --- | --- |
| 探针在线 | `campus_probe_online` | 0 / 1 |
| 丢包 | `campus_probe_icmp_loss_ratio` | %，原值范围 0–1 |
| 延迟 | `campus_probe_icmp_rtt_seconds` | ms |
| 抖动 | `campus_probe_icmp_jitter_seconds` | ms |
| HTTP 可用性 | `campus_probe_http_success` | %，成功为 1，失败为 0 |
| HTTP 耗时 | `campus_probe_http_duration_seconds` | ms |
| HTTP 状态码 | `campus_probe_http_status_code` | 整数 |
| 最近上报 | `campus_probe_last_seen_timestamp_seconds` | 时间 |

使用 `campus`、`building`、`building_group`、`probe_id`、`network_type`、`target` 标签。总览批量查询上述指标，并查询最近 5 分钟丢包均值、10 分钟在线状态切换次数；历史只查询选择的楼栋。

所有默认查询通过 `timestamp(metric)` 排除超过 180 秒未抓取的样本（历史查询在每个求值时刻检查）。探针在线状态由最近上报时间推导：不足 30 分钟为在线，30 分钟至 24 小时为断网，超过 24 小时退出在线序列。质量查询还会与该在线判定及 `time() - campus_probe_last_seen_timestamp_seconds <= 180` 联合筛选。网关继续暴露的陈旧测量值不会被误当成当前数据；历史筛选在各个查询时间点执行。`last_seen` 的值代表上报时间，API 中的样本时间代表 PromQL 求值时间，原始抓取时效通过 `timestamp(metric)` 单独约束，界面分别展示两者。

楼栋平均值先对每个在线探针的各目标平均，再对在线探针平均，避免目标数量不同导致某个探针占比过大；波动检测使用单探针丢包与最大抖动，避免楼栋平均值掩盖问题。HTTP 可用性是在线探针观测的成功比例，与网络在线状态分开显示。

## 状态规则

| 状态 | 颜色 | 默认判断 |
| --- | --- | --- |
| 暂无数据 | 空白、空心标识 | 没有有效数据或数据已过期 |
| 下线 | 红 | 全部近期探针至少 30 分钟未上报，尚未超过 24 小时 |
| 等待 | 黄 | 未知、数据不完整或部分近期探针断网 |
| 在线 | 绿 | 已观测探针全部在线且质量正常 |
| 波动 | 橙 | 任一在线探针任一目标当前或 5 分钟窗口丢包 > 0，抖动 ≥ 30 ms，或 10 分钟状态切换 ≥ 3 次 |

波动优先于部分下线；全部下线仍显示红色。探针下线仅说明该探针没有及时上报，不能据此断言整个楼栋断网。超过 24 小时未上报的节点自动退出当前故障统计，保留在探针表中。查询失败单独提示，不等同网络下线；部分查询失败时不确认绿色在线。

## 自定义配置

环境变量：

| 变量 | 用途 |
| --- | --- |
| `PROMETHEUS_URL` | 服务端 Prometheus 根地址，支持路径前缀，覆盖 JSON 配置 |
| `PROMETHEUS_TOKEN` | 可选 Bearer token，仅在服务端使用 |
| `NETPROBE_CONFIG` | 可选自定义 JSON 文件路径 |
| `HOST` / `PORT` | 默认 `0.0.0.0` / `3000` |

将 `config/local.example.json` 复制为 `config/local.json`，并设置 `NETPROBE_CONFIG=./config/local.json`。示例中的 `job` 只是可选筛选，**必须改为实际 scrape job 或删除 `matchers`**，避免无结果。

自定义文件与 `config/default.json`、`config/catalog.json` 合并：`metrics`、`labels`、`thresholds` 按键覆盖，`campuses`、`groups`、`buildings` 如提供则整体替换。楼栋的 `id` 是页面标识，`building` 和 `campus` 必须对应 Prometheus 标签。

默认目录包含参考页面的 71 栋：沙坪坝 A/B/C 校园、虎溪梅/松/竹/兰/荷园及博士楼、两江校区。已知标签 `a11`、`sy03`、`zy05`、`lj02` 等直接映射；学林宾馆、青教楼、博士楼的代码需按实际数据校正。查询发现目录外的楼栋会自动以标签名补充展示，可在目录中添加友好名称。

指标自定义示例：

```json
{
  "metrics": {
    "loss": {
      "query": "campus_probe_icmp_loss_ratio{{selector}}",
      "scale": 1,
      "freshOnly": true
    }
  }
}
```

`{{selector}}` 在总览替换为全局标签筛选，在历史中还包含所选楼栋的 `campus` / `building` 精确匹配。表达式应保留探针和目标标签，别提前聚合掉它们。`scale` 为转换倍数；`freshOnly` 启用上面的在线/最近上报筛选；`freshnessMetric` 指定用于 `timestamp()` 检查的原始指标名（窗口查询也使用原始指标，而不是窗口函数的求值时间）；`instantOnly` 表示只在总览查询。将可选指标配置为 `null` 可以禁用。公开 API 不接受任意 PromQL，也不返回 Prometheus URL 或凭据。

## 轻量运行

- 即时查询缓存 15 秒、相同请求合并，多个访问者共享服务器查询结果。
- 查询并发最多 4，唯一待处理查询最多 68，单查询超时 8 秒。
- 历史默认 24 小时，可选 1 小时、6 小时、7 天；自适应步长，每条最多 720 点，每项最多 200 序列。超过限额显示查询不可用，避免悄悄截断。
- 查询缓存最多 100 条且序列 JSON 体积最多 32 MiB；单次响应上限 16 MiB。
- 图表库和详情页面按需加载；超过 12 条曲线时可按探针和目标筛选，数值表保留所有序列。
- 前端后台标签页暂停刷新，返回前台刷新总览，超过有效期的总览数据留空。
- 全部脚本、字体回退和样式来自本地，不依赖 CDN。

## 部署

### Docker Compose

配置 `.env` 后：

```sh
docker compose up -d --build
```

容器内部 `127.0.0.1` 指的是容器自身；请填写容器可达的 Prometheus 地址，或将服务加入 Prometheus 的 Docker 网络并使用服务名。多阶段镜像只保留 Node、后端代码、配置和静态页面，以非 root 用户运行。自定义配置的挂载方式见 `compose.yaml`。

### 普通 Node / systemd

构建后只需部署 `dist/`、`server/`、`shared/`、`config/`，通过 `node server/index.mjs` 启动。环境变量放在服务端即可；后端不需要安装 npm 依赖。

提供 `deploy/cqu-netprobe.service` 示例：代码放 `/opt/cqu-netprobe`，创建专用 `netprobe` 用户，将 `PROMETHEUS_URL` 等配置放 `/etc/cqu-netprobe.env`；按服务器实际 Node 路径修改 `ExecStart`，再安装 service。可以直接通过服务端口访问，无需 Nginx；已有入口或负载均衡可以把 HTTP 请求交给该端口。

## API 与验证

- `GET /api/health`：进程健康与配置标记，**不代表 Prometheus 已连通**。
- `GET /api/overview`：所有楼栋当前状态、探针、目录和数据源状态。
- `GET /api/buildings/:id/history?range=24h`：指定楼栋的历史序列。

`source.state` 区分 `unconfigured`、`ready`、`partial`、`error`；`ready` 也可能是真实空结果。`source.errors` 返回指标与错误类别，不公开上游错误文本。

```sh
npm test
npm run build
```

测试使用本地 HTTP Prometheus 协议夹具，验证状态、单位、标签转义、超时、缓存、参数校验、序列限额和生产路由；不接收上报或执行额外数据采集。

### 网络事件与状态公告

`/status` 提供全局状态、校区近 7 天状态条、日期筛选和近期异常片段。总览及详情顶部保留当前事件，新事件或严重度升级会弹出最多两条 12 秒通知；关闭通知不隐藏仍在进行的事件。恢复提示只在得到有效恢复证据后出现，查询失败、监测范围变化或缺少样本不会被当成恢复。

当前丢包事件按楼栋内所有有效探针、所有目标的最高当前丢包率判定。大于 0 立即告警，严格超过 `max(5%, P99 + 2 个百分点)` 判为严重，不再要求平均值越线或持续 2 分钟。P99 来自同一“楼栋最高单目标丢包率”统计量的过去 7 天分布，排除最近 15 分钟；至少需要 144 个有效的 5 分钟采样点。基线不足或查询失败时，仍立即告警，严重阈值暂用 5%，界面标注基线不足。P95 只保留为参考，不再决定告警门槛。

以 `campus_probe_last_seen_timestamp_seconds` 的**值**计算上报年龄，不使用 `campus_probe_online` 的网关阈值判定断网。距上次上报达到 1800 秒、且不超过 86400 秒的任何探针都会触发所在楼栋的断网事件；事件列出受影响探针和最后上报时间。其他探针仍有上报时标题为“探针断网”，全部近期探针断网时标题为“疑似断网”。超过 86400 秒标为“节点下线”，退出当前故障统计和校区分母，保留在探针表中。节点下线、数据缺失和查询失败都不视为故障恢复。无有效最近上报值时状态未知；未来超过 30 秒的上报值也不用于断网判定。

校区事件仍要求至少 3 栋、占最近 24 小时有上报楼栋的 60%；同一楼栋多个事件只计一次。只有整栋楼全部近期探针断网的范围满足条件时才显示“校园网疑似中断”，单探针故障不会直接推断整个校园网中断。

事件历史直接由 Prometheus 重建，无数据库或人工事故工作流：近 7 天每 15 分钟采样，使用相同的 30 分钟/24 小时上报规则及任一目标丢包大于 0 规则重建校区异常片段。历史页只记录达到校区覆盖条件的大面积异常，不能保留采样间隔内的每次单探针瞬时告警；原始楼栋详情历史曲线可用于进一步查看。小时色块显示最差观测，采样缺口保持空白或黄色。校区“在线观测率”是楼栋在线比例的采样平均值，缺失时段不算在线，覆盖率另列；不是校园 SLA。

`config/default.json` 的 `thresholds.reportOfflineSeconds` 和 `thresholds.nodeOfflineSeconds` 分别为 1800 与 86400。`events` 配置事件开关、最低历史样本量、严重阈值下限、P99 裕量及校区覆盖条件。告警证据随总览刷新立即判定，历史基线后台查询并缓存 5 分钟，不阻塞丢包公告。所有查询只在服务端生成，公共 API 不接受 PromQL。生产环境仍需提供真实 Prometheus 地址；演示仅使用明确标注的本地模拟数据。

### 外观模式

右上角提供浅色、暗夜和跟随系统三种外观，默认跟随系统。选择保存在浏览器本地，刷新后仍有效；跟随系统时会响应系统外观变化。公告、历史状态、监控表格和图表均随主题切换，无需额外依赖。
