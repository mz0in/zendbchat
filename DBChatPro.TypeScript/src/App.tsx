import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  ChevronDown,
  Database,
  Download,
  Heart,
  History,
  Menu,
  MessageSquare,
  Play,
  Plus,
  RefreshCcw,
  Save,
  Search,
  ShieldCheck,
  Settings,
  Trash2
} from "lucide-react";
import { mockApi } from "./services/mockApi";
import type {
  AIConnection,
  AIProviderConfig,
  AISettings,
  ChatMessage,
  DatabaseSchema,
  DatabaseType,
  HistoryItem,
  QueryResult
} from "./types";

const api = mockApi;

const emptySchema: DatabaseSchema = { schemaRaw: [], schemaStructured: [] };
const emptyResult: QueryResult = { columns: [], rows: [] };

const databaseTypes: DatabaseType[] = ["MSSQL", "MYSQL", "POSTGRESQL", "ORACLE", "SQLITE"];
const connectionPlaceholders: Record<DatabaseType, string> = {
  MSSQL: "Data Source=localhost;Initial Catalog=Sales;Trusted_Connection=True;TrustServerCertificate=true",
  MYSQL: "Server=127.0.0.1;Port=3306;Database=sales;Uid=user;Pwd=password",
  POSTGRESQL: "Host=127.0.0.1;Port=5432;Database=sales;Username=user;Password=password",
  ORACLE: "User Id=user;Password=password;Data Source=localhost:1521/service",
  SQLITE: "file:./data/app.db or sqlite://./data/app.db"
};
const aiSettingsKey = "dbchatpro-ts-ai-settings";
const builtInProviders = [
  { id: "OpenAI", name: "OpenAI", endpoint: "https://api.openai.com/v1" },
  { id: "AzureOpenAI", name: "Azure OpenAI", endpoint: "" },
  { id: "Anthropic", name: "Anthropic Claude", endpoint: "https://api.anthropic.com/v1" },
  { id: "GoogleGemini", name: "Google Gemini", endpoint: "https://generativelanguage.googleapis.com/v1beta/openai" },
  { id: "Ollama", name: "Ollama", endpoint: "http://localhost:11434/v1" },
  { id: "GitHubModels", name: "GitHub Models", endpoint: "https://models.inference.ai.azure.com" },
  { id: "AWSBedrock", name: "AWS Bedrock", endpoint: "" }
];
const modelCatalog: Record<string, string[]> = {
  AzureOpenAI: ["gpt-4.1", "gpt-4o", "gpt-4o-mini", "o4-mini"],
  OpenAI: ["gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini", "o4-mini"],
  Anthropic: ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest", "claude-3-opus-latest"],
  GoogleGemini: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
  Ollama: ["llama3.1", "llama3.2", "mistral", "qwen2.5-coder"],
  GitHubModels: ["gpt-4.1", "gpt-4o", "Phi-4", "DeepSeek-R1"],
  AWSBedrock: ["anthropic.claude-3-5-sonnet-20241022-v2:0", "anthropic.claude-3-haiku-20240307-v1:0", "amazon.nova-pro-v1:0"]
};
const defaultAISettings: AISettings = {
  platform: "OpenAI",
  model: "gpt-4.1",
  endpoint: "",
  apiKey: "",
  awsRegion: "",
  awsProfile: "",
  customModels: {},
  customProviders: []
};

function loadAISettings(): AISettings {
  const raw = window.localStorage.getItem(aiSettingsKey);
  if (!raw) {
    return defaultAISettings;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AISettings>;
    return {
      ...defaultAISettings,
      ...parsed,
      customModels: parsed.customModels ?? {},
      customProviders: parsed.customProviders ?? []
    };
  } catch {
    return defaultAISettings;
  }
}

function saveAISettings(settings: AISettings): void {
  window.localStorage.setItem(aiSettingsKey, JSON.stringify(settings));
}

function getAvailableModels(settings: AISettings): string[] {
  const customProviders = settings.customProviders ?? [];
  const customModels = settings.customModels ?? {};
  const customProvider = customProviders.find((provider) => provider.id === settings.platform);
  return Array.from(
    new Set([
      ...(modelCatalog[settings.platform] ?? []),
      ...(customProvider?.models ?? []),
      ...(customModels[settings.platform] ?? [])
    ])
  );
}

function refreshModels(settings: AISettings): Promise<string[]> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(getAvailableModels(settings)), 350);
  });
}

function getProviderOptions(settings: AISettings): Array<{ id: string; name: string }> {
  return [
    ...builtInProviders.map((provider) => ({ id: provider.id, name: provider.name })),
    ...(settings.customProviders ?? []).map((provider) => ({ id: provider.id, name: provider.name }))
  ];
}

function getProviderEndpoint(settings: AISettings, platform: string): string {
  return (
    (settings.customProviders ?? []).find((provider) => provider.id === platform)?.endpoint ??
    builtInProviders.find((provider) => provider.id === platform)?.endpoint ??
    ""
  );
}

function getProviderApiKey(settings: AISettings, platform: string): string {
  return (settings.customProviders ?? []).find((provider) => provider.id === platform)?.apiKey ?? "";
}

function makeCustomProviderId(name: string): string {
  return `custom:${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "provider"}`;
}

function quoteSqlValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "''";
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return trimmed;
  }

  return `'${trimmed.replaceAll("'", "''")}'`;
}

