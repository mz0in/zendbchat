# Development

## Prerequisites

- Bun 1.0.10 or newer

Check Bun:

```sh
bun --version
```

## Install

```sh
bun install
```

## Start Dev Server

```sh
bun run dev
```

Open:

```text
http://localhost:5173
```

## Typecheck

```sh
bun run typecheck
```

## Build

```sh
bun run build
```

## Preview Production Build

```sh
bun run preview
```

## Adding A Database Type

1. Add the type to `DatabaseType` in `src/types.ts`.
2. Add it to `databaseTypes` in `src/App.tsx`.
3. Add a connection placeholder in `connectionPlaceholders`.
4. Add schema and result behavior in `src/services/mockApi.ts`.
5. Confirm Smart SQL Builder syntax handling in `buildSmartSql`.
6. Run `bun run typecheck` and `bun run build`.

## Adding An AI Provider

1. Add provider metadata in `builtInProviders` in `src/App.tsx`.
2. Add model defaults in `modelCatalog`.
3. If the provider needs custom request handling, implement that in the future real API adapter.
4. Run `bun run typecheck` and `bun run build`.

## Replacing The Mock API

Create a real implementation of `DbChatApi` with the same methods:

- `getConnections`
- `addConnection`
- `deleteConnection`
- `generateSchema`
- `getAiSqlQuery`
- `getDataTable`
- `getQueries`
- `saveQuery`
- `chatPrompt`

Then update `src/App.tsx` to import the real API adapter instead of `mockApi`.

## Safety Notes

- Do not store production database credentials or AI API keys in browser localStorage.
- Validate generated SQL on the backend before execution.
- Prefer read-only database users for query execution.
- Add query timeouts and row limits in live adapters.
