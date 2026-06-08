"""Database models for Colony marketplace."""

from sqlalchemy import (
    Column,
    String,
    Integer,
    Float,
    Text,
    DateTime,
    JSON,
    Boolean,
    ForeignKey,
    CheckConstraint,
    Index,
    create_engine,
    event,
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from datetime import datetime, timezone
import uuid

Base = declarative_base()

# Status enum values used across models
AGENT_STATUSES = ("active", "paused", "archived")
INSTALL_STATUSES = ("active", "paused", "cancelled")
TRANSACTION_STATUSES = ("pending", "confirmed", "failed")
PRICING_TYPES = ("free", "subscription", "per_use")


def gen_id() -> str:
    """Generate a 16-char hex ID from uuid4 — collision-resistant and URL-safe."""
    return uuid.uuid4().hex[:16]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Mixin: common timestamp columns
# ---------------------------------------------------------------------------
class TimestampMixin:
    created_at = Column(DateTime, default=_utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=_utcnow, onupdate=_utcnow, nullable=False
    )


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------
class User(TimestampMixin, Base):
    """A user (creator or buyer)."""
    __tablename__ = "users"

    id = Column(String(16), primary_key=True, default=gen_id)
    name = Column(String(255), default="")
    email = Column(String(255), default="")
    wallet_address = Column(String(255), unique=True, nullable=False, index=True)
    bio = Column(Text, default="")
    is_creator = Column(Boolean, default=False, nullable=False)
    total_earned = Column(Float, default=0.0, nullable=False)
    total_spent = Column(Float, default=0.0, nullable=False)

    # Relationships
    agents = relationship("Agent", back_populates="creator", lazy="dynamic")
    installs = relationship("Install", back_populates="user", lazy="dynamic")
    reviews = relationship("Review", back_populates="user", lazy="dynamic")

    __table_args__ = (
        CheckConstraint("total_earned >= 0", name="ck_user_total_earned_nonneg"),
        CheckConstraint("total_spent >= 0", name="ck_user_total_spent_nonneg"),
    )


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------
class Agent(TimestampMixin, Base):
    """An AI agent in the marketplace."""
    __tablename__ = "agents"

    id = Column(String(16), primary_key=True, default=gen_id)
    name = Column(String(255), nullable=False, index=True)
    slug = Column(String(255), unique=True, nullable=False, index=True)
    description = Column(Text, default="")
    long_description = Column(Text, default="")

    # Creator (FK → users)
    creator_id = Column(
        String(16),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    creator_name = Column(String(255), default="")
    creator_wallet = Column(String(255), default="")

    # Pricing
    pricing_type = Column(String(32), default="free", nullable=False)
    price_usd = Column(Float, default=0.0, nullable=False)
    price_usdc = Column(Float, default=0.0, nullable=False)

    # Agent config
    model = Column(String(128), default="gpt-4o-mini")
    system_prompt = Column(Text, default="")
    tools = Column(JSON, default=list)
    capabilities = Column(JSON, default=list)

    # Marketplace
    category = Column(String(128), default="general", nullable=False, index=True)
    tags = Column(JSON, default=list)
    featured = Column(Boolean, default=False, nullable=False)
    verified = Column(Boolean, default=False, nullable=False)

    # Stats
    installs = Column(Integer, default=0, nullable=False)
    rating_avg = Column(Float, default=0.0, nullable=False)
    rating_count = Column(Integer, default=0, nullable=False)
    total_revenue = Column(Float, default=0.0, nullable=False)

    # Version
    version = Column(String(32), default="1.0.0")
    changelog = Column(Text, default="")

    # Status
    status = Column(String(32), default="active", nullable=False, index=True)

    # Relationships
    creator = relationship("User", back_populates="agents")
    agent_installs = relationship("Install", back_populates="agent", lazy="dynamic")
    agent_reviews = relationship("Review", back_populates="agent", lazy="dynamic")
    agent_transactions = relationship(
        "Transaction", back_populates="agent", lazy="dynamic"
    )

    __table_args__ = (
        CheckConstraint(
            f"pricing_type IN {PRICING_TYPES}",
            name="ck_agent_pricing_type",
        ),
        CheckConstraint(
            f"status IN {AGENT_STATUSES}",
            name="ck_agent_status",
        ),
        CheckConstraint("price_usd >= 0", name="ck_agent_price_usd_nonneg"),
        CheckConstraint("price_usdc >= 0", name="ck_agent_price_usdc_nonneg"),
        CheckConstraint("installs >= 0", name="ck_agent_installs_nonneg"),
        CheckConstraint("rating_avg >= 0 AND rating_avg <= 5", name="ck_agent_rating_avg"),
        CheckConstraint("rating_count >= 0", name="ck_agent_rating_count_nonneg"),
        CheckConstraint("total_revenue >= 0", name="ck_agent_total_revenue_nonneg"),
        # Composite index: find agents by category and status (marketplace listing)
        Index("ix_agents_category_status", "category", "status"),
        # Composite index: find featured/verified agents quickly
        Index("ix_agents_featured_verified", "featured", "verified"),
    )


# ---------------------------------------------------------------------------
# Install
# ---------------------------------------------------------------------------
class Install(TimestampMixin, Base):
    """A user installing an agent."""
    __tablename__ = "installs"

    id = Column(String(16), primary_key=True, default=gen_id)
    agent_id = Column(
        String(16),
        ForeignKey("agents.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = Column(
        String(16),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_wallet = Column(String(255), default="")
    status = Column(String(32), default="active", nullable=False)

    # Relationships
    agent = relationship("Agent", back_populates="agent_installs")
    user = relationship("User", back_populates="installs")

    __table_args__ = (
        CheckConstraint(
            f"status IN {INSTALL_STATUSES}",
            name="ck_install_status",
        ),
        # Composite index: look up installs by agent+user (dedup / per-user queries)
        Index("ix_installs_agent_user", "agent_id", "user_id", unique=True),
        # Index on status for filtering active installs
        Index("ix_installs_status", "status"),
    )


# ---------------------------------------------------------------------------
# Review
# ---------------------------------------------------------------------------
class Review(TimestampMixin, Base):
    """A user review of an agent."""
    __tablename__ = "reviews"

    id = Column(String(16), primary_key=True, default=gen_id)
    agent_id = Column(
        String(16),
        ForeignKey("agents.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = Column(
        String(16),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_name = Column(String(255), default="")
    rating = Column(Integer, nullable=False)
    comment = Column(Text, default="")

    # Relationships
    agent = relationship("Agent", back_populates="agent_reviews")
    user = relationship("User", back_populates="reviews")

    __table_args__ = (
        CheckConstraint("rating >= 1 AND rating <= 5", name="ck_review_rating_range"),
        # Composite index: look up reviews by agent+user (one review per user per agent)
        Index("ix_reviews_agent_user", "agent_id", "user_id", unique=True),
        # Composite index: list reviews for an agent sorted by creation time
        Index("ix_reviews_agent_created", "agent_id", "created_at"),
    )


# ---------------------------------------------------------------------------
# Transaction
# ---------------------------------------------------------------------------
class Transaction(TimestampMixin, Base):
    """A payment transaction (USDC on Base)."""
    __tablename__ = "transactions"

    id = Column(String(16), primary_key=True, default=gen_id)
    agent_id = Column(
        String(16),
        ForeignKey("agents.id", ondelete="RESTRICT"),
        nullable=False,
    )
    buyer_id = Column(
        String(16),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    seller_id = Column(
        String(16),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    amount_usdc = Column(Float, nullable=False)
    platform_fee = Column(Float, default=0.0, nullable=False)
    seller_receives = Column(Float, default=0.0, nullable=False)
    tx_hash = Column(String(255), default="")
    status = Column(String(32), default="pending", nullable=False, index=True)

    # Relationships
    agent = relationship("Agent", back_populates="agent_transactions")
    buyer = relationship("User", foreign_keys=[buyer_id])
    seller = relationship("User", foreign_keys=[seller_id])

    __table_args__ = (
        CheckConstraint(
            f"status IN {TRANSACTION_STATUSES}",
            name="ck_transaction_status",
        ),
        CheckConstraint("amount_usdc >= 0", name="ck_transaction_amount_nonneg"),
        CheckConstraint("platform_fee >= 0", name="ck_transaction_fee_nonneg"),
        CheckConstraint("seller_receives >= 0", name="ck_transaction_seller_receives_nonneg"),
        # Look up transactions by buyer
        Index("ix_transactions_buyer", "buyer_id", "created_at"),
        # Look up transactions by seller
        Index("ix_transactions_seller", "seller_id", "created_at"),
        # Look up transaction by on-chain hash
        Index("ix_transactions_tx_hash", "tx_hash"),
    )


# ---------------------------------------------------------------------------
# Database initialization
# ---------------------------------------------------------------------------
def init_db(db_path: str = "colony.db"):
    """Initialize database with WAL mode for better concurrency."""
    engine = create_engine(f"sqlite:///{db_path}", echo=False)

    # Enable WAL mode and foreign key enforcement for SQLite
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, _connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()

    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session, engine