function buildSmartSql(options: {
  databaseType: DatabaseType;
  tableName: string;
  columns: string[];
  joinType: string;
  joinTable: string;
  joinLeftColumn: string;
  joinRightColumn: string;
  filterColumn: string;
  filterOperator: string;
  filterValue: string;
  sortColumn: string;
  sortDirection: string;
  limit: string;
}): string {
  if (!options.tableName) {
    return "";
  }

  const limitValue = Number.parseInt(options.limit, 10);
  const usesTop = options.databaseType === "MSSQL" && Number.isFinite(limitValue) && limitValue > 0;
  const selectedColumns = options.columns.length > 0 ? options.columns.join(", ") : "*";
  const selectClause = `SELECT${usesTop ? ` TOP ${limitValue}` : ""} ${selectedColumns}`;
  const lines = [selectClause, `FROM ${options.tableName}`];

  if (options.joinTable && options.joinLeftColumn && options.joinRightColumn) {
    lines.push(`${options.joinType} JOIN ${options.joinTable} ON ${options.joinLeftColumn} = ${options.joinRightColumn}`);
  }

  if (options.filterColumn && options.filterOperator && options.filterValue) {
    lines.push(`WHERE ${options.filterColumn} ${options.filterOperator} ${quoteSqlValue(options.filterValue)}`);
  }

  if (options.sortColumn) {
    lines.push(`ORDER BY ${options.sortColumn} ${options.sortDirection}`);
  }

  if (!usesTop && Number.isFinite(limitValue) && limitValue > 0) {
    lines.push(`LIMIT ${limitValue}`);
  }

  return `${lines.join("\n")};`;
}

function createSystemMessage(result: QueryResult): ChatMessage {
  return {
    role: "system",
    text: `You are a helpful AI assistant. Provide helpful insights about the following data: ${JSON.stringify(result.rows)}`
  };
}

