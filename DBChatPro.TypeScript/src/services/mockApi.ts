import type {
  AIConnection,
  AIQuery,
  ChatMessage,
  DatabaseSchema,
  DatabaseType,
  DbChatApi,
  HistoryItem,
  QueryResult,
  QueryType
} from "../types";

const storageKey = "dbchatpro-ts-state";

interface AppState {
  connections: AIConnection[];
  queries: HistoryItem[];
}

const schemas: Record<DatabaseType, DatabaseSchema> = {
  MSSQL: {
    schemaStructured: [
      { tableName: "Customers", columns: ["CustomerId", "CompanyName", "Region", "CreatedAt"] },
      { tableName: "Orders", columns: ["OrderId", "CustomerId", "OrderDate", "Status", "Total"] },
      { tableName: "OrderItems", columns: ["OrderItemId", "OrderId", "Sku", "Quantity", "Price"] }
    ],
    schemaRaw: [
      "Customers(CustomerId, CompanyName, Region, CreatedAt)",
      "Orders(OrderId, CustomerId, OrderDate, Status, Total)",
      "OrderItems(OrderItemId, OrderId, Sku, Quantity, Price)"
    ]
  },
  MYSQL: {
    schemaStructured: [
      { tableName: "users", columns: ["id", "email", "plan", "created_at"] },
      { tableName: "invoices", columns: ["id", "user_id", "status", "amount", "due_date"] }
    ],
    schemaRaw: ["users(id, email, plan, created_at)", "invoices(id, user_id, status, amount, due_date)"]
  },
  POSTGRESQL: {
    schemaStructured: [
      { tableName: "accounts", columns: ["id", "name", "industry", "owner_id"] },
      { tableName: "tickets", columns: ["id", "account_id", "priority", "state", "opened_at"] }
    ],
    schemaRaw: ["accounts(id, name, industry, owner_id)", "tickets(id, account_id, priority, state, opened_at)"]
  },
  ORACLE: {
    schemaStructured: [
      { tableName: "PRODUCTS", columns: ["PRODUCT_ID", "NAME", "CATEGORY", "LIST_PRICE"] },
      { tableName: "SHIPMENTS", columns: ["SHIPMENT_ID", "PRODUCT_ID", "STATUS", "SHIPPED_AT"] }
    ],
    schemaRaw: ["PRODUCTS(PRODUCT_ID, NAME, CATEGORY, LIST_PRICE)", "SHIPMENTS(SHIPMENT_ID, PRODUCT_ID, STATUS, SHIPPED_AT)"]
  },
  SQLITE: {
    schemaStructured: [
      { tableName: "notes", columns: ["id", "title", "body", "created_at", "updated_at"] },
      { tableName: "tasks", columns: ["id", "note_id", "title", "status", "due_date"] },
      { tableName: "settings", columns: ["key", "value", "updated_at"] }
    ],
    schemaRaw: [
      "notes(id, title, body, created_at, updated_at)",
      "tasks(id, note_id, title, status, due_date)",
      "settings(key, value, updated_at)"
    ]
  }
};

const seedState: AppState = {
  connections: [
    {
      name: "Sales Warehouse",
      databaseType: "MSSQL",
      connectionString: "Data Source=localhost;Initial Catalog=Sales;Trusted_Connection=True;TrustServerCertificate=true"
    }
  ],
  queries: []
};

function loadState(): AppState {
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    saveState(seedState);
    return seedState;
  }

  return JSON.parse(raw) as AppState;
}

function saveState(state: AppState): void {
  window.localStorage.setItem(storageKey, JSON.stringify(state));
}

function delay<T>(value: T, ms = 250): Promise<T> {
  return new Promise((resolve) => window.setTimeout(() => resolve(value), ms));
}

function toSql(prompt: string, databaseType: DatabaseType): string {
  const normalized = prompt.toLowerCase();
  const limit = databaseType === "MSSQL" ? "TOP 10" : "";

  if (databaseType === "SQLITE") {
    if (normalized.includes("task")) {
      return "SELECT tasks.id, tasks.title, tasks.status, tasks.due_date FROM tasks ORDER BY tasks.due_date ASC LIMIT 10;";
    }

    return "SELECT notes.id, notes.title, notes.created_at, notes.updated_at FROM notes ORDER BY notes.updated_at DESC LIMIT 10;";
  }

  if (normalized.includes("customer") || normalized.includes("order")) {
    return databaseType === "MSSQL"
      ? "SELECT TOP 10 c.CompanyName, o.OrderDate, o.Status, o.Total FROM Customers c JOIN Orders o ON c.CustomerId = o.CustomerId ORDER BY o.OrderDate DESC;"
      : "SELECT c.name, o.created_at, o.status, o.total FROM customers c JOIN orders o ON c.id = o.customer_id ORDER BY o.created_at DESC LIMIT 10;";
  }

  if (normalized.includes("invoice")) {
    return "SELECT id, user_id, status, amount, due_date FROM invoices ORDER BY due_date ASC LIMIT 10;";
  }

  return `SELECT ${limit} * FROM ${databaseType === "MSSQL" ? "Orders" : "tickets"};`.replace("  ", " ");
}

