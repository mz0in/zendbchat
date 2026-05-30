import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Bell,
  Bot,
  ChevronDown,
  CheckCircle2,
  Clipboard,
  Columns3,
  Database,
  Download,
  Edit3,
  FileCode,
  Filter,
  Heart,
  History,
  Home,
  Lightbulb,
  ListPlus,
  Menu,
  MessageSquare,
  Plus,
  RefreshCcw,
  Save,
  Send,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Settings,
  Table2,
  Trash2,
  UserCircle
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

function normalizeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, "");
}

function isGoogleGenerativeEndpoint(endpoint: string): boolean {
  return /generativelanguage\.googleapis\.com\/v1(beta)?$/i.test(normalizeEndpoint(endpoint));
}

function getModelNameFromGoogleName(name: string): string {
  return name.replace(/^models\//, "");
}

async function fetchProviderModels(settings: AISettings): Promise<string[]> {
  const endpoint = normalizeEndpoint(settings.endpoint || getProviderEndpoint(settings, settings.platform));
  if (!endpoint) {
    return getAvailableModels(settings);
  }

  const headers: HeadersInit = { Accept: "application/json" };
  let url = `${endpoint}/models`;

  if (isGoogleGenerativeEndpoint(endpoint)) {
    const search = new URLSearchParams();
    if (settings.apiKey) {
      search.set("key", settings.apiKey);
    }
    url = `${endpoint}/models${search.toString() ? `?${search}` : ""}`;
  } else if (settings.apiKey) {
    headers.Authorization = `Bearer ${settings.apiKey}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Model refresh failed with ${response.status} ${response.statusText || "response"}.`);
  }

  const payload = (await response.json()) as {
    data?: Array<{ id?: string; name?: string }>;
    models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
  };

  if (Array.isArray(payload.data)) {
    return payload.data.map((model) => model.id ?? model.name ?? "").filter(Boolean);
  }

  if (Array.isArray(payload.models)) {
    return payload.models
      .filter((model) => !model.supportedGenerationMethods || model.supportedGenerationMethods.includes("generateContent"))
      .map((model) => getModelNameFromGoogleName(model.name ?? ""))
      .filter(Boolean);
  }

  return [];
}

