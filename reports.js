const colors = ['#2f94aa','#956a42','#3c835a','#d9a966','#b94b43','#83aab4','#84621c','#84bd8c'];

function setup(id){
  const c = $(id);
  const r = c.parentElement.getBoundingClientRect();
  c.width = Math.max(1, r.width - 30);
  c.height = 220;
  const ctx = c.getContext('2d');
  ctx.clearRect(0,0,c.width,c.height);
  return {ctx,w:c.width,h:c.height};
}

function legend(id, items){
  const el = $(id);
  if(!el) return;
  el.innerHTML = items.map((x,i)=>`<span><i class="swatch" style="background:${x.color||colors[i%colors.length]}"></i>${x.label}${x.value!==undefined?': '+money(x.value):''}</span>`).join('');
}

function bars(id, labels, series){
  const {ctx,w,h}=setup(id), pad=36, max=Math.max(1,...series.flatMap(s=>s.data.map(v=>Math.max(0,Number(v)||0))));
  const bw=(w-pad*2)/Math.max(1,labels.length);
  series.forEach((s,si)=>{
    ctx.fillStyle=s.color;
    labels.forEach((l,i)=>{
      const v=Math.max(0,Number(s.data[i])||0);
      const x=pad+i*bw+si*(bw/(series.length+1))+6;
      const y=h-pad-(v/max)*(h-pad*2);
      ctx.fillRect(x,y,Math.max(4,bw/(series.length+1)-6),h-pad-y);
    });
  });
  ctx.fillStyle='#243038';
  ctx.font='12px Segoe UI';
  labels.forEach((l,i)=>ctx.fillText(String(l).slice(0,3),pad+i*bw+6,h-10));
}

function pie(id,items,legendId){
  const {ctx,w,h}=setup(id), cx=w/2, cy=h/2, r=Math.min(w,h)/2-12;
  const total=items.reduce((t,x)=>t+Number(x.value||0),0)||1;
  let a=-Math.PI/2;
  items.forEach((it,i)=>{
    const slice=(Number(it.value||0)/total)*Math.PI*2;
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,a,a+slice);ctx.closePath();
    ctx.fillStyle=colors[i%colors.length];ctx.fill();a+=slice;
  });
  legend(legendId,items);
}

function hbars(id,items){
  const {ctx,w}=setup(id), max=Math.max(1,...items.map(x=>Number(x.value)||0));
  ctx.font='12px Segoe UI';
  items.forEach((it,i)=>{
    const y=10+i*20;
    ctx.fillStyle='#243038';
    ctx.fillText(String(it.label||'Unknown').slice(0,22),8,y+12);
    ctx.fillStyle=colors[i%colors.length];
    const valW=(Number(it.value||0)/max)*(w-210);
    ctx.fillRect(150,y,Math.max(2,valW),15);
    ctx.fillStyle='#243038';
    ctx.fillText(money(it.value),155+valW,y+12);
  });
}

function groupSum(rows,filter,key){
  const map=new Map();
  rows.filter(filter).forEach(r=>{
    const k=String(r[key]||'Unknown').trim() || 'Unknown';
    map.set(k,(map.get(k)||0)+Number(r.amount||0));
  });
  return [...map].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value);
}

async function load(){
  const year=$('reportYear').value;
  const rows=await loadTransactions(year);
  const monthRows=calculateMonthly(rows);
  const totals=totalsFromMonthly(monthRows);

  // IMPORTANT: Match Dashboard rule exactly.
  // Dashboard Total Income = Income + Donations.
  const totalIncome = Number(totals.income||0) + Number(totals.donations||0);
  const totalExpenses = Number(totals.expenses||0);
  const totalProfit = totalIncome - totalExpenses;

  $('rIncome').textContent = money(totalIncome);
  $('rExpenses').textContent = money(totalExpenses);
  $('rProfit').textContent = money(totalProfit);
  $('rFiling').textContent = money(totals.taxable_sales);

  bars('monthlyChart', months, [
    {label:'Income',color:colors[0],data:monthRows.map(x=>Number(x.income||0)+Number(x.donations||0))},
    {label:'Expenses',color:colors[4],data:monthRows.map(x=>Number(x.expenses||0))}
  ]);
  legend('monthlyLegend',[
    {label:'Income',value:totalIncome,color:colors[0]},
    {label:'Expenses',value:totalExpenses,color:colors[4]}
  ]);

  pie('paymentChart', groupSum(rows,r=>r.entry_type==='Income','payment_type').slice(0,8), 'paymentLegend');
  pie('accountChart', groupSum(rows,r=>r.entry_type==='Income' || r.entry_type==='Donation','account').slice(0,8), 'accountLegend');
  pie('expenseChart', groupSum(rows,r=>r.entry_type==='Expense','account').slice(0,8), 'expenseLegend');
  hbars('customerChart', groupSum(rows,r=>r.entry_type==='Income' || r.entry_type==='Donation','customer_name').slice(0,10));

  const years=await loadYears();
  const yrData=[];
  for(const y of years){
    const rr=await loadTransactions(y);
    const tt=totalsFromMonthly(calculateMonthly(rr));
    const inc=Number(tt.income||0)+Number(tt.donations||0);
    const exp=Number(tt.expenses||0);
    yrData.push({year:y,income:inc,expenses:exp,profit:inc-exp});
  }
  bars('yearChart',yrData.map(x=>x.year),[
    {label:'Income',color:colors[0],data:yrData.map(x=>x.income)},
    {label:'Expenses',color:colors[4],data:yrData.map(x=>x.expenses)},
    {label:'Profit',color:colors[2],data:yrData.map(x=>x.profit)}
  ]);
  legend('yearLegend',[
    {label:'Income',color:colors[0]},
    {label:'Expenses',color:colors[4]},
    {label:'Profit',color:colors[2]}
  ]);
}

async function init(){
  $('nav').innerHTML=nav({key:'reports',title:'Reports v4',subtitle:'Charts and visual business insights'});
  $('footer').innerHTML=footer();
  const years=await loadYears();
  const cur=String(new Date().getFullYear());
  $('reportYear').innerHTML=years.map(y=>`<option ${y===cur?'selected':''}>${y}</option>`).join('');
  $('reportYear').onchange=load;
  await load();
}

init().catch(e=>alert(e.message));
window.addEventListener('resize',()=>setTimeout(load,150));
