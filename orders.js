console.log('orders.js v4.1.26 week rerender collapse fix loaded');

// Self-contained Supabase settings for Orders page.
// This bypasses any cached common.js header issue.
const ORDERS_SUPABASE_URL = 'https://fprbzavehflzqcmxvbxx.supabase.co';
const ORDERS_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwcmJ6YXZlaGZsenFjbXh2Ynh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MjMxNzEsImV4cCI6MjA5OTk5OTE3MX0.8_D_7kx9f2as46N7ZrNhGZen25e8TGFd2ue5p1TgTvg';
const ORDERS_REST = `${ORDERS_SUPABASE_URL}/rest/v1`;

const $o = id => document.getElementById(id);
const moneyO = n => (Number(n)||0).toLocaleString(undefined,{style:'currency',currency:'USD'});
const todayO = () => new Date().toISOString().slice(0,10);
const ORDER_MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function formatOrderDate(value){
  if(!value) return '-';
  const parts = String(value).slice(0,10).split('-');
  if(parts.length !== 3) return value;
  const year = parts[0].slice(-2);
  const month = ORDER_MONTHS_SHORT[Number(parts[1])-1] || parts[1];
  const day = parts[2].padStart(2,'0');
  return `${day} ${month} ${year}`;
}

function localDateFromISO(value){
  if(!value) return null;
  const parts = String(value).slice(0,10).split('-').map(Number);
  if(parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return new Date(parts[0], parts[1]-1, parts[2]);
}
function isoFromDate(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function weekGroupKey(order){
  if(!order.pickup_date) return '9999-99-99|No Pickup Date';
  const d = localDateFromISO(order.pickup_date);
  if(!d) return '9999-99-99|No Pickup Date';
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - d.getDay());
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  return `${isoFromDate(sunday)}|${formatOrderDate(isoFromDate(sunday))} - ${formatOrderDate(isoFromDate(saturday))}`;
}
function setWeekGroupCollapsed(group, collapsed){
  if(!group) return;

  const button = group.querySelector('.week-toggle-btn');
  const label = group.querySelector('.week-toggle-text');
  const body = group.querySelector('.week-group-body');

  group.classList.toggle('collapsed', collapsed);

  // Hide/show every order card in this week directly, not only the wrapper.
  // This fixes the Website Orders page when older CSS keeps the wrapper visible.
  group.querySelectorAll('.week-group-body, .week-group-body .board-card').forEach(el => {
    el.hidden = collapsed;
    el.style.setProperty('display', collapsed ? 'none' : '', 'important');
  });

  if(body && !collapsed){
    body.hidden = false;
    body.style.setProperty('display', 'flex', 'important');
    body.style.setProperty('flex-direction', 'column', 'important');
    body.style.setProperty('gap', '14px', 'important');
  }

  if(label) label.textContent = collapsed ? 'Expand' : 'Collapse';
  if(button) button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
}

function toggleWeekGroup(button, event){
  if(event){
    event.preventDefault();
    event.stopPropagation();
  }
  const group = button.closest('.week-group');
  if(!group) return false;
  setWeekGroupCollapsed(group, !group.classList.contains('collapsed'));
  return false;
}
window.toggleWeekGroup = toggleWeekGroup;

function expandAllOrderCards(){
  document.querySelectorAll('.collapsed-order').forEach(card => card.classList.add('expanded'));
}
function collapseAllOrderCards(){
  document.querySelectorAll('.collapsed-order').forEach(card => card.classList.remove('expanded'));
}
window.expandAllOrderCards = expandAllOrderCards;
window.collapseAllOrderCards = collapseAllOrderCards;


function toggleWeekGroupKey(encodedKey, event){
  if(event){
    event.preventDefault();
    event.stopPropagation();
  }

  const key = decodeURIComponent(encodedKey);
  if(collapsedWeekGroups.has(key)) collapsedWeekGroups.delete(key);
  else collapsedWeekGroups.add(key);

  renderBoard();
  return false;
}
window.toggleWeekGroupKey = toggleWeekGroupKey;

function renderWeekGroups(list){
  if(!list.length) return '<p class="empty-column">Drop orders here.</p>';

  const toolbar = '<div class="board-collapse-toolbar"><button type="button" onclick="expandAllOrderCards()">Expand Cards</button><button type="button" onclick="collapseAllOrderCards()">Collapse Cards</button></div>';
  const groups = new Map();

  list.forEach(order => {
    const key = weekGroupKey(order);
    if(!groups.has(key)) groups.set(key, []);
    groups.get(key).push(order);
  });

  return toolbar + [...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([key,items]) => {
    const label = key.split('|')[1];
    const collapsed = collapsedWeekGroups.has(key);
    const encodedKey = encodeURIComponent(key);
    const buttonText = collapsed ? 'Expand' : 'Collapse';
    const bodyHtml = collapsed ? '' : `<div class="week-group-body">${items.map(orderCard).join('')}</div>`;

    return `<div class="week-group ${collapsed ? 'collapsed' : ''}" data-week-key="${encodedKey}">
      <div class="week-group-title">
        <span>${label}</span>
        <button type="button" class="week-toggle-btn" aria-expanded="${collapsed ? 'false' : 'true'}" onclick="return toggleWeekGroupKey('${encodedKey}', event)">
          <span class="week-toggle-text">${buttonText}</span> <b>${items.length}</b>
        </button>
      </div>
      ${bodyHtml}
    </div>`;
  }).join('');
}


let currentPhotoData = '';
let allOrders = [];
let customerNames = [];
const collapsedWeekGroups = new Set();
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
    const [txRows, orderRows] = await Promise.all([
      rest('/transactions?select=customer_name&customer_name=not.is.null&limit=5000').catch(() => []),
      rest('/orders?select=customer_name&customer_name=not.is.null&limit=5000').catch(() => [])
    ]);

    const search = String(term||'').toLowerCase();
    customerNames = [...new Set([
      ...txRows.map(r=>String(r.customer_name||'').trim()),
      ...orderRows.map(r=>String(r.customer_name||'').trim())
    ].filter(Boolean))].sort((a,b)=>a.localeCompare(b));

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
    if($o('paymentType')) $o('paymentType').value = order.payment_type || '';
    $o('status').value = order.status || 'New Orders';
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
  $o('status').value = 'New Orders';
}

