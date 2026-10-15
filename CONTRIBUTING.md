# Contributing

1. Branch from `main`: `feat/…`, `fix/…`, `docs/…` ([docs/branching.md](docs/branching.md)).
2. `npm ci`, then work. `npm run dev` is for development only; the products are the Android/Windows/Linux apps and the CLI.
3. Add or update a test in `test/` for logic you change (see [docs/development.md](docs/development.md#adding-a-test)).
4. `npm run check` must pass (typecheck, all tests, build). Browser e2e: `npm run test:e2e`.
5. Keep saving non-destructive, never commit secrets (client secrets and API keys are typed into the app), and keep the
   identifier `com.starnote.interop` so installed apps keep their data.
6. Update [CHANGELOG.md](CHANGELOG.md) under "Unreleased" and any doc your change makes wrong.
