# Architecture

DBChatPro TypeScript is a standalone React and Vite application using Bun for package management.

## Runtime Stack

- Bun: package manager and script runner
- Vite: development server and production build
- React: UI state and rendering
- TypeScript: domain models and compile-time checks
- lucide-react: icons

## Project Layout

```text
DBChatPro.TypeScript/
  src/
    App.tsx
    main.tsx
    styles.css
    types.ts
    services/
      mockApi.ts
  docs/
  package.json
  vite.config.ts
```

## Important Files

- `src/App.tsx`: primary UI, navigation, dashboard, settings, connections, SQL editor, Smart SQL Builder.
- `src/types.ts`: shared domain types and API interface.
- `src/services/mockApi.ts`: local mock implementation of the app data and AI boundary.
- `src/styles.css`: app layout and component styling.

## Data Boundary

The frontend talks through the `DbChatApi` interface in `src/types.ts`.

Current implementation:

```text
App.tsx -> mockApi -> localStorage / simulated data
```

Production implementation:

```text
App.tsx -> real API client -> backend -> AI providers and databases
```

## State

Browser-local state includes:

- connection profiles
- prompt history
- favorites
- AI settings
- custom providers
- custom models

The current app stores this in `localStorage`.

## Smart SQL Builder

The builder consumes `DatabaseSchema`:

- tables come from `schemaStructured[].tableName`
- columns come from `schemaStructured[].columns`
- selected builder state is converted to SQL by `buildSmartSql`

MSSQL uses `TOP`. Other supported database types use `LIMIT`.

## Live Integration Notes

To connect live systems, replace `mockApi` with a real implementation of `DbChatApi`.

The backend should own:

- database drivers and connection handling
- AI provider API keys
- schema introspection
- SQL validation and execution
- audit and access controls

Keep raw credentials out of browser storage for production deployments.

