# Security Policy

## Supported scope

Security fixes target the current active development branch and the latest released demo snapshot. Historical hackathon branches are not maintained as production services.

## Reporting a vulnerability

Do not disclose suspected vulnerabilities in a public issue. Use the repository's private GitHub security advisory flow:

https://github.com/songconmaisaix31-design/we-remember/security/advisories/new

Include the affected path, impact, minimal reproduction, and any safe remediation idea. Do not include real credentials, private family data, browser storage exports, tokens, or robot endpoints.

## Security boundaries

- The username-only gate is a local display session, not authentication or authorization.
- Demo state and responsibility fixtures are not durable production persistence.
- Channel and robot adapters are disabled or isolated by default and do not prove delivery, reading, completion, or physical-device safety.
- Production identity, uploads, external messages, AI providers, and robot access require separate threat modeling and deployment review.
