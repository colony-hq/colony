# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability in Colony, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, email: **security@colonyhq.dev** (or open a private security advisory on GitHub).

## What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

## Response timeline

- **24 hours:** Acknowledgment of your report
- **72 hours:** Initial assessment
- **7 days:** Fix or mitigation plan
- **14 days:** Fix released (if applicable)

## Scope

In scope:
- API endpoints (authentication bypass, injection, data leaks)
- Payment verification (double-spend, fake transactions)
- Wallet authentication (signature forgery)
- Agent runtime (prompt injection, sandbox escape)

Out of scope:
- Social engineering
- Denial of service
- Third-party dependencies (report upstream)

## Recognition

We credit reporters in the changelog (unless they prefer anonymity).
