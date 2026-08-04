let monthData = [];

function taxRound(n){
  return Math.round((Number(n)||0) * 100) / 100;
}

function taxInput(month, field, value, extraClass=''){
  return `<div class="currency-input ${extraClass}"><span>$</span><input data-m="${month}" data-f="${field}" type="number" step="0.01" value="${Number(value||0).toFixed(2)}"></div>`;
}

async function loadTax(){
  const year = $('taxYear').value;
  const tx = await loadTransactions(year);
  const monthly = calculateMonthly(tx);
  const filings = await sbFetch(`/tax_filings?select=*&tax_year=eq.${year}&limit=100`);

  monthData = monthly.map(m => ({
    ...m,
    ...(filings.find(f => Number(f.tax_month) === Number(m.month)) || {})
  }));

  $('taxTable').querySelector('tbody').innerHTML = monthData.map(r => {
    const state = Number(r.state_charged || 0);
    const parish = Number(r.parish_charged || 0);
    const actual = taxRound(state + parish);
    const paid = !!r.paid;

    return `
      <tr class="${paid ? 'tax-row-paid' : ''}">
        <td class="month-cell">${months[r.month-1]}</td>
        <td>${money(r.noncash_gross)}</td>
        <td class="filing-amount">${money(r.taxable_sales)}</td>
        <td>${money(r.tax_due)}</td>
        <td class="money-input-cell">${taxInput(r.month, 'state_charged', state, 'tax-money-small')}</td>
        <td class="money-input-cell">${taxInput(r.month, 'parish_charged', parish, 'tax-money-small')}</td>
        <td class="actual-paid-cell">${money(actual)}</td>
        <td><input class="tax-date-input" data-m="${r.month}" data-f="paid_date" type="date" value="${r.paid_date || ''}"></td>
        <td class="paid-cell">
          <label class="paid-toggle ${paid ? 'is-paid' : 'is-open'}">
            <input data-m="${r.month}" data-f="paid" type="checkbox" ${paid ? 'checked' : ''} onchange="taxMarkChanged(${r.month})">
            <span>${paid ? 'Paid' : 'Open'}</span>
          </label>
        </td>
        <td class="notes-cell"><input class="tax-notes-input" data-m="${r.month}" data-f="notes" value="${escapeHtml(r.notes || '')}"></td>
        <td><button class="primary tax-save-btn" onclick="saveMonth(${r.month})">Save</button></td>
      </tr>`;
  }).join('');

  updateHeader();
}

function getTaxInput(m, f){
  return document.querySelector(`[data-m="${m}"][data-f="${f}"]`);
}

function currentTableTotals(){
  let state = 0;
  let parish = 0;
  let paid = 0;

  document.querySelectorAll('[data-f="state_charged"]').forEach(el => state += Number(el.value || 0));
  document.querySelectorAll('[data-f="parish_charged"]').forEach(el => parish += Number(el.value || 0));
  paid = state + parish;

  return {state: taxRound(state), parish: taxRound(parish), paid: taxRound(paid)};
}

function updateHeader(){
  const sales = monthData.reduce((t,r)=>t + Number(r.income||0), 0);
  const exp = monthData.reduce((t,r)=>t + Number(r.expenses||0), 0);
  const cash = monthData.reduce((t,r)=>t + Number(r.cash_income||0), 0);
  const filing = monthData.reduce((t,r)=>t + Number(r.taxable_sales||0), 0);
  const totals = currentTableTotals();

  $('taxSales').textContent = money(sales);
  $('taxExpenses').textContent = money(exp);
  $('taxCash').textContent = money(cash);
  $('taxFiling').textContent = money(filing);
  $('taxPaid').textContent = money(totals.paid);
  $('stateParish').textContent = `${money(totals.state)} + ${money(totals.parish)}`;
  $('taxNote').innerHTML = `<b>v4 ACTIVE:</b> Filing Amount excludes Cash sales. Filing Amount = <b>${money(filing)}</b>. State + Parish = <b>${money(totals.state)} + ${money(totals.parish)}</b>. Actual Tax Paid = <b>${money(totals.paid)}</b>.`;
}

function taxMarkChanged(m){
  const checkbox = getTaxInput(m, 'paid');
  const tr = checkbox.closest('tr');
  const label = checkbox.closest('label');
  const text = label.querySelector('span');

  tr.classList.toggle('tax-row-paid', checkbox.checked);
  label.classList.toggle('is-paid', checkbox.checked);
  label.classList.toggle('is-open', !checkbox.checked);
  text.textContent = checkbox.checked ? 'Paid' : 'Open';
}

