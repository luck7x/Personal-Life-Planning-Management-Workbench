# 明心台后端 MVP

这个后端只做第一阶段的数据闭环：用 FastAPI 提供 API，用 SQLite 保存完整 workspace state。

## WSL2 本地启动

在仓库根目录执行：

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
```

检查服务：

```bash
curl http://127.0.0.1:8000/api/health
```

## API

- `GET /api/health`：健康检查。
- `GET /api/state`：读取当前完整工作台状态。
- `POST /api/state`：保存完整工作台状态，请求体格式：

```json
{
  "state": {}
}
```

## 数据位置

SQLite 数据库默认写入：

```text
backend/data/mingxintai.sqlite3
```

删除测试环境：

```bash
rm -rf .venv backend/data
```
