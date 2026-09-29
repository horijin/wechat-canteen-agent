## AI智能体辅助的餐厅点单和订单管理系统
### 主要功能
利用RAG技术实现LLM辅助的顾客精准智能点单助手，通过长期记忆用户个人档案、饮食偏好和有效理解用户复杂、个性化需求，实现更精准高效的点单建议，有望有效缓解食堂点单场景下的“选择焦虑”问题，并将AI助手整合到全栈食堂订单管理系统中，实现功能有机整合和闭环。

### 项目结构
#### 后端

```text
.
├── app/                        # 核心业务
│   ├── __init__.py             # 包初始化
│   ├── database.py             # 数据库 Engine 与 SessionLocal 配置
│   ├── main.py                 # FastAPI 路由、中间件、生命周期与 AI 核心逻辑
│   ├── models.py               # SQLAlchemy ORM 模型定义 (食堂, 档口, 菜品, 订单, 记忆画像等)
│   ├── schemas.py              # Pydantic 输入输出数据校验模型
│   └── seed.py                 # 演示数据 Seeds
├── static/                     # 静态资源目录
│   └── dishes/                 # 商家上传的菜品图片存储路径
├── tests/                      # 单元测试与集成测试目录
├── .env                        # 运行时环境变量配置 (API Key, 数据库链接等)
├── .env.example                # 环境变量配置模板
├── cafeteria.db                # SQLite 数据库文件 (自动生成)
├── requirements.txt            # 项目 Python 依赖列表
└── run.py                      # 应用启动入口脚本

```
### 后端部署

#### 1. 环境准备

 **Python 3.10** 或更高版本。

#### 2. 克隆项目与安装依赖

```bash
# 激活你的虚拟环境
python -m venv .venv
source .venv/bin/activate  # Windows : .venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

```

#### 3. 配置环境变量

项目根目录下复制 `.env.example` 为 `.env`，并根据实际情况配置：

```ini
# 数据库配置
DATABASE_URL="sqlite:///./cafeteria.db"

# 商家鉴权 Token
MERCHANT_SECRET_TOKEN="xxxxxxxxxxxx"

# AI 大模型 API 配置
OPENAI_API_KEY="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
OPENAI_API_BASE="https://xxx.com" 
LLM_MODEL="XXXXXX"
```

具体方法是，可以在命令行中显示已在venv虚拟环境的情况下输入下面三行命令：

```bash
 export OPENAI_API_KEY="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
 export OPENAI_API_BASE="https://XXXXXX.com" 
 export LLM_MODEL="XXXXXX"
```

#### 4. 启动服务

可以直接使用vnev虚拟环境中根目录的 `run.py` 启动服务：

```bash
python run.py
```

### 前端运行

1. 注册并登录微信开发者平台，选择“创建小程序”，按照指引完成创建流程，并获取可用于开发部署微信小程序的App ID（或测试号App ID） 
2. 下载并在桌面端配置微信开发者工具，按照指引使用微信开发者工具导入本目录，需要将`project.config.json` 中的App ID参数替换为测试者的App ID。
3. 项目代码默认服务开放在本地`http://127.0.0.1:8000`。在联调本机服务时，需要根据实际后端服务部署的 IP 和外网暴露端口的配置情况进行修改。需确认在微信开发者工具中的项目配置栏已关闭“合法域名校验”。
4. 在微信开发者工具选择调试模式，会出现模拟手机UI界面，点击编译按钮，即可在电脑端微信开发者平台进行手机仿真调试、运行。也可点击“真机调试”按钮进行调试。
5. 正式发布必须使用已备案 HTTPS 域名，并在微信公众平台为相应服务配置合法域名。