async function saveMonth(m){
  const year = Number($('taxYear').value);
  const row = {
    tax_year: year,
    tax_month: m,
    state_charged: Number(getTaxInput(m,'state_charged').value)||0,
    parish_charged: Number(getTaxInput(m,'parish_charged').value)||0,
    paid_date: getTaxInput(m,'paid_date').value || null,
    paid: getTaxInput(m,'paid').checked,
    notes: getTaxInput(m,'notes').value || ''
  };

  await sbFetch('/tax_filings?on_conflict=tax_year,tax_month', {
    method:'POST',
    headers:{Prefer:'resolution=merge-duplicates'},
    body:JSON.stringify(row)
  });

  await loadTax();
}

function printableTaxRows(){
  return monthData.map(r => {
    const state = Number(r.state_charged || 0);
    const parish = Number(r.parish_charged || 0);
    const actual = taxRound(state + parish);
    const paid = !!r.paid;
    return `
      <tr>
        <td>${months[r.month-1]}</td>
        <td class="num">${money(r.noncash_gross)}</td>
        <td class="num highlight">${money(r.taxable_sales)}</td>
        <td class="num">${money(r.tax_due)}</td>
        <td class="num">${money(state)}</td>
        <td class="num">${money(parish)}</td>
        <td class="num strong">${money(actual)}</td>
        <td>${paid ? 'Paid' : 'Open'}</td>
        <td>${escapeHtml(r.paid_date || '')}</td>
        <td>${escapeHtml(r.notes || '')}</td>
      </tr>`;
  }).join('');
}

