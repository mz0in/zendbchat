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
      { tableName: "Products", columns: ["ProductID", "ProductName", "CategoryID", "UnitPrice", "UnitsInStock"] },
      { tableName: "Categories", columns: ["CategoryID", "CategoryName", "Description"] }
    ],
    schemaRaw: [
      "Customers(CustomerID, CompanyName, ContactName, City, Country)",
      "Orders(OrderID, CustomerID, OrderDate, ShipCity, ShipCountry)",
      "OrderDetails(OrderID, ProductID, UnitPrice, Quantity, Discount)",
      "Products(ProductID, ProductName, CategoryID, UnitPrice, UnitsInStock)",
      "Categories(CategoryID, CategoryName, Description)"
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

function normalizePrompt(prompt: string): string {
  const digitNormalized = prompt
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
  const normalized = digitNormalized.toLowerCase();
  const translatedTokens: string[] = [normalized];

  const conceptDictionary: Array<[RegExp, string]> = [
    [/\b(revenue|sales|total sales|amount|total|income|turnover|mrr|arr|category|categories|month over month|mom|monthly|months?)\b|ايراد|إيراد|ايرادات|إيرادات|مبيعات|اجمالي|إجمالي|المجموع|فئة|تصنيف|شهر|شهري|اشهر|أشهر/iu, " revenue sales category monthly"],
    [/\b(client|clients|customer|customers|cust|cliente|clientes|cliente?s|kunde|kunden)\b|عميل|عملاء|العملاء|الزبائن|زبائن|مشتري|المشترين|العملاء/iu, " customers"],
    [/\b(order|orders|purchase|purchases|commande|commandes|pedido|pedidos|bestellung|bestellungen)\b|طلب|طلبات|الطلبات|اوردر|أوردر|اوامر|أوامر/iu, " orders"],
    [/\b(product|products|item|items|produit|produits|producto|productos|produkt|produkte)\b|منتج|منتجات|المنتجات|سلعة|اصناف|أصناف/iu, " products"],
    [/\b(invoice|invoices|bill|bills|facture|factures|factura|facturas)\b|فاتورة|فواتير|الفواتير/iu, " invoice"],
    [/\b(list|show|display|get|fetch|select|give|voir|mostrar|listar|zeige|anzeigen)\b|اعرض|عرض|اظهر|أظهر|هات|جيب|قائمة|اسرد|اذكر|اختار|اختر/iu, " list show"],
    [/\b(all|every|full|todos|todas|tout|tous|alle)\b|كل|جميع|كافة|الكل/iu, " all every"],
    [/\b(top|first|limit|only|primeros|premiers|erste)\b|اول|أول|اخر|آخر|حد|فقط/iu, " top first limit"]
  ];

  for (const [pattern, token] of conceptDictionary) {
    if (pattern.test(normalized)) {
      translatedTokens.push(token);
    }
  }

  return translatedTokens.join(" ");
}

function inferPromptLimit(prompt: string): number | null {
  const normalized = normalizePrompt(prompt);
  if (/\b(all|every|full|without limit|no limit)\b/.test(normalized)) {
    return null;
  }

  const explicitLimit = normalized.match(/\b(?:top|first|limit|show|list)\s+(\d{1,4})\b/);
  if (explicitLimit) {
    return Number.parseInt(explicitLimit[1], 10);
  }

  return 50;
}

function appendSqliteLimit(sql: string, limit: number | null): string {
  return limit ? `${sql} LIMIT ${limit};` : `${sql};`;
}

function appendMssqlLimit(selectColumns: string, fromClause: string, limit: number | null): string {
  return `SELECT${limit ? ` TOP ${limit}` : ""} ${selectColumns} ${fromClause};`;
}

function toSql(prompt: string, databaseType: DatabaseType): string {
  const normalized = normalizePrompt(prompt);
  const rowLimit = inferPromptLimit(prompt);

  if (databaseType === "SQLITE") {
    if (normalized.includes("revenue") || normalized.includes("sales") || normalized.includes("category monthly")) {
      return appendSqliteLimit(
        "SELECT strftime('%Y-%m', Orders.OrderDate) AS month, Categories.CategoryName AS category, ROUND(SUM([Order Details].UnitPrice * [Order Details].Quantity * (1 - [Order Details].Discount)), 2) AS total_revenue FROM Orders JOIN [Order Details] ON [Order Details].OrderID = Orders.OrderID JOIN Products ON Products.ProductID = [Order Details].ProductID JOIN Categories ON Categories.CategoryID = Products.CategoryID GROUP BY strftime('%Y-%m', Orders.OrderDate), Categories.CategoryName ORDER BY month DESC, total_revenue DESC",
        rowLimit
      );
    }

    if (normalized.includes("customer")) {
      return appendSqliteLimit(
        "SELECT CustomerID, CompanyName, ContactName, City, Country FROM Customers ORDER BY CompanyName",
        rowLimit
      );
    }

    if (normalized.includes("order")) {
      return appendSqliteLimit(
        "SELECT Orders.OrderID, Customers.CompanyName, Orders.OrderDate, Orders.ShipCity, Orders.ShipCountry FROM Orders JOIN Customers ON Customers.CustomerID = Orders.CustomerID ORDER BY Orders.OrderDate DESC",
        rowLimit
      );
    }

    return appendSqliteLimit("SELECT ProductID, ProductName, UnitPrice, UnitsInStock FROM Products ORDER BY ProductName", rowLimit);
  }

  if (normalized.includes("revenue") || normalized.includes("sales") || normalized.includes("category monthly")) {
    return databaseType === "MSSQL"
      ? appendMssqlLimit(
          "FORMAT(o.OrderDate, 'yyyy-MM') AS [Month], p.Category AS Category, SUM(oi.Quantity * oi.Price) AS TotalRevenue",
          "FROM Orders o JOIN OrderItems oi ON oi.OrderId = o.OrderId JOIN Products p ON p.ProductId = oi.ProductId GROUP BY FORMAT(o.OrderDate, 'yyyy-MM'), p.Category ORDER BY [Month] DESC, TotalRevenue DESC",
          rowLimit
        )
      : appendSqliteLimit(
          "SELECT strftime('%Y-%m', o.created_at) AS month, p.category AS category, SUM(oi.quantity * oi.price) AS total_revenue FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN products p ON p.id = oi.product_id GROUP BY strftime('%Y-%m', o.created_at), p.category ORDER BY month DESC, total_revenue DESC",
          rowLimit
        );
  }

  if (normalized.includes("customer") || normalized.includes("order")) {
    return databaseType === "MSSQL"
      ? appendMssqlLimit(
          "c.CompanyName, o.OrderDate, o.Status, o.Total",
          "FROM Customers c JOIN Orders o ON c.CustomerId = o.CustomerId ORDER BY o.OrderDate DESC",
          rowLimit
        )
      : appendSqliteLimit(
          "SELECT c.name, o.created_at, o.status, o.total FROM customers c JOIN orders o ON c.id = o.customer_id ORDER BY o.created_at DESC",
          rowLimit
        );
  }

  if (normalized.includes("invoice")) {
    return appendSqliteLimit("SELECT id, user_id, status, amount, due_date FROM invoices ORDER BY due_date ASC", rowLimit);
  }

  return databaseType === "MSSQL"
    ? appendMssqlLimit("*", "FROM Orders", rowLimit)
    : appendSqliteLimit("SELECT * FROM tickets", rowLimit);
}

function readSqlLimit(query: string): number | null {
  const limitMatch = query.match(/\blimit\s+(\d{1,4})\b/i);
  if (limitMatch) {
    return Number.parseInt(limitMatch[1], 10);
  }

  const topMatch = query.match(/\btop\s+(\d{1,4})\b/i);
  if (topMatch) {
    return Number.parseInt(topMatch[1], 10);
  }

  return null;
}

function applyResultLimit(result: QueryResult, query: string): QueryResult {
  const limit = readSqlLimit(query);
  return limit ? { ...result, rows: result.rows.slice(0, limit) } : result;
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
    const revenueMode = query.toLowerCase().includes("total_revenue") || query.toLowerCase().includes("totalrevenue");
    const invoiceMode = query.toLowerCase().includes("invoice");
    const ticketMode = query.toLowerCase().includes("ticket");
    const sqliteCustomerMode = query.toLowerCase().includes("customers");
    const sqliteProductMode = query.toLowerCase().includes("products");

    if (revenueMode) {
      return delay(applyResultLimit({
        columns: ["month", "category", "total_revenue"],
        rows: [
          ["1998-05", "Beverages", "12286.70"],
          ["1998-05", "Dairy Products", "10549.60"],
          ["1998-05", "Confections", "7211.25"],
          ["1998-04", "Beverages", "18454.90"],
          ["1998-04", "Seafood", "15822.40"],
          ["1998-04", "Produce", "13220.75"],
          ["1998-03", "Dairy Products", "17421.20"],
          ["1998-03", "Confections", "14202.00"],
          ["1998-03", "Meat/Poultry", "11834.80"],
          ["1998-02", "Beverages", "16340.45"],
          ["1998-02", "Grains/Cereals", "9348.30"],
          ["1998-02", "Condiments", "8102.10"]
        ]
      }, query));
    }

    if (sqliteCustomerMode) {
      return delay(applyResultLimit({
        columns: ["CustomerID", "CompanyName", "ContactName", "City", "Country"],
        rows: [
          ["ALFKI", "Alfreds Futterkiste", "Maria Anders", "Berlin", "Germany"],
          ["ANATR", "Ana Trujillo Emparedados y helados", "Ana Trujillo", "Mexico D.F.", "Mexico"],
          ["ANTON", "Antonio Moreno Taqueria", "Antonio Moreno", "Mexico D.F.", "Mexico"],
          ["AROUT", "Around the Horn", "Thomas Hardy", "London", "UK"],
          ["BSBEV", "B's Beverages", "Victoria Ashworth", "London", "UK"],
          ["BERGS", "Berglunds snabbkop", "Christina Berglund", "Lulea", "Sweden"],
          ["BLAUS", "Blauer See Delikatessen", "Hanna Moos", "Mannheim", "Germany"],
          ["BLONP", "Blondesddsl pere et fils", "Frederique Citeaux", "Strasbourg", "France"],
          ["BONAP", "Bon app", "Laurence Lebihan", "Marseille", "France"],
          ["BOTTM", "Bottom-Dollar Markets", "Elizabeth Lincoln", "Tsawassen", "Canada"],
          ["BOLID", "Bolido Comidas preparadas", "Martin Sommer", "Madrid", "Spain"],
          ["CACTU", "Cactus Comidas para llevar", "Patricio Simpson", "Buenos Aires", "Argentina"],
          ["CENTC", "Centro comercial Moctezuma", "Francisco Chang", "Mexico D.F.", "Mexico"],
          ["CHOPS", "Chop-suey Chinese", "Yang Wang", "Bern", "Switzerland"],
          ["COMMI", "Comercio Mineiro", "Pedro Afonso", "Sao Paulo", "Brazil"],
          ["CONSH", "Consolidated Holdings", "Elizabeth Brown", "London", "UK"],
          ["WANDK", "Die Wandernde Kuh", "Rita Muller", "Stuttgart", "Germany"],
          ["DRACD", "Drachenblut Delikatessen", "Sven Ottlieb", "Aachen", "Germany"],
          ["DUMON", "Du monde entier", "Janine Labrune", "Nantes", "France"],
          ["EASTC", "Eastern Connection", "Ann Devon", "London", "UK"],
          ["ERNSH", "Ernst Handel", "Roland Mendel", "Graz", "Austria"],
          ["FISSA", "FISSA Fabrica Inter. Salchichas S.A.", "Diego Roel", "Madrid", "Spain"],
          ["FAMIA", "Familia Arquibaldo", "Aria Cruz", "Sao Paulo", "Brazil"],
          ["FOLIG", "Folies gourmandes", "Martine Rance", "Lille", "France"],
          ["FOLKO", "Folk och fa HB", "Maria Larsson", "Bracke", "Sweden"]
        ]
      }, query));
    }

    if (sqliteProductMode) {
      return delay(applyResultLimit({
        columns: ["ProductID", "ProductName", "UnitPrice", "UnitsInStock"],
        rows: [
          ["1", "Chai", "18.00", "39"],
          ["2", "Chang", "19.00", "17"],
          ["3", "Aniseed Syrup", "10.00", "13"]
        ]
      }, query));
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
