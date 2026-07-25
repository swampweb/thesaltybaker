const money = n =>
  (Number(n) || 0).toLocaleString(undefined, {
    style: "currency",
    currency: "USD"
  });

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const $ = id => document.getElementById(id);

const TAX_RATE = 0.05;

function exitApp() {
  alert("The Salty Baker is running from GitHub Pages now. You can close this browser tab when finished.");
}

function normalizeTx(row) {
  return {
    id: row.id,
    date: row.transaction_date,
    entry_type: row.entry_type,
    account: row.account,
    name: row.customer_name || "",
    payment_type: row.payment_type || "",
    amount: Number(row.amount) || 0,
    notes: row.notes || "",
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function toDbTx(body) {
  return {
    transaction_date: body.date,
    entry_type: body.entry_type,
    account: body.account,
    customer_name: body.name || "",
    payment_type: body.payment_type || "",
    amount: Number(body.amount) || 0,
    notes: body.notes || ""
  };
}

function includedTax(amount) {
  amount = Number(amount) || 0;
  return amount - amount / (1 + TAX_RATE);
}

function buildMonthRows(rows) {
  const monthRows = [];

  for (let m = 1; m <= 12; m++) {
    const list = rows.filter(r => {
      const d = new Date(r.transaction_date + "T00:00:00");
      return d.getMonth() + 1 === m;
    });

    const income = list
      .filter(r => r.entry_type === "Income")
      .reduce((t, r) => t + Number(r.amount || 0), 0);

    const donations = list
      .filter(r => r.entry_type === "Donation")
      .reduce((t, r) => t + Number(r.amount || 0), 0);

    const expenses = list
      .filter(r => r.entry_type === "Expense")
      .reduce((t, r) => t + Number(r.amount || 0), 0);

    const cash_income = list
      .filter(r => r.entry_type === "Income" && r.payment_type === "Cash")
      .reduce((t, r) => t + Number(r.amount || 0), 0);

    const noncash_gross = list
      .filter(r => r.entry_type === "Income" && (r.payment_type || "") !== "Cash")
      .reduce((t, r) => t + Number(r.amount || 0), 0);

    const taxable_sales = income;
    const tax_due = includedTax(taxable_sales);

    monthRows.push({
      month: m,
      income,
      cash_income,
      donations,
      expenses,
      net_profit: income + donations - expenses,
      noncash_gross,
      taxable_sales,
      tax_due
    });
  }

  return monthRows;
}

function buildTotals(monthRows) {
  return {
    income: monthRows.reduce((t, r) => t + Number(r.income || 0), 0),
    cash_income: monthRows.reduce((t, r) => t + Number(r.cash_income || 0), 0),
    donations: monthRows.reduce((t, r) => t + Number(r.donations || 0), 0),
    expenses: monthRows.reduce((t, r) => t + Number(r.expenses || 0), 0),
    net_profit: monthRows.reduce((t, r) => t + Number(r.net_profit || 0), 0),
    noncash_gross: monthRows.reduce((t, r) => t + Number(r.noncash_gross || 0), 0),
    taxable_sales: monthRows.reduce((t, r) => t + Number(r.taxable_sales || 0), 0),
    tax_due: monthRows.reduce((t, r) => t + Number(r.tax_due || 0), 0),
    override_applied: false
  };
}

async function getTransactionsRaw(year = "all", month = "all") {
  let query = window.saltySupabase
    .from("transactions")
    .select("*")
    .order("transaction_date", { ascending: false })
    .order("id", { ascending: false });

  if (year && year !== "all") {
    query = query
      .gte("transaction_date", `${year}-01-01`)
      .lte("transaction_date", `${year}-12-31`);
  }

  if (month && month !== "all") {
    const mm = String(month).padStart(2, "0");
    const lastDay = new Date(Number(year), Number(month), 0).getDate();
    query = query
      .gte("transaction_date", `${year}-${mm}-01`)
      .lte("transaction_date", `${year}-${mm}-${lastDay}`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

async function getYears() {
  const { data, error } = await window.saltySupabase
    .from("transactions")
    .select("transaction_date");

  if (error) throw new Error(error.message);

  const years = [...new Set(
    (data || [])
      .map(r => String(r.transaction_date || "").slice(0, 4))
      .filter(Boolean)
  )].sort();

  return years;
}

async function getCustomers(term = "") {
  const { data, error } = await window.saltySupabase
    .from("transactions")
    .select("customer_name, transaction_date, entry_type")
    .not("customer_name", "is", null);

  if (error) throw new Error(error.message);

  const map = new Map();
  const search = String(term || "").toLowerCase();

  (data || []).forEach(r => {
    const name = String(r.customer_name || "").trim();
    if (!name) return;
    if (search && !name.toLowerCase().includes(search)) return;

    if (!map.has(name)) {
      map.set(name, {
        name,
        orders: 0,
        last_date: ""
      });
    }

    const item = map.get(name);

    if (r.entry_type === "Income" || r.entry_type === "Donation") {
      item.orders++;
    }

    if (!item.last_date || r.transaction_date > item.last_date) {
      item.last_date = r.transaction_date;
    }
  });

  const customers = [...map.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return customers;
}

async function getSummary(year) {
  const rows = await getTransactionsRaw(year, "all");
  const monthRows = buildMonthRows(rows);
  const totals = buildTotals(monthRows);

  return {
    months: monthRows,
    totals
  };
}

async function getCustomerReport(name) {
  const { data, error } = await window.saltySupabase
    .from("transactions")
    .select("*")
    .eq("customer_name", name)
    .order("transaction_date", { ascending: false })
    .order("id", { ascending: false });

  if (error) throw new Error(error.message);

  const tx = (data || []).map(normalizeTx);

  const incomeRows = tx.filter(r =>
    r.entry_type === "Income" || r.entry_type === "Donation"
  );

  const summary = {
    order_count: incomeRows.length,
    total_income: tx
      .filter(r => r.entry_type === "Income")
      .reduce((t, r) => t + Number(r.amount || 0), 0),
    total_donations: tx
      .filter(r => r.entry_type === "Donation")
      .reduce((t, r) => t + Number(r.amount || 0), 0),
    first_date: tx.length ? tx.map(r => r.date).sort()[0] : "",
    last_date: tx.length ? tx.map(r => r.date).sort().reverse()[0] : ""
  };

  return {
    summary,
    transactions: tx
  };
}

async function api(url, opt = {}) {
  const method = (opt.method || "GET").toUpperCase();
  const parsed = new URL(url, window.location.origin);
  const path = parsed.pathname;

  if (path === "/api/years") {
    return {
      years: await getYears()
    };
  }

  if (path === "/api/customers") {
    const term = parsed.searchParams.get("term") || "";
    return {
      customers: await getCustomers(term)
    };
  }

  if (path === "/api/summary") {
    const year = parsed.searchParams.get("year") || new Date().getFullYear();
    return await getSummary(year);
  }

  if (path === "/api/transactions" && method === "GET") {
    const year = parsed.searchParams.get("year") || "all";
    const month = parsed.searchParams.get("month") || "all";
    const rows = await getTransactionsRaw(year, month);

    return {
      transactions: rows.map(normalizeTx)
    };
  }

  if (path === "/api/transactions" && method === "POST") {
    const body = JSON.parse(opt.body || "{}");
    const dbRow = toDbTx(body);

    const { data, error } = await window.saltySupabase
      .from("transactions")
      .insert(dbRow)
      .select()
      .single();

    if (error) throw new Error(error.message);

    return {
      transaction: normalizeTx(data)
    };
  }

  if (path === "/api/transactions" && method === "PUT") {
    const body = JSON.parse(opt.body || "{}");
    const id = body.id;

    if (!id) throw new Error("Missing transaction ID.");

    const dbRow = toDbTx(body);

    const { data, error } = await window.saltySupabase
      .from("transactions")
      .update(dbRow)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(error.message);

    return {
      transaction: normalizeTx(data)
    };
  }

  if (path.startsWith("/api/transactions/") && method === "DELETE") {
    const id = path.split("/").pop();

    const { error } = await window.saltySupabase
      .from("transactions")
      .delete()
      .eq("id", id);

    if (error) throw new Error(error.message);

    return {
      ok: true
    };
  }

  if (path === "/api/customer-report") {
    const name = parsed.searchParams.get("name") || "";
    return await getCustomerReport(name);
  }

  throw new Error("Unsupported API route: " + path);
}

async function loadSharedFooter() {
  try {
    let footer = document.querySelector(".site-footer");

    if (!footer) {
      footer = document.createElement("footer");
      footer.className = "site-footer";
      document.body.appendChild(footer);
    }

    let r = await fetch("footer.html?v=" + Date.now(), {
      cache: "no-store"
    });

    if (!r.ok) throw new Error("footer.html not found");

    let html = await r.text();
    let doc = new DOMParser().parseFromString(html, "text/html");
    let shared = doc.querySelector("#footerContent");

    footer.innerHTML = shared ? shared.innerHTML : html;
  } catch (e) {
    console.warn("Footer load failed:", e);
  }
}

document.addEventListener("DOMContentLoaded", loadSharedFooter);