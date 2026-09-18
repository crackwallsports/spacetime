# Life State PWA V1

一个 local-first 的个人状态记录器 PWA。

## 本版重点

- 页面关闭、锁屏、切后台 **不会自动结束当前状态**。
- “关机”语义改为“停止记录 / 未记录”。
- 状态切换支持 5 秒撤销。
- 长时间未切换只提示，不自动修改历史。
- 删除旧 `advancedZone` 思路，不包含目标、周统计、review 等废弃功能。
- 保留原有状态管理、时间线、历史修正、导入/导出。
- 继续使用 `localStorage`，便于兼容现有数据。
- 增加 PWA manifest、Service Worker、离线 App Shell、iPhone safe-area 布局。

## 本地测试

```bash
cd life-state-pwa
python3 -m http.server 8080
```

Mac 浏览器访问：

```text
http://localhost:8080
```

Service Worker 在 localhost 可正常测试。

## iPhone 测试

正式测试 PWA 请部署到 HTTPS 地址，然后 Safari 打开：

1. 分享
2. 添加到主屏幕
3. 选择作为 Web App 打开
4. 从主屏幕启动 `State`

局域网 `http://Mac-IP:8080` 可以测试 UI，但不适合验证完整 Service Worker 安全上下文行为。

## 数据兼容

仍使用原 key：

```text
focus_machine_v1
```

因此在同一 origin 下升级时可继续读取原数据。建议升级前先使用“导出数据”备份。