function downloadCsv(result: QueryResult): void {
  const lines = [result.columns, ...result.rows].map((row) =>
    row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")
  );
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "export.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function App() {
  const [aiSettings, setAISettings] = useState<AISettings>(() => loadAISettings());
  const [route, setRoute] = useState<"dashboard" | "connections" | "settings">("dashboard");
  const [connections, setConnections] = useState<AIConnection[]>([]);
  const [activeConnectionName, setActiveConnectionName] = useState("");
  const [schema, setSchema] = useState<DatabaseSchema>(emptySchema);
  const [prompt, setPrompt] = useState("");
  const [aiPlatform, setAiPlatform] = useState(aiSettings.platform);
  const [aiModel, setAiModel] = useState(aiSettings.model);
  const [generatedSql, setGeneratedSql] = useState("");
  const [summary, setSummary] = useState("");
  const [result, setResult] = useState<QueryResult>(emptyResult);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [favorites, setFavorites] = useState<HistoryItem[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatPrompt, setChatPrompt] = useState("");
  const [activeTab, setActiveTab] = useState<"results" | "sql" | "insights">("results");
  const [drawerTab, setDrawerTab] = useState<"schema" | "chat" | "history" | "favorites">("schema");
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [compactRows, setCompactRows] = useState(false);
  const [stripedRows, setStripedRows] = useState(true);
  const [borderedRows, setBorderedRows] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState("");
  const [connectionDraft, setConnectionDraft] = useState<AIConnection>({
    name: "",
    connectionString: "",
    databaseType: "MSSQL"
  });
  const [previewSchema, setPreviewSchema] = useState<DatabaseSchema>(emptySchema);

  const activeConnection = useMemo(
    () => connections.find((connection) => connection.name === activeConnectionName) ?? connections[0],
    [activeConnectionName, connections]
  );
  const dashboardModelOptions = useMemo(
    () => getAvailableModels({ ...aiSettings, platform: aiPlatform }),
    [aiSettings, aiPlatform]
  );

  async function refreshConnectionData(connection = activeConnection) {
    if (!connection) {
      setSchema(emptySchema);
      setHistory([]);
      setFavorites([]);
      return;
    }

    const [nextSchema, nextHistory, nextFavorites] = await Promise.all([
      api.generateSchema(connection),
      api.getQueries(connection.name, "History"),
      api.getQueries(connection.name, "Favorite")
    ]);
    setSchema(nextSchema);
    setHistory(nextHistory);
    setFavorites(nextFavorites);
  }

  useEffect(() => {
    api.getConnections().then((items) => {
      setConnections(items);
      setActiveConnectionName(items[0]?.name ?? "");
    });
  }, []);

  useEffect(() => {
    setAiPlatform(aiSettings.platform);
    setAiModel(aiSettings.model);
  }, [aiSettings.platform, aiSettings.model]);

  useEffect(() => {
    if (activeConnection) {
      refreshConnectionData(activeConnection).catch((nextError: unknown) => {
        setError(nextError instanceof Error ? nextError.message : "Unable to load connection data.");
      });
    }
  }, [activeConnection?.name]);

  async function runPrompt(nextPrompt = prompt) {
    if (!activeConnection || !nextPrompt.trim()) {
      return;
    }

    setError("");
    setLoadingMessage("Getting the AI query...");

    try {
      const aiQuery = await api.getAiSqlQuery(aiModel, aiPlatform, nextPrompt, schema, activeConnection.databaseType);
      setGeneratedSql(aiQuery.query);
      setSummary(aiQuery.summary);
      setLoadingMessage("Running the database query...");

      const nextResult = await api.getDataTable(activeConnection, aiQuery.query);
      setResult(nextResult);
      setChatHistory([createSystemMessage(nextResult)]);
      await api.saveQuery(nextPrompt, activeConnection.name, "History");
      await refreshConnectionData(activeConnection);
      setActiveTab("results");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "The query failed.");
    } finally {
      setLoadingMessage("");
    }
  }

  async function executeSql() {
    if (!activeConnection || !generatedSql.trim()) {
      return;
    }

    setLoadingMessage("Running the edited query...");
    try {
      const nextResult = await api.getDataTable(activeConnection, generatedSql);
      setResult(nextResult);
      setChatHistory([createSystemMessage(nextResult)]);
      setActiveTab("results");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "The SQL query failed.");
    } finally {
      setLoadingMessage("");
    }
  }

  async function saveFavorite() {
    if (!activeConnection || !prompt.trim()) {
      return;
    }

    await api.saveQuery(prompt, activeConnection.name, "Favorite");
    await refreshConnectionData(activeConnection);
  }

  async function checkConnection() {
    setError("");
    try {
      const nextSchema = await api.generateSchema(connectionDraft);
      setPreviewSchema(nextSchema);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to read database schema.");
    }
  }

  async function saveConnection() {
    if (!connectionDraft.name.trim() || !connectionDraft.connectionString.trim()) {
      setError("Connection name and connection string are required.");
      return;
    }

    await api.addConnection(connectionDraft);
    const nextConnections = await api.getConnections();
    setConnections(nextConnections);
    setActiveConnectionName(connectionDraft.name);
    setConnectionDraft({ name: "", connectionString: "", databaseType: "MSSQL" });
    setPreviewSchema(emptySchema);
    setRoute("dashboard");
  }

  async function deleteConnection(name: string) {
    await api.deleteConnection(name);
    const nextConnections = await api.getConnections();
    setConnections(nextConnections);
    setActiveConnectionName(nextConnections[0]?.name ?? "");
  }

  async function sendChat() {
    if (!chatPrompt.trim()) {
      return;
    }

    const nextHistory = [...chatHistory, { role: "user" as const, text: chatPrompt }];
    setChatHistory(nextHistory);
    setChatPrompt("");
    const reply = await api.chatPrompt(nextHistory, aiModel, aiPlatform);
    setChatHistory([...nextHistory, reply]);
  }

  const mainContent =
    route === "connections" ? (
      <ConnectionsView
        draft={connectionDraft}
        setDraft={setConnectionDraft}
        previewSchema={previewSchema}
        connections={connections}
        error={error}
        onCheck={checkConnection}
        onSave={saveConnection}
        onDelete={deleteConnection}
      />
    ) : route === "settings" ? (
      <SettingsView
        settings={aiSettings}
        onSave={(nextSettings) => {
          setAISettings(nextSettings);
          saveAISettings(nextSettings);
          setAiPlatform(nextSettings.platform);
          setAiModel(nextSettings.model);
        }}
        onReset={() => {
          setAISettings(defaultAISettings);
          saveAISettings(defaultAISettings);
          setAiPlatform(defaultAISettings.platform);
          setAiModel(defaultAISettings.model);
        }}
      />
    ) : (
      <DashboardView
        connections={connections}
        activeConnection={activeConnection}
        aiProviderOptions={getProviderOptions(aiSettings)}
        aiModelOptions={dashboardModelOptions}
        schema={schema}
        prompt={prompt}
        setPrompt={setPrompt}
        aiPlatform={aiPlatform}
        setAiPlatform={(platform) => {
          const nextModels = getAvailableModels({ ...aiSettings, platform });
          setAiPlatform(platform);
          setAiModel(nextModels.includes(aiModel) ? aiModel : nextModels[0] ?? "");
        }}
        aiModel={aiModel}
        setAiModel={setAiModel}
        generatedSql={generatedSql}
        setGeneratedSql={setGeneratedSql}
        summary={summary}
        result={result}
        history={history}
        favorites={favorites}
        chatHistory={chatHistory}
        chatPrompt={chatPrompt}
        setChatPrompt={setChatPrompt}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        drawerTab={drawerTab}
        setDrawerTab={setDrawerTab}
        drawerOpen={drawerOpen}
        setDrawerOpen={setDrawerOpen}
        compactRows={compactRows}
        setCompactRows={setCompactRows}
        stripedRows={stripedRows}
        setStripedRows={setStripedRows}
        borderedRows={borderedRows}
        setBorderedRows={setBorderedRows}
        loadingMessage={loadingMessage}
        error={error}
        onRun={runPrompt}
        onExecuteSql={executeSql}
        onSaveFavorite={saveFavorite}
        onExport={() => downloadCsv(result)}
        onLoadPrompt={(query) => {
          setPrompt(query);
          runPrompt(query);
        }}
        onSelectConnection={setActiveConnectionName}
        onSendChat={sendChat}
        onClearChat={() => setChatHistory(result.rows.length ? [createSystemMessage(result)] : [])}
        onGoConnections={() => setRoute("connections")}
      />
    );

  return (
    <div className="app-shell">
      <aside className="side-nav">
        <div className="brand">
          <Database size={28} />
          <span>DBChatPro</span>
        </div>
        <button className={route === "dashboard" ? "active nav-button" : "nav-button"} onClick={() => setRoute("dashboard")}>
          <Search size={18} /> Dashboard
        </button>
        <button className={route === "connections" ? "active nav-button" : "nav-button"} onClick={() => setRoute("connections")}>
          <Plus size={18} /> Connections
        </button>
        <button className={route === "settings" ? "active nav-button" : "nav-button"} onClick={() => setRoute("settings")}>
          <Settings size={18} /> Settings
        </button>
      </aside>
      <main className="workspace">{mainContent}</main>
    </div>
  );
}

