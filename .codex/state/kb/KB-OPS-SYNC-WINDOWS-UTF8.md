# KB-OPS-SYNC-WINDOWS-UTF8

## Pattern

- Windows 中文项目路径下，Python orchestrator 跨 normalize→apply 传递 event_file 时可能因默认代码页导致路径乱码。

## Root Cause

- ops_sync_run.py 未显式约束子进程编码链路；在 Windows 默认代码页环境里，capture_output/text 的解码结果会污染中文路径。

## Fix

- 在 orchestrator 启动 normalize/apply 子进程时显式设置 PYTHONUTF8=1。
- 对子进程 stdout/stderr 统一使用 UTF-8 解码并在异常字节上 replace，而不是依赖系统代码页。
- 增加包含中文目录名的回归测试，直接校验 normalize.event_file 不含替换字符且后续 apply 成功。

## Precheck

- Windows 上凡是跨 Python 子进程传递文件路径的脚本，都要显式检查 UTF-8 链路。
- 回归测试至少覆盖一个真实中文路径项目根，不能只在 ASCII 临时目录里验证。
