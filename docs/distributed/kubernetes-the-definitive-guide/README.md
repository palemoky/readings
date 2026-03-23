# 《Kubernetes 权威指南》

!!! abstract "阅读信息"

    - **评分**：⭐️⭐️⭐️⭐️⭐️
    - **时间**：09/01/2020 → 09/30/2020
    - **读后感**：

| 分类       | 生态位置（K8s 对应能力）   | 常用软件                                  | 说明                           |
| ---------- | -------------------------- | ----------------------------------------- | ------------------------------ |
| 流量入口层 | Ingress / API Gateway      | Traefik / NGINX Ingress Controller / Kong | 集群入口，处理 HTTP/HTTPS 流量 |
| 服务治理层 | Service Mesh               | Istio / Linkerd                           | 服务间通信、熔断、灰度         |
| 服务发现   | Service + DNS（增强）      | Nacos / Consul                            | 注册中心（K8s 自带 Service）   |
| 配置中心   | ConfigMap / Secret（增强） | Nacos / Apollo                            | 动态配置、灰度发布             |
| 发布系统   | Deployment / GitOps        | Jenkins / GitLab CI / Argo CD             | 构建 + 部署                    |
| 监控指标   | Metrics                    | Prometheus                                | 采集指标                       |
| 可视化     | Dashboard                  | Grafana                                   | 展示监控数据                   |
| 日志系统   | Logging                    | ELK Stack / Loki                          | 日志收集分析                   |
| 链路追踪   | Tracing                    | Jaeger / Zipkin                           | 调用链分析                     |
| 安全       | 认证/策略/证书             | Keycloak / OPA / Cert Manager             | 权限 + TLS                     |
| 存储       | PV / PVC                   | Ceph / MinIO / Longhorn                   | 持久化存储                     |
| 应用管理   | Helm / 配置管理            | Helm / Kustomize                          | 应用打包部署                   |