interface DashboardProps {
  connections: AIConnection[];
  activeConnection?: AIConnection;
  aiProviderOptions: Array<{ id: string; name: string }>;
  aiModelOptions: string[];
  schema: DatabaseSchema;
  prompt: string;
  setPrompt(value: string): void;
  aiPlatform: string;
  setAiPlatform(value: string): void;
  aiModel: string;
  setAiModel(value: string): void;
  generatedSql: string;
  setGeneratedSql(value: string): void;
  summary: string;
  result: QueryResult;
  history: HistoryItem[];
  favorites: HistoryItem[];
  chatHistory: ChatMessage[];
  chatPrompt: string;
  setChatPrompt(value: string): void;
  activeTab: "results" | "sql" | "insights";
  setActiveTab(value: "results" | "sql" | "insights"): void;
  drawerTab: "schema" | "chat" | "history" | "favorites";
  setDrawerTab(value: "schema" | "chat" | "history" | "favorites"): void;
  drawerOpen: boolean;
  setDrawerOpen(value: boolean): void;
  compactRows: boolean;
  setCompactRows(value: boolean): void;
  stripedRows: boolean;
  setStripedRows(value: boolean): void;
  borderedRows: boolean;
  setBorderedRows(value: boolean): void;
  loadingMessage: string;
  error: string;
  onRun(): void;
  onExecuteSql(): void;
  onSaveFavorite(): void;
  onExport(): void;
  onLoadPrompt(query: string): void;
  onSelectConnection(name: string): void;
  onSendChat(): void;
  onClearChat(): void;
  onGoConnections(): void;
}

function DashboardView(props: DashboardProps) {
  if (!props.connections.length) {
    return (
      <section className="empty-state">
        <Database size={48} />
        <h1>No database connections</h1>
        <p>Add a connection before generating SQL or chatting with database results.</p>
        <button className="primary-button" onClick={props.onGoConnections}>
          <Plus size={18} /> Add connection
        </button>
      </section>
    );
  }

  return (
    <div className={props.drawerOpen ? "dashboard with-drawer" : "dashboard"}>
      <section className="query-panel">
        <header className="page-header">
          <div>
            <h1>Chat with your database</h1>
            <p>Generate SQL from natural language, inspect results, and continue the analysis in chat.</p>
          </div>
          <button className="icon-button" title="Toggle drawer" onClick={() => props.setDrawerOpen(!props.drawerOpen)}>
            <Menu size={20} />
          </button>
        </header>

        <div className="toolbar-grid">
          <label>
            Select Database
            <select value={props.activeConnection?.name ?? ""} onChange={(event) => props.onSelectConnection(event.target.value)}>
              {props.connections.map((connection) => (
                <option key={connection.name}>{connection.name}</option>
              ))}
            </select>
          </label>
          <label>
            AI Platform
            <select value={props.aiPlatform} onChange={(event) => props.setAiPlatform(event.target.value)}>
              {props.aiProviderOptions.map((provider) => (
                <option key={provider.id} value={provider.id}>{provider.name}</option>
              ))}
            </select>
          </label>
          <label>
            AI Model
            <select value={props.aiModel} onChange={(event) => props.setAiModel(event.target.value)}>
              {props.aiModelOptions.length > 0 ? (
                props.aiModelOptions.map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))
              ) : (
                <option value="">No models configured</option>
              )}
            </select>
          </label>
        </div>

        <label className="prompt-box">
          Your prompt
          <textarea
            value={props.prompt}
            onChange={(event) => props.setPrompt(event.target.value)}
            placeholder="Show the 10 most recent orders with customer names and totals"
          />
        </label>
        <div className="action-row">
          <button className="primary-button" onClick={props.onRun} disabled={!props.prompt.trim() || Boolean(props.loadingMessage)}>
            <Play size={18} /> Submit
          </button>
          {props.loadingMessage && <span className="status-text">{props.loadingMessage}</span>}
          {props.error && <span className="error-text">{props.error}</span>}
        </div>

        <div className="tabs">
          <button className={props.activeTab === "results" ? "active" : ""} onClick={() => props.setActiveTab("results")}>Results</button>
          <button className={props.activeTab === "sql" ? "active" : ""} onClick={() => props.setActiveTab("sql")}>SQL Editor</button>
          <button className={props.activeTab === "insights" ? "active" : ""} onClick={() => props.setActiveTab("insights")}>Insights</button>
        </div>

        {props.activeTab === "results" && (
          <ResultsPanel
            result={props.result}
            compactRows={props.compactRows}
            stripedRows={props.stripedRows}
            borderedRows={props.borderedRows}
            setCompactRows={props.setCompactRows}
            setStripedRows={props.setStripedRows}
            setBorderedRows={props.setBorderedRows}
            onFavorite={props.onSaveFavorite}
            onExport={props.onExport}
          />
        )}

        {props.activeTab === "sql" && (
          <section className="panel">
            <SmartSqlBuilder
              schema={props.schema}
              databaseType={props.activeConnection?.databaseType ?? "MSSQL"}
              onBuild={(sql) => props.setGeneratedSql(sql)}
            />
            <label className="prompt-box">
              Edit generated query
              <textarea value={props.generatedSql} onChange={(event) => props.setGeneratedSql(event.target.value)} />
            </label>
            <button className="primary-button" onClick={props.onExecuteSql}>
              <RefreshCcw size={18} /> Execute
            </button>
          </section>
        )}

        {props.activeTab === "insights" && <section className="panel insight-panel">{props.summary || "No insights to show."}</section>}
      </section>

      {props.drawerOpen && (
        <aside className="right-drawer">
          <div className="tabs compact">
            <button className={props.drawerTab === "schema" ? "active" : ""} onClick={() => props.setDrawerTab("schema")}>Schema</button>
            <button className={props.drawerTab === "chat" ? "active" : ""} onClick={() => props.setDrawerTab("chat")}>Chat</button>
            <button className={props.drawerTab === "history" ? "active" : ""} onClick={() => props.setDrawerTab("history")}>History</button>
            <button className={props.drawerTab === "favorites" ? "active" : ""} onClick={() => props.setDrawerTab("favorites")}>Favorites</button>
          </div>
          {props.drawerTab === "schema" && <SchemaTree schema={props.schema} databaseName={props.activeConnection?.name ?? ""} />}
          {props.drawerTab === "chat" && (
            <ChatPanel
              history={props.chatHistory}
              prompt={props.chatPrompt}
              setPrompt={props.setChatPrompt}
              onSend={props.onSendChat}
              onClear={props.onClearChat}
            />
          )}
          {props.drawerTab === "history" && <SavedQueries title="Query history" items={props.history} onLoad={props.onLoadPrompt} />}
          {props.drawerTab === "favorites" && <SavedQueries title="Saved favorites" items={props.favorites} onLoad={props.onLoadPrompt} />}
        </aside>
      )}
    </div>
  );
}

