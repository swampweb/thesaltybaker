const colors = ['#2f94aa','#956a42','#3c835a','#d9a966','#b94b43','#83aab4','#84621c','#84bd8c','#658991','#c58f55'];

function chartSetup(id, height=260){
  const c = $(id);
  const parent = c.parentElement;
  const rect = parent.getBoundingClientRect();
  c.width = Math.max(1, rect.width - 30);
  c.height = height;
  const ctx = c.getContext('2d');
  ctx.clearRect(0,0,c.width,c.height);
  return {ctx,w:c.width,h:c.height};
}

function moneyLabel(value){
  return money(Number(value)||0);
}

function makeLegend(id, items, includeValue=true){
  const el = $(id);
  if(!el) return;
  el.innerHTML = items.map((x,i)=>{
    const color = x.color || colors[i % colors.length];
    const value = includeValue && x.value !== undefined ? `: ${moneyLabel(x.value)}` : '';
    return `<span><i class="swatch" style="background:${color}"></i>${escapeHtml(x.label || x.name || 'Unknown')}${value}</span>`;
  }).join('');
}

function bars(id, labels, series, height=260){
  const {ctx,w,h}=chartSetup(id,height);
  const padL=48, padR=18, padT=16, padB=34;
  const max=Math.max(1,...series.flatMap(s=>s.data.map(v=>Math.max(0,Number(v)||0))));
  const plotW=w-padL-padR;
  const plotH=h-padT-padB;
  const groupW=plotW/Math.max(1,labels.length);
  ctx.font='12px Segoe UI';
  series.forEach((s,si)=>{
    ctx.fillStyle=s.color;
    labels.forEach((lab,i)=>{
      const v=Math.max(0,Number(s.data[i])||0);
      const barW=Math.max(8, groupW/(series.length+1)-8);
      const x=padL+i*groupW+si*(barW+8)+10;
      const y=padT+plotH-(v/max)*plotH;
      ctx.fillRect(x,y,barW,padT+plotH-y);
    });
  });
  ctx.fillStyle='#243038';
  labels.forEach((lab,i)=>ctx.fillText(String(lab).slice(0,3),padL+i*groupW+8,h-10));
}

function pie(id, items, legendId){
  const {ctx,w,h}=chartSetup(id,300);
  const cx=w/2, cy=h/2, r=Math.min(w,h)/2-10;
  const total=items.reduce((t,x)=>t+Number(x.value||0),0)||1;
  let a=-Math.PI/2;
  items.forEach((it,i)=>{
    const slice=(Number(it.value||0)/total)*Math.PI*2;
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,r,a,a+slice);
    ctx.closePath();
    ctx.fillStyle=it.color || colors[i%colors.length];
    ctx.fill();
    a += slice;
  });
  makeLegend(legendId,items,true);
}

function hbars(id,items){
  const {ctx,w,h}=chartSetup(id,330);
  const max=Math.max(1,...items.map(x=>Number(x.value)||0));
  const rowH=27;
  ctx.font='13px Segoe UI';
  items.forEach((it,i)=>{
    const y=14+i*rowH;
    const label=String(it.label||'Unknown').slice(0,26);
    ctx.fillStyle='#243038';
    ctx.fillText(label,18,y+15);
    ctx.fillStyle=it.color || colors[i%colors.length];
    const x=160;
    const valW=(Number(it.value||0)/max)*(w-230);
    ctx.fillRect(x,y,Math.max(2,valW),16);
    ctx.fillStyle='#243038';
    ctx.fillText(moneyLabel(it.value),x+valW+6,y+15);
  });
}

function groupSum(rows,filter,key){
  const map=new Map();
  rows.filter(filter).forEach(r=>{
    const k=String(r[key]||'Unknown').trim() || 'Unknown';
    map.set(k,(map.get(k)||0)+Number(r.amount||0));
  });
  return [...map].map(([label,value],i)=>({label,value,color:colors[i%colors.length]})).sort((a,b)=>b.value-a.value);
}

function setReportTitles(year){
  const label = reportScopeLabel(year);
  $('monthlyTitle').textContent = selectedReportMonth() === 'all' ? `Monthly Income vs Expenses - ${year}` : `Income vs Expenses - ${label}`;
  $('paymentTitle').textContent = `Payment Type Split - ${label}`;
  $('accountTitle').textContent = `Income by Account - ${label}`;
  $('expenseTitle').textContent = `Expense Categories - ${label}`;
  $('customerTitle').textContent = `Top 10 Customers by Sales - ${label}`;
}



function selectedReportMonth(){
  const el = $('reportMonth');
  return el ? String(el.value || 'all') : 'all';
}

