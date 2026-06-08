# Contributing to Colony

Thanks for your interest in contributing. Colony is an open-source project and we welcome contributions of all kinds.

## Getting started

```bash
git clone https://github.com/colony-hq/colony.git
cd colony
pip install -e ".[dev]"
```

## Development

```bash
# Run the server
python -m src.cli serve --port 8888

# Run tests
pytest

# Lint
ruff check src/
```

## How to contribute

### Reporting bugs

Open an issue with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Your environment (OS, Python version)

### Suggesting features

Open an issue with:
- The problem you're trying to solve
- Your proposed solution
- Alternatives you've considered

### Submitting code

1. Fork the repo
2. Create a branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Test your changes
5. Commit: `git commit -m "Add my feature"`
6. Push: `git push origin feature/my-feature`
7. Open a PR

### PR guidelines

- One feature per PR
- Include tests if applicable
- Update documentation if needed
- Keep commits clean and descriptive

## Code style

- Python: PEP 8, enforced by ruff
- JavaScript: vanilla JS, no frameworks
- HTML: semantic HTML, Jinja2 templates
- CSS: custom properties, no frameworks

## Architecture

```
src/
├── api.py      → FastAPI routes
├── auth.py     → Wallet authentication
├── models.py   → Database models
├── payments.py → USDC verification
├── runtime.py  → LLM providers
└── cli.py      → CLI
```

## Questions?

Open an issue or start a discussion.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
