"""Colony CLI — AI Agent Marketplace."""

import argparse
import os
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# .env loading
# ---------------------------------------------------------------------------

def _load_dotenv(env_path: str | None = None) -> dict[str, str]:
    """Load a .env file. Uses python-dotenv if available, otherwise manual parse.

    Returns a dict of keys that were loaded (may be empty if file missing).
    """
    if env_path is None:
        # Walk up from this file to find .env
        here = Path(__file__).resolve().parent
        for candidate in [here / ".env", here.parent / ".env"]:
            if candidate.is_file():
                env_path = str(candidate)
                break

    if env_path is None:
        return {}

    p = Path(env_path)
    if not p.is_file():
        print(f"Warning: .env file not found: {env_path}", file=sys.stderr)
        return {}

    # Try python-dotenv first
    try:
        from dotenv import load_dotenv  # type: ignore[import-untyped]
        load_dotenv(p, override=False)
        return {}
    except ImportError:
        pass

    # Manual parse fallback
    loaded: dict[str, str] = {}
    for raw_line in p.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:  # don't override existing env
            os.environ[key] = value
            loaded[key] = value
    return loaded


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _getenv(key: str, default: str = "") -> str:
    return os.environ.get(key, default)


def _show_config(host: str, port: int, db_path: str, log_level: str, workers: int):
    """Print the current config to stderr."""
    print("=" * 48, file=sys.stderr)
    print("  Colony — AI Agent Marketplace", file=sys.stderr)
    print("=" * 48, file=sys.stderr)
    print(f"  Host       : {host}", file=sys.stderr)
    print(f"  Port       : {port}", file=sys.stderr)
    print(f"  Database   : {db_path}", file=sys.stderr)
    print(f"  Log Level  : {log_level}", file=sys.stderr)
    print(f"  Workers    : {workers}", file=sys.stderr)
    print(f"  JWT Expiry : {_getenv('JWT_EXPIRY_SECONDS', '86400')}s", file=sys.stderr)
    print(f"  Base RPC   : {_getenv('BASE_RPC_URL', '(not set)')}", file=sys.stderr)

    # Show which AI keys are configured
    ai_keys = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GROQ_API_KEY",
               "DEEPSEEK_API_KEY", "CEREBRAS_API_KEY"]
    configured = [k for k in ai_keys if os.environ.get(k)]
    if configured:
        print(f"  AI Keys    : {', '.join(configured)}", file=sys.stderr)
    else:
        print("  AI Keys    : (none configured)", file=sys.stderr)
    print("=" * 48, file=sys.stderr)


def _check_dep(module_name: str, pip_name: str | None = None):
    """Import a module or print a helpful error and exit."""
    try:
        __import__(module_name)
    except ImportError:
        pkg = pip_name or module_name
        print(f"Error: required package '{pkg}' is not installed.", file=sys.stderr)
        print(f"       Install it with:  pip install {pkg}", file=sys.stderr)
        sys.exit(1)


# ---------------------------------------------------------------------------
# Subcommand: migrate
# ---------------------------------------------------------------------------

def _cmd_migrate(db_path: str):
    """Run database migrations (create all tables)."""
    _check_dep("sqlalchemy")
    from src.models import init_db

    print(f"Migrating database: {db_path}")
    _Session, _engine = init_db(db_path)
    print(f"✓ Database ready — tables created/verified in {db_path}")


# ---------------------------------------------------------------------------
# Subcommand: seed
# ---------------------------------------------------------------------------

def _cmd_seed(db_path: str):
    """Seed database with sample categories (stored as metadata or printed)."""
    _check_dep("sqlalchemy")
    from src.models import init_db, Agent, User

    Session, _engine = init_db(db_path)
    session = Session()

    categories = [
        ("coding",      "Coding",      "Code review, generation, debugging"),
        ("writing",     "Writing",     "Content creation, copywriting"),
        ("research",    "Research",    "Web search, analysis, summaries"),
        ("trading",     "Trading",     "Crypto trading, DeFi, portfolio"),
        ("support",     "Support",     "Customer support, FAQ, helpdesk"),
        ("data",        "Data",        "Data analysis, visualization, ETL"),
        ("automation",  "Automation",  "Workflow automation, scheduling"),
        ("creative",    "Creative",    "Image gen, video, music, design"),
        ("general",     "General",     "General purpose AI assistants"),
    ]

    # Create a demo user if none exists
    demo_user = session.query(User).filter(User.wallet_address == "0xseed000000000000000000000000000000000000").first()
    if not demo_user:
        demo_user = User(
            name="Colony Team",
            wallet_address="0xseed000000000000000000000000000000000000",
            is_creator=True,
            bio="Official Colony demo account",
        )
        session.add(demo_user)
        session.commit()
        print(f"  Created demo user: {demo_user.id}")

    # Seed one sample agent per category
    for cat_id, cat_name, cat_desc in categories:
        existing = session.query(Agent).filter(Agent.category == cat_id, Agent.creator_id == demo_user.id).first()
        if existing:
            print(f"  Skipping {cat_name} — sample agent already exists")
            continue

        agent = Agent(
            name=f"{cat_name} Assistant",
            slug=f"demo-{cat_id}-assistant",
            description=f"A demo agent for {cat_desc.lower()}",
            long_description=f"This is a sample {cat_name.lower()} agent to demonstrate the Colony marketplace. {cat_desc}.",
            creator_id=demo_user.id,
            creator_name=demo_user.name,
            creator_wallet=demo_user.wallet_address,
            pricing_type="free",
            category=cat_id,
            tags=[cat_id, "demo"],
            version="1.0.0",
        )
        session.add(agent)
        print(f"  + Seeded: {agent.name} ({cat_id})")

    session.commit()
    session.close()
    print("✓ Seed complete")


