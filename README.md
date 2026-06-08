<p align="center">
</p>

<p align="center">
  <strong>The marketplace for AI agents on Base chain.</strong><br/>
  Browse agents built by real people. Deploy with one click. Earn in USDC.
</p>

<p align="center">
  <a href="https://github.com/colony-hq/colony/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://github.com/colony-hq/colony/stargazers"><img src="https://img.shields.io/github/stars/colony-hq/colony.svg" alt="Stars"></a>
</p>

---

## What is Colony?

Colony is a marketplace where AI agents are published, discovered, and deployed. Everything runs on Base chain. Payments happen in USDC. No Stripe. No bank accounts. No KYC. Just wallets.

**Creators** publish agents and earn USDC. **Users** browse, compare, and deploy agents in one click. **The platform** handles auth, payments, hosting, and agent execution.

## How it works

```
Creator publishes agent
        │
        ▼
┌─────────────────────┐
│     Colony Hub       │  ← Browse, search, filter, sort
│  ┌───────────────┐   │
│  │  Agent Store   │   │  ← Ratings, reviews, pricing
│  └───────┬───────┘   │
│          │            │
│    User deploys      │  ← One click, wallet connect
│          │            │
│    USDC on-chain     │  ← Base chain, verified on-chain
│          │            │
│    Agent runs        │  ← Multi-provider LLM execution
└─────────────────────┘
```

## Quick start

```bash
# Install
pip install colony

# Run the server
python -m colony.cli serve --port 8888

# Open http://localhost:8888
```

Or clone and run:

```bash
git clone https://github.com/colony-hq/colony.git
cd colony
pip install fastapi uvicorn sqlalchemy httpx pyjwt
python -m src.cli serve --port 8888
```

## API

16 endpoints. All tested. All documented.

```
GET    /api/stats                    Marketplace stats
GET    /api/categories               9 categories
GET    /api/agents                   List agents (search, filter, sort, paginate)
GET    /api/agents/{id}              Agent detail + reviews
POST   /api/agents                   Publish agent (auth required)
PUT    /api/agents/{id}              Update agent (auth required)
DELETE /api/agents/{id}              Archive agent (auth required)
GET    /api/auth/message             Get wallet sign message
POST   /api/auth/verify              Verify signature → JWT
GET    /api/auth/me                  Current user profile
PUT    /api/auth/profile             Update profile (auth required)
POST   /api/agents/{id}/install      Install agent (free = instant, paid = payment flow)
POST   /api/agents/{id}/confirm-payment  Verify USDC tx on-chain
POST   /api/agents/{id}/chat         Chat with agent
GET    /api/creator/agents           My published agents (auth required)
GET    /api/creator/earnings         Earnings summary (auth required)
GET    /api/wallet/balance           USDC balance on Base chain
```

## Auth

Wallet-based. No passwords. No emails.

```javascript
// 1. Get sign message from API
const { message } = await fetch('/api/auth/message?address=0x...').then(r => r.json());

// 2. Sign with MetaMask
const signature = await ethereum.request({
  method: 'personal_sign',
  params: [message, walletAddress]
});

// 3. Verify → get JWT
const { token } = await fetch('/api/auth/verify', {
  method: 'POST',
  body: JSON.stringify({ address: walletAddress, signature })
}).then(r => r.json());

// 4. Use token for authenticated requests
fetch('/api/agents', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

## Payments

All payments are USDC on Base chain. No Stripe. No bank accounts. No KYC.

```
User sends USDC → Creator's wallet
                    │
         Backend verifies on-chain
         (Base RPC + Transfer event logs)
                    │
         Agent installed automatically
                    │
         80% → Creator
         20% → Platform
```

**USDC contract on Base:** `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

## Supported AI providers

| Provider | Models | Format |
|----------|--------|--------|
| OpenAI | gpt-4o, gpt-4o-mini | OpenAI-compatible |
| Anthropic | Claude Sonnet 4, Claude Haiku | Native API |
| Groq | Llama 3.3 70B, Mixtral | OpenAI-compatible |
| DeepSeek | deepseek-chat | OpenAI-compatible |
| Cerebras | Llama 3.3 70B, Llama 3.1 8B | OpenAI-compatible |

Agents choose their provider. Users don't need API keys — providers are configured server-side.

## Tech stack

- **Backend:** Python, FastAPI, SQLAlchemy, SQLite
- **Frontend:** Vanilla HTML/CSS/JS (Jinja2 templates)
- **Auth:** Wallet sign + JWT (HMAC-SHA256)
- **Payments:** USDC on Base chain (Ethereum L2)
- **LLM:** OpenAI-compatible API format + Anthropic native API
- **Deploy:** systemd + nginx (any VPS)

## Architecture

```
colony/
├── src/
│   ├── api.py          # FastAPI routes (16 endpoints)
│   ├── auth.py         # Wallet authentication
│   ├── models.py       # SQLAlchemy models
│   ├── payments.py     # USDC payment verification
│   ├── runtime.py      # LLM provider abstraction
│   ├── cli.py          # CLI entrypoint
│   ├── templates/      # Jinja2 HTML templates
│   │   ├── home.html
│   │   ├── browse.html
│   │   ├── agent.html
│   │   ├── create.html
│   │   ├── dashboard.html
│   │   ├── chat.html
│   │   └── base.html
│   └── static/
│       ├── css/style.css
│       └── js/app.js
├── pyproject.toml
├── LICENSE
└── README.md
```

## Categories

| Category | Description |
|----------|-------------|
| coding | Code review, debugging, generation |
| writing | Content, copywriting, editing |
| research | Deep research, analysis, summarization |
| trading | Market analysis, portfolio, DeFi |
| support | Customer support, FAQ, triage |
| data | Data analysis, visualization, ETL |
| automation | Workflows, scheduling, integration |
| creative | Design, music, video ideas |
| general | Everything else |

## Contributing

```bash
git clone https://github.com/colony-hq/colony.git
cd colony
pip install -e ".[dev]"
```

PRs welcome. Open an issue first for big changes.

## License

MIT — see [LICENSE](LICENSE).

---

<p align="center">
  <strong>Built on <a href="https://base.org">Base</a>.</strong><br/>
  <sub>Colony is an open-source project. Not affiliated with Coinbase or Base.</sub>
</p>
