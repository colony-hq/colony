"""
Colony — basic tests.

Run: python -m pytest tests/ -v
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.models import Base, Agent, User, Install, Review
from src.api import app

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


# Use in-memory SQLite for tests
TEST_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def setup_db():
    Base.metadata.create_all(bind=engine)


def teardown_db():
    Base.metadata.drop_all(bind=engine)


def test_stats_endpoint():
    """GET /api/stats returns marketplace stats."""
    setup_db()
    client = TestClient(app)
    response = client.get("/api/stats")
    assert response.status_code == 200
    data = response.json()
    assert "total_agents" in data
    assert "total_users" in data
    assert "total_revenue_usdc" in data
    teardown_db()


def test_categories_endpoint():
    """GET /api/categories returns 9 categories."""
    setup_db()
    client = TestClient(app)
    response = client.get("/api/categories")
    assert response.status_code == 200
    data = response.json()
    assert "categories" in data
    assert len(data["categories"]) == 9
    teardown_db()


def test_agents_list_empty():
    """GET /api/agents returns empty list when no agents."""
    setup_db()
    client = TestClient(app)
    response = client.get("/api/agents")
    assert response.status_code == 200
    data = response.json()
    assert data["agents"] == []
    assert data["total"] == 0
    teardown_db()


def test_auth_message():
    """GET /api/auth/message returns a sign message for a wallet address."""
    setup_db()
    client = TestClient(app)
    response = client.get("/api/auth/message?address=0x1234567890abcdef1234567890abcdef12345678")
    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert "Colony" in data["message"]
    teardown_db()


def test_agent_not_found():
    """GET /api/agents/nonexistent returns 404."""
    setup_db()
    client = TestClient(app)
    response = client.get("/api/agents/nonexistent")
    assert response.status_code == 404
    teardown_db()
