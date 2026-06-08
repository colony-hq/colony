"""Colony CLI."""

import argparse


def main():
    parser = argparse.ArgumentParser(prog="colony", description="Colony — AI Agent Marketplace")
    sub = parser.add_subparsers(dest="command")

    serve_cmd = sub.add_parser("serve", help="Start Colony server")
    serve_cmd.add_argument("--port", type=int, default=8888)
    serve_cmd.add_argument("--host", default="0.0.0.0")
    serve_cmd.add_argument("--db", default="colony.db")

    sub.add_parser("version", help="Show version")

    args = parser.parse_args()

    if args.command == "serve":
        from src.api import create_app
        import uvicorn
        app = create_app(args.db)
        print(f"Colony starting on http://{args.host}:{args.port}")
        uvicorn.run(app, host=args.host, port=args.port, log_level="info")

    elif args.command == "version":
        from src import __version__
        print(f"colony v{__version__}")

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
