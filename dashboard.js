let tx = [];
let visibleTx = [];
let allCustomers = [];

const accountSets = {
  Income: ['Orders', 'Trade Show'],
  Expense: ['Grocery', 'Supplies', 'Equipment', 'Tax'],
  Donation: ['Donation']
};

function setAccountOptions(type, preferred=''){
  const account = $('account');
  const opts = accountSets[type] || accountSets.Income;
  const selected = preferred && opts.includes(preferred) ? preferred : opts[0];
  account.innerHTML = opts.map(o => `<option ${o===selected?'selected':''}>${o}</option>`).join('');
}

async function fillYears(){
  const years = await loadYears();
  const current = String(new Date().getFullYear());
  const html = years.map(y => `<option ${y===current?'selected':''}>${y}</option>`).join('');
  $('reportYear').innerHTML = html;
  $('txYear').innerHTML = html;
}

function fillMonths(){
  months.forEach((m,i) => $('txMonth').insertAdjacentHTML('beforeend', `<option value="${i+1}" ${new Date().getMonth()===i?'selected':''}>${m}</option>`));
}

async function fillCustomers(term=''){
  const rows = await sbFetch('/transactions?select=customer_name,transaction_date,entry_type&limit=5000');
  const map = new Map();
  rows.forEach(r => {
    const n = String(r.customer_name || '').trim();
    if(!n) return;
    if(term && !n.toLowerCase().includes(term.toLowerCase())) return;
    if(!map.has(n)) map.set(n, {name:n, orders:0, last_date:''});
    const item = map.get(n);
    if(r.entry_type === 'Income' || r.entry_type === 'Donation') item.orders++;
    if(!item.last_date || r.transaction_date > item.last_date) item.last_date = r.transaction_date;
  });
  allCustomers = [...map.values()].sort((a,b)=>a.name.localeCompare(b.name));
  const html = allCustomers.map(c=>`<option value="${escapeHtml(c.name)}">${c.orders} row(s), last ${c.last_date}</option>`).join('');
  $('customerList').innerHTML = html;
  $('customerReportList').innerHTML = html;
}

function bestCustomerName(n){
  const low = String(n || '').trim().toLowerCase();
  const c = allCustomers.find(x => x.name.toLowerCase() === low);
  return c ? c.name : String(n || '').trim();
}

function updateLastEntryBubble(type){
  const selected = type || $('entryType').value;
  const rows = tx.filter(r => r.entry_type === selected).sort((a,b)=>String(b.transaction_date).localeCompare(String(a.transaction_date)) || Number(b.id)-Number(a.id));
  if(!rows.length){
    $('lastEntryDetails').textContent = `No entry found for ${selected}.`;
    return;
  }
  const r = rows[0];
  $('lastEntryDetails').innerHTML = `<span><b>Date:</b> ${r.transaction_date}</span> <span><b>Customer:</b> ${escapeHtml(r.customer_name||'')}</span> <span><b>Payment:</b> ${escapeHtml(r.payment_type||'')}</span> <span><b>Amount:</b> ${money(r.amount)}</span>`;
}

async function renderNonPostedCard(){
  try{
    const orders = await loadOrders('all');
    const monthCounts = new Map();
    let total = 0;

    (orders || []).forEach(o => {
      const status = String(o.status || 'New Orders');
      if(status === 'Posted to Finance' || status === 'Cancelled') return;
      total++;
      if(!o.pickup_date) return;
      const monthNum = Number(String(o.pickup_date).slice(5,7));
      if(!monthNum) return;
      const label = months[monthNum - 1];
      monthCounts.set(label, (monthCounts.get(label) || 0) + 1);
    });

    $('nonPostedOrders').textContent = String(total);
    const parts = [...monthCounts.entries()].map(([m,c]) => `${m}: ${c}`);
    $('nonPostedMonths').textContent = parts.length ? parts.join(' | ') : 'No pickup month counts';
  }catch(err){
    $('nonPostedOrders').textContent = '!';
    $('nonPostedMonths').textContent = 'Could not load orders';
  }
}

