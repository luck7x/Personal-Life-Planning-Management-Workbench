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

更贴近日常使用的本地启动方式：

```bash
export MINGXIN_API_TOKEN='dev-secret'
uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
```

状态接口默认要求访问密钥。启动前设置访问密钥：

```bash
export MINGXIN_API_TOKEN='换成一段只有你知道的长密钥'
uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
```

Windows PowerShell 写法：

```powershell
$env:MINGXIN_API_TOKEN = '换成一段只有你知道的长密钥'
uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
```

仅本地临时开发时，如果确实想禁用密钥校验，可以显式开启：

```bash
export MINGXIN_ALLOW_NO_TOKEN=1
```

公网/VPS 不要设置 `MINGXIN_ALLOW_NO_TOKEN=1`。

测试时如果不想碰默认数据库，可以单独指定数据库路径：

```bash
export MINGXIN_DB_PATH=/tmp/mingxintai-test.sqlite3
```

PowerShell 写法：

```powershell
$env:MINGXIN_DB_PATH = 'D:\temp\mingxintai-test.sqlite3'
```

检查服务：

```bash
curl http://127.0.0.1:8000/api/health
```

## API

- `GET /api/health`：健康检查。
- `GET /api/state`：读取当前完整工作台状态。设置 `MINGXIN_API_TOKEN` 后需要请求头 `X-Mingxin-Token`。
- `POST /api/state`：保存完整工作台状态，请求体格式：

```json
{
  "state": {},
  "reason": "manual"
}
```

设置访问密钥后的命令示例：

```bash
curl -H "X-Mingxin-Token: 换成你的密钥" http://127.0.0.1:8000/api/state
```

## 自动备份

每次 `POST /api/state` 覆盖主状态前，后端会先把旧状态写入快照表，默认保留最近 200 份。

- `GET /api/snapshots`：列出最近快照。
- `GET /api/snapshots/{id}`：读取指定快照。
- `POST /api/snapshots/{id}/restore`：把指定快照恢复为当前状态。

前端“自动同步”开启后，任何本地保存会在约 2 秒后自动上传；手动上传按钮只是兜底，不是日常必需步骤。

部署到 VPS 后，在前端“藏真阁”里把 API 地址改成你的后端地址，并填写访问密钥；之后打开自动同步即可。

## VPS 部署模板

本目录提供最小部署模板：

- `backend/.env.example`：后端环境变量示例。
- `backend/deploy/systemd/mingxintai.service`：systemd 服务模板。
- `backend/deploy/nginx/mingxintai.conf`：Nginx 静态页 + API 反代模板。

推荐 VPS 目录：

```text
/opt/mingxintai                 后端代码和 .venv
/etc/mingxintai/backend.env     后端密钥和数据库路径
/var/lib/mingxintai             SQLite 数据目录
/var/www/mingxintai             前端静态 HTML
```

部署要点：

```bash
sudo mkdir -p /opt/mingxintai /etc/mingxintai /var/lib/mingxintai /var/www/mingxintai
sudo cp backend/.env.example /etc/mingxintai/backend.env
sudo nano /etc/mingxintai/backend.env
sudo chown -R www-data:www-data /var/lib/mingxintai
```

`/etc/mingxintai/backend.env` 至少需要：

```bash
MINGXIN_API_TOKEN=换成一段只有你知道的长密钥
MINGXIN_DB_PATH=/var/lib/mingxintai/mingxintai.sqlite3
```

安装后端依赖：

```bash
cd /opt/mingxintai
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

安装 systemd 服务：

```bash
sudo cp backend/deploy/systemd/mingxintai.service /etc/systemd/system/mingxintai.service
sudo systemctl daemon-reload
sudo systemctl enable --now mingxintai
sudo systemctl status mingxintai
```

安装 Nginx 配置前，先把 `backend/deploy/nginx/mingxintai.conf` 里的 `server_name example.com;` 改成你的域名。

前端静态文件建议复制成英文文件名，避免服务器和浏览器对中文路径处理不一致：

```bash
sudo cp "参考项目/v2/明心台.html" /var/www/mingxintai/mingxintai.html
sudo chown -R www-data:www-data /var/www/mingxintai
```

```bash
sudo cp backend/deploy/nginx/mingxintai.conf /etc/nginx/sites-available/mingxintai
sudo ln -s /etc/nginx/sites-available/mingxintai /etc/nginx/sites-enabled/mingxintai
sudo nginx -t
sudo systemctl reload nginx
```

部署完成后，前端“藏真阁”里：

- API 地址填写 `https://你的域名`。
- 访问密钥填写 `MINGXIN_API_TOKEN` 的值。
- 打开自动同步。

## 数据位置

SQLite 数据库默认写入：

```text
backend/data/mingxintai.sqlite3
```

删除测试环境：

```bash
rm -rf .venv backend/data
```
