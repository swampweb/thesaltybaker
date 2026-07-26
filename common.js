const $ = id => document.getElementById(id);
const money = n => (Number(n)||0).toLocaleString(undefined,{style:'currency',currency:'USD'});
const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const todayISO = () => new Date().toISOString().slice(0,10);

// Fallback config in case config.js is cached/missing.
const SB_URL = (typeof SUPABASE_URL !== 'undefined') ? SUPABASE_URL : 'https://fprbzavehflzqcmxvbxx.supabase.co';
const SB_KEY = (typeof SUPABASE_ANON_KEY !== 'undefined') ? SUPABASE_ANON_KEY : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwcmJ6YXZlaGZsenFjbXh2Ynh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MjMxNzEsImV4cCI6MjA5OTk5OTE3MX0.8_D_7kx9f2as46N7ZrNhGZen25e8TGFd2ue5p1TgTvg';
const SB_REST = `${SB_URL}/rest/v1`;
const APP_VER = (typeof APP_VERSION !== 'undefined') ? APP_VERSION : '4.1.03';
const TAX_RATE_SAFE = (typeof SALES_TAX_RATE !== 'undefined') ? SALES_TAX_RATE : 0.10;

function apiHeaders(extra={}){
  return {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

async function sbFetch(path, options={}){
  const extraHeaders = options.headers || {};
  const cleanOptions = {...options};
  delete cleanOptions.headers;

  const res = await fetch(`${SB_REST}${path}`, {
    ...cleanOptions,
    headers: apiHeaders(extraHeaders)
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if(!res.ok){
    const msg = data?.message || data?.hint || text || `Supabase error ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function escapeHtml(value){
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[ch]));
}

function getYearRange(year){ return {start:`${year}-01-01`, end:`${year}-12-31`}; }
function includedTax(amount){ amount=Number(amount)||0; return amount - amount/(1+TAX_RATE_SAFE); }
function filingAmount(amount){ amount=Number(amount)||0; return amount/(1+TAX_RATE_SAFE); }

async function loadTransactions(year='all'){
  let path = '/transactions?select=*&order=transaction_date.desc,id.desc&limit=5000';
  if(year !== 'all'){
    const r=getYearRange(year);
    path += `&transaction_date=gte.${r.start}&transaction_date=lte.${r.end}`;
  }
  return await sbFetch(path);
}

async function loadYears(){
  const rows = await sbFetch('/transactions?select=transaction_date&limit=5000');
  const years = [...new Set(rows.map(r => String(r.transaction_date||'').slice(0,4)).filter(Boolean))].sort();
  const current = String(new Date().getFullYear());
  if(!years.includes(current)) years.push(current);
  return [...new Set(years)].sort();
}

function calculateMonthly(rows){
  const out=[];
  for(let m=1;m<=12;m++){
    const list=rows.filter(r => Number(String(r.transaction_date||'').slice(5,7))===m);
    const income=list.filter(r=>r.entry_type==='Income').reduce((t,r)=>t+Number(r.amount||0),0);
    const donations=list.filter(r=>r.entry_type==='Donation').reduce((t,r)=>t+Number(r.amount||0),0);
    const expenses=list.filter(r=>r.entry_type==='Expense').reduce((t,r)=>t+Number(r.amount||0),0);
    const cash=list.filter(r=>r.entry_type==='Income' && String(r.payment_type||'')==='Cash').reduce((t,r)=>t+Number(r.amount||0),0);
    const noncash=list.filter(r=>r.entry_type==='Income' && String(r.payment_type||'')!=='Cash').reduce((t,r)=>t+Number(r.amount||0),0);
    const filing=filingAmount(income);
    out.push({month:m,income,donations,expenses,cash_income:cash,noncash_gross:noncash,taxable_sales:filing,tax_due:includedTax(income),net_profit:income+donations-expenses});
  }
  return out;
}

function totalsFromMonthly(monthRows){
  const sum = f => monthRows.reduce((t,r)=>t+Number(r[f]||0),0);
  return {income:sum('income'),donations:sum('donations'),expenses:sum('expenses'),cash_income:sum('cash_income'),noncash_gross:sum('noncash_gross'),taxable_sales:sum('taxable_sales'),tax_due:sum('tax_due'),net_profit:sum('net_profit')};
}

async function insertTransaction(row){
  const data = await sbFetch('/transactions', {method:'POST', headers:{Prefer:'return=representation'}, body:JSON.stringify(row)});
  return data?.[0];
}
async function updateTransaction(id,row){
  const data = await sbFetch(`/transactions?id=eq.${encodeURIComponent(id)}`, {method:'PATCH', headers:{Prefer:'return=representation'}, body:JSON.stringify(row)});
  return data?.[0];
}
async function deleteTransaction(id){ await sbFetch(`/transactions?id=eq.${encodeURIComponent(id)}`, {method:'DELETE'}); }

async function upsertOrder(order){
  const id = order.id;
  const body = {...order};
  delete body.id;
  if(id){
    const data = await sbFetch(`/orders?id=eq.${encodeURIComponent(id)}`, {method:'PATCH', headers:{Prefer:'return=representation'}, body:JSON.stringify(body)});
    return data?.[0];
  }
  const data = await sbFetch('/orders', {method:'POST', headers:{Prefer:'return=representation'}, body:JSON.stringify(body)});
  return data?.[0];
}
async function loadOrders(status='all'){
  let path = '/orders?select=*&order=pickup_date.asc,order_date.asc,id.asc&limit=5000';
  if(status !== 'all') path += `&status=eq.${encodeURIComponent(status)}`;
  return await sbFetch(path);
}
async function postOrderToFinance(order){
  const tx = await insertTransaction({
    transaction_date: order.order_date || todayISO(),
    entry_type: 'Income',
    account: 'Orders',
    customer_name: order.customer_name || '',
    payment_type: order.payment_type || '',
    amount: Number(order.total_amount)||0,
    notes: `Order Board | Pickup: ${order.pickup_date||''} | Source: ${order.media_source||''} | Details: ${order.details||''}`
  });
  await upsertOrder({...order, status:'Posted to Finance', posted_transaction_id: tx.id});
  return tx;
}

function nav(active){
  return `<header class="topbar"><div class="brand"><img src="logo.png" onerror="this.style.display='none'"><div><h1>${active.title}</h1><p>${active.subtitle}</p></div></div><nav><a ${active.key==='dashboard'?'class="active"':''} href="index.html">Dashboard</a><a ${active.key==='orders'?'class="active"':''} href="orders.html">Orders</a><a ${active.key==='reports'?'class="active"':''} href="reports.html">Reports</a><a ${active.key==='tax'?'class="active"':''} href="tax.html">Tax</a><a ${active.key==='admin'?'class="active"':''} href="admin.html">Admin</a><button class="exit-btn" onclick="alert('Close this browser tab when finished.')">Exit</button></nav></header>`;
}
function footer(){ return `<footer class="site-footer">Created by CajunVeteran 2026 | Version ${APP_VER}</footer>`; }