async function refreshYearlyReport(){
  const year = $('reportYear').value;
  const allYear = await loadTransactions(year);
  const monthRows = calculateMonthly(allYear);
  const totals = totalsFromMonthly(monthRows);

  $('totalIncome').textContent = money(Number(totals.income||0) + Number(totals.donations||0));
  $('totalExpenses').textContent = money(totals.expenses);
  $('totalProfit').textContent = money((Number(totals.income||0) + Number(totals.donations||0)) - Number(totals.expenses||0));
  $('totalTax').textContent = money(totals.tax_due);

  $('summaryTable').querySelector('tbody').innerHTML = monthRows.map(x => `
    <tr>
      <td>${months[x.month-1]}</td>
      <td>${money(x.income)}</td>
      <td>${money(x.cash_income)}</td>
      <td>${money(x.donations)}</td>
      <td>${money(x.expenses)}</td>
      <td>${money((Number(x.income||0)+Number(x.donations||0))-Number(x.expenses||0))}</td>
      <td>${money(x.noncash_gross)}</td>
      <td class="filing-amount">${money(x.taxable_sales)}</td>
      <td>${money(x.tax_due)}</td>
    </tr>`).join('');

  $('footIncome').textContent = money(totals.income);
  $('footCash').textContent = money(totals.cash_income);
  $('footDonations').textContent = money(totals.donations);
  $('footExpenses').textContent = money(totals.expenses);
  $('footProfit').textContent = money((Number(totals.income||0)+Number(totals.donations||0))-Number(totals.expenses||0));
  $('footNonCashGross').textContent = money(totals.noncash_gross);
  $('footFilingAmount').textContent = money(totals.taxable_sales);
  $('footTaxDue').textContent = money(totals.tax_due);

  tx = allYear;
  updateLastEntryBubble($('entryType').value);
  await renderNonPostedCard();
}

async function refreshMonthlyInputs(){
  const year = $('txYear').value;
  const month = $('txMonth').value;
  const allYear = await loadTransactions(year);
  visibleTx = allYear.filter(r => month === 'all' || Number(String(r.transaction_date).slice(5,7)) === Number(month));
  renderTx();
}

function renderTx(){
  const q = String($('search').value || '').toLowerCase();
  const rows = visibleTx.filter(r => JSON.stringify(r).toLowerCase().includes(q));
  $('monthlyTitle').textContent = `Monthly Inputs - Orders: ${rows.filter(r=>r.entry_type==='Income' && String(r.account).toLowerCase()==='orders').length}`;
  $('txTable').querySelector('tbody').innerHTML = rows.map(r => `
    <tr>
      <td>${r.transaction_date}</td>
      <td>${r.entry_type}</td>
      <td>${r.account}</td>
      <td>${escapeHtml(r.customer_name||'')}</td>
      <td>${escapeHtml(r.payment_type||'')}</td>
      <td>${money(r.amount)}</td>
      <td>${escapeHtml(r.notes||'')}</td>
      <td><button onclick="editTx(${r.id})">Edit</button> <button class="danger" onclick="delTx(${r.id})">Delete</button></td>
    </tr>`).join('') || '<tr><td colspan="8">No monthly inputs found.</td></tr>';
}

window.editTx = id => {
  const r = [...tx, ...visibleTx].find(x => Number(x.id) === Number(id));
  if(!r) return;
  $('entryId').value = r.id;
  $('date').value = r.transaction_date;
  $('entryType').value = r.entry_type;
  setAccountOptions(r.entry_type, r.account);
  $('name').value = r.customer_name || '';
  $('paymentType').value = r.payment_type || '';
  $('amount').value = r.amount;
  $('notes').value = r.notes || '';
  scrollTo({top:0,behavior:'smooth'});
};

window.delTx = async id => {
  if(confirm('Delete this entry? Linked Order Board card will also be removed if this entry came from an order.')){
    await deleteTransaction(id);
    await refreshYearlyReport();
    await refreshMonthlyInputs();
  }
};