async function refreshModels(settings: AISettings): Promise<string[]> {
  const fetchedModels = await fetchProviderModels(settings);
  return Array.from(new Set([...fetchedModels, ...getAvailableModels(settings)]));
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

function parseNumericCell(value: string | undefined): number | null {
  const normalized = (value ?? "").replaceAll(",", "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
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
  groupByColumn: string;
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

  if (options.groupByColumn) {
    lines.push(`GROUP BY ${options.groupByColumn}`);
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

function wantsChart(message: string): boolean {
  return /\b(chart|graph|plot|visual|visualize|line|bar|trend)\b|رسم|مخطط|بياني|رسم بياني|شارت/iu.test(message);
}

function createResultAwareReply(options: {
  prompt: string;
  generatedSql: string;
  result: QueryResult;
  aiModel: string;
  aiPlatform: string;
}): ChatMessage {
  const provider = options.aiPlatform && options.aiModel ? `${options.aiPlatform} / ${options.aiModel}` : "the configured model";
  const rowCount = options.result.rows.length;
  const columns = options.result.columns.join(", ") || "no columns";
  const chartNote = wantsChart(options.prompt) ? " I also added an inline chart from the current result set." : "";
  const sqlNote = options.generatedSql.trim()
    ? `\n\nSQL used:\n${options.generatedSql.trim()}`
    : "\n\nNo SQL has been generated yet. Run a query first, then continue the conversation here.";

  return {
    role: "assistant",
    text: `Using ${provider}, I reviewed the current query result: ${rowCount} rows with columns ${columns}.${chartNote}${sqlNote}`
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

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function makeCrcTable(): number[] {
  return Array.from({ length: 256 }, (_, index) => {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    return crc >>> 0;
  });
}

const crcTable = makeCrcTable();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(buffer: number[], value: number): void {
  buffer.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeUint32(buffer: number[], value: number): void {
  buffer.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function createZip(files: Array<{ name: string; content: string }>): Uint8Array {
  const encoder = new TextEncoder();
  const fileParts: number[] = [];
  const centralDirectory: number[] = [];

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const contentBytes = encoder.encode(file.content);
    const checksum = crc32(contentBytes);
    const localHeaderOffset = fileParts.length;

    writeUint32(fileParts, 0x04034b50);
    writeUint16(fileParts, 20);
    writeUint16(fileParts, 0);
    writeUint16(fileParts, 0);
    writeUint16(fileParts, 0);
    writeUint16(fileParts, 0);
    writeUint32(fileParts, checksum);
    writeUint32(fileParts, contentBytes.length);
    writeUint32(fileParts, contentBytes.length);
    writeUint16(fileParts, nameBytes.length);
    writeUint16(fileParts, 0);
    fileParts.push(...nameBytes, ...contentBytes);

    writeUint32(centralDirectory, 0x02014b50);
    writeUint16(centralDirectory, 20);
    writeUint16(centralDirectory, 20);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint32(centralDirectory, checksum);
    writeUint32(centralDirectory, contentBytes.length);
    writeUint32(centralDirectory, contentBytes.length);
    writeUint16(centralDirectory, nameBytes.length);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint32(centralDirectory, 0);
    writeUint32(centralDirectory, localHeaderOffset);
    centralDirectory.push(...nameBytes);
  }

  const centralDirectoryOffset = fileParts.length;
  fileParts.push(...centralDirectory);
  writeUint32(fileParts, 0x06054b50);
  writeUint16(fileParts, 0);
  writeUint16(fileParts, 0);
  writeUint16(fileParts, files.length);
  writeUint16(fileParts, files.length);
  writeUint32(fileParts, centralDirectory.length);
  writeUint32(fileParts, centralDirectoryOffset);
  writeUint16(fileParts, 0);

  return new Uint8Array(fileParts);
}

function downloadExcel(result: QueryResult): void {
  if (!result.columns.length) {
    return;
  }

  const headerCells = result.columns
    .map((column, index) => `<c r="${String.fromCharCode(65 + index)}1" t="inlineStr" s="1"><is><t>${escapeXml(column)}</t></is></c>`)
    .join("");
  const bodyRows = result.rows
    .map((row, rowIndex) => {
      const cells = result.columns
        .map((_, index) => {
          const cell = row[index] ?? "";
          const normalizedNumber = cell.replaceAll(",", "").trim();
          const isNumber = /^-?\d+(\.\d+)?$/.test(normalizedNumber);
          const cellReference = `${String.fromCharCode(65 + index)}${rowIndex + 2}`;
          return isNumber
            ? `<c r="${cellReference}"><v>${escapeXml(normalizedNumber)}</v></c>`
            : `<c r="${cellReference}" t="inlineStr"><is><t>${escapeXml(cell)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 2}">${cells}</row>`;
    })
    .join("");
  const columnDefinitions = result.columns
    .map((_, index) => `<col min="${index + 1}" max="${index + 1}" width="22" customWidth="1"/>`)
    .join("");
  const workbook = createZip([
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
    },
    {
      name: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="DBChatPro Export" sheetId="1" r:id="rId1"/></sheets></workbook>`
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
    },
    {
      name: "xl/styles.xml",
      content: `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font/><font><b/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEEF3FB"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`
    },
    {
      name: "xl/worksheets/sheet1.xml",
      content: `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${columnDefinitions}</cols><sheetData><row r="1">${headerCells}</row>${bodyRows}</sheetData></worksheet>`
    }
  ]);
  const blob = new Blob([workbook.buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "export.xlsx";
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
  const [activeTab, setActiveTab] = useState<"results" | "sql" | "insights" | "chart" | "data">("results");
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
  const [editingConnectionName, setEditingConnectionName] = useState("");
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

    if (editingConnectionName) {
      await api.updateConnection(editingConnectionName, connectionDraft);
    } else {
      await api.addConnection(connectionDraft);
    }
    const nextConnections = await api.getConnections();
    setConnections(nextConnections);
    setActiveConnectionName(connectionDraft.name);
    setConnectionDraft({ name: "", connectionString: "", databaseType: "MSSQL" });
    setEditingConnectionName("");
    setPreviewSchema(emptySchema);
    setRoute("dashboard");
  }

  async function deleteConnection(name: string) {
    await api.deleteConnection(name);
    const nextConnections = await api.getConnections();
    setConnections(nextConnections);
    setActiveConnectionName(nextConnections[0]?.name ?? "");
    if (editingConnectionName === name) {
      setEditingConnectionName("");
      setConnectionDraft({ name: "", connectionString: "", databaseType: "MSSQL" });
      setPreviewSchema(emptySchema);
    }
  }

  function editConnection(connection: AIConnection) {
    setError("");
    setEditingConnectionName(connection.name);
    setConnectionDraft({ ...connection });
    setPreviewSchema(emptySchema);
    setRoute("connections");
  }

  function cancelEditConnection() {
    setError("");
    setEditingConnectionName("");
    setConnectionDraft({ name: "", connectionString: "", databaseType: "MSSQL" });
    setPreviewSchema(emptySchema);
  }

  async function sendChat() {
    if (!chatPrompt.trim()) {
      return;
    }

    const nextHistory = [...chatHistory, { role: "user" as const, text: chatPrompt }];
    setChatHistory(nextHistory);
    setChatPrompt("");
    const reply = createResultAwareReply({
      prompt: chatPrompt,
      generatedSql,
      result,
      aiModel,
      aiPlatform
    });
    setChatHistory([...nextHistory, reply]);
  }

  const mainContent =
    route === "connections" ? (
      <ConnectionsView
        draft={connectionDraft}
        setDraft={setConnectionDraft}
        previewSchema={previewSchema}
        connections={connections}
        editingConnectionName={editingConnectionName}
        error={error}
        onCheck={checkConnection}
        onSave={saveConnection}
        onEdit={editConnection}
        onCancelEdit={cancelEditConnection}
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
        onRun={() => runPrompt()}
        onExecuteSql={executeSql}
        onSaveFavorite={saveFavorite}
        onExportCsv={() => downloadCsv(result)}
        onExportExcel={() => downloadExcel(result)}
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
        <button className="new-chat-button" onClick={() => setRoute("dashboard")}>
          <Plus size={18} /> New Chat
          <kbd>⌘K</kbd>
        </button>
        <button className={route === "dashboard" ? "active nav-button" : "nav-button"} onClick={() => setRoute("dashboard")}>
          <Home size={18} /> Dashboard
        </button>
        <button className="nav-button" onClick={() => setRoute("dashboard")}>
          <MessageSquare size={18} /> Chat
        </button>
        <button className="nav-button" onClick={() => setRoute("dashboard")}>
          <FileCode size={18} /> Queries
        </button>
        <button className="nav-button" onClick={() => setRoute("dashboard")}>
          <BarChart3 size={18} /> Insights
        </button>
        <button className={route === "connections" ? "active nav-button" : "nav-button"} onClick={() => setRoute("connections")}>
          <Server size={18} /> Data Sources
        </button>
        <button className="nav-button" onClick={() => setRoute("dashboard")}>
          <Bell size={18} /> Alerts
        </button>
        <button className={route === "settings" ? "active nav-button" : "nav-button"} onClick={() => setRoute("settings")}>
          <Settings size={18} /> Settings
        </button>
        <div className="nav-user">
          <UserCircle size={30} />
          <div>
            <strong>Aiden Davis</strong>
            <span>Admin</span>
          </div>
          <ChevronDown size={15} />
        </div>
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
  activeTab: "results" | "sql" | "insights" | "chart" | "data";
  setActiveTab(value: "results" | "sql" | "insights" | "chart" | "data"): void;
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
  onExportCsv(): void;
  onExportExcel(): void;
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
          <div className="header-title">
            <span className="header-icon"><MessageSquare size={20} /></span>
            <div>
              <h1>Chat with your database</h1>
              <p>Generate SQL from natural language, inspect results, and continue the analysis in chat.</p>
            </div>
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

        <div className="prompt-workbench">
          <label className="prompt-box">
            Your prompt
            <textarea
              value={props.prompt}
              onChange={(event) => props.setPrompt(event.target.value)}
              placeholder="Show total revenue by product category for the last 6 months, month over month."
            />
          </label>
          <div className="prompt-side-actions">
            <button className="secondary-button" onClick={() => props.setPrompt("Show total revenue by product category for the last 6 months, month over month.")}>
              <SlidersHorizontal size={17} /> Advanced Options
            </button>
            <button className="primary-button submit-button" onClick={props.onRun} disabled={!props.prompt.trim() || Boolean(props.loadingMessage)}>
              <Send size={18} /> Submit
              <kbd>⌘↵</kbd>
            </button>
          </div>
          <div className="prompt-tools" aria-label="Prompt tools">
            <button title="Suggest prompt" onClick={() => props.setPrompt("Find anomalies in monthly revenue and explain likely causes.")}>
              <Lightbulb size={16} />
            </button>
            <button title="Insert SQL intent" onClick={() => props.setPrompt(`${props.prompt} Include filters, grouping, and a safe row limit.`.trim())}>
              <Clipboard size={16} />
            </button>
          </div>
        </div>
        <div className="action-row status-row">
          {props.loadingMessage && <span className="status-text">{props.loadingMessage}</span>}
          {props.error && <span className="error-text">{props.error}</span>}
        </div>

        <div className="tabs">
          <button className={props.activeTab === "results" ? "active" : ""} onClick={() => props.setActiveTab("results")}>Results</button>
          <button className={props.activeTab === "sql" ? "active" : ""} onClick={() => props.setActiveTab("sql")}>SQL Editor</button>
          <button className={props.activeTab === "insights" ? "active" : ""} onClick={() => props.setActiveTab("insights")}>Insights</button>
          <button className={props.activeTab === "chart" ? "active" : ""} onClick={() => props.setActiveTab("chart")}>Chart</button>
          <button className={props.activeTab === "data" ? "active" : ""} onClick={() => props.setActiveTab("data")}>Data</button>
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
            onExportCsv={props.onExportCsv}
            onExportExcel={props.onExportExcel}
          />
        )}

        {props.activeTab === "sql" && (
          <section className="panel">
            <SmartSqlBuilder
              key={`${props.activeConnection?.name ?? "none"}-${props.activeConnection?.databaseType ?? "none"}`}
              schema={props.schema}
              databaseName={props.activeConnection?.name ?? ""}
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
        {props.activeTab === "chart" && <ChartPanel result={props.result} />}
        {props.activeTab === "data" && <DataExplorerPanel result={props.result} schema={props.schema} />}
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
              generatedSql={props.generatedSql}
              result={props.result}
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
  databaseName: string;
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
  const [groupByColumn, setGroupByColumn] = useState("");
  const [sortColumn, setSortColumn] = useState("");
  const [sortDirection, setSortDirection] = useState("DESC");
  const [limit, setLimit] = useState("50");

  const tableNames = props.schema.schemaStructured.map((table) => table.tableName);
  const activeTable = props.schema.schemaStructured.find((table) => table.tableName === tableName);
  const activeColumns = activeTable?.columns.map((column) => `${tableName}.${column}`) ?? [];
  const joinActiveTable = props.schema.schemaStructured.find((table) => table.tableName === joinTable);
  const joinColumns = joinActiveTable?.columns.map((column) => `${joinTable}.${column}`) ?? [];
  const allColumns = [...activeColumns, ...joinColumns];
  const schemaKey = useMemo(
    () => props.schema.schemaStructured.map((table) => `${table.tableName}:${table.columns.join(",")}`).join("|"),
    [props.schema]
  );

  useEffect(() => {
    resetBuilder();
  }, [schemaKey, props.databaseType, props.databaseName]);

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
        groupByColumn,
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
    setGroupByColumn("");
    setSortColumn("");
    setSortDirection("DESC");
    setLimit("50");
  }

  function selectAllColumns() {
    setSelectedColumns(activeColumns);
  }

  function suggestJoin() {
    const nextJoinTable = tableNames.find((name) => name !== tableName) ?? "";
    const nextJoinColumns = props.schema.schemaStructured.find((table) => table.tableName === nextJoinTable)?.columns ?? [];
    const currentId = activeTable?.columns.find((column) => /(^id$|_id$|id$)/i.test(column)) ?? activeTable?.columns[0] ?? "";
    const nextId = nextJoinColumns.find((column) => /(^id$|_id$|id$)/i.test(column)) ?? nextJoinColumns[0] ?? "";
    setJoinTable(nextJoinTable);
    setJoinLeftColumn(currentId ? `${tableName}.${currentId}` : "");
    setJoinRightColumn(nextId ? `${nextJoinTable}.${nextId}` : "");
  }

  function updateTableName(nextTableName: string) {
    setTableName(nextTableName);
    setSelectedColumns([]);
    setJoinTable("");
    setJoinLeftColumn("");
    setJoinRightColumn("");
    setFilterColumn("");
    setGroupByColumn("");
    setSortColumn("");
  }

  function updateJoinTable(nextJoinTable: string) {
    setJoinTable(nextJoinTable);
    setJoinLeftColumn("");
    setJoinRightColumn("");
    setFilterColumn("");
    setGroupByColumn("");
    setSortColumn("");
  }

  if (!props.schema.schemaStructured.length) {
    return <div className="sql-builder muted-panel">Connect a database to enable the visual SQL builder.</div>;
  }

  return (
    <div className="sql-builder">
      <div className="builder-header">
        <div>
          <h2>Smart SQL Builder</h2>
          <p>Build a query visually from the active schema for {props.databaseName || "the selected database"}.</p>
        </div>
        <div className="action-row">
          <button className="secondary-button" onClick={selectAllColumns} disabled={!activeColumns.length}>
            <Columns3 size={17} /> Select all
          </button>
          <button className="secondary-button" onClick={suggestJoin} disabled={tableNames.length < 2}>
            <ListPlus size={17} /> Suggest join
          </button>
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
          Selected database
          <input value={props.databaseName || "No database selected"} readOnly />
        </label>
        <label>
          Database table
          <select value={tableName} onChange={(event) => updateTableName(event.target.value)}>
            {tableNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>

        <label>
          Limit
          <input value={limit} onChange={(event) => setLimit(event.target.value)} inputMode="numeric" placeholder="Leave blank for no row limit" />
        </label>
      </div>

      <div className="column-picker">
        <div className="builder-label"><Columns3 size={16} /> Select columns</div>
        <div className="column-chip-list">
          {activeColumns.map((column) => (
            <button key={column} className={selectedColumns.includes(column) ? "selected" : ""} onClick={() => toggleColumn(column)}>
              {column}
            </button>
          ))}
        </div>
      </div>

      <div className="builder-grid join-grid">
        <div className="builder-stage">JOIN</div>
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
          <select value={joinTable} onChange={(event) => updateJoinTable(event.target.value)}>
            <option value="">No join</option>
            {tableNames.filter((name) => name !== tableName).map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
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
        <div className="builder-stage">WHERE</div>
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
          Group by
          <input list="sql-builder-all-columns" value={groupByColumn} onChange={(event) => setGroupByColumn(event.target.value)} placeholder="Optional GROUP BY column" />
        </label>
      </div>

      <div className="builder-grid sort-grid">
        <div className="builder-stage">ORDER BY</div>
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
  onExportCsv(): void;
  onExportExcel(): void;
}) {
  if (!props.result.rows.length) {
    return <section className="panel muted-panel">No data to show.</section>;
  }

  return (
    <section className="panel">
      <div className="result-banner">
          <span><CheckCircle2 size={17} /> Query executed successfully</span>
        <div>
          <span>812 ms</span>
          <span>{props.result.rows.length} rows</span>
          <button className="icon-button" title="Export Excel" onClick={props.onExportExcel}><Download size={17} /></button>
        </div>
      </div>
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
      <p className="table-caption">Showing 1 to {props.result.rows.length} of {props.result.rows.length} rows</p>
      <div className="control-strip">
        <label><input type="checkbox" checked={props.compactRows} onChange={(event) => props.setCompactRows(event.target.checked)} /> Dense</label>
        <label><input type="checkbox" checked={props.stripedRows} onChange={(event) => props.setStripedRows(event.target.checked)} /> Striped</label>
        <label><input type="checkbox" checked={props.borderedRows} onChange={(event) => props.setBorderedRows(event.target.checked)} /> Bordered</label>
        <button className="secondary-button" onClick={props.onFavorite}><Heart size={17} /> Favorite</button>
        <button className="secondary-button" onClick={props.onExportCsv}><Download size={17} /> Export CSV</button>
        <button className="secondary-button" onClick={props.onExportExcel}><Download size={17} /> Export Excel</button>
      </div>
    </section>
  );
}

function ChartPanel({ result }: { result: QueryResult }) {
  const numericColumnIndex = result.columns.findIndex((_, index) =>
    result.rows.some((row) => parseNumericCell(row[index]) !== null)
  );
  const labelColumnIndex = result.columns.findIndex((_, index) => index !== numericColumnIndex);
  const values = result.rows.slice(0, 6).map((row) => {
    return {
      label: row[labelColumnIndex] ?? row[0] ?? "Row",
      value: parseNumericCell(row[numericColumnIndex]) ?? 0
    };
  });
  const maxValue = Math.max(...values.map((item) => item.value), 1);

  if (!result.rows.length || numericColumnIndex < 0) {
    return <section className="panel muted-panel">Run a query with numeric values to preview a chart.</section>;
  }

  return (
    <section className="panel chart-panel">
      <div className="panel-title-row">
        <div>
          <h2>Chart preview</h2>
          <p className="muted-text">Visual preview generated from the first numeric result column.</p>
        </div>
        <BarChart3 size={22} />
      </div>
      <div className="bar-chart">
        {values.map((item) => (
          <div className="bar-row" key={`${item.label}-${item.value}`}>
            <span>{item.label}</span>
            <div><i style={{ width: `${Math.max(8, (item.value / maxValue) * 100)}%` }} /></div>
            <strong>{item.value.toLocaleString()}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function DataExplorerPanel({ result, schema }: { result: QueryResult; schema: DatabaseSchema }) {
  return (
    <section className="panel data-explorer-panel">
      <div className="panel-title-row">
        <div>
          <h2>Data explorer</h2>
          <p className="muted-text">Profile the current result and schema before refining the query.</p>
        </div>
        <Table2 size={22} />
      </div>
      <div className="metric-grid">
        <article>
          <span>Rows</span>
          <strong>{result.rows.length}</strong>
        </article>
        <article>
          <span>Columns</span>
          <strong>{result.columns.length}</strong>
        </article>
        <article>
          <span>Tables</span>
          <strong>{schema.schemaStructured.length}</strong>
        </article>
      </div>
      <div className="data-column-list">
        {result.columns.map((column) => (
          <span key={column}><Filter size={14} /> {column}</span>
        ))}
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
  generatedSql: string;
  result: QueryResult;
  setPrompt(value: string): void;
  onSend(): void;
  onClear(): void;
}) {
  const visibleMessages = props.history.filter((message) => message.role !== "system");

  return (
    <section className="drawer-section chat-panel">
      <div className="drawer-ai-header">
        <Bot size={18} />
        <strong>DBChatPro AI</strong>
      </div>
      <div className="chat-list">
        {visibleMessages.map((message, index) => (
          <article key={`${message.role}-${index}`} className={`chat-message ${message.role}`}>
            <strong>{message.role === "user" ? "You" : "AI Assistant"}</strong>
            <ChatMessageBody text={message.text} />
            {message.role === "assistant" && wantsChart(visibleMessages[index - 1]?.text ?? "") && (
              <ChatResultChart result={props.result} />
            )}
          </article>
        ))}
        {!visibleMessages.length && (
          <article className="chat-message assistant">
            <strong>AI Assistant</strong>
            <span>Run a query, then ask for trends, exceptions, charts, SQL details, or a safer SQL rewrite.</span>
          </article>
        )}
      </div>
      <div className="chat-suggestions">
        <button onClick={() => props.setPrompt("Show this as a line chart")}>Show this as a line chart</button>
        <button onClick={() => props.setPrompt("Compare to previous year")}>Compare to previous year</button>
        <button onClick={() => props.setPrompt("Show the SQL command and explain the result")}>Show SQL and explain</button>
      </div>
      <textarea value={props.prompt} onChange={(event) => props.setPrompt(event.target.value)} placeholder="Ask about trends, outliers, or next actions" />
      <div className="action-row">
        <button className="primary-button" onClick={props.onSend}><Send size={17} /> Submit</button>
        <button className="secondary-button" onClick={props.onClear}>Clear</button>
      </div>
    </section>
  );
}

function ChatMessageBody({ text }: { text: string }) {
  const [beforeSql, sql] = text.split("\n\nSQL used:\n");

  return (
    <>
      <span>{beforeSql}</span>
      {sql && (
        <pre className="chat-sql"><code>{sql}</code></pre>
      )}
    </>
  );
}

function ChatResultChart({ result }: { result: QueryResult }) {
  const numericColumnIndex = result.columns.findIndex((_, index) =>
    result.rows.some((row) => parseNumericCell(row[index]) !== null)
  );
  const labelColumnIndex = result.columns.findIndex((_, index) => index !== numericColumnIndex);

  if (!result.rows.length || numericColumnIndex < 0) {
    return <div className="chat-chart-empty">No numeric result column is available for a chart.</div>;
  }

  const values = result.rows.slice(0, 6).map((row) => ({
    label: row[labelColumnIndex] ?? row[0] ?? "Row",
    value: parseNumericCell(row[numericColumnIndex]) ?? 0
  }));
  const maxValue = Math.max(...values.map((item) => item.value), 1);

  return (
    <div className="chat-chart">
      {values.map((item) => (
        <div className="chat-chart-row" key={`${item.label}-${item.value}`}>
          <span>{item.label}</span>
          <div><i style={{ width: `${Math.max(8, (item.value / maxValue) * 100)}%` }} /></div>
          <strong>{item.value.toLocaleString()}</strong>
        </div>
      ))}
    </div>
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
  editingConnectionName: string;
  error: string;
  onCheck(): void;
  onSave(): void;
  onEdit(connection: AIConnection): void;
  onCancelEdit(): void;
  onDelete(name: string): void;
}) {
  const isEditing = Boolean(props.editingConnectionName);
  const canSave = Boolean(props.draft.name.trim() && props.draft.connectionString.trim());

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
          <h2>{isEditing ? "Edit Connection" : "Add a Connection"}</h2>
          <p className="muted-text">
            {isEditing
              ? `Editing ${props.editingConnectionName}. Saved query history is kept if you rename it.`
              : "The AI service receives schema context only; it does not need direct access to record data."}
          </p>
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
            <button className="secondary-button" onClick={props.onSave} disabled={!canSave}>
              <Save size={17} /> {isEditing ? "Update" : "Save"}
            </button>
            {isEditing && (
              <button className="secondary-button" onClick={props.onCancelEdit}>
                Cancel
              </button>
            )}
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
                  <div className="connection-actions">
                    <button className="icon-button" title={`Edit ${connection.name}`} onClick={() => props.onEdit(connection)}>
                      <Edit3 size={17} />
                    </button>
                    <button className="icon-button danger" title="Delete connection" onClick={() => props.onDelete(connection.name)}>
                      <Trash2 size={18} />
                    </button>
                  </div>
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
  const [modelRefreshError, setModelRefreshError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(props.settings);
    setAvailableModels(getAvailableModels(props.settings));
  }, [props.settings]);

  function saveSettings() {
    const settingsToSave = syncSelectedCustomProvider(draft);
    setDraft(settingsToSave);
    persistSettings(settingsToSave);
  }

  function persistSettings(nextSettings: AISettings) {
    props.onSave(nextSettings);
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
    setModelRefreshError("");
    setRefreshingModels(true);
    try {
      const settingsToRefresh = syncSelectedCustomProvider(nextDraft);
      const models = await refreshModels(settingsToRefresh);
      const refreshedDraft: AISettings = {
        ...settingsToRefresh,
        model: settingsToRefresh.model && models.includes(settingsToRefresh.model) ? settingsToRefresh.model : models[0] ?? settingsToRefresh.model,
        customModels: {
          ...(settingsToRefresh.customModels ?? {}),
          [settingsToRefresh.platform]: Array.from(new Set([...((settingsToRefresh.customModels ?? {})[settingsToRefresh.platform] ?? []), ...models]))
        },
        customProviders: (settingsToRefresh.customProviders ?? []).map((provider) =>
          provider.id === settingsToRefresh.platform
            ? { ...provider, models: Array.from(new Set([...provider.models, ...models])) }
            : provider
        )
      };
      setDraft(refreshedDraft);
      setAvailableModels(getAvailableModels(refreshedDraft));
      persistSettings(refreshedDraft);
    } catch (nextError) {
      setModelRefreshError(nextError instanceof Error ? nextError.message : "Unable to refresh models from this provider.");
    } finally {
      setRefreshingModels(false);
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
    persistSettings(nextDraft);
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
    persistSettings(nextDraft);
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
    persistSettings(nextDraft);
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
          {modelRefreshError && <p className="error-text">{modelRefreshError}</p>}
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