function filterRowsByReportMonth(rows){
  const selected = selectedReportMonth();
  if(selected === 'all') return rows;
  const monthNumber = Number(selected);
  return rows.filter(r => Number(String(r.transaction_date || '').slice(5,7)) === monthNumber);
}

function ensureReportMonthFilter(){
  if($('reportMonth')) return;
  const yearSelect = $('reportYear');
  if(!yearSelect) return;
  const wrap = document.createElement('div');
  wrap.className = 'report-filter-row';
  wrap.innerHTML = `
    <label class="report-filter-label">Year
      <span id="reportYearHolder"></span>
    </label>
    <label class="report-filter-label">Month
      <select id="reportMonth">
        <option value="all">All Months</option>
        <option value="1">January</option>
        <option value="2">February</option>
        <option value="3">March</option>
        <option value="4">April</option>
        <option value="5">May</option>
        <option value="6">June</option>
        <option value="7">July</option>
        <option value="8">August</option>
        <option value="9">September</option>
        <option value="10">October</option>
        <option value="11">November</option>
        <option value="12">December</option>
      </select>
    </label>`;
  yearSelect.parentNode.insertBefore(wrap, yearSelect);
  $('reportYearHolder').appendChild(yearSelect);
  $('reportMonth').onchange = load;
}

function reportScopeLabel(year){
  const selected = selectedReportMonth();
  if(selected === 'all') return year;
  const monthName = months[Number(selected)-1] || 'Selected Month';
  return `${monthName} ${year}`;
}

async function load(){
  const year=$('reportYear').value;
  setReportTitles(year);

  const allRows=await loadTransactions(year);
  const rows=filterRowsByReportMonth(allRows);
  const monthRows=calculateMonthly(rows);
  const totals=totalsFromMonthly(monthRows);

  const totalIncome=Number(totals.income||0);
  const totalExpenses=Number(totals.expenses||0);
  const totalProfit=Number(totals.net_profit||0);

  $('rIncome').textContent=moneyLabel(totalIncome);
  $('rExpenses').textContent=moneyLabel(totalExpenses);
  $('rProfit').textContent=moneyLabel(totalProfit);
  $('rFiling').textContent=moneyLabel(totals.taxable_sales);

  const monthlySeries=[
    {label:'Income',color:colors[0],data:monthRows.map(x=>Number(x.income||0)),value:totalIncome},
    {label:'Expenses',color:colors[4],data:monthRows.map(x=>Number(x.expenses||0)),value:totalExpenses}
  ];
  bars('monthlyChart',months,monthlySeries,285);
  makeLegend('monthlyLegend',monthlySeries,false);

  pie('paymentChart',groupSum(rows,r=>r.entry_type==='Income','payment_type').slice(0,8),'paymentLegend');
  pie('accountChart',groupSum(rows,r=>r.entry_type==='Income'||r.entry_type==='Donation','account').slice(0,8),'accountLegend');
  pie('expenseChart',groupSum(rows,r=>r.entry_type==='Expense','account').slice(0,8),'expenseLegend');
  hbars('customerChart',groupSum(rows,r=>r.entry_type==='Income'||r.entry_type==='Donation','customer_name').slice(0,10));

  const years=await loadYears();
  const yrData=[];
  for(const y of years){
    const rr=await loadTransactions(y);
    const tt=totalsFromMonthly(calculateMonthly(rr));
    const inc=Number(tt.income||0);
    const exp=Number(tt.expenses||0);
    yrData.push({year:y,income:inc,expenses:exp,profit:inc-exp});
  }
  const yearSeries=[
    {label:'Income',color:colors[0],data:yrData.map(x=>x.income)},
    {label:'Expenses',color:colors[4],data:yrData.map(x=>x.expenses)},
    {label:'Profit',color:colors[2],data:yrData.map(x=>x.profit)}
  ];
  bars('yearChart',yrData.map(x=>x.year),yearSeries,300);
  makeLegend('yearLegend',yearSeries,false);
}

async function init(){
  $('nav').innerHTML=nav({key:'reports',title:'Reports v4',subtitle:'Charts and visual business insights'});
  $('footer').innerHTML=footer();
  const years=await loadYears();
  const cur=String(new Date().getFullYear());
  $('reportYear').innerHTML=years.map(y=>`<option ${y===cur?'selected':''}>${y}</option>`).join('');
  ensureReportMonthFilter();
  $('reportYear').onchange=load;
  await load();
}

init().catch(e=>alert(e.message));
window.addEventListener('resize',()=>setTimeout(load,150));