# ---------------------------------------------------------------------------
# Subcommand: serve
# ---------------------------------------------------------------------------

def _cmd_serve(host: str, port: int, db_path: str, log_level: str, workers: int):
    """Start the Colony API server."""
    _check_dep("uvicorn", "uvicorn[standard]")
    _check_dep("fastapi", "fastapi")
    _check_dep("sqlalchemy", "sqlalchemy")

    from src.api import create_app  # noqa: E402
    import uvicorn  # noqa: E402

    _show_config(host, port, db_path, log_level, workers)

    app = create_app(db_path)
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level=log_level,
        workers=workers,
    )


# ---------------------------------------------------------------------------
# Subcommand: version
# ---------------------------------------------------------------------------

def _cmd_version():
    from src import __version__
    print(f"colony v{__version__}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def _build_parser() -> argparse.ArgumentParser:
    """Build the argument parser. Called after .env is loaded so defaults reflect env."""
    parser = argparse.ArgumentParser(
        prog="colony",
        description="Colony — AI Agent Marketplace",
    )

    parser.add_argument(
        "--env",
        metavar="FILE",
        default=None,
        help="Path to .env file (default: auto-detect)",
    )

    sub = parser.add_subparsers(dest="command")

    # ── serve ────────────────────────────────────────────────────────────
    serve_cmd = sub.add_parser("serve", help="Start Colony API server")
    serve_cmd.add_argument(
        "--host", default=_getenv("HOST", "0.0.0.0"),
        help="Bind host (default: 0.0.0.0, env: HOST)",
    )
    serve_cmd.add_argument(
        "--port", type=int, default=int(_getenv("PORT", "8888")),
        help="Bind port (default: 8888, env: PORT)",
    )
    serve_cmd.add_argument(
        "--db", dest="db_path", default=_getenv("DATABASE_PATH", "colony.db"),
        help="SQLite database path (default: colony.db, env: DATABASE_PATH)",
    )
    serve_cmd.add_argument(
        "--log-level",
        default=_getenv("LOG_LEVEL", "info"),
        choices=["debug", "info", "warning", "error", "critical"],
        help="Uvicorn log level (default: info, env: LOG_LEVEL)",
    )
    serve_cmd.add_argument(
        "--workers", type=int, default=int(_getenv("WORKERS", "1")),
        help="Number of uvicorn worker processes (default: 1, env: WORKERS)",
    )

    # ── migrate ──────────────────────────────────────────────────────────
    migrate_cmd = sub.add_parser("migrate", help="Run database migrations (create tables)")
    migrate_cmd.add_argument(
        "--db", dest="db_path", default=_getenv("DATABASE_PATH", "colony.db"),
        help="SQLite database path (default: colony.db, env: DATABASE_PATH)",
    )

    # ── seed ─────────────────────────────────────────────────────────────
    seed_cmd = sub.add_parser("seed", help="Seed database with sample categories")
    seed_cmd.add_argument(
        "--db", dest="db_path", default=_getenv("DATABASE_PATH", "colony.db"),
        help="SQLite database path (default: colony.db, env: DATABASE_PATH)",
    )

    # ── version ──────────────────────────────────────────────────────────
    sub.add_parser("version", help="Show version")

    return parser


def main():
    # First pass: extract --env from argv without consuming anything else
    env_path = None
    for i, arg in enumerate(sys.argv[1:], 1):
        if arg == "--env" and i < len(sys.argv) - 1:
            env_path = sys.argv[i + 1]
            break
        if arg.startswith("--env="):
            env_path = arg.split("=", 1)[1]
            break

    # Load .env early so all subcommands pick up env vars
    _load_dotenv(env_path)

    # Build parser (defaults now reflect .env values)
    parser = _build_parser()
    args = parser.parse_args()

    if args.command == "serve":
        _cmd_serve(args.host, args.port, args.db_path, args.log_level, args.workers)

    elif args.command == "migrate":
        _cmd_migrate(args.db_path)

    elif args.command == "seed":
        _cmd_seed(args.db_path)

    elif args.command == "version":
        _cmd_version()

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