async function saveEntry(e){
  e.preventDefault();
  const row = {
    transaction_date: $('date').value,
    entry_type: $('entryType').value,
    account: $('account').value,
    customer_name: bestCustomerName($('name').value),
    payment_type: $('paymentType').value,
    amount: Number($('amount').value)||0,
    notes: $('notes').value
  };
  const id = $('entryId').value;
  if(id) await updateTransaction(id,row);
  else await insertTransaction(row);
  $('entryForm').reset();
  $('entryId').value = '';
  $('date').value = todayISO();
  $('entryType').value = 'Income';
  setAccountOptions('Income','Orders');
  await fillCustomers();
  await refreshYearlyReport();
  await refreshMonthlyInputs();
}

async function runCustomerReport(){
  const name = $('customerSearch').value.trim();
  if(!name) return alert('Type or pick a customer first.');
  const rows = await sbFetch(`/transactions?select=*&customer_name=eq.${encodeURIComponent(name)}&order=transaction_date.desc,id.desc&limit=5000`);
  const income = rows.filter(r=>r.entry_type==='Income').reduce((t,r)=>t+Number(r.amount||0),0);
  const donations = rows.filter(r=>r.entry_type==='Donation').reduce((t,r)=>t+Number(r.amount||0),0);
  const dates = rows.map(r=>r.transaction_date).sort();
  $('customerSummary').innerHTML = `
    <div class="mini-card"><span>Orders / Donations</span><strong>${rows.filter(r=>r.entry_type!=='Expense').length}</strong></div>
    <div class="mini-card"><span>Total Income</span><strong>${money(income+donations)}</strong></div>
    <div class="mini-card"><span>First Date</span><strong>${dates[0]||'-'}</strong></div>
    <div class="mini-card"><span>Last Date</span><strong>${dates[dates.length-1]||'-'}</strong></div>`;
  $('customerTable').querySelector('tbody').innerHTML = rows.map(r => `
    <tr>
      <td>${r.transaction_date}</td>
      <td>${r.entry_type}</td>
      <td>${r.account}</td>
      <td>${r.payment_type||''}</td>
      <td>${money(r.amount)}</td>
      <td>${escapeHtml(r.notes||'')}</td>
      <td><button type="button" onclick="editTx(${r.id})">Edit</button></td>
    </tr>`).join('') || '<tr><td colspan="7">No history found.</td></tr>';
}

function exportCsv(){
  const header = ['Date','Type','Account','Name','Payment','Amount','Notes'];
  const rows = visibleTx.map(r => [r.transaction_date,r.entry_type,r.account,r.customer_name,r.payment_type,r.amount,r.notes]);
  const csv = [header,...rows].map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download = 'salty-baker-visible-transactions.csv';
  a.click();
}

async function init(){
  $('nav').innerHTML = nav({key:'dashboard',title:'The Salty Baker Finance',subtitle:'Income, Expenses, Tax Filing, and Customer Tracking'});
  $('footer').innerHTML = footer();
  $('date').value = todayISO();
  $('paymentType').innerHTML = ['','Apple','Cash','Cash App','Paypal','Square','Venmo','Zelle','Other'].map(x=>`<option value="${x}">${x}</option>`).join('');
  setAccountOptions('Income','Orders');
  fillMonths();
  await fillYears();
  await fillCustomers();
  await refreshYearlyReport();
  await refreshMonthlyInputs();

  $('entryType').onchange = e => setAccountOptions(e.target.value);
  $('entryForm').onsubmit = saveEntry;
  $('resetBtn').onclick = () => {
    $('entryForm').reset();
    $('entryId').value='';
    $('date').value=todayISO();
    $('entryType').value='Income';
    setAccountOptions('Income','Orders');
  };
  $('reportYear').onchange = refreshYearlyReport;
  $('txYear').onchange = refreshMonthlyInputs;
  $('txMonth').onchange = refreshMonthlyInputs;
  $('search').oninput = renderTx;
  $('name').oninput = e => fillCustomers(e.target.value);
  $('customerSearch').oninput = e => fillCustomers(e.target.value);
  $('runCustomerReport').onclick = runCustomerReport;
  $('exportCsv').onclick = exportCsv;
}

init().catch(e=>alert(e.message));
