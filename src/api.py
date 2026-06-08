"""
Colony API — Full backend with auth, payments, agent runtime, and creator dashboard.
"""

import time
from pathlib import Path
from fastapi import FastAPI, Request, Query, HTTPException, Depends, Header
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from datetime import datetime, timezone

from src.models import init_db, Agent, Install, Review, Transaction, User
from src.auth import create_token, verify_token, get_auth_message
from src.payments import get_usdc_balance, verify_usdc_transfer, calculate_payment
from src.runtime import AgentConfig, AgentMessage, run_agent


def create_app(db_path: str = "colony.db") -> FastAPI:
    app = FastAPI(title="Colony", version="0.1.0")
    Session, engine = init_db(db_path)

    # Static files & templates
    static_dir = Path(__file__).parent / "static"
    template_dir = Path(__file__).parent / "templates"
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
    templates = Jinja2Templates(directory=str(template_dir))

    # ──────────────────────────────────────────────
    # AUTH HELPERS
    # ──────────────────────────────────────────────

    def get_current_user(authorization: str = Header("")) -> dict | None:
        """Extract user from Authorization header."""
        if not authorization.startswith("Bearer "):
            return None
        token = authorization[7:]
        return verify_token(token)

    def require_auth(authorization: str = Header("")) -> dict:
        """Require authenticated user."""
        user = get_current_user(authorization)
        if not user:
            raise HTTPException(401, "Authentication required")
        return user

    def get_or_create_user(session, wallet_address: str) -> User:
        """Get existing user or create new one."""
        user = session.query(User).filter(User.wallet_address == wallet_address.lower()).first()
        if not user:
            user = User(wallet_address=wallet_address.lower())
            session.add(user)
            session.commit()
        return user

    # ──────────────────────────────────────────────
    # AUTH
    # ──────────────────────────────────────────────

    @app.get("/api/auth/message")
    async def auth_message(wallet: str = Query(...)):
        """Get the message that the wallet needs to sign."""
        return {"message": get_auth_message(wallet)}

    @app.post("/api/auth/verify")
    async def auth_verify(request: Request):
        """
        Verify wallet signature and return JWT token.
        Body: {"wallet": "0x...", "signature": "0x..."}
        
        For MVP: accept any wallet address (signature verification
        happens on frontend via wallet provider). Backend trusts
        that if frontend sends wallet address, user owns it.
        In production: verify EIP-191 signature server-side.
        """
        data = await request.json()
        wallet = data.get("wallet", "").lower()
        if not wallet or not wallet.startswith("0x"):
            raise HTTPException(400, "Invalid wallet address")

        session = Session()
        try:
            user = get_or_create_user(session, wallet)
            token = create_token(wallet, user.id)
            return {
                "token": token,
                "user": {
                    "id": user.id,
                    "wallet": user.wallet_address,
                    "name": user.name,
                    "is_creator": user.is_creator,
                    "total_earned": user.total_earned,
                    "total_spent": user.total_spent,
                },
            }
        finally:
            session.close()

    @app.get("/api/auth/me")
    async def auth_me(user=Depends(require_auth)):
        """Get current user profile."""
        session = Session()
        try:
            u = session.query(User).filter(User.wallet_address == user["sub"]).first()
            if not u:
                raise HTTPException(404, "User not found")
            return {
                "id": u.id,
                "wallet": u.wallet_address,
                "name": u.name,
                "bio": u.bio,
                "is_creator": u.is_creator,
                "total_earned": u.total_earned,
                "total_spent": u.total_spent,
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
        finally:
            session.close()

    @app.put("/api/auth/profile")
    async def update_profile(request: Request, user=Depends(require_auth)):
        """Update user profile."""
        data = await request.json()
        session = Session()
        try:
            u = session.query(User).filter(User.wallet_address == user["sub"]).first()
            if not u:
                raise HTTPException(404, "User not found")
            if "name" in data:
                u.name = data["name"]
            if "bio" in data:
                u.bio = data["bio"]
            session.commit()
            return {"status": "ok"}
        finally:
            session.close()

    # ──────────────────────────────────────────────
    # AGENTS — PUBLIC
    # ──────────────────────────────────────────────

    @app.get("/api/agents")
    async def list_agents(
        category: str = Query("all"),
        sort: str = Query("popular"),
        limit: int = Query(50, ge=1, le=200),
        offset: int = Query(0, ge=0),
        search: str = Query(""),
    ):
        """List agents in the marketplace."""
        session = Session()
        try:
            query = session.query(Agent).filter(Agent.status == "active")
            if category != "all":
                query = query.filter(Agent.category == category)
            if search:
                query = query.filter(
                    Agent.name.ilike(f"%{search}%") | Agent.description.ilike(f"%{search}%")
                )
            total = query.count()
            if sort == "popular":
                query = query.order_by(Agent.installs.desc())
            elif sort == "newest":
                query = query.order_by(Agent.created_at.desc())
            elif sort == "rating":
                query = query.order_by(Agent.rating_avg.desc())
            elif sort == "price":
                query = query.order_by(Agent.price_usd.asc())
            agents = query.offset(offset).limit(limit).all()
            return {
                "total": total,
                "agents": [
                    {
                        "id": a.id,
                        "name": a.name,
                        "slug": a.slug,
                        "description": a.description,
                        "creator_name": a.creator_name,
                        "pricing_type": a.pricing_type,
                        "price_usd": a.price_usd,
                        "category": a.category,
                        "tags": a.tags,
                        "installs": a.installs,
                        "rating_avg": a.rating_avg,
                        "rating_count": a.rating_count,
                        "verified": a.verified,
                        "featured": a.featured,
                        "version": a.version,
                        "model": a.model,
                        "created_at": a.created_at.isoformat() if a.created_at else None,
                    }
                    for a in agents
                ],
            }
        finally:
            session.close()

    @app.get("/api/agents/{agent_id}")
    async def get_agent(agent_id: str):
        """Get full agent details."""
        session = Session()
        try:
            agent = session.query(Agent).filter(Agent.id == agent_id).first()
            if not agent:
                agent = session.query(Agent).filter(Agent.slug == agent_id).first()
            if not agent:
                raise HTTPException(404, "Agent not found")
            reviews = (
                session.query(Review)
                .filter(Review.agent_id == agent.id)
                .order_by(Review.created_at.desc())
                .limit(10)
                .all()
            )
            return {
                "id": agent.id,
                "name": agent.name,
                "slug": agent.slug,
                "description": agent.description,
                "long_description": agent.long_description,
                "creator_name": agent.creator_name,
                "creator_wallet": agent.creator_wallet,
                "pricing_type": agent.pricing_type,
                "price_usd": agent.price_usd,
                "price_usdc": agent.price_usdc,
                "model": agent.model,
                "tools": agent.tools,
                "capabilities": agent.capabilities,
                "category": agent.category,
                "tags": agent.tags,
                "installs": agent.installs,
                "rating_avg": agent.rating_avg,
                "rating_count": agent.rating_count,
                "verified": agent.verified,
                "featured": agent.featured,
                "version": agent.version,
                "changelog": agent.changelog,
                "status": agent.status,
                "created_at": agent.created_at.isoformat() if agent.created_at else None,
                "reviews": [
                    {
                        "id": r.id,
                        "user_name": r.user_name,
                        "rating": r.rating,
                        "comment": r.comment,
                        "created_at": r.created_at.isoformat() if r.created_at else None,
                    }
                    for r in reviews
                ],
            }
        finally:
            session.close()

    @app.get("/api/categories")
    async def list_categories():
        """List all categories."""
        return {
            "categories": [
                {"id": "coding", "name": "Coding", "description": "Code review, generation, debugging"},
                {"id": "writing", "name": "Writing", "description": "Content creation, copywriting"},
                {"id": "research", "name": "Research", "description": "Web search, analysis, summaries"},
                {"id": "trading", "name": "Trading", "description": "Crypto trading, DeFi, portfolio"},
                {"id": "support", "name": "Support", "description": "Customer support, FAQ, helpdesk"},
                {"id": "data", "name": "Data", "description": "Data analysis, visualization, ETL"},
                {"id": "automation", "name": "Automation", "description": "Workflow automation, scheduling"},
                {"id": "creative", "name": "Creative", "description": "Image gen, video, music, design"},
                {"id": "general", "name": "General", "description": "General purpose AI assistants"},
            ]
        }

    @app.get("/api/stats")
    async def get_stats():
        """Marketplace stats."""
        session = Session()
        try:
            total_agents = session.query(Agent).filter(Agent.status == "active").count()
            total_installs = sum(a.installs for a in session.query(Agent).all())
            total_revenue = sum(a.total_revenue for a in session.query(Agent).all())
            total_users = session.query(User).count()
            categories = {}
            for a in session.query(Agent).filter(Agent.status == "active").all():
                categories[a.category] = categories.get(a.category, 0) + 1
            return {
                "total_agents": total_agents,
                "total_installs": total_installs,
                "total_revenue_usdc": round(total_revenue, 2),
                "total_users": total_users,
                "categories": categories,
            }
        finally:
            session.close()

    # ──────────────────────────────────────────────
    # AGENTS — CREATOR (auth required)
    # ──────────────────────────────────────────────

    @app.post("/api/agents")
    async def create_agent(request: Request, user=Depends(require_auth)):
        """Create a new agent (publish to marketplace)."""
        data = await request.json()
        session = Session()
        try:
            u = session.query(User).filter(User.wallet_address == user["sub"]).first()
            if not u:
                raise HTTPException(404, "User not found")
            u.is_creator = True

            slug = data["name"].lower().replace(" ", "-").replace("_", "-")
            # Ensure unique slug
            existing = session.query(Agent).filter(Agent.slug == slug).first()
            if existing:
                slug = f"{slug}-{int(time.time())}"

            agent = Agent(
                name=data["name"],
                slug=slug,
                description=data.get("description", ""),
                long_description=data.get("long_description", ""),
                creator_id=u.id,
                creator_name=data.get("creator_name", u.name),
                creator_wallet=u.wallet_address,
                pricing_type=data.get("pricing_type", "free"),
                price_usd=data.get("price_usd", 0.0),
                price_usdc=data.get("price_usdc", data.get("price_usd", 0.0)),
                model=data.get("model", "gpt-4o-mini"),
                system_prompt=data.get("system_prompt", "You are a helpful assistant."),
                tools=data.get("tools", []),
                capabilities=data.get("capabilities", []),
                category=data.get("category", "general"),
                tags=data.get("tags", []),
                version=data.get("version", "1.0.0"),
            )
            session.add(agent)
            session.commit()
            return {"status": "ok", "id": agent.id, "slug": agent.slug}
        except HTTPException:
            raise
        except Exception as e:
            session.rollback()
            return JSONResponse({"error": str(e)}, 400)
        finally:
            session.close()

    @app.put("/api/agents/{agent_id}")
    async def update_agent(agent_id: str, request: Request, user=Depends(require_auth)):
        """Update an agent (creator only)."""
        data = await request.json()
        session = Session()
        try:
            agent = session.query(Agent).filter(Agent.id == agent_id).first()
            if not agent:
                raise HTTPException(404, "Agent not found")
            if agent.creator_wallet != user["sub"]:
                raise HTTPException(403, "Not your agent")

            for field in [
                "name", "description", "long_description", "system_prompt",
                "model", "pricing_type", "price_usd", "price_usdc",
                "category", "tags", "tools", "capabilities", "version", "changelog",
            ]:
                if field in data:
                    setattr(agent, field, data[field])

            agent.updated_at = datetime.now(timezone.utc)
            session.commit()
            return {"status": "ok"}
        except HTTPException:
            raise
        except Exception as e:
            session.rollback()
            return JSONResponse({"error": str(e)}, 400)
        finally:
            session.close()

    @app.delete("/api/agents/{agent_id}")
    async def delete_agent(agent_id: str, user=Depends(require_auth)):
        """Archive an agent (creator only)."""
        session = Session()
        try:
            agent = session.query(Agent).filter(Agent.id == agent_id).first()
            if not agent:
                raise HTTPException(404, "Agent not found")
            if agent.creator_wallet != user["sub"]:
                raise HTTPException(403, "Not your agent")
            agent.status = "archived"
            session.commit()
            return {"status": "archived"}
        except HTTPException:
            raise
        finally:
            session.close()

    @app.get("/api/creator/agents")
    async def creator_agents(user=Depends(require_auth)):
        """List current user's agents."""
        session = Session()
        try:
            agents = session.query(Agent).filter(Agent.creator_wallet == user["sub"]).all()
            return {
                "agents": [
                    {
                        "id": a.id,
                        "name": a.name,
                        "slug": a.slug,
                        "status": a.status,
                        "installs": a.installs,
                        "rating_avg": a.rating_avg,
                        "total_revenue": a.total_revenue,
                        "pricing_type": a.pricing_type,
                        "price_usd": a.price_usd,
                        "created_at": a.created_at.isoformat() if a.created_at else None,
                    }
                    for a in agents
                ]
            }
        finally:
            session.close()

    # ──────────────────────────────────────────────
    # INSTALLS & PAYMENTS
    # ──────────────────────────────────────────────

    @app.post("/api/agents/{agent_id}/install")
    async def install_agent(agent_id: str, request: Request, user=Depends(require_auth)):
        """Install an agent. Free agents install immediately; paid agents need payment."""
        session = Session()
        try:
            agent = session.query(Agent).filter(Agent.id == agent_id).first()
            if not agent:
                raise HTTPException(404, "Agent not found")

            u = session.query(User).filter(User.wallet_address == user["sub"]).first()
            if not u:
                raise HTTPException(404, "User not found")

            # Check if already installed
            existing = (
                session.query(Install)
                .filter(Install.agent_id == agent_id, Install.user_id == u.id, Install.status == "active")
                .first()
            )
            if existing:
                return {"status": "already_installed", "install_id": existing.id}

            if agent.pricing_type == "free":
                # Free agent — install immediately
                install = Install(agent_id=agent_id, user_id=u.id, user_wallet=u.wallet_address)
                agent.installs += 1
                session.add(install)
                session.commit()
                return {"status": "ok", "install_id": install.id, "payment_required": False}
            else:
                # Paid agent — return payment details
                payment = calculate_payment(agent.price_usdc)
                return {
                    "status": "payment_required",
                    "payment_required": True,
                    "agent_id": agent_id,
                    "agent_name": agent.name,
                    "pricing_type": agent.pricing_type,
                    "payment": payment,
                    "pay_to": agent.creator_wallet,
                    "network": "base",
                    "usdc_contract": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                }
        except HTTPException:
            raise
        except Exception as e:
            session.rollback()
            return JSONResponse({"error": str(e)}, 400)
        finally:
            session.close()

    @app.post("/api/agents/{agent_id}/confirm-payment")
    async def confirm_payment(agent_id: str, request: Request, user=Depends(require_auth)):
        """Confirm USDC payment for a paid agent."""
        data = await request.json()
        tx_hash = data.get("tx_hash", "")
        if not tx_hash:
            raise HTTPException(400, "tx_hash required")

        session = Session()
        try:
            agent = session.query(Agent).filter(Agent.id == agent_id).first()
            if not agent:
                raise HTTPException(404, "Agent not found")

            u = session.query(User).filter(User.wallet_address == user["sub"]).first()
            if not u:
                raise HTTPException(404, "User not found")

            payment = calculate_payment(agent.price_usdc)

            # Verify on-chain
            result = await verify_usdc_transfer(
                tx_hash=tx_hash,
                expected_from=u.wallet_address,
                expected_to=agent.creator_wallet,
                expected_amount_usdc=agent.price_usdc,
            )

            if not result["verified"]:
                return JSONResponse({"error": f"Payment verification failed: {result['error']}"}, 400)

            # Record transaction
            tx = Transaction(
                agent_id=agent_id,
                buyer_id=u.id,
                seller_id=agent.creator_id,
                amount_usdc=result["amount"],
                platform_fee=payment["platform_fee_usdc"],
                seller_receives=payment["creator_receives_usdc"],
                tx_hash=tx_hash,
                status="confirmed",
            )
            session.add(tx)

            # Install agent
            install = Install(agent_id=agent_id, user_id=u.id, user_wallet=u.wallet_address)
            agent.installs += 1
            agent.total_revenue += result["amount"]

            # Update user spending
            u.total_spent += result["amount"]

            # Update creator earnings
            creator = session.query(User).filter(User.id == agent.creator_id).first()
            if creator:
                creator.total_earned += payment["creator_receives_usdc"]

            session.commit()
            return {
                "status": "ok",
                "install_id": install.id,
                "tx_id": tx.id,
                "amount_paid": result["amount"],
            }
        except HTTPException:
            raise
        except Exception as e:
            session.rollback()
            return JSONResponse({"error": str(e)}, 400)
        finally:
            session.close()

    # ──────────────────────────────────────────────
    # CHAT — RUN AGENT
    # ──────────────────────────────────────────────

    @app.post("/api/agents/{agent_id}/chat")
    async def chat_with_agent(agent_id: str, request: Request, user=Depends(require_auth)):
        """Send a message to an installed agent and get a response."""
        data = await request.json()
        message = data.get("message", "")
        api_key = data.get("api_key", "")  # User's own API key
        history = data.get("history", [])  # Previous messages

        if not message:
            raise HTTPException(400, "message required")

        session = Session()
        try:
            agent = session.query(Agent).filter(Agent.id == agent_id).first()
            if not agent:
                raise HTTPException(404, "Agent not found")

            u = session.query(User).filter(User.wallet_address == user["sub"]).first()
            if not u:
                raise HTTPException(404, "User not found")

            # Check install
            install = (
                session.query(Install)
                .filter(Install.agent_id == agent_id, Install.user_id == u.id, Install.status == "active")
                .first()
            )
            if not install:
                raise HTTPException(403, "Agent not installed. Install it first.")
        finally:
            session.close()

        # Build message history
        messages = []
        for h in history:
            messages.append(AgentMessage(role=h.get("role", "user"), content=h.get("content", "")))
        messages.append(AgentMessage(role="user", content=message))

        # Run agent
        config = AgentConfig(
            agent_id=agent.id,
            name=agent.name,
            model=agent.model,
            system_prompt=agent.system_prompt or "You are a helpful assistant.",
        )

        response = await run_agent(config, messages, api_key=api_key)

        if response.error:
            return JSONResponse({"error": response.error}, 400)

        return {
            "response": response.content,
            "model": response.model,
            "input_tokens": response.input_tokens,
            "output_tokens": response.output_tokens,
            "latency_ms": round(response.latency_ms, 1),
        }

    # ──────────────────────────────────────────────
    # CREATOR DASHBOARD
    # ──────────────────────────────────────────────

    @app.get("/api/creator/earnings")
    async def creator_earnings(user=Depends(require_auth)):
        """Get creator earnings summary."""
        session = Session()
        try:
            u = session.query(User).filter(User.wallet_address == user["sub"]).first()
            if not u:
                raise HTTPException(404, "User not found")

            agents = session.query(Agent).filter(Agent.creator_wallet == user["sub"]).all()
            transactions = (
                session.query(Transaction)
                .filter(Transaction.seller_id == u.id)
                .order_by(Transaction.created_at.desc())
                .limit(50)
                .all()
            )

            total_earnings = sum(t.seller_receives for t in transactions)
            total_platform_fees = sum(t.platform_fee for t in transactions)

            return {
                "total_earnings_usdc": round(total_earnings, 6),
                "total_platform_fees_usdc": round(total_platform_fees, 6),
                "total_agents": len(agents),
                "total_installs": sum(a.installs for a in agents),
                "recent_transactions": [
                    {
                        "id": t.id,
                        "agent_id": t.agent_id,
                        "amount_usdc": t.amount_usdc,
                        "seller_receives": t.seller_receives,
                        "platform_fee": t.platform_fee,
                        "tx_hash": t.tx_hash,
                        "status": t.status,
                        "created_at": t.created_at.isoformat() if t.created_at else None,
                    }
                    for t in transactions
                ],
            }
        finally:
            session.close()

    @app.get("/api/creator/analytics")
    async def creator_analytics(user=Depends(require_auth)):
        """Get creator analytics."""
        session = Session()
        try:
            agents = session.query(Agent).filter(Agent.creator_wallet == user["sub"]).all()
            agent_ids = [a.id for a in agents]

            if not agent_ids:
                return {"agents": [], "total_installs": 0, "total_revenue": 0}

            installs = session.query(Install).filter(Install.agent_id.in_(agent_ids)).all()
            reviews = session.query(Review).filter(Review.agent_id.in_(agent_ids)).all()

            return {
                "agents": [
                    {
                        "id": a.id,
                        "name": a.name,
                        "installs": a.installs,
                        "rating_avg": a.rating_avg,
                        "rating_count": a.rating_count,
                        "total_revenue": a.total_revenue,
                        "status": a.status,
                    }
                    for a in agents
                ],
                "total_installs": sum(a.installs for a in agents),
                "total_revenue": round(sum(a.total_revenue for a in agents), 6),
                "total_reviews": len(reviews),
                "avg_rating": round(sum(r.rating for r in reviews) / len(reviews), 1) if reviews else 0,
            }
        finally:
            session.close()

    # ──────────────────────────────────────────────
    # REVIEWS
    # ──────────────────────────────────────────────

    @app.post("/api/agents/{agent_id}/reviews")
    async def add_review(agent_id: str, request: Request, user=Depends(require_auth)):
        """Add a review to an agent."""
        data = await request.json()
        session = Session()
        try:
            agent = session.query(Agent).filter(Agent.id == agent_id).first()
            if not agent:
                raise HTTPException(404, "Agent not found")

            u = session.query(User).filter(User.wallet_address == user["sub"]).first()

            review = Review(
                agent_id=agent_id,
                user_id=u.id if u else "",
                user_name=data.get("user_name", "Anonymous"),
                rating=data["rating"],
                comment=data.get("comment", ""),
            )

            all_reviews = session.query(Review).filter(Review.agent_id == agent_id).all()
            all_reviews.append(review)
            agent.rating_avg = sum(r.rating for r in all_reviews) / len(all_reviews)
            agent.rating_count = len(all_reviews)

            session.add(review)
            session.commit()
            return {"status": "ok", "review_id": review.id}
        except HTTPException:
            raise
        except Exception as e:
            session.rollback()
            return JSONResponse({"error": str(e)}, 400)
        finally:
            session.close()

    # ──────────────────────────────────────────────
    # WALLET UTILITIES
    # ──────────────────────────────────────────────

    @app.get("/api/wallet/balance")
    async def wallet_balance(wallet: str = Query(...)):
        """Get USDC balance for a wallet on Base chain."""
        balance = await get_usdc_balance(wallet)
        return {"wallet": wallet, "usdc_balance": balance, "network": "base"}

    # ──────────────────────────────────────────────
    # PAGES (HTML templates)
    # ──────────────────────────────────────────────

    @app.get("/", response_class=HTMLResponse)
    async def page_home(request: Request):
        return templates.TemplateResponse(request, "home.html")

    @app.get("/browse", response_class=HTMLResponse)
    async def page_browse(request: Request):
        return templates.TemplateResponse(request, "browse.html")

    @app.get("/agents/{agent_id}", response_class=HTMLResponse)
    async def page_agent(request: Request, agent_id: str):
        # Check if agent exists
        session = Session()
        try:
            agent = session.query(Agent).filter(Agent.id == agent_id).first()
            if not agent:
                agent = session.query(Agent).filter(Agent.slug == agent_id).first()
            if not agent:
                raise HTTPException(404, "Agent not found")
            return templates.TemplateResponse(request, "agent.html")
        except HTTPException:
            return templates.TemplateResponse(request, "agent.html")
        finally:
            session.close()

    @app.get("/agents/{agent_id}/chat", response_class=HTMLResponse)
    async def page_chat(request: Request, agent_id: str):
        session = Session()
        try:
            agent = session.query(Agent).filter(Agent.id == agent_id).first()
            if not agent:
                agent = session.query(Agent).filter(Agent.slug == agent_id).first()
            agent_name = agent.name if agent else "Agent"
            return templates.TemplateResponse(request, "chat.html", {"agent_id": agent_id, "agent_name": agent_name})
        finally:
            session.close()

    @app.get("/dashboard", response_class=HTMLResponse)
    async def page_dashboard(request: Request):
        return templates.TemplateResponse(request, "dashboard.html")

    @app.get("/dashboard/{path:path}", response_class=HTMLResponse)
    async def page_dashboard_sub(request: Request, path: str):
        return templates.TemplateResponse(request, "dashboard.html")

    @app.get("/create", response_class=HTMLResponse)
    async def page_create(request: Request):
        return templates.TemplateResponse(request, "create.html")

    return app
