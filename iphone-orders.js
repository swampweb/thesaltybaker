console.log('iphone-orders.js v1.2 expand collapse controls loaded');

const SUPABASE_URL = 'https://fprbzavehflzqcmxvbxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwcmJ6YXZlaGZsenFjbXh2Ynh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MjMxNzEsImV4cCI6MjA5OTk5OTE3MX0.8_D_7kx9f2as46N7ZrNhGZen25e8TGFd2ue5p1TgTvg';
const REST = `${SUPABASE_URL}/rest/v1`;
const $ = id => document.getElementById(id);
const MONEY = n => (Number(n)||0).toLocaleString(undefined,{style:'currency',currency:'USD'});
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const STATUSES = ['New Orders','In Progress','Ready','Picked Up','Posted to Finance','Cancelled'];
let allOrders = [];
let activePaymentOrderId = null;
let msgTimer = null;

function headers(extra={}){return {apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${SUPABASE_ANON_KEY}`,'Content-Type':'application/json',...extra};}
async function rest(path, options={}){
  const extra = options.headers || {};
  const clean = {...options};
  delete clean.headers;
  const res = await fetch(`${REST}${path}`, {...clean, headers:headers(extra)});
  const text = await res.text();
  let data = null;
  try{data = text ? JSON.parse(text) : null;}catch{data = text;}
  if(!res.ok) throw new Error(data?.message || data?.hint || text || `Supabase error ${res.status}`);
  return data;
}
function esc(v){return String(v??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[ch]));}
function today(){return new Date().toISOString().slice(0,10);}
function fmtDate(v){
  if(!v) return '-';
  const p=String(v).slice(0,10).split('-');
  if(p.length!==3) return v;
  return `${p[2].padStart(2,'0')} ${MONTHS[Number(p[1])-1]||p[1]} ${p[0].slice(-2)}`;
}
function localDateFromISO(value){
  if(!value) return null;
  const p=String(value).slice(0,10).split('-').map(Number);
  if(p.length!==3 || p.some(Number.isNaN)) return null;
  return new Date(p[0],p[1]-1,p[2]);
}
function isoFromDate(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function weekGroupKey(order){
  if(!order.pickup_date) return '9999-99-99|No Pickup Date';
  const d=localDateFromISO(order.pickup_date);
  if(!d) return '9999-99-99|No Pickup Date';
  const sunday=new Date(d);
  sunday.setDate(d.getDate()-d.getDay());
  const saturday=new Date(sunday);
  saturday.setDate(sunday.getDate()+6);
  return `${isoFromDate(sunday)}|${fmtDate(isoFromDate(sunday))} - ${fmtDate(isoFromDate(saturday))}`;
}

function showMsg(text, error=false){
  const el=$('statusMessage');
  clearTimeout(msgTimer);
  el.textContent=text;
  el.className='status-message'+(error?' error':'');
  el.style.display='block';
  if(!error) msgTimer=setTimeout(()=>{el.style.display='none';},3000);
}
function sortOrders(a,b){
  const ap=a.pickup_date||'9999-12-31', bp=b.pickup_date||'9999-12-31';
  return ap.localeCompare(bp)||String(a.order_date||'9999-12-31').localeCompare(String(b.order_date||'9999-12-31'))||Number(a.id||0)-Number(b.id||0);
}
async function loadCustomerNames(term=''){
  const [txRows, orderRows] = await Promise.all([
    rest('/transactions?select=customer_name&customer_name=not.is.null&limit=5000').catch(()=>[]),
    rest('/orders?select=customer_name&customer_name=not.is.null&limit=5000').catch(()=>[])
  ]);
  const search=String(term||'').toLowerCase();
  const names=[...new Set([...txRows,...orderRows].map(r=>String(r.customer_name||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  $('customerNameList').innerHTML=names.filter(n=>!search||n.toLowerCase().includes(search)).slice(0,50).map(n=>`<option value="${esc(n)}"></option>`).join('');
}
async function loadOrders(){
  allOrders = await rest('/orders?select=*&order=pickup_date.asc,order_date.asc,id.asc&limit=5000');
  allOrders.sort(sortOrders);
  render();
}
function filteredOrders(){
  const q=String($('searchInput').value||'').toLowerCase();
  const f=$('statusFilter').value;
  return allOrders.filter(o=>{
    if(f==='open' && ['Posted to Finance','Cancelled'].includes(o.status)) return false;
    if(f!=='open' && f!=='all' && o.status!==f) return false;
    if(!q) return true;
    return JSON.stringify(o).toLowerCase().includes(q) || String(o.id).includes(q);
  });
}
function updateSummary(){
  const open=allOrders.filter(o=>!['Posted to Finance','Cancelled'].includes(o.status)).length;
  const paid=allOrders.filter(o=>String(o.payment_type||'').trim() && !['Posted to Finance','Cancelled'].includes(o.status)).length;
  const ready=allOrders.filter(o=>o.status==='Ready').length;
  $('openCount').textContent=open;
  $('paidCount').textContent=paid;
  $('readyCount').textContent=ready;
}
window.toggleMobileCard=function(id,event){
  if(event && event.target && event.target.closest('button,select,input,textarea,a')) return;
  const card=document.querySelector(`[data-mobile-id="${id}"]`);
  if(card) card.classList.toggle('expanded');
};

function card(o){
  const paid=String(o.payment_type||'').trim();
  const posted=o.status==='Posted to Finance'||!!o.posted_transaction_id;
  return `<article class="mobile-card collapsed-mobile-card ${paid?'paid':''} ${posted?'posted':''}" data-mobile-id="${o.id}" onclick="toggleMobileCard(${o.id}, event)">
    <div class="card-badges"><span class="badge order">Order #${o.id}</span><span class="badge pickup">Pickup ${fmtDate(o.pickup_date)}</span></div>
    <div class="card-title"><strong>${esc(o.customer_name||'')}</strong><span class="amount">${MONEY(o.total_amount)}</span></div>
    <div class="date-line"><b>Order:</b> ${fmtDate(o.order_date)}</div>
    <div class="meta-line"><b>Status:</b> ${esc(o.status||'New Orders')}</div>
    <div class="mobile-card-expanded">
      <div class="meta-line">${o.media_source?`<b>Source:</b> ${esc(o.media_source)}`:'<b>Source:</b> -'}</div>
      <button class="pay-btn ${paid?'paid':''}" type="button" onclick="openPayment(${o.id})">${paid?`Paid: ${esc(paid)}`:'Payment not set'}</button>
      ${o.details?`<div class="details">${esc(o.details)}</div>`:''}
      <div class="card-actions">
        <button type="button" class="ghost" onclick="openEdit(${o.id})">Edit</button>
        ${posted?`<button type="button" class="ghost" onclick="unpostOrder(${o.id})">Unpost</button>`:`<button type="button" class="primary" onclick="postOrder(${o.id})">Post</button>`}
      </div>
    </div>
    <button type="button" class="mobile-expand-btn" onclick="toggleMobileCard(${o.id}, event)">Expand / Collapse</button>
  </article>`;
}
window.toggleMobileWeekGroup=function(button,event){
  if(event) event.stopPropagation();
  const group=button.closest('.mobile-week-group');
  if(!group) return;
  group.classList.toggle('collapsed');
  const label=button.querySelector('.mobile-week-toggle-text');
  if(label) label.textContent=group.classList.contains('collapsed')?'Expand':'Collapse';
};
window.expandAllMobileCards=function(){document.querySelectorAll('.collapsed-mobile-card').forEach(c=>c.classList.add('expanded'));};
window.collapseAllMobileCards=function(){document.querySelectorAll('.collapsed-mobile-card').forEach(c=>c.classList.remove('expanded'));};

function renderWeekGroups(rows){
  if(!rows.length) return '<div class="empty-state">No orders found.</div>';
  const toolbar='<div class="mobile-collapse-toolbar"><button type="button" onclick="expandAllMobileCards()">Expand Cards</button><button type="button" onclick="collapseAllMobileCards()">Collapse Cards</button></div>';
  const groups=new Map();
  rows.forEach(order=>{
    const key=weekGroupKey(order);
    if(!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(order);
  });
  return toolbar + [...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([key,items])=>{
    const label=key.split('|')[1];
    return `<section class="mobile-week-group"><div class="mobile-week-title"><span>${label}</span><button type="button" class="mobile-week-toggle-btn" onclick="toggleMobileWeekGroup(this,event)"><span class="mobile-week-toggle-text">Collapse</span> <b>${items.length}</b></button></div><div class="mobile-week-body">${items.map(card).join('')}</div></section>`;
  }).join('');
}

function render(){
  updateSummary();
  const rows=filteredOrders();
  $('ordersList').innerHTML=renderWeekGroups(rows);
}
function openModal(){
  $('orderModal').classList.add('show');
  $('orderModal').setAttribute('aria-hidden','false');
}
function closeModal(){
  $('orderModal').classList.remove('show');
  $('orderModal').setAttribute('aria-hidden','true');
}
function clearForm(){
  $('orderForm').reset();
  $('orderId').value='';
  $('orderDate').value=today();
  $('status').value='New Orders';
  $('modalTitle').textContent='New Order';
  $('deleteOrderBtn').style.display='none';
}
window.openEdit=function(id){
  const o=allOrders.find(x=>Number(x.id)===Number(id));
  if(!o) return;
  clearForm();
  $('modalTitle').textContent=`Edit Order #${o.id}`;
  $('orderId').value=o.id;
  $('customerName').value=o.customer_name||'';
  $('orderDate').value=o.order_date||today();
  $('pickupDate').value=o.pickup_date||'';
  $('totalAmount').value=o.total_amount||'';
  $('mediaSource').value=o.media_source||'';
  $('status').value=o.status||'New Orders';
  $('paymentType').value=o.payment_type||'';
  $('details').value=o.details||'';
  $('deleteOrderBtn').style.display='inline-flex';
  openModal();
  loadCustomerNames(o.customer_name||'');
};
async function saveOrder(e){
  e.preventDefault();
  const id=$('orderId').value;
  const row={
    customer_name:$('customerName').value.trim(),
    order_date:$('orderDate').value||today(),
    pickup_date:$('pickupDate').value||null,
    total_amount:Number($('totalAmount').value)||0,
    media_source:$('mediaSource').value||'',
    status:$('status').value||'New Orders',
    payment_type:$('paymentType').value||'',
    details:$('details').value||''
  };
  if(!row.customer_name) return showMsg('Customer name is required.', true);
  if(id) await rest(`/orders?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(row)});
  else await rest('/orders',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(row)});
  closeModal();
  showMsg(id?'Order updated.':'Order created.');
  await loadCustomerNames('');
  await loadOrders();
}
window.openPayment=function(id){
  const o=allOrders.find(x=>Number(x.id)===Number(id));
  if(!o) return;
  activePaymentOrderId=id;
  $('paymentTitle').textContent=`Payment for Order #${id}`;
  $('paymentSelect').value=o.payment_type||'Venmo';
  $('paymentModal').classList.add('show');
};
function closePayment(){
  $('paymentModal').classList.remove('show');
  activePaymentOrderId=null;
}
async function savePayment(){
  if(!activePaymentOrderId) return;
  const payment_type=$('paymentSelect').value;
  await rest(`/orders?id=eq.${encodeURIComponent(activePaymentOrderId)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({payment_type})});
  closePayment();
  showMsg(`Order #${activePaymentOrderId} payment saved.`);
  await loadOrders();
}
window.postOrder=async function(id){
  const o=allOrders.find(x=>Number(x.id)===Number(id));
  if(!o) return;
  let payment=o.payment_type||'';
  if(!payment){
    activePaymentOrderId=id;
    $('paymentTitle').textContent=`Payment for Order #${id}`;
    $('paymentSelect').value='Venmo';
    $('paymentModal').classList.add('show');
    showMsg('Select payment first, then tap Post again.');
    return;
  }
  if(!o.total_amount) return showMsg('Total amount is required before posting.', true);
  const tx={transaction_date:o.order_date||today(),entry_type:'Income',account:'Orders',customer_name:o.customer_name||'',payment_type:payment,amount:Number(o.total_amount)||0,notes:`Order #${o.id} | Order Board | Pickup: ${o.pickup_date||''} | Source: ${o.media_source||''} | Details: ${o.details||''}`};
  const inserted=await rest('/transactions',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(tx)});
  await rest(`/orders?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({status:'Posted to Finance',posted_transaction_id:inserted?.[0]?.id||null,payment_type:payment})});
  showMsg(`Order #${id} posted.`);
  await loadOrders();
};
window.unpostOrder=async function(id){
  const o=allOrders.find(x=>Number(x.id)===Number(id));
  if(!o) return;
  if(o.posted_transaction_id) await rest(`/transactions?id=eq.${encodeURIComponent(o.posted_transaction_id)}`,{method:'DELETE'}).catch(()=>null);
  await rest(`/orders?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({status:'Picked Up',posted_transaction_id:null})});
  showMsg(`Order #${id} unposted.`);
  await loadOrders();
};
async function deleteCurrent(){
  const id=$('orderId').value;
  if(!id || !confirm('Delete this order?')) return;
  const o=allOrders.find(x=>Number(x.id)===Number(id));
  if(o?.posted_transaction_id) await rest(`/transactions?id=eq.${encodeURIComponent(o.posted_transaction_id)}`,{method:'DELETE'}).catch(()=>null);
  await rest(`/orders?id=eq.${encodeURIComponent(id)}`,{method:'DELETE'});
  closeModal();
  showMsg(`Order #${id} deleted.`);
  await loadOrders();
}
async function init(){
  $('orderDate').value=today();
  $('newOrderBtn').onclick=()=>{clearForm();openModal();loadCustomerNames('');};
  $('refreshBtn').onclick=async()=>{showMsg('Refreshing...');await loadOrders();};
  $('closeModalBtn').onclick=closeModal;
  $('orderModal').onclick=e=>{if(e.target===$('orderModal')) closeModal();};
  $('orderForm').onsubmit=saveOrder;
  $('deleteOrderBtn').onclick=deleteCurrent;
  $('searchInput').oninput=render;
  $('statusFilter').onchange=render;
  $('customerName').oninput=e=>loadCustomerNames(e.target.value);
  $('closePaymentBtn').onclick=closePayment;
  $('paymentModal').onclick=e=>{if(e.target===$('paymentModal')) closePayment();};
  $('savePaymentBtn').onclick=savePayment;
  await loadCustomerNames('');
  await loadOrders();
}
init().catch(err=>showMsg(err.message||err,true));
