console.log('orders.js v4.1.10 no load status loaded');

// Self-contained Supabase settings for Orders page.
// This bypasses any cached common.js header issue.
const ORDERS_SUPABASE_URL = 'https://fprbzavehflzqcmxvbxx.supabase.co';
const ORDERS_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwcmJ6YXZlaGZsenFjbXh2Ynh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MjMxNzEsImV4cCI6MjA5OTk5OTE3MX0.8_D_7kx9f2as46N7ZrNhGZen25e8TGFd2ue5p1TgTvg';
const ORDERS_REST = `${ORDERS_SUPABASE_URL}/rest/v1`;

const $o = id => document.getElementById(id);
const moneyO = n => (Number(n)||0).toLocaleString(undefined,{style:'currency',currency:'USD'});
const todayO = () => new Date().toISOString().slice(0,10);

let currentPhotoData = '';
let allOrders = [];
let customerNames = [];
const BOARD_STATUSES = ['New Orders','In Progress','Ready','Picked Up','Posted to Finance'];

function h(extra={}){
  return {
    apikey: ORDERS_SUPABASE_ANON_KEY,
    Authorization: `Bearer ${ORDERS_SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

async function rest(path, options={}){
  const headers = h(options.headers || {});
  const clean = {...options};
  delete clean.headers;
  const res = await fetch(`${ORDERS_REST}${path}`, {...clean, headers});
  const text = await res.text();
  let data = null;
  try{ data = text ? JSON.parse(text) : null; }catch{ data = text; }
  if(!res.ok){
    throw new Error(data?.message || data?.hint || text || `Supabase error ${res.status}`);
  }
  return data;
}

function escapeO(value){
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[ch]));
}

let statusTimer = null;
function setStatus(message, err=false){
  const el = $o('saveStatus');
  if(!el){ alert(message); return; }
  if(statusTimer){
    clearTimeout(statusTimer);
    statusTimer = null;
  }
  el.style.display = 'block';
  el.style.background = err ? '#ffe0e0' : '#e8f8ec';
  el.style.borderLeftColor = err ? '#bd4f47' : '#326725';
  el.innerHTML = message;

  // Only keep error messages visible. Success/info messages auto-hide.
  if(!err){
    statusTimer = setTimeout(() => {
      el.style.display = 'none';
      el.innerHTML = '';
    }, 3500);
  }
}

function clearStatus(){
  const el = $o('saveStatus');
  if(el){
    el.style.display = 'none';
    el.innerHTML = '';
  }
}

function statusId(status){ return String(status || '').replace(/[^a-z0-9]/gi,''); }

function parseLooseDate(value){
  const raw = String(value || '').trim();
  if(!raw) return '';
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
  if(!m) return '';
  let year = m[3] ? Number(m[3]) : new Date().getFullYear();
  if(year < 100) year += 2000;
  return `${year}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
}

function grabField(text, labels){
  for(const label of labels){
    const re = new RegExp(`${label}\\s*:?\\s*([^,\\n]+)`, 'i');
    const m = text.match(re);
    if(m) return m[1].trim();
  }
  return '';
}

function setSelectValue(id, value){
  const el = $o(id);
  const wanted = String(value || '').trim().toLowerCase();
  if(!wanted) return;
  const found = [...el.options].find(o => String(o.value).toLowerCase() === wanted);
  el.value = found ? found.value : 'Other';
}

function parseQuickText(){
  const t = $o('quickText').value.trim();
  if(!t){ setStatus('Type or paste order text first. Photo upload is reference-only in this version.', true); return; }
  const name = grabField(t, ['Name']);
  const media = grabField(t, ['Media Source', 'Source']);
  const orderDate = grabField(t, ['Order Date', 'Date']);
  const pickupDate = grabField(t, ['P\\/?U Date', 'Pickup Date', 'Pick Up Date']);
  const payment = grabField(t, ['Payment', 'Paid By']);
  const total = (t.match(/(?:Total|Amount)\s*:?\s*\$?\s*([0-9]+(?:\.[0-9]{1,2})?)/i)||[])[1];
  if(name) $o('customerName').value = name;
  if(media) setSelectValue('mediaSource', media);
  if(payment) setSelectValue('paymentType', payment);
  if(total) $o('totalAmount').value = total;
  const od = parseLooseDate(orderDate);
  const pd = parseLooseDate(pickupDate);
  if(od) $o('orderDate').value = od;
  if(pd) $o('pickupDate').value = pd;
  if(!$o('details').value.trim()) $o('details').value = t;
  setStatus('Filled what I could. Review before saving.');
}

async function loadCustomerNames(term=''){
  try{
    const rows = await rest('/transactions?select=customer_name&customer_name=not.is.null&limit=5000');
    const search = String(term||'').toLowerCase();
    customerNames = [...new Set(rows.map(r=>String(r.customer_name||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    const filtered = customerNames.filter(n => !search || n.toLowerCase().includes(search)).slice(0,50);
    $o('customerNameList').innerHTML = filtered.map(n=>`<option value="${escapeO(n)}"></option>`).join('');
  }catch(err){
    console.warn('Customer lookup failed', err);
  }
}

function openOrderForm(order){
  $o('orderFormPanel').style.display = 'block';
  $o('formTitle').textContent = order ? 'Edit Order' : 'New Order';
  clearForm(false);
  if(order){
    $o('orderId').value = order.id;
    $o('orderDate').value = order.order_date || todayO();
    $o('pickupDate').value = order.pickup_date || '';
    $o('customerName').value = order.customer_name || '';
    $o('mediaSource').value = order.media_source || '';
    $o('details').value = order.details || '';
    $o('totalAmount').value = order.total_amount || '';
    $o('paymentType').value = order.payment_type || '';
    $o('status').value = order.status || 'New Orders';
    currentPhotoData = order.photo_data || '';
    $o('photoPreviewWrap').innerHTML = currentPhotoData ? `<img class="photo-preview" src="${currentPhotoData}">` : '';
  }
  clearStatus();
  scrollTo({top:0,behavior:'smooth'});
  loadCustomerNames($o('customerName').value);
}

function closeOrderForm(){ $o('orderFormPanel').style.display='none'; }
function clearForm(resetDate=true){
  $o('orderForm').reset();
  $o('orderId').value = '';
  if(resetDate) $o('orderDate').value = todayO();
  currentPhotoData = '';
  $o('photoPreviewWrap').innerHTML = '';
  $o('status').value = 'New Orders';
}

function buildPayload(){
  return {
    order_date: $o('orderDate').value || todayO(),
    pickup_date: $o('pickupDate').value || null,
    customer_name: $o('customerName').value.trim(),
    media_source: $o('mediaSource').value || '',
    details: $o('details').value || $o('quickText').value || '',
    total_amount: Number($o('totalAmount').value) || 0,
    payment_type: $o('paymentType').value || '',
    status: $o('status').value || 'New Orders',
    photo_data: currentPhotoData || null
  };
}

async function saveOrderNow(){
  const btn = $o('saveOrderBtn');
  try{
    setStatus('Saving order...');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    const id = $o('orderId').value;
    const payload = buildPayload();
    if(!payload.customer_name){ setStatus('Customer name is required.', true); return; }
    let saved;
    if(id){
      const data = await rest(`/orders?id=eq.${encodeURIComponent(id)}`, {method:'PATCH', headers:{Prefer:'return=representation'}, body:JSON.stringify(payload)});
      saved = data?.[0];
    }else{
      const data = await rest('/orders', {method:'POST', headers:{Prefer:'return=representation'}, body:JSON.stringify(payload)});
      saved = data?.[0];
    }
    setStatus(`Order saved successfully. ID: ${saved?.id || 'created'}`);
    closeOrderForm();
    await renderBoard();
  }catch(err){
    console.error('Save failed', err);
    setStatus('Save failed: ' + escapeO(err.message || err), true);
  }finally{
    btn.disabled = false;
    btn.textContent = 'Save Order';
  }
}

async function loadOrdersSelf(){
  return await rest('/orders?select=*&order=pickup_date.asc,order_date.asc,id.asc&limit=5000');
}

async function deleteLinkedTransaction(transactionId){
  if(!transactionId) return;
  await rest(`/transactions?id=eq.${encodeURIComponent(transactionId)}`, {method:'DELETE'});
}

function orderCard(order){
  const posted = !!order.posted_transaction_id || order.status === 'Posted to Finance';
  const photo = order.photo_data ? `<img class="board-photo" src="${order.photo_data}" alt="Order photo reference">` : '';
  return `<article class="board-card" draggable="true" data-id="${order.id}">
    <div class="board-card-top"><strong>${escapeO(order.customer_name)}</strong><span>${moneyO(order.total_amount)}</span></div>
    <div class="board-meta"><div><b>Order:</b> ${order.order_date || '-'}</div><div><b>Pickup:</b> ${order.pickup_date || '-'}</div><div><b>Source:</b> ${escapeO(order.media_source || '-')}</div><div><b>Payment:</b> ${escapeO(order.payment_type || '-')}</div></div>
    ${order.details ? `<p>${escapeO(order.details).slice(0,180)}</p>` : ''}${photo}
    <div class="board-actions"><button type="button" onclick="editOrder(${order.id})">Edit</button>${posted ? `<span class="posted-label">Posted</span><button type="button" onclick="unpostOrder(${order.id})">Unpost</button>` : `<button type="button" class="primary" onclick="postOrder(${order.id})">Post</button>`}<button type="button" class="danger" onclick="deleteOrder(${order.id})">Delete</button></div>
  </article>`;
}

function bindDragDrop(){
  document.querySelectorAll('.board-card').forEach(card=>{
    card.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',card.dataset.id);card.classList.add('dragging');});
    card.addEventListener('dragend',()=>card.classList.remove('dragging'));
  });
  document.querySelectorAll('.board-column').forEach(col=>{
    col.addEventListener('dragover',e=>{e.preventDefault();col.classList.add('drag-over');});
    col.addEventListener('dragleave',()=>col.classList.remove('drag-over'));
    col.addEventListener('drop',async e=>{e.preventDefault();col.classList.remove('drag-over');const id=e.dataTransfer.getData('text/plain');const status=col.dataset.status;if(id&&status)await updateOrderStatus(id,status);});
  });
}

async function renderBoard(){
  try{
    allOrders = await loadOrdersSelf();
    BOARD_STATUSES.forEach(status=>{
      const list = allOrders.filter(o=>(o.status||'New Orders')===status);
      const id=statusId(status);
      const listEl=$o(`list${id}`);
      const countEl=$o(`count${id}`);
      if(listEl) listEl.innerHTML = list.map(orderCard).join('') || '<p class="empty-column">Drop orders here.</p>';
      if(countEl) countEl.textContent = list.length;
    });
    const cancelled = allOrders.filter(o=>o.status==='Cancelled');
    if($o('cancelledOrders')) $o('cancelledOrders').innerHTML = cancelled.map(orderCard).join('') || '<p>No cancelled orders.</p>';
    bindDragDrop();
  }catch(err){
    setStatus('Board load failed: ' + escapeO(err.message || err), true);
  }
}

async function updateOrderStatus(id,status){
  try{
    const o=allOrders.find(x=>Number(x.id)===Number(id));
    if(!o)return;
    await rest(`/orders?id=eq.${encodeURIComponent(id)}`, {method:'PATCH', headers:{Prefer:'return=representation'}, body:JSON.stringify({status})});
    await renderBoard();
  }catch(err){ setStatus('Move failed: '+escapeO(err.message||err), true); }
}

async function postOrder(id){
  try{
    const o = allOrders.find(x=>Number(x.id)===Number(id));
    if(!o)return;
    if(o.posted_transaction_id){ setStatus('This order is already posted.', true); return; }
    if(!o.total_amount){ setStatus('Total amount is required before posting.', true); return; }
    if(confirm('Post this order to Finance as Income / Orders?')){
      const txPayload = {
        transaction_date: o.order_date || todayO(),
        entry_type: 'Income',
        account: 'Orders',
        customer_name: o.customer_name || '',
        payment_type: o.payment_type || '',
        amount: Number(o.total_amount)||0,
        notes: `Order Board | Pickup: ${o.pickup_date||''} | Source: ${o.media_source||''} | Details: ${o.details||''}`
      };
      const tx = await rest('/transactions', {method:'POST', headers:{Prefer:'return=representation'}, body:JSON.stringify(txPayload)});
      await rest(`/orders?id=eq.${encodeURIComponent(id)}`, {method:'PATCH', headers:{Prefer:'return=representation'}, body:JSON.stringify({status:'Posted to Finance', posted_transaction_id:tx?.[0]?.id || null})});
      setStatus('Posted to Finance.');
      await renderBoard();
    }
  }catch(err){ setStatus('Post failed: '+escapeO(err.message||err), true); }
}

async function unpostOrder(id){
  try{
    const o = allOrders.find(x => Number(x.id) === Number(id));
    if(!o) return;
    if(!o.posted_transaction_id){
      setStatus('This order is not linked to a Finance transaction.', true);
      return;
    }
    if(confirm('Unpost this order? This will delete the linked Finance transaction and move the order back to Picked Up.')){
      await deleteLinkedTransaction(o.posted_transaction_id);
      await rest(`/orders?id=eq.${encodeURIComponent(id)}`, {
        method:'PATCH',
        headers:{Prefer:'return=representation'},
        body:JSON.stringify({status:'Picked Up', posted_transaction_id:null})
      });
      setStatus('Order unposted and Finance transaction deleted.');
      await renderBoard();
    }
  }catch(err){ setStatus('Unpost failed: '+escapeO(err.message||err), true); }
}

async function deleteOrder(id){
  try{
    const o = allOrders.find(x => Number(x.id) === Number(id));
    if(!o) return;
    const linked = o.posted_transaction_id ? ' This will also delete the linked Finance transaction.' : '';
    if(confirm('Delete this order permanently?' + linked)){
      if(o.posted_transaction_id){
        await deleteLinkedTransaction(o.posted_transaction_id);
      }
      await rest(`/orders?id=eq.${encodeURIComponent(id)}`, {method:'DELETE'});
      setStatus('Order deleted. Linked Finance transaction was removed if one existed.');
      await renderBoard();
    }
  }catch(err){ setStatus('Delete failed: '+escapeO(err.message||err), true); }
}

// Backward-compatible alias. Older UI text used Cancel; new UI uses Delete.
async function cancelOrder(id){ return deleteOrder(id); }

window.editOrder
window.editOrder = id => { const o=allOrders.find(x=>Number(x.id)===Number(id)); if(o) openOrderForm(o); };
window.postOrder = postOrder;
window.cancelOrder = cancelOrder;
window.deleteOrder = deleteOrder;
window.unpostOrder = unpostOrder;

async function init(){
  try{
    if(typeof nav === 'function') $o('nav').innerHTML = nav({key:'orders', title:'Order Board', subtitle:'Digital workflow for paper order tickets'});
    else $o('nav').innerHTML = '<header class="topbar"><div class="brand"><div><h1>Order Board</h1><p>Digital workflow for paper order tickets</p></div></div></header>';
    if(typeof footer === 'function') $o('footer').innerHTML = footer();
    $o('orderDate').value = todayO();
    $o('newOrderBtn').addEventListener('click',()=>openOrderForm(null));
    $o('refreshBtn').addEventListener('click',renderBoard);
    $o('closeFormBtn').addEventListener('click',closeOrderForm);
    $o('parseBtn').addEventListener('click',parseQuickText);
    $o('clearBtn').addEventListener('click',()=>clearForm());
    $o('saveOrderBtn').addEventListener('click',saveOrderNow);
    $o('orderForm').addEventListener('submit',e=>{e.preventDefault(); saveOrderNow();});
    $o('customerName').addEventListener('input',e=>loadCustomerNames(e.target.value));
    $o('photoInput').addEventListener('change',async e=>{
      const file=e.target.files[0];
      if(!file)return;
      const r=new FileReader();
      r.onload=()=>{currentPhotoData=r.result;$o('photoPreviewWrap').innerHTML=`<img class="photo-preview" src="${currentPhotoData}"><p class="hint"><b>Photo attached.</b> The photo is kept as a reference.</p>`;};
      r.readAsDataURL(file);
    });
    clearStatus();
    await loadCustomerNames('');
    await renderBoard();
  }catch(err){
    alert('Orders init failed: '+(err.message||err));
  }
}

init();
