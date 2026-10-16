# 0009. Apache-2.0 licence with a Contributor License Agreement

Date: 2026-10-16

## Status
Accepted

## Context
The project must be credible open source, easy to adopt and self-host, and safe for companies to use and contribute to. A licence change after external contributions requires every contributor's permission unless that permission was granted up front.

## Decision
- The whole repository is licensed under the **Apache License 2.0** (`LICENSE`, `NOTICE`).
- External contributions require signing the project's **Contributor License Agreement** (`CLA.md`), collected automatically on pull requests (CLA Assistant).
- The CLA is a licence grant, not a copyright assignment: contributors keep ownership of their work. It includes a patent licence and permits the maintainer to distribute contributions under other licences, including future versions of the project licence.
- The Developer Certificate of Origin (DCO) is not used.

## Consequences
- Apache-2.0 gives users an explicit patent grant and imposes minimal obligations, which lowers adoption friction.
- The CLA adds one click to a contributor's first pull request.
- The CLA text should be reviewed by a lawyer before the first external contribution is merged.