function buildPayload(){
  return {
    order_date: $o('orderDate').value || todayO(),
    pickup_date: $o('pickupDate').value || null,
    customer_name: $o('customerName').value.trim(),
    media_source: $o('mediaSource').value || '',
    details: $o('details').value || '',
    total_amount: Number($o('totalAmount').value) || 0,
    payment_type: ($o('paymentType') ? $o('paymentType').value : ''),
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
    await loadCustomerNames('');
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

function setOrderCardExpanded(card, expanded){
  if(!card) return;
  const details = card.querySelector('.order-card-expanded');
  const btn = card.querySelector('.card-expand-btn');

  card.classList.toggle('expanded', expanded);
  if(details){
    details.hidden = !expanded;
    details.style.cssText = expanded ? 'display:block!important;' : 'display:none!important;';
  }
  if(btn){
    btn.textContent = expanded ? 'Collapse Card' : 'Expand Card';
    btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }
}

function toggleOrderCard(cardId, event, source='card'){
  if(event) event.stopPropagation();
  if(source === 'card' && event && event.target && event.target.closest('button,select,input,textarea,a')) return;
  const card = document.querySelector(`[data-id="${cardId}"]`);
  if(!card) return;
  setOrderCardExpanded(card, !card.classList.contains('expanded'));
}
window.toggleOrderCard = toggleOrderCard;

function orderCard(order){
  const posted = !!order.posted_transaction_id || order.status === 'Posted to Finance';
  const paymentType = String(order.payment_type || '').trim();
  const orderDate = formatOrderDate(order.order_date);
  const pickupDate = formatOrderDate(order.pickup_date);
  const paymentButton = posted
    ? ''
    : `<button type="button" class="payment-pill-btn ${paymentType ? 'paid' : 'unpaid'}" onclick="setOrderPayment(${order.id})">${paymentType ? `Paid: ${escapeO(paymentType)}` : 'Payment not set'}</button>`;

  return `<article class="board-card cleaner-order-card collapsed-order ${paymentType ? 'paid-order-card' : ''}" draggable="true" data-id="${order.id}" onclick="toggleOrderCard(${order.id}, event)">
    <div class="order-card-badges">
      <span class="order-number">Order #${order.id}</span>
      <span class="pickup-date-bubble">Pickup ${pickupDate}</span>
    </div>
    <div class="board-card-top clean-card-top">
      <strong>${escapeO(order.customer_name)}</strong>
      <span>${moneyO(order.total_amount)}</span>
    </div>
    <div class="date-row"><span><b>Order:</b> ${orderDate}</span></div>
    <div class="board-meta clean-meta">
      <div><b>Source:</b> ${escapeO(order.media_source || '-')}</div>
    </div>
    <div class="order-card-expanded" hidden style="display:none!important">
      <div class="payment-status-row">${paymentButton}</div>
      ${order.details ? `<p class="order-details-text">${escapeO(order.details).slice(0,180)}</p>` : ''}
      <div class="board-actions clean-actions compact-actions">
        <button type="button" class="soft-btn small-action-btn" onclick="editOrder(${order.id})">Edit</button>
        ${posted ? `<span class="posted-label small-posted-label">Posted</span><button type="button" class="soft-btn small-action-btn" onclick="unpostOrder(${order.id})">Unpost</button>` : `<button type="button" class="primary post-btn small-action-btn" onclick="postOrder(${order.id})">Post</button>`}
        <button type="button" class="danger delete-btn small-action-btn" onclick="deleteOrder(${order.id})">Delete</button>
      </div>
    </div>
    <button type="button" class="card-expand-btn" data-card-toggle="1" aria-expanded="false" onclick="toggleOrderCard(${order.id}, event, 'button')">Expand Card</button>
  </article>`;
}



function bindWeekCollapseDirect(){ /* week buttons are handled by toggleWeekGroupKey and board re-render */ }

function bindCollapseDelegates(){
  if(window.__ordersCollapseDelegatesBound) return;
  window.__ordersCollapseDelegatesBound = true;

  document.addEventListener('click', event => {
    const weekButton = event.target.closest('.week-toggle-btn');
    if(weekButton){
      event.preventDefault();
      event.stopPropagation();
      const group = weekButton.closest('.week-group');
      setWeekGroupCollapsed(group, !group.classList.contains('collapsed'));
      return;
    }

    const cardButton = event.target.closest('.card-expand-btn');
    if(cardButton){
      event.preventDefault();
      event.stopPropagation();
      const card = cardButton.closest('.board-card');
      setOrderCardExpanded(card, !card.classList.contains('expanded'));
      return;
    }
  }, true);
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
    allOrders.sort((a,b)=>{
      const ap = a.pickup_date || '9999-12-31';
      const bp = b.pickup_date || '9999-12-31';
      return ap.localeCompare(bp) || String(a.order_date||'9999-12-31').localeCompare(String(b.order_date||'9999-12-31')) || Number(a.id||0)-Number(b.id||0);
    });
    BOARD_STATUSES.forEach(status=>{
      const list = allOrders.filter(o=>(o.status||'New Orders')===status);
      const id=statusId(status);
      const listEl=$o(`list${id}`);
      const countEl=$o(`count${id}`);
      if(listEl) listEl.innerHTML = renderWeekGroups(list);
      if(countEl) countEl.textContent = list.length;
    });
    const cancelled = allOrders.filter(o=>o.status==='Cancelled');
    if($o('cancelledOrders')) $o('cancelledOrders').innerHTML = renderWeekGroups(cancelled).replace('Drop orders here.','No cancelled orders.');
    bindWeekCollapseDirect();
    bindCollapseDelegates();
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

function ensurePaymentModal(){
  let modal = document.getElementById('paymentModal');
  if(modal) return modal;

  modal = document.createElement('div');
  modal.id = 'paymentModal';
  modal.className = 'payment-modal-backdrop';
  modal.innerHTML = `
    <div class="payment-modal-card">
      <h3 id="paymentModalTitle">Payment Type</h3>
      <p class="hint">Choose how this order was paid.</p>
      <label>Payment Type
        <select id="paymentModalSelect">
          <option>Apple</option>
          <option>Cash</option>
          <option>Cash App</option>
          <option>Paypal</option>
          <option>Square</option>
          <option>Venmo</option>
          <option>Zelle</option>
          <option>Other</option>
        </select>
      </label>
      <div class="payment-modal-actions">
        <button type="button" id="paymentModalCancel">Cancel</button>
        <button type="button" class="primary" id="paymentModalSave">Save Payment</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  return modal;
}

function choosePaymentType(current='Venmo', title='Payment Type'){
  return new Promise(resolve => {
    const modal = ensurePaymentModal();
    const select = document.getElementById('paymentModalSelect');
    const titleEl = document.getElementById('paymentModalTitle');
    const save = document.getElementById('paymentModalSave');
    const cancel = document.getElementById('paymentModalCancel');

    titleEl.textContent = title;
    select.value = current || 'Venmo';
    if(select.value !== (current || 'Venmo')) select.value = 'Other';
    modal.classList.add('show');

    const cleanup = value => {
      modal.classList.remove('show');
      save.onclick = null;
      cancel.onclick = null;
      modal.onclick = null;
      resolve(value);
    };

    save.onclick = () => cleanup(select.value);
    cancel.onclick = () => cleanup(null);
    modal.onclick = e => { if(e.target === modal) cleanup(null); };
    setTimeout(() => select.focus(), 50);
  });
}

async function setOrderPayment(id){
  try{
    const o = allOrders.find(x => Number(x.id) === Number(id));
    if(!o) return;

    const current = String(o.payment_type || '').trim() || 'Venmo';
    const choice = await choosePaymentType(current, `Payment for Order #${id}`);
    if(choice === null) return;

    const paymentType = String(choice || '').trim();
    if(!paymentType){
      setStatus('Payment type was not changed.', true);
      return;
    }

    await rest(`/orders?id=eq.${encodeURIComponent(id)}`, {
      method:'PATCH',
      headers:{Prefer:'return=representation'},
      body:JSON.stringify({payment_type:paymentType})
    });

    setStatus(`Order #${id} marked paid by ${escapeO(paymentType)}.`);
    await renderBoard();
  }catch(err){
    setStatus('Payment update failed: '+escapeO(err.message||err), true);
  }
}

async function postOrder(id){
  try{
    const o = allOrders.find(x=>Number(x.id)===Number(id));
    if(!o)return;
    if(o.posted_transaction_id){ setStatus('This order is already posted.', true); return; }
    if(!o.total_amount){ setStatus('Total amount is required before posting.', true); return; }

    let paymentType = o.payment_type || '';
    if(!paymentType){
      const choice = await choosePaymentType('Venmo', `Payment for Order #${id}`);
      if(choice === null) return;
      paymentType = String(choice || '').trim();
      if(!paymentType){ setStatus('Payment type is required before posting.', true); return; }
    }

    if(confirm(`Post Order #${o.id} to Finance as Income / Orders?`)){
      const txPayload = {
        transaction_date: o.order_date || todayO(),
        entry_type: 'Income',
        account: 'Orders',
        customer_name: o.customer_name || '',
        payment_type: paymentType,
        amount: Number(o.total_amount)||0,
        notes: `Order #${o.id} | Order Board | Pickup: ${o.pickup_date||''} | Source: ${o.media_source||''} | Details: ${o.details||''}`
      };
      const tx = await rest('/transactions', {method:'POST', headers:{Prefer:'return=representation'}, body:JSON.stringify(txPayload)});
      await rest(`/orders?id=eq.${encodeURIComponent(id)}`, {method:'PATCH', headers:{Prefer:'return=representation'}, body:JSON.stringify({status:'Posted to Finance', payment_type:paymentType, posted_transaction_id:tx?.[0]?.id || null})});
      setStatus(`Order #${o.id} posted to Finance as Income / Orders.`);
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
window.setOrderPayment = setOrderPayment;
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
    $o('clearBtn').addEventListener('click',()=>clearForm());
    $o('saveOrderBtn').addEventListener('click',saveOrderNow);
    $o('orderForm').addEventListener('submit',e=>{e.preventDefault(); saveOrderNow();});
    $o('customerName').addEventListener('input',e=>loadCustomerNames(e.target.value));
    clearStatus();
    await loadCustomerNames('');
    await renderBoard();
  }catch(err){
    alert('Orders init failed: '+(err.message||err));
  }
}

init();
