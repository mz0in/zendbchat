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
      { tableName: "Customers", columns: ["CustomerID", "CompanyName", "ContactName", "City", "Country"] },
      { tableName: "Orders", columns: ["OrderID", "CustomerID", "OrderDate", "ShipCity", "ShipCountry"] },
      { tableName: "OrderDetails", columns: ["OrderID", "ProductID", "UnitPrice", "Quantity", "Discount"] },
      { tableName: "Products", columns: ["ProductID", "ProductName", "CategoryID", "UnitPrice", "UnitsInStock"] }
    ],
    schemaRaw: [
      "Customers(CustomerID, CompanyName, ContactName, City, Country)",
      "Orders(OrderID, CustomerID, OrderDate, ShipCity, ShipCountry)",
      "OrderDetails(OrderID, ProductID, UnitPrice, Quantity, Discount)",
      "Products(ProductID, ProductName, CategoryID, UnitPrice, UnitsInStock)"
    ]
  }
};

const seedState: AppState = {
  connections: [
    {
      name: "Northwind SQLite",
      databaseType: "SQLITE",
      connectionString: "file:./data/northwind.sqlite"
    },
    {
      name: "Sales Warehouse",
      databaseType: "MSSQL",
      connectionString: "Data Source=localhost;Initial Catalog=Sales;Trusted_Connection=True;TrustServerCertificate=true"
    }
  ],
  queries: []
};

function ensureDemoConnections(state: AppState): AppState {
  const demoConnections = seedState.connections.filter(
    (seedConnection) => !state.connections.some((connection) => connection.name === seedConnection.name)
  );

  if (!demoConnections.length) {
    return state;
  }

  const nextState = {
    ...state,
    connections: [...demoConnections, ...state.connections]
  };
  saveState(nextState);
  return nextState;
}

function loadState(): AppState {
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    saveState(seedState);
    return seedState;
  }

  return ensureDemoConnections(JSON.parse(raw) as AppState);
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
    if (normalized.includes("customer") || normalized.includes("list")) {
      return "SELECT CustomerID, CompanyName, ContactName, City, Country FROM Customers ORDER BY CompanyName LIMIT 10;";
    }

    if (normalized.includes("order")) {
      return "SELECT Orders.OrderID, Customers.CompanyName, Orders.OrderDate, Orders.ShipCity, Orders.ShipCountry FROM Orders JOIN Customers ON Customers.CustomerID = Orders.CustomerID ORDER BY Orders.OrderDate DESC LIMIT 10;";
    }

    return "SELECT ProductID, ProductName, UnitPrice, UnitsInStock FROM Products ORDER BY ProductName LIMIT 10;";
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

  async updateConnection(originalName, connection) {
    const state = loadState();
    state.connections = [
      ...state.connections.filter((item) => item.name !== originalName && item.name !== connection.name),
      connection
    ];
    state.queries = state.queries.map((item) =>
      item.databaseName === originalName ? { ...item, databaseName: connection.name } : item
    );
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
    const sqliteCustomerMode = query.toLowerCase().includes("customers");
    const sqliteProductMode = query.toLowerCase().includes("products");

    if (sqliteCustomerMode) {
      return delay({
        columns: ["CustomerID", "CompanyName", "ContactName", "City", "Country"],
        rows: [
          ["ALFKI", "Alfreds Futterkiste", "Maria Anders", "Berlin", "Germany"],
          ["ANATR", "Ana Trujillo Emparedados y helados", "Ana Trujillo", "Mexico D.F.", "Mexico"],
          ["ANTON", "Antonio Moreno Taqueria", "Antonio Moreno", "Mexico D.F.", "Mexico"],
          ["AROUT", "Around the Horn", "Thomas Hardy", "London", "UK"],
          ["BERGS", "Berglunds snabbkop", "Christina Berglund", "Lulea", "Sweden"],
          ["BLAUS", "Blauer See Delikatessen", "Hanna Moos", "Mannheim", "Germany"],
          ["BLONP", "Blondesddsl pere et fils", "Frederique Citeaux", "Strasbourg", "France"],
          ["BOLID", "Bolido Comidas preparadas", "Martin Sommer", "Madrid", "Spain"],
          ["BONAP", "Bon app", "Laurence Lebihan", "Marseille", "France"],
          ["BOTTM", "Bottom-Dollar Markets", "Elizabeth Lincoln", "Tsawassen", "Canada"]
        ]
      });
    }

    if (sqliteProductMode) {
      return delay({
        columns: ["ProductID", "ProductName", "UnitPrice", "UnitsInStock"],
        rows: [
          ["1", "Chai", "18.00", "39"],
          ["2", "Chang", "19.00", "17"],
          ["3", "Aniseed Syrup", "10.00", "13"]
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
