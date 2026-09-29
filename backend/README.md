## 项目结构

```text
.
├── app/                        # 核心业务
│   ├── __init__.py             # 包初始化
│   ├── database.py             # 数据库 Engine 与 SessionLocal 配置
│   ├── main.py                 # FastAPI 路由、中间件、生命周期与 AI 核心逻辑
│   ├── models.py               # SQLAlchemy ORM 模型定义 (食堂, 档口, 菜品, 订单, 记忆画像等)
│   ├── schemas.py              # Pydantic 输入输出数据校验模型
│   └── seed.py                 # 演示数据
├── static/                     # 静态资源目录
│   └── dishes/                 # 商家上传的菜品图片存储路径
├── tests/                      # 单元测试与集成测试目录
├── .env                        # 运行时环境变量配置 (API Key, 数据库链接等)
├── .env.example                # 环境变量配置模板
├── cafeteria.db                # SQLite 数据库文件 (自动生成)
├── requirements.txt            # 项目 Python 依赖列表
└── run.py                      # 应用启动入口脚本

```

---

## 服务部署

### 1. 环境准备

 **Python 3.10** 或更高版本。

### 2. 克隆项目与安装依赖

```bash
# 激活你的虚拟环境
python -m venv .venv
source .venv/bin/activate  # Windows : .venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

```

### 3. 配置环境变量

项目根目录下复制 `.env.example` 为 `.env`，并根据实际情况配置：

```ini
# 数据库配置
DATABASE_URL="sqlite:///./cafeteria.db"

# 商家鉴权 Token
MERCHANT_SECRET_TOKEN="xxxxxxxxxxxx"

# AI 大模型 API 配置
OPENAI_API_KEY="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
OPENAI_API_BASE="https://XXXXXX.com" 
LLM_MODEL="XXXXXX"
```

具体方法是，可以在命令行中显示已在venv虚拟环境的情况下输入下面三行命令：

```bash
 export OPENAI_API_KEY="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
 export OPENAI_API_BASE="https://XXXXXX.com" 
 export LLM_MODEL="XXXXXX"
```

### 4. 启动服务

可以直接使用vnev虚拟环境中根目录的 `run.py` 启动服务：

```bash
python run.py
```

