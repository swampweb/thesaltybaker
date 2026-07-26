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
  const sales = monthData.reduce((t,r)=>t + Number(r.income||0) + Number(r.donations||0), 0);
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

function pdf(){
  const w = open('', '_blank');
  w.document.write(`<h1>The Salty Baker Tax Filing Summary</h1><p>${$('taxNote').innerText}</p><button onclick="print()">Print / Save as PDF</button>`);
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
