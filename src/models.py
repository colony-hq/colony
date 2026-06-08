"""Database models for Colony marketplace."""

from sqlalchemy import Column, String, Integer, Float, Text, DateTime, JSON, Boolean, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime, timezone
import uuid

Base = declarative_base()


def gen_id():
    return str(uuid.uuid4())[:12]


class Agent(Base):
    """An AI agent in the marketplace."""
    __tablename__ = "agents"

    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, nullable=False, index=True)
    slug = Column(String, unique=True, nullable=False, index=True)
    description = Column(Text, default="")
    long_description = Column(Text, default="")

    # Creator
    creator_id = Column(String, nullable=False, index=True)
    creator_name = Column(String, default="")
    creator_wallet = Column(String, default="")

    # Pricing
    pricing_type = Column(String, default="free")  # free, subscription, per_use
    price_usd = Column(Float, default=0.0)
    price_usdc = Column(Float, default=0.0)

    # Agent config
    model = Column(String, default="gpt-4o-mini")
    system_prompt = Column(Text, default="")
    tools = Column(JSON, default=list)
    capabilities = Column(JSON, default=list)

    # Marketplace
    category = Column(String, default="general", index=True)
    tags = Column(JSON, default=list)
    featured = Column(Boolean, default=False)
    verified = Column(Boolean, default=False)

    # Stats
    installs = Column(Integer, default=0)
    rating_avg = Column(Float, default=0.0)
    rating_count = Column(Integer, default=0)
    total_revenue = Column(Float, default=0.0)

    # Version
    version = Column(String, default="1.0.0")
    changelog = Column(Text, default="")

    # Status
    status = Column(String, default="active")  # active, paused, archived
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Install(Base):
    """A user installing an agent."""
    __tablename__ = "installs"

    id = Column(String, primary_key=True, default=gen_id)
    agent_id = Column(String, nullable=False, index=True)
    user_id = Column(String, nullable=False, index=True)
    user_wallet = Column(String, default="")
    status = Column(String, default="active")  # active, paused, cancelled
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Review(Base):
    """A user review of an agent."""
    __tablename__ = "reviews"

    id = Column(String, primary_key=True, default=gen_id)
    agent_id = Column(String, nullable=False, index=True)
    user_id = Column(String, nullable=False, index=True)
    user_name = Column(String, default="")
    rating = Column(Integer, nullable=False)  # 1-5
    comment = Column(Text, default="")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Transaction(Base):
    """A payment transaction (USDC on Base)."""
    __tablename__ = "transactions"

    id = Column(String, primary_key=True, default=gen_id)
    agent_id = Column(String, nullable=False, index=True)
    buyer_id = Column(String, nullable=False, index=True)
    seller_id = Column(String, nullable=False, index=True)
    amount_usdc = Column(Float, nullable=False)
    platform_fee = Column(Float, default=0.0)  # 20%
    seller_receives = Column(Float, default=0.0)
    tx_hash = Column(String, default="")  # on-chain tx
    status = Column(String, default="pending")  # pending, confirmed, failed
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class User(Base):
    """A user (creator or buyer)."""
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, default="")
    email = Column(String, default="")
    wallet_address = Column(String, unique=True, nullable=False, index=True)
    bio = Column(Text, default="")
    is_creator = Column(Boolean, default=False)
    total_earned = Column(Float, default=0.0)
    total_spent = Column(Float, default=0.0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


def init_db(db_path: str = "colony.db"):
    """Initialize database."""
    engine = create_engine(f"sqlite:///{db_path}", echo=False)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session, engine
