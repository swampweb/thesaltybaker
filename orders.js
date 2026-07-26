console.log('orders.js v4.1.02 loaded');

let currentPhotoData = '';
let allOrders = [];
const BOARD_STATUSES = ['New Orders','In Progress','Ready','Picked Up','Posted to Finance'];

function setStatusMessage(message, isError=false){
  const el = $('saveStatus');
  if(!el){ alert(message); return; }
  el.style.display='block';
  el.style.background = isError ? '#ffe0e0' : '#e8f8ec';
  el.style.borderLeftColor = isError ? '#bd4f47' : '#326725';
  el.innerHTML = message;
}

function statusId(status){ return String(status || '').replace(/[^a-z0-9]/gi,''); }

function parseLooseDate(value){
  const raw = String(value || '').trim();
  if(!raw) return '';
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
  if(!m) return '';
  const currentYear = new Date().getFullYear();
  let year = m[3] ? Number(m[3]) : currentYear;
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

function setSelectValue(selectId, value){
  const el = $(selectId);
  const wanted = String(value || '').trim().toLowerCase();
  if(!wanted) return;
  const found = [...el.options].find(o => String(o.value).toLowerCase() === wanted);
  el.value = found ? found.value : 'Other';
}

function parseQuickText(){
  const t = $('quickText').value.trim();
  if(!t){ setStatusMessage('Type or paste order text first. Photo upload is reference-only in this version.', true); return; }
  const name = grabField(t, ['Name']);
  const media = grabField(t, ['Media Source', 'Source']);
  const orderDate = grabField(t, ['Order Date', 'Date']);
  const pickupDate = grabField(t, ['P\\/?U Date', 'Pickup Date', 'Pick Up Date']);
  const payment = grabField(t, ['Payment', 'Paid By']);
  const total = (t.match(/(?:Total|Amount)\s*:?\s*\$?\s*([0-9]+(?:\.[0-9]{1,2})?)/i)||[])[1];
  if(name) $('customerName').value = name;
  if(media) setSelectValue('mediaSource', media);
  if(payment) setSelectValue('paymentType', payment);
  if(total) $('totalAmount').value = total;
  const od = parseLooseDate(orderDate);
  const pd = parseLooseDate(pickupDate);
  if(od) $('orderDate').value = od;
  if(pd) $('pickupDate').value = pd;
  if(!$('details').value.trim()) $('details').value = t;
  setStatusMessage('Filled what I could. Review before saving.');
}

function openOrderForm(order){
  $('orderFormPanel').style.display = 'block';
  $('formTitle').textContent = order ? 'Edit Order' : 'New Order';
  clearForm(false);
  if(order){
    $('orderId').value = order.id;
    $('orderDate').value = order.order_date || todayISO();
    $('pickupDate').value = order.pickup_date || '';
    $('customerName').value = order.customer_name || '';
    $('mediaSource').value = order.media_source || '';
    $('details').value = order.details || '';
    $('totalAmount').value = order.total_amount || '';
    $('paymentType').value = order.payment_type || '';
    $('status').value = order.status || 'New Orders';
    currentPhotoData = order.photo_data || '';
    $('photoPreviewWrap').innerHTML = currentPhotoData ? `<img class="photo-preview" src="${currentPhotoData}">` : '';
  }
  setStatusMessage('Order form ready.');
  scrollTo({top:0,behavior:'smooth'});
}

function closeOrderForm(){ $('orderFormPanel').style.display='none'; }

function clearForm(resetDate=true){
  $('orderForm').reset();
  $('orderId').value='';
  if(resetDate) $('orderDate').value=todayISO();
  currentPhotoData='';
  $('photoPreviewWrap').innerHTML='';
  $('status').value='New Orders';
}

function buildPayload(){
  return {
    id: $('orderId').value || undefined,
    order_date: $('orderDate').value || todayISO(),
    pickup_date: $('pickupDate').value || null,
    customer_name: $('customerName').value.trim(),
    media_source: $('mediaSource').value || '',
    details: $('details').value || $('quickText').value || '',
    total_amount: Number($('totalAmount').value) || 0,
    payment_type: $('paymentType').value || '',
    status: $('status').value || 'New Orders',
    photo_data: currentPhotoData || null
  };
}

async function saveOrderNow(){
  const btn = $('saveOrderBtn');
  try{
    setStatusMessage('Saving order...');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    const order = buildPayload();
    if(!order.customer_name){ setStatusMessage('Customer name is required.', true); return; }

    if(typeof upsertOrder !== 'function'){
      throw new Error('upsertOrder function is missing. common.js may be old or not loaded.');
    }

    console.log('Saving payload', order);
    const saved = await upsertOrder(order);
    console.log('Saved result', saved);
    setStatusMessage(`Order saved successfully. ID: ${saved?.id || 'created'}`);
    closeOrderForm();
    await renderBoard();
  }catch(err){
    console.error('Save failed', err);
    setStatusMessage('Save failed: ' + escapeHtml(err.message || err), true);
  }finally{
    btn.disabled = false;
    btn.textContent = 'Save Order';
  }
}

function orderCard(order){
  const posted = !!order.posted_transaction_id || order.status === 'Posted to Finance';
  const photo = order.photo_data ? `<img class="board-photo" src="${order.photo_data}" alt="Order photo reference">` : '';
  return `<article class="board-card" draggable="true" data-id="${order.id}">
    <div class="board-card-top"><strong>${escapeHtml(order.customer_name)}</strong><span>${money(order.total_amount)}</span></div>
    <div class="board-meta"><div><b>Order:</b> ${order.order_date || '-'}</div><div><b>Pickup:</b> ${order.pickup_date || '-'}</div><div><b>Source:</b> ${escapeHtml(order.media_source || '-')}</div><div><b>Payment:</b> ${escapeHtml(order.payment_type || '-')}</div></div>
    ${order.details ? `<p>${escapeHtml(order.details).slice(0,180)}</p>` : ''}${photo}
    <div class="board-actions"><button type="button" onclick="editOrder(${order.id})">Edit</button>${posted ? '<span class="posted-label">Posted</span>' : `<button type="button" class="primary" onclick="postOrder(${order.id})">Post</button>`}<button type="button" class="danger" onclick="cancelOrder(${order.id})">Cancel</button></div>
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
    if(typeof loadOrders !== 'function') throw new Error('loadOrders function is missing. common.js may be old or not loaded.');
    allOrders = await loadOrders('all');
    BOARD_STATUSES.forEach(status=>{
      const list=allOrders.filter(o=>(o.status||'New Orders')===status);
      const id=statusId(status);
      const listEl=$(`list${id}`);
      const countEl=$(`count${id}`);
      if(listEl) listEl.innerHTML=list.map(orderCard).join('') || '<p class="empty-column">Drop orders here.</p>';
      if(countEl) countEl.textContent=list.length;
    });
    const cancelled=allOrders.filter(o=>o.status==='Cancelled');
    if($('cancelledOrders')) $('cancelledOrders').innerHTML=cancelled.map(orderCard).join('') || '<p>No cancelled orders.</p>';
    bindDragDrop();
  }catch(err){
    setStatusMessage('Board load failed: ' + escapeHtml(err.message || err), true);
  }
}

async function updateOrderStatus(id,status){
  try{const o=allOrders.find(x=>Number(x.id)===Number(id));if(!o)return;await upsertOrder({...o,status});await renderBoard();}
  catch(err){setStatusMessage('Move failed: '+escapeHtml(err.message||err),true);}
}

async function postOrder(id){
  try{
    const o=allOrders.find(x=>Number(x.id)===Number(id)); if(!o)return;
    if(o.posted_transaction_id){setStatusMessage('This order is already posted.', true);return;}
    if(!o.total_amount){setStatusMessage('Total amount is required before posting.', true);return;}
    if(confirm('Post this order to Finance as Income / Orders?')){await postOrderToFinance(o);setStatusMessage('Posted to Finance.');await renderBoard();}
  }catch(err){setStatusMessage('Post failed: '+escapeHtml(err.message||err),true);}
}

async function cancelOrder(id){
  try{const o=allOrders.find(x=>Number(x.id)===Number(id));if(!o)return;if(confirm('Move this order to Cancelled?')){await upsertOrder({...o,status:'Cancelled'});await renderBoard();}}
  catch(err){setStatusMessage('Cancel failed: '+escapeHtml(err.message||err),true);}
}

window.editOrder = id => { const o=allOrders.find(x=>Number(x.id)===Number(id)); if(o) openOrderForm(o); };
window.postOrder = postOrder;
window.cancelOrder = cancelOrder;

async function init(){
  try{
    $('nav').innerHTML = nav({key:'orders', title:'Order Board', subtitle:'Digital workflow for paper order tickets'});
    $('footer').innerHTML = footer();
    $('orderDate').value = todayISO();
    $('newOrderBtn').addEventListener('click',()=>openOrderForm(null));
    $('refreshBtn').addEventListener('click',renderBoard);
    $('closeFormBtn').addEventListener('click',closeOrderForm);
    $('parseBtn').addEventListener('click',parseQuickText);
    $('clearBtn').addEventListener('click',()=>clearForm());
    $('saveOrderBtn').addEventListener('click',saveOrderNow);
    $('orderForm').addEventListener('submit',e=>{e.preventDefault(); saveOrderNow();});
    $('photoInput').addEventListener('change',async e=>{
      const file=e.target.files[0]; if(!file)return;
      const r=new FileReader();
      r.onload=()=>{currentPhotoData=r.result;$('photoPreviewWrap').innerHTML=`<img class="photo-preview" src="${currentPhotoData}"><p class="hint"><b>Photo attached.</b> The photo is kept as a reference.</p>`;};
      r.readAsDataURL(file);
    });
    setStatusMessage('Orders page loaded.');
    await renderBoard();
  }catch(err){
    alert('Orders init failed: '+(err.message||err));
  }
}

init();
