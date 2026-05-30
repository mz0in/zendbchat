# User Guide

DBChatPro TypeScript is a standalone browser app for configuring database connections, generating SQL from prompts, editing SQL, building SQL visually, and reviewing results.

## Main Navigation

- Dashboard: chat with the active database, choose AI provider/model, run prompts, inspect results, edit SQL, and use the Smart SQL Builder.
- Connections: add, check, save, and delete database connection profiles.
- Settings: configure AI providers, models, endpoints, API keys, and custom OpenAI-compatible providers.

## Database Connections

Open Connections and add a profile with:

- Database Type
- Connection name
- Connection string

Supported connection profile types:

- MSSQL
- MySQL
- PostgreSQL
- Oracle
- SQLite

The current standalone browser implementation uses `src/services/mockApi.ts`, so connection checks and query results are simulated. A real backend adapter is required for live database access.

## Chat With Your Database

On Dashboard:

1. Select a database.
2. Select an AI provider.
3. Select an AI model from the dropdown.
4. Enter a natural-language prompt.
5. Click Submit.

The app generates SQL, runs it through the current data adapter, and shows results.

## SQL Editor

The SQL Editor contains:

- Smart SQL Builder: visual query construction from schema metadata.
- Editable SQL textarea: final SQL can be manually changed.
- Execute button: runs the current SQL text.

## Smart SQL Builder

The builder supports:

- table autocomplete
- column selection
- optional join
- filter conditions
- sorting
- row limit

Click Build SQL to place generated SQL into the editor. You can then edit and execute it.

## Results

The Results tab shows returned rows in a table. Controls allow:

- dense rows
- striped rows
- bordered rows
- saving the prompt as a favorite
- CSV export

## History And Favorites

The drawer includes:

- Schema: active database tables and columns.
- Chat: follow-up analysis over the current result set.
- History: previous prompts.
- Favorites: saved prompts.

