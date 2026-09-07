# OPT-07 原始待办记录

以下要求已完成，复用契约见 [快捷命令](../reference/07-quick-commands.md)。

### OPT-07：验证链构建复用

- 依据：[`package.json`](../../package.json) 中 build 会生成并测试协议产物，随后 smoke:electron 再生成，打包入口也再次生成并测试；[`test-browser.mjs`](../../script/test-browser.mjs) 与 verify:electron 分别重建 Web。[快捷命令](../reference/07-quick-commands.md)明确当前尚无受验证的跳过构建机制。
- 实施：优先复用同一次协调流程中的成功步骤，不引入通用构建缓存系统。若跨命令复用确有收益，必须验证源码、配置、锁文件、输入数据与产物的一致性，不能只检查 HEAD 或文件存在；各独立命令保持安全默认行为。
- 定点验收：记录构建次数及命令耗时；输入未变时避免重复，源码/配置/数据变化、产物缺失或上一步失败时必须重建或拒绝复用。浏览器、源码桌面和打包应用 smoke 仍各自执行；涉及打包链的实现最终需要真实发布门验证。

## 本次验收与本地产物

- 组合 `verify -- --browser --electron`：五组真实浏览器场景及源码 Electron smoke 通过，零第三方请求、零 console 问题；会话与预览服务已关闭。Web 与协议各构建一次，总耗时 29.35 秒。
- 实际 `powershell.exe` Windows 打包门：39 个文件、390 项 Vitest 通过（27.80 秒）；Web/协议构建 6.122 秒，electron-builder 104.845 秒，完整入口 145.75 秒并以零退出码结束。真实打包应用 smoke 与中英文 locale 检查通过。
- 定点选择/复用测试共 58 项通过；配置边界 13 项通过；Wiki 校验器 8 项通过。输入变化、产物缺失、失败失效、独立入口和消费顺序均有负向或固定断言。
- 本机生成 `build/release/PalTools-0.1.1-win-x64.exe`，88,419,722 字节，SHA-256：`2A18D7A6F6856BD05B55E15B79BE29FE8F6EEE077F11A1B5E4774688883965EF`。
- 本次只验证并更新本地 Windows 产物，没有远程发布；macOS 打包链未改动、未在本机验收。生产构建仍有既有大 chunk 提示，未扩展本次优化范围。
- 提交前仅移除两个新增 TSX 文件末尾的多余空行；重新 build 后，对 Web、协议、Electron 目录与 package 配置共 459 个文件逐一比较 SHA-256，包内输入与已通过 smoke 的产物保持一致。

当前操作契约见[快捷命令](../reference/07-quick-commands.md)。运行日志和逐步计时保存在忽略的 `output/agent-runs/opt07-*.txt` / `*-timing.json`，不将本机一次测量解释为所有环境的固定提速。
