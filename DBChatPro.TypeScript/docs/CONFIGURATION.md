# Configuration

Configuration is stored locally in the browser through `localStorage`. It is intended for standalone development and demo use. Production deployments should move secrets and live database access to a backend service.

## AI Settings

Open Settings to configure:

- AI Provider
- Model
- Endpoint
- API key
- AWS region/profile when using AWS Bedrock

Built-in providers:

- OpenAI
- Azure OpenAI
- Anthropic Claude
- Google Gemini
- Ollama
- GitHub Models
- AWS Bedrock

## Custom OpenAI-Compatible Providers

Use the custom provider form for providers that expose an OpenAI-compatible API.

Required fields:

- Provider name
- Base URL
- API key
- Models, as a comma-separated list

Example:

```text
Provider name: OpenRouter
Base URL: https://openrouter.ai/api/v1
Models: openai/gpt-4.1, anthropic/claude-3.5-sonnet
```

After adding a custom provider, it appears in the Dashboard AI Provider dropdown.

## Custom Models

If a model is missing from the provider model dropdown:

1. Open Settings.
2. Select the provider.
3. Enter the model or deployment name in Custom model name.
4. Click Add.
5. Save Settings.

The model will then be available in the Dashboard model dropdown.

## Database Connection Strings

Examples:

```text
MSSQL: Data Source=localhost;Initial Catalog=Sales;Trusted_Connection=True;TrustServerCertificate=true
MySQL: Server=127.0.0.1;Port=3306;Database=sales;Uid=user;Pwd=password
PostgreSQL: Host=127.0.0.1;Port=5432;Database=sales;Username=user;Password=password
Oracle: User Id=user;Password=password;Data Source=localhost:1521/service
SQLite: file:./data/app.db
SQLite: sqlite://./data/app.db
```

## SQLite

SQLite is supported as a connection profile type and in the mock adapter. Reading an actual SQLite file from a browser app is not available without a backend or browser-specific file import flow.

For live SQLite support, add a TypeScript backend endpoint that can:

- open the SQLite file
- introspect tables and columns
- execute read-only SQL
- return rows to the frontend

