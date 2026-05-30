export type DatabaseType = "MSSQL" | "MYSQL" | "POSTGRESQL" | "ORACLE" | "SQLITE";

export type QueryType = "History" | "Favorite";

export type ChatRole = "system" | "user" | "assistant";

export interface AIConnection {
  name: string;
  connectionString: string;
  databaseType: DatabaseType;
}

export interface TableSchema {
  tableName: string;
  columns: string[];
}

export interface DatabaseSchema {
  schemaStructured: TableSchema[];
  schemaRaw: string[];
}

export interface HistoryItem {
  id: string;
  name: string;
  query: string;
  databaseName: string;
  queryType: QueryType;
  createdAt: string;
}

export interface AIQuery {
  query: string;
  summary: string;
}

export interface ChatMessage {
  role: ChatRole;
  text: string;
}

export interface QueryResult {
  columns: string[];
  rows: string[][];
}

export interface AISettings {
  platform: string;
  model: string;
  endpoint: string;
  apiKey: string;
  awsRegion: string;
  awsProfile: string;
  customModels: Record<string, string[]>;
  customProviders: AIProviderConfig[];
}

export interface AIProviderConfig {
  id: string;
  name: string;
  endpoint: string;
  apiKey: string;
  models: string[];
  compatibility: "OpenAI";
}

export interface DbChatApi {
  getConnections(): Promise<AIConnection[]>;
  addConnection(connection: AIConnection): Promise<void>;
  deleteConnection(name: string): Promise<void>;
  generateSchema(connection: AIConnection): Promise<DatabaseSchema>;
  getAiSqlQuery(
    model: string,
    platform: string,
    prompt: string,
    schema: DatabaseSchema,
    databaseType: DatabaseType
  ): Promise<AIQuery>;
  getDataTable(connection: AIConnection, query: string): Promise<QueryResult>;
  getQueries(databaseName: string, queryType: QueryType): Promise<HistoryItem[]>;
  saveQuery(prompt: string, databaseName: string, queryType: QueryType): Promise<void>;
  chatPrompt(history: ChatMessage[], model: string, platform: string): Promise<ChatMessage>;
}