export const mockApi: DbChatApi = {
  async getConnections() {
    return delay(loadState().connections);
  },

  async addConnection(connection) {
    const state = loadState();
    state.connections = [...state.connections.filter((item) => item.name !== connection.name), connection];
    saveState(state);
    await delay(undefined);
  },

  async deleteConnection(name) {
    const state = loadState();
    state.connections = state.connections.filter((item) => item.name !== name);
    state.queries = state.queries.filter((item) => item.databaseName !== name);
    saveState(state);
    await delay(undefined);
  },

  async generateSchema(connection) {
    return delay(schemas[connection.databaseType]);
  },

  async getAiSqlQuery(model, platform, prompt, _schema, databaseType): Promise<AIQuery> {
    const engine = platform && model ? `${platform} / ${model}` : "the selected AI provider";
    return delay({
      query: toSql(prompt, databaseType),
      summary: `Generated with ${engine}. The query targets the relevant schema objects and returns a concise result set for review.`
    });
  },

  async getDataTable(_connection, query): Promise<QueryResult> {
    const invoiceMode = query.toLowerCase().includes("invoice");
    const ticketMode = query.toLowerCase().includes("ticket");
    const sqliteNotesMode = query.toLowerCase().includes("notes");
    const sqliteTasksMode = query.toLowerCase().includes("tasks");

    if (sqliteTasksMode) {
      return delay({
        columns: ["id", "title", "status", "due_date"],
        rows: [
          ["1", "Review schema sync", "Open", "2026-06-01"],
          ["2", "Prepare local import", "In Progress", "2026-06-03"],
          ["3", "Archive old notes", "Done", "2026-05-28"]
        ]
      });
    }

    if (sqliteNotesMode) {
      return delay({
        columns: ["id", "title", "created_at", "updated_at"],
        rows: [
          ["1", "SQLite local setup", "2026-05-25", "2026-05-30"],
          ["2", "Provider configuration", "2026-05-27", "2026-05-29"],
          ["3", "Smart builder ideas", "2026-05-29", "2026-05-30"]
        ]
      });
    }

    if (invoiceMode) {
      return delay({
        columns: ["id", "user_id", "status", "amount", "due_date"],
        rows: [
          ["INV-1024", "U-18", "Open", "428.00", "2026-06-04"],
          ["INV-1025", "U-23", "Paid", "899.00", "2026-06-09"],
          ["INV-1026", "U-31", "Open", "153.40", "2026-06-12"]
        ]
      });
    }

    if (ticketMode) {
      return delay({
        columns: ["id", "account_id", "priority", "state", "opened_at"],
        rows: [
          ["T-1148", "A-410", "High", "Open", "2026-05-29"],
          ["T-1147", "A-210", "Medium", "Waiting", "2026-05-28"],
          ["T-1145", "A-114", "Low", "Closed", "2026-05-27"]
        ]
      });
    }

    return delay({
      columns: ["CompanyName", "OrderDate", "Status", "Total"],
      rows: [
        ["Northwind Labs", "2026-05-29", "Shipped", "1240.50"],
        ["Contoso Health", "2026-05-28", "Processing", "870.20"],
        ["Fabrikam Retail", "2026-05-28", "Delivered", "2318.10"],
        ["Adventure Works", "2026-05-27", "Delivered", "655.80"]
      ]
    });
  },

  async getQueries(databaseName, queryType) {
    const state = loadState();
    return delay(
      state.queries
        .filter((item) => item.databaseName === databaseName && item.queryType === queryType)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    );
  },

  async saveQuery(prompt, databaseName, queryType) {
    const state = loadState();
    const id = `${queryType}-${databaseName}-${prompt}`;
    state.queries = [
      {
        id,
        name: prompt.length > 46 ? `${prompt.slice(0, 43)}...` : prompt,
        query: prompt,
        databaseName,
        queryType,
        createdAt: new Date().toISOString()
      },
      ...state.queries.filter((item) => item.id !== id)
    ].slice(0, 30);
    saveState(state);
    await delay(undefined);
  },

  async chatPrompt(history, model, platform) {
    const lastUserMessage = [...history].reverse().find((item) => item.role === "user")?.text ?? "";
    const provider = platform && model ? `${platform} using ${model}` : "the configured assistant";
    const text = `Using ${provider}, the current result set suggests a focused follow-up: ${lastUserMessage || "ask for trends, outliers, or next actions"}.`;
    return delay<ChatMessage>({ role: "assistant", text });
  }
};
