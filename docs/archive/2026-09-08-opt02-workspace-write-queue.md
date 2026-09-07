# OPT-02 原始待办记录

以下要求已完成，当前边界见 [架构说明](../reference/03-architecture.md)。

### OPT-02：配种工作区写入队列

- 依据：[`useBreedingWorkspace`](../../src/features/breeding/useBreedingWorkspace.ts) 的普通 `mutate` 使用 `queueRef`，`replaceWorkspace` 直接执行仓储替换，二者不共享顺序；提交完成后也没有加载代次检查。风险依据为源码路径，尚未动态复现。
- 实施：将替换、重置纳入同一队列，明确入队、重试、卸载与数据库关闭的顺序；已提交的事务不伪装成可取消，过期回调不得覆盖当前状态。
- 定点验收：人为延迟 commit/replace/load，覆盖普通修改与导入交错、排队期间重试、卸载及写入失败；队列失败后仍可继续，重新读取与最终界面状态一致。优先补 hook 测试，并回归现有导入确认流程。