function pdf(){
  const year = $('taxYear').value;
  const filing = monthData.reduce((t,r)=>t + Number(r.taxable_sales||0),0);
  const noncash = monthData.reduce((t,r)=>t + Number(r.noncash_gross||0),0);
  const taxDue = monthData.reduce((t,r)=>t + Number(r.tax_due||0),0);
  const totals = monthData.reduce((t,r)=>{
    const state = Number(r.state_charged || 0);
    const parish = Number(r.parish_charged || 0);
    t.state += state;
    t.parish += parish;
    t.paid += state + parish;
    return t;
  }, {state:0, parish:0, paid:0});
  const generated = new Date().toLocaleDateString(undefined, {year:'numeric', month:'long', day:'numeric'});

  const w = open('', '_blank');
  w.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>The Salty Baker Tax Filing Summary ${year}</title>
  <style>
    :root{--teal:#2f94aa;--teal-dark:#1e6372;--brown:#956a42;--tan:#eadfce;--cream:#f7f2ea;--line:#dfd0bf;--yellow:#fff5c9;--text:#243038;}
    *{box-sizing:border-box;}
    body{margin:0;background:#ede5d8;color:var(--text);font-family:"Segoe UI",Arial,sans-serif;font-size:13px;line-height:1.35;}
    .page{width:8.5in;min-height:11in;margin:0 auto;background:#fff;padding:.55in;box-shadow:0 8px 24px rgba(0,0,0,.14);}
    .letterhead{display:flex;align-items:center;justify-content:space-between;gap:20px;border-bottom:5px solid var(--teal);padding-bottom:18px;margin-bottom:18px;}
    .brand-block{display:flex;align-items:center;gap:14px;}
    .brand-mark{width:72px;height:72px;border-radius:50%;background:linear-gradient(145deg,#fff8dd,#eadfce);border:3px solid var(--teal);display:flex;align-items:center;justify-content:center;color:var(--brown);font-family:Georgia,serif;font-size:30px;font-weight:900;box-shadow:0 4px 12px rgba(0,0,0,.12);}
    h1{font-family:Georgia,"Times New Roman",serif;margin:0;color:var(--teal-dark);font-size:32px;line-height:1;}
    .subtitle{margin:6px 0 0;color:var(--brown);font-weight:800;letter-spacing:.04em;text-transform:uppercase;font-size:12px;}
    .meta{text-align:right;color:#6b5b50;font-size:12px;}
    .meta strong{display:block;color:var(--teal-dark);font-size:18px;margin-bottom:4px;}
    .summary-title{display:flex;justify-content:space-between;align-items:flex-end;margin:12px 0 14px;gap:20px;}
    .summary-title h2{margin:0;color:var(--teal-dark);font-size:22px;}
    .summary-title p{margin:4px 0 0;color:#6b5b50;}
    .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:16px 0 18px;}
    .card{border:1px solid var(--line);border-left:6px solid var(--teal);border-radius:14px;padding:12px;background:#fff;min-height:74px;}
    .card.gold{background:#fff8dd;border-left-color:#d9a41f;}
    .card span{display:block;color:#6b5b50;font-weight:900;font-size:11px;text-transform:uppercase;letter-spacing:.04em;}
    .card strong{display:block;margin-top:5px;color:#243038;font-size:20px;}
    .note{background:#fff5c9;border:1px solid #e6c75e;border-left:6px solid #d9a41f;border-radius:12px;padding:12px 14px;margin:12px 0 18px;color:#5c4a21;}
    table{width:100%;border-collapse:separate;border-spacing:0;border:1px solid var(--line);border-radius:12px;overflow:hidden;font-size:11px;}
    th{background:var(--teal-dark);color:#fff;padding:8px 6px;text-align:left;white-space:nowrap;}
    td{padding:7px 6px;border-bottom:1px solid #eadfce;vertical-align:top;}
    tbody tr:nth-child(even){background:#fbf8f2;}
    tbody tr:last-child td{border-bottom:0;}
    .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;}
    .highlight{background:#fff8dd;color:#6b4600;font-weight:900;}
    .strong{font-weight:900;}
    .footer{margin-top:28px;border-top:1px solid var(--line);padding-top:12px;display:flex;justify-content:space-between;gap:20px;color:#6b5b50;font-size:11px;}
    .actions{margin:18px 0 0;text-align:right;}
    button{border:0;border-radius:12px;background:var(--teal);color:#fff;padding:10px 16px;font-weight:900;cursor:pointer;}
    @media print{
      body{background:#fff;}
      .page{width:auto;min-height:auto;margin:0;padding:.35in;box-shadow:none;}
      .actions{display:none;}
      @page{size:letter;margin:.35in;}
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="letterhead">
      <div class="brand-block">
        <div class="brand-mark">SB</div>
        <div>
          <h1>The Salty Baker</h1>
          <p class="subtitle">Tax Filing Summary</p>
        </div>
      </div>
      <div class="meta">
        <strong>${year}</strong>
        Prepared for tax filing<br>
        Generated ${generated}
      </div>
    </section>

    <section class="summary-title">
      <div>
        <h2>Annual Tax Filing Overview</h2>
        <p>Filing Amount excludes Cash sales and backs included tax out of non-cash gross receipts.</p>
      </div>
      <div class="actions"><button onclick="print()">Print / Save as PDF</button></div>
    </section>

    <section class="cards">
      <div class="card"><span>Non-Cash Gross</span><strong>${money(noncash)}</strong></div>
      <div class="card gold"><span>Filing Amount</span><strong>${money(filing)}</strong></div>
      <div class="card"><span>Included Tax</span><strong>${money(taxDue)}</strong></div>
      <div class="card gold"><span>Actual Tax Paid</span><strong>${money(totals.paid)}</strong></div>
      <div class="card"><span>State Charged</span><strong>${money(totals.state)}</strong></div>
      <div class="card"><span>Parish Charged</span><strong>${money(totals.parish)}</strong></div>
      <div class="card"><span>State + Parish</span><strong>${money(totals.state)} + ${money(totals.parish)}</strong></div>
      <div class="card"><span>Report Year</span><strong>${year}</strong></div>
    </section>

    <div class="note">
      <b>Summary:</b> Filing Amount = <b>${money(filing)}</b>. State + Parish = <b>${money(totals.state)} + ${money(totals.parish)}</b>. Actual Tax Paid = <b>${money(totals.paid)}</b>.
    </div>

    <table>
      <thead>
        <tr>
          <th>Month</th>
          <th>Non-Cash Gross</th>
          <th>Filing Amount</th>
          <th>Included Tax</th>
          <th>State</th>
          <th>Parish</th>
          <th>Actual Paid</th>
          <th>Status</th>
          <th>Paid Date</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>${printableTaxRows()}</tbody>
    </table>

    <section class="footer">
      <div>The Salty Baker finance tracker</div>
      <div>Generated from Tax Filing Tracker for ${year}</div>
    </section>
  </main>
</body>
</html>`);
  w.document.close();
}


async function init(){
  $('nav').innerHTML = nav({key:'tax',title:'Tax Filing Tracker v4',subtitle:'Monthly Tax Filing is the source of truth for Filing Amount'});
  $('footer').innerHTML = footer();

  const years = await loadYears();
  const cur = String(new Date().getFullYear());
  $('taxYear').innerHTML = years.map(y => `<option ${y===cur?'selected':''}>${y}</option>`).join('');
  $('taxYear').onchange = loadTax;
  $('pdfBtn').onclick = pdf;

  await loadTax();
}

init().catch(e=>alert(e.message));
