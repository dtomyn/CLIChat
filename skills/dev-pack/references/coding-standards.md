# Coding standards

A starting point for the program. Replace or extend each rule with the program's agreed standard; keep the headings so the agents can find them.

## Naming
- Names say what something is or does: `renewalFee`, `isPhotoRecent()`. No abbreviations a new team member wouldn't know.
- C#: PascalCase for types, methods and properties; camelCase for locals and parameters; `I` prefix for interfaces.
- JavaScript / TypeScript: camelCase for variables and functions, PascalCase for classes, UPPER_SNAKE for constants.
- Python: snake_case for functions and variables, PascalCase for classes.
- API paths and JSON properties follow `Knowledge/API Standards.md` (kebab-case paths, camelCase properties).

## Structure
- One responsibility per class or module. Keep functions short enough to read without scrolling.
- Business rules live in the domain or service layer, not in controllers, UI code or SQL.
- Configuration comes from settings per environment, never from constants in code.

## Errors and logging
- Fail fast on invalid input with a clear message; return the program error model (`Problem`) from APIs.
- Catch only what you can handle. Never swallow an exception silently.
- Log with a correlation ID (`X-Correlation-ID`). Never log secrets, tokens or personal data (names, emails, permit numbers).

## Security
- No secrets in code, config files or pipeline YAML. Use Key Vault references or the platform's secret store.
- Validate and encode all input and output. Use parameterised queries only.
- Dependencies come from the approved feeds and are pinned to a version.

## Tests
- Unit tests are written first and live beside the code they test (or in the matching test project).
- One behaviour per test; arrange, act, assert. Tests don't depend on each other or on run order.
- Tests name the story and design they cover (`AB#1234`, `TD-105`).
- Target: every acceptance criterion has a test; new code has at least 80% line coverage.

## Reviews
- Small pull requests (under about 400 changed lines) get better reviews. Split bigger changes.
- The author resolves every comment, or explains why not, before merging.