function SmartSqlBuilder(props: {
  schema: DatabaseSchema;
  databaseType: DatabaseType;
  onBuild(sql: string): void;
}) {
  const firstTable = props.schema.schemaStructured[0]?.tableName ?? "";
  const [tableName, setTableName] = useState(firstTable);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [joinType, setJoinType] = useState("LEFT");
  const [joinTable, setJoinTable] = useState("");
  const [joinLeftColumn, setJoinLeftColumn] = useState("");
  const [joinRightColumn, setJoinRightColumn] = useState("");
  const [filterColumn, setFilterColumn] = useState("");
  const [filterOperator, setFilterOperator] = useState("=");
  const [filterValue, setFilterValue] = useState("");
  const [sortColumn, setSortColumn] = useState("");
  const [sortDirection, setSortDirection] = useState("DESC");
  const [limit, setLimit] = useState("10");

  const tableNames = props.schema.schemaStructured.map((table) => table.tableName);
  const activeTable = props.schema.schemaStructured.find((table) => table.tableName === tableName);
  const activeColumns = activeTable?.columns.map((column) => `${tableName}.${column}`) ?? [];
  const joinActiveTable = props.schema.schemaStructured.find((table) => table.tableName === joinTable);
  const joinColumns = joinActiveTable?.columns.map((column) => `${joinTable}.${column}`) ?? [];
  const allColumns = [...activeColumns, ...joinColumns];

  useEffect(() => {
    if (!tableName && firstTable) {
      setTableName(firstTable);
    }
  }, [firstTable, tableName]);

  useEffect(() => {
    if (tableName && !tableNames.includes(tableName) && firstTable) {
      setTableName(firstTable);
      setSelectedColumns([]);
      setJoinTable("");
      setJoinLeftColumn("");
      setJoinRightColumn("");
      setFilterColumn("");
      setSortColumn("");
    }
  }, [firstTable, tableName, tableNames]);

  function toggleColumn(columnName: string) {
    setSelectedColumns((current) =>
      current.includes(columnName) ? current.filter((column) => column !== columnName) : [...current, columnName]
    );
  }

  function buildSql() {
    props.onBuild(
      buildSmartSql({
        databaseType: props.databaseType,
        tableName,
        columns: selectedColumns,
        joinType,
        joinTable,
        joinLeftColumn,
        joinRightColumn,
        filterColumn,
        filterOperator,
        filterValue,
        sortColumn,
        sortDirection,
        limit
      })
    );
  }

  function resetBuilder() {
    setTableName(firstTable);
    setSelectedColumns([]);
    setJoinType("LEFT");
    setJoinTable("");
    setJoinLeftColumn("");
    setJoinRightColumn("");
    setFilterColumn("");
    setFilterOperator("=");
    setFilterValue("");
    setSortColumn("");
    setSortDirection("DESC");
    setLimit("10");
  }

  if (!props.schema.schemaStructured.length) {
    return <div className="sql-builder muted-panel">Connect a database to enable the visual SQL builder.</div>;
  }

  return (
    <div className="sql-builder">
      <div className="builder-header">
        <div>
          <h2>Smart SQL Builder</h2>
          <p>Build a query visually from the active schema, then edit the generated SQL before execution.</p>
        </div>
        <div className="action-row">
          <button className="secondary-button" onClick={resetBuilder}>
            <RefreshCcw size={17} /> Reset
          </button>
          <button className="primary-button" onClick={buildSql} disabled={!tableName}>
            <Save size={17} /> Build SQL
          </button>
        </div>
      </div>

      <div className="builder-grid">
        <label>
          Database table
          <input list="sql-builder-tables" value={tableName} onChange={(event) => setTableName(event.target.value)} placeholder="Start typing a table name" />
        </label>
        <datalist id="sql-builder-tables">
          {tableNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        <label>
          Limit
          <input value={limit} onChange={(event) => setLimit(event.target.value)} inputMode="numeric" placeholder="10" />
        </label>
      </div>

      <div className="column-picker">
        <div className="builder-label">Columns</div>
        <div className="column-chip-list">
          {activeColumns.map((column) => (
            <button key={column} className={selectedColumns.includes(column) ? "selected" : ""} onClick={() => toggleColumn(column)}>
              {column}
            </button>
          ))}
        </div>
      </div>

      <div className="builder-grid join-grid">
        <label>
          Join type
          <select value={joinType} onChange={(event) => setJoinType(event.target.value)}>
            <option>LEFT</option>
            <option>INNER</option>
            <option>RIGHT</option>
            <option>FULL</option>
          </select>
        </label>
        <label>
          Join table
          <input list="sql-builder-join-tables" value={joinTable} onChange={(event) => setJoinTable(event.target.value)} placeholder="Optional table" />
        </label>
        <datalist id="sql-builder-join-tables">
          {tableNames.filter((name) => name !== tableName).map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <label>
          Left column
          <input list="sql-builder-active-columns" value={joinLeftColumn} onChange={(event) => setJoinLeftColumn(event.target.value)} placeholder={`${tableName}.Id`} />
        </label>
        <label>
          Right column
          <input list="sql-builder-join-columns" value={joinRightColumn} onChange={(event) => setJoinRightColumn(event.target.value)} placeholder={`${joinTable}.Id`} />
        </label>
      </div>

      <datalist id="sql-builder-active-columns">
        {activeColumns.map((column) => (
          <option key={column} value={column} />
        ))}
      </datalist>
      <datalist id="sql-builder-join-columns">
        {joinColumns.map((column) => (
          <option key={column} value={column} />
        ))}
      </datalist>
      <datalist id="sql-builder-all-columns">
        {allColumns.map((column) => (
          <option key={column} value={column} />
        ))}
      </datalist>

      <div className="builder-grid filter-grid">
        <label>
          Filter column
          <input list="sql-builder-all-columns" value={filterColumn} onChange={(event) => setFilterColumn(event.target.value)} placeholder="Optional WHERE column" />
        </label>
        <label>
          Operator
          <select value={filterOperator} onChange={(event) => setFilterOperator(event.target.value)}>
            <option>=</option>
            <option>!=</option>
            <option>&gt;</option>
            <option>&gt;=</option>
            <option>&lt;</option>
            <option>&lt;=</option>
            <option>LIKE</option>
          </select>
        </label>
        <label>
          Value
          <input value={filterValue} onChange={(event) => setFilterValue(event.target.value)} placeholder="Filter value" />
        </label>
      </div>

      <div className="builder-grid sort-grid">
        <label>
          Sort column
          <input list="sql-builder-all-columns" value={sortColumn} onChange={(event) => setSortColumn(event.target.value)} placeholder="Optional ORDER BY column" />
        </label>
        <label>
          Direction
          <select value={sortDirection} onChange={(event) => setSortDirection(event.target.value)}>
            <option>DESC</option>
            <option>ASC</option>
          </select>
        </label>
      </div>
    </div>
  );
}

function ResultsPanel(props: {
  result: QueryResult;
  compactRows: boolean;
  stripedRows: boolean;
  borderedRows: boolean;
  setCompactRows(value: boolean): void;
  setStripedRows(value: boolean): void;
  setBorderedRows(value: boolean): void;
  onFavorite(): void;
  onExport(): void;
}) {
  if (!props.result.rows.length) {
    return <section className="panel muted-panel">No data to show.</section>;
  }

  return (
    <section className="panel">
      <div className="table-scroll">
        <table className={`${props.compactRows ? "compact-rows" : ""} ${props.stripedRows ? "striped-rows" : ""} ${props.borderedRows ? "bordered-rows" : ""}`}>
          <thead>
            <tr>
              {props.result.columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.result.rows.map((row, index) => (
              <tr key={`${row.join("-")}-${index}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`${cell}-${cellIndex}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="control-strip">
        <label><input type="checkbox" checked={props.compactRows} onChange={(event) => props.setCompactRows(event.target.checked)} /> Dense</label>
        <label><input type="checkbox" checked={props.stripedRows} onChange={(event) => props.setStripedRows(event.target.checked)} /> Striped</label>
        <label><input type="checkbox" checked={props.borderedRows} onChange={(event) => props.setBorderedRows(event.target.checked)} /> Bordered</label>
        <button className="secondary-button" onClick={props.onFavorite}><Heart size={17} /> Favorite</button>
        <button className="secondary-button" onClick={props.onExport}><Download size={17} /> Export Data</button>
      </div>
    </section>
  );
}

function SchemaTree({ schema, databaseName }: { schema: DatabaseSchema; databaseName: string }) {
  return (
    <section className="drawer-section">
      <p>Browse the tables and columns for <strong>{databaseName}</strong>.</p>
      <div className="schema-tree">
        {schema.schemaStructured.map((table) => (
          <details key={table.tableName} open>
            <summary><ChevronDown size={16} /> {table.tableName}</summary>
            <ul>
              {table.columns.map((column) => (
                <li key={column}>{column}</li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}

function ChatPanel(props: {
  history: ChatMessage[];
  prompt: string;
  setPrompt(value: string): void;
  onSend(): void;
  onClear(): void;
}) {
  return (
    <section className="drawer-section chat-panel">
      <p>Ask the AI model for insights about the current query result.</p>
      <div className="chat-list">
        {props.history.filter((message) => message.role !== "system").map((message, index) => (
          <article key={`${message.role}-${index}`} className={`chat-message ${message.role}`}>
            <strong>{message.role === "user" ? "You" : "AI Assistant"}</strong>
            <span>{message.text}</span>
          </article>
        ))}
      </div>
      <textarea value={props.prompt} onChange={(event) => props.setPrompt(event.target.value)} placeholder="Ask about trends, outliers, or next actions" />
      <div className="action-row">
        <button className="primary-button" onClick={props.onSend}><MessageSquare size={17} /> Submit</button>
        <button className="secondary-button" onClick={props.onClear}>Clear</button>
      </div>
    </section>
  );
}

function SavedQueries({ title, items, onLoad }: { title: string; items: HistoryItem[]; onLoad(query: string): void }) {
  return (
    <section className="drawer-section">
      <p>{title}</p>
      {items.length ? (
        <div className="saved-list">
          {items.map((item) => (
            <button key={item.id} onClick={() => onLoad(item.query)}>
              <History size={16} /> {item.name}
            </button>
          ))}
        </div>
      ) : (
        <p className="muted-text">No saved prompts yet.</p>
      )}
    </section>
  );
}

function ConnectionsView(props: {
  draft: AIConnection;
  setDraft(value: AIConnection): void;
  previewSchema: DatabaseSchema;
  connections: AIConnection[];
  error: string;
  onCheck(): void;
  onSave(): void;
  onDelete(name: string): void;
}) {
  return (
    <div className="connections-page">
      <header className="page-header">
        <div>
          <h1>Manage Database Connections</h1>
          <p>Register database connection strings and inspect the schema used for AI query generation.</p>
        </div>
      </header>

      <section className="connection-grid">
        <div className="panel">
          <h2>Add a Connection</h2>
          <p className="muted-text">The AI service receives schema context only; it does not need direct access to record data.</p>
          {props.error && <p className="error-text">{props.error}</p>}
          <label>
            Database Type
            <select value={props.draft.databaseType} onChange={(event) => props.setDraft({ ...props.draft, databaseType: event.target.value as DatabaseType })}>
              {databaseTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          <label>
            Connection name
            <input value={props.draft.name} onChange={(event) => props.setDraft({ ...props.draft, name: event.target.value })} />
          </label>
          <label>
            Connection string
            <textarea
              value={props.draft.connectionString}
              onChange={(event) => props.setDraft({ ...props.draft, connectionString: event.target.value })}
              placeholder={connectionPlaceholders[props.draft.databaseType]}
            />
          </label>
          {props.draft.databaseType === "SQLITE" && (
            <p className="muted-text">
              SQLite supports local file paths for desktop/server use. In this standalone browser demo, the mock adapter simulates SQLite schema and query results.
            </p>
          )}
          <div className="action-row">
            <button className="primary-button" onClick={props.onCheck}><Bot size={17} /> Check Connection</button>
            {props.previewSchema.schemaStructured.length > 0 && <button className="secondary-button" onClick={props.onSave}><Save size={17} /> Save</button>}
          </div>
          {props.previewSchema.schemaStructured.length > 0 && <SchemaTree schema={props.previewSchema} databaseName={props.draft.name || "New connection"} />}
        </div>

        <div className="panel">
          <h2>Existing Connections</h2>
          {props.connections.length ? (
            <div className="connection-list">
              {props.connections.map((connection) => (
                <article key={connection.name}>
                  <div>
                    <strong>{connection.name}</strong>
                    <span>{connection.databaseType}</span>
                  </div>
                  <button className="icon-button danger" title="Delete connection" onClick={() => props.onDelete(connection.name)}>
                    <Trash2 size={18} />
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted-text">No connections yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function SettingsView(props: {
  settings: AISettings;
  onSave(settings: AISettings): void;
  onReset(): void;
}) {
  const [draft, setDraft] = useState<AISettings>(props.settings);
  const [availableModels, setAvailableModels] = useState<string[]>(() => getAvailableModels(props.settings));
  const [customModelName, setCustomModelName] = useState("");
  const [customProviderDraft, setCustomProviderDraft] = useState({
    name: "",
    endpoint: "",
    apiKey: "",
    models: ""
  });
  const [refreshingModels, setRefreshingModels] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(props.settings);
    setAvailableModels(getAvailableModels(props.settings));
  }, [props.settings]);

  function saveSettings() {
    const settingsToSave = syncSelectedCustomProvider(draft);
    setDraft(settingsToSave);
    props.onSave(settingsToSave);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  function syncSelectedCustomProvider(settings: AISettings): AISettings {
    const customProviders = settings.customProviders ?? [];
    const customModels = settings.customModels ?? {};
    const selectedProvider = customProviders.find((provider) => provider.id === settings.platform);
    if (!selectedProvider) {
      return settings;
    }

    return {
      ...settings,
      customProviders: customProviders.map((provider) =>
        provider.id === settings.platform
          ? {
              ...provider,
              endpoint: settings.endpoint,
              apiKey: settings.apiKey,
              models: Array.from(new Set([...provider.models, ...(customModels[settings.platform] ?? [])]))
            }
          : provider
      )
    };
  }

  async function handleRefreshModels(nextDraft = draft) {
    setRefreshingModels(true);
    const models = await refreshModels(nextDraft);
    setAvailableModels(models);
    setRefreshingModels(false);

    if (!nextDraft.model && models.length > 0) {
      setDraft({ ...nextDraft, model: models[0] });
    }
  }

  function updatePlatform(platform: string) {
    const selectedProvider = (draft.customProviders ?? []).find((provider) => provider.id === platform);
    const platformModels = Array.from(
      new Set([...(modelCatalog[platform] ?? []), ...(selectedProvider?.models ?? []), ...((draft.customModels ?? {})[platform] ?? [])])
    );
    const nextDraft = {
      ...draft,
      platform,
      model: platformModels.includes(draft.model) ? draft.model : platformModels[0] ?? "",
      endpoint: selectedProvider?.endpoint ?? getProviderEndpoint(draft, platform),
      apiKey: selectedProvider?.apiKey ?? getProviderApiKey(draft, platform)
    };
    setDraft(nextDraft);
    setAvailableModels(platformModels);
  }

  function addCustomModel() {
    const modelName = customModelName.trim();
    if (!modelName) {
      return;
    }

    const platformModels = (draft.customModels ?? {})[draft.platform] ?? [];
    const nextDraft: AISettings = {
      ...draft,
      model: modelName,
      customModels: {
        ...(draft.customModels ?? {}),
        [draft.platform]: Array.from(new Set([...platformModels, modelName]))
      }
    };

    setDraft(nextDraft);
    setAvailableModels(getAvailableModels(nextDraft));
    setCustomModelName("");
  }

  function addCustomProvider() {
    const providerName = customProviderDraft.name.trim();
    const endpoint = customProviderDraft.endpoint.trim();
    if (!providerName || !endpoint) {
      return;
    }

    const id = makeCustomProviderId(providerName);
    const models = customProviderDraft.models
      .split(",")
      .map((model) => model.trim())
      .filter(Boolean);
    const provider: AIProviderConfig = {
      id,
      name: providerName,
      endpoint,
      apiKey: customProviderDraft.apiKey,
      models,
      compatibility: "OpenAI"
    };
    const nextDraft: AISettings = {
      ...draft,
      platform: id,
      model: models[0] ?? "",
      endpoint,
      apiKey: customProviderDraft.apiKey,
      customProviders: [...(draft.customProviders ?? []).filter((item) => item.id !== id), provider]
    };

    setDraft(nextDraft);
    setAvailableModels(getAvailableModels(nextDraft));
    setCustomProviderDraft({ name: "", endpoint: "", apiKey: "", models: "" });
  }

  function removeCustomProvider(id: string) {
    const nextProviders = (draft.customProviders ?? []).filter((provider) => provider.id !== id);
    const fallbackPlatform = builtInProviders[0].id;
    const nextDraft: AISettings = {
      ...draft,
      platform: draft.platform === id ? fallbackPlatform : draft.platform,
      model: draft.platform === id ? modelCatalog[fallbackPlatform][0] : draft.model,
      endpoint: draft.platform === id ? getProviderEndpoint(draft, fallbackPlatform) : draft.endpoint,
      apiKey: draft.platform === id ? "" : draft.apiKey,
      customProviders: nextProviders
    };

    setDraft(nextDraft);
    setAvailableModels(getAvailableModels(nextDraft));
  }

  return (
    <div className="settings-page">
      <header className="page-header">
        <div>
          <h1>Settings</h1>
          <p>Configure the AI provider and model used for SQL generation and result chat.</p>
        </div>
      </header>

      <section className="settings-grid">
        <div className="panel settings-panel">
          <h2>AI Model Configuration</h2>
          <label>
            AI Provider
            <select value={draft.platform} onChange={(event) => updatePlatform(event.target.value)}>
              {getProviderOptions(draft).map((provider) => (
                <option key={provider.id} value={provider.id}>{provider.name}</option>
              ))}
            </select>
          </label>
          <div className="custom-provider-box">
            <h3>Custom OpenAI-compatible provider</h3>
            <div className="custom-provider-grid">
              <label>
                Provider name
                <input
                  value={customProviderDraft.name}
                  onChange={(event) => setCustomProviderDraft({ ...customProviderDraft, name: event.target.value })}
                  placeholder="OpenRouter, Together AI, Groq"
                />
              </label>
              <label>
                Base URL
                <input
                  value={customProviderDraft.endpoint}
                  onChange={(event) => setCustomProviderDraft({ ...customProviderDraft, endpoint: event.target.value })}
                  placeholder="https://provider.example.com/v1"
                />
              </label>
              <label>
                API key
                <input
                  type="password"
                  value={customProviderDraft.apiKey}
                  onChange={(event) => setCustomProviderDraft({ ...customProviderDraft, apiKey: event.target.value })}
                  placeholder="Provider API key"
                />
              </label>
              <label>
                Models
                <input
                  value={customProviderDraft.models}
                  onChange={(event) => setCustomProviderDraft({ ...customProviderDraft, models: event.target.value })}
                  placeholder="model-a, model-b"
                />
              </label>
            </div>
            <button className="secondary-button add-provider" onClick={addCustomProvider}>
              <Plus size={17} /> Add Provider
            </button>
          </div>
          {(draft.customProviders ?? []).length > 0 && (
            <div className="custom-provider-list">
              {(draft.customProviders ?? []).map((provider) => (
                <article key={provider.id}>
                  <div>
                    <strong>{provider.name}</strong>
                    <span>{provider.endpoint}</span>
                  </div>
                  <button className="icon-button danger" title="Remove provider" onClick={() => removeCustomProvider(provider.id)}>
                    <Trash2 size={17} />
                  </button>
                </article>
              ))}
            </div>
          )}
          <div className="model-picker">
            <label>
              Select model
              <select value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })}>
                {availableModels.map((model) => (
                  <option key={model}>{model}</option>
                ))}
              </select>
            </label>
            <button className="secondary-button refresh-models" onClick={() => handleRefreshModels()} disabled={refreshingModels}>
              <RefreshCcw size={17} /> {refreshingModels ? "Refreshing" : "Refresh"}
            </button>
          </div>
          <div className="custom-model-row">
            <label>
              Custom model name
              <input
                value={customModelName}
                onChange={(event) => setCustomModelName(event.target.value)}
                placeholder="Add model or deployment name"
              />
            </label>
            <button className="secondary-button add-model" onClick={addCustomModel}>
              <Plus size={17} /> Add
            </button>
          </div>
          <label>
            Endpoint
            <input
              value={draft.endpoint}
              onChange={(event) => setDraft({ ...draft, endpoint: event.target.value })}
              placeholder="https://api.openai.com/v1 or provider endpoint"
            />
          </label>
          <label>
            API key
            <input
              type="password"
              value={draft.apiKey}
              onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
              placeholder="Stored locally for this standalone app"
            />
          </label>

          {draft.platform === "AWSBedrock" && (
            <div className="nested-settings">
              <label>
                AWS Region
                <input value={draft.awsRegion} onChange={(event) => setDraft({ ...draft, awsRegion: event.target.value })} placeholder="us-east-1" />
              </label>
              <label>
                AWS Profile
                <input value={draft.awsProfile} onChange={(event) => setDraft({ ...draft, awsProfile: event.target.value })} placeholder="default" />
              </label>
            </div>
          )}

          <div className="action-row">
            <button className="primary-button" onClick={saveSettings}>
              <Save size={17} /> Save Settings
            </button>
            <button className="secondary-button" onClick={props.onReset}>
              <RefreshCcw size={17} /> Reset
            </button>
            {saved && <span className="status-text">Settings saved.</span>}
          </div>
        </div>

        <aside className="panel configured-model">
          <ShieldCheck size={32} />
          <h2>Configured Model</h2>
          <dl>
            <div>
              <dt>Platform</dt>
              <dd>{props.settings.platform}</dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd>{props.settings.model || "Not configured"}</dd>
            </div>
            <div>
              <dt>Custom Models</dt>
              <dd>{(props.settings.customModels ?? {})[props.settings.platform]?.length ?? 0}</dd>
            </div>
            <div>
              <dt>Endpoint</dt>
              <dd>{props.settings.endpoint || "Provider default"}</dd>
            </div>
          </dl>
        </aside>
      </section>
    </div>
  );
}
