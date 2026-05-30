# DBChatPro TypeScript Standalone

This is a standalone TypeScript React application for DBChatPro. Everything needed by the app lives in this directory.

The app includes the complete product surface in TypeScript:

- manage database connections
- use MSSQL, MySQL, PostgreSQL, Oracle, and SQLite connection profiles
- inspect discovered schema
- generate SQL from a natural language prompt
- run or edit SQL
- view/export results
- save prompt history and favorites
- chat over the current result set

The current implementation uses a local TypeScript API adapter in `src/services/mockApi.ts` so it can run by itself without database credentials or AI provider keys. Replace that adapter with a real TypeScript/Node API client when the backend endpoint is ready.

SQLite connection strings can use local file style values such as:

```text
file:./data/app.db
sqlite://./data/app.db
```

The browser-only demo simulates SQLite through the local mock adapter; a real backend adapter is needed to read an actual local SQLite file.

## Run

```sh
bun install
bun run dev
```

Then open `http://localhost:5173`.

## Build

```sh
bun run build
```

## Documentation

- [User Guide](docs/USER_GUIDE.md)
- [Configuration](docs/CONFIGURATION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Development](docs/DEVELOPMENT.md)

## Project Boundary

Everything required to run the standalone app lives inside this directory:

- `src/App.tsx` contains the full React UI and workflow state.
- `src/types.ts` contains the TypeScript domain model.
- `src/services/mockApi.ts` contains the local API implementation.
- `src/styles.css` contains all app styling.
