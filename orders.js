let currentPhotoData = '';
let allOrders = [];
const BOARD_STATUSES = ['New Orders','In Progress','Ready','Picked Up','Posted to Finance'];

function statusId(status){
  return String(status || '').replace(/[^a-z0-9]/gi,'');
}

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

function setSelectValue(selectId, value){
  const el = $(selectId);
  const wanted = String(value || '').trim().toLowerCase();
  if(!wanted) return;
  const found = [...el.options].find(o => String(o.value).toLowerCase() === wanted);
  if(found) el.value = found.value;
  else el.value = 'Other';
}

function grabField(text, labels){
  for(const label of labels){
    const re = new RegExp(`${label}\\s*:?\\s*([^,\\n]+)`, 'i');
    const m = text.match(re);
    if(m) return m[1].trim();
  }
  return '';
}

function parseQuickText(){
  const t = $('quickText').value.trim();
  if(!t){
    alert('Type or paste the order details into Quick Text first. Photo upload is for reference only in this version.');
    return;
  }

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

  let details = t
    .replace(/Name\s*:?[^\n,]+/ig,'')
    .replace(/Media Source\s*:?[^\n,]+/ig,'')
    .replace(/Source\s*:?[^\n,]+/ig,'')
    .replace(/P\/?U Date\s*:?[^\n,]+/ig,'')
    .replace(/Pickup Date\s*:?[^\n,]+/ig,'')
    .replace(/Pick Up Date\s*:?[^\n,]+/ig,'')
    .replace(/Order Date\s*:?[^\n,]+/ig,'')
    .replace(/Date\s*:?[^\n,]+/ig,'')
    .replace(/Payment\s*:?[^\n,]+/ig,'')
    .replace(/Paid By\s*:?[^\n,]+/ig,'')
    .replace(/Total\s*:?[^\n,]+/ig,'')
    .replace(/Amount\s*:?[^\n,]+/ig,'')
    .replace(/^[,\s\-]+/,'')
    .trim();

  if(details) $('details').value = details;
  alert('Filled what I could. Review before saving.');
}

function fileToDataUrl(file){
  return new Promise((resolve,reject)=>{
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
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

  scrollTo({top:0,behavior:'smooth'});
}

function closeOrderForm(){
  $('orderFormPanel').style.display = 'none';
}

function clearForm(resetDate=true){
  $('orderForm').reset();
  $('orderId').value = '';
  if(resetDate) $('orderDate').value = todayISO();
  currentPhotoData = '';
  $('photoPreviewWrap').innerHTML = '';
  $('status').value = 'New Orders';
}

async function saveOrder(e){
  e.preventDefault();
  const order = {
    id: $('orderId').value || undefined,
    order_date: $('orderDate').value || todayISO(),
    pickup_date: $('pickupDate').value || null,
    customer_name: $('customerName').value.trim(),
    media_source: $('mediaSource').value,
    details: $('details').value,
    total_amount: Number($('totalAmount').value) || 0,
    payment_type: $('paymentType').value,
    status: $('status').value || 'New Orders',
    photo_data: currentPhotoData || null
  };

  if(!order.customer_name) return alert('Customer name is required.');
  await upsertOrder(order);
  closeOrderForm();
  await renderBoard();
}

async function updateOrderStatus(id, status){
  const order = allOrders.find(o => Number(o.id) === Number(id));
  if(!order) return;
  await upsertOrder({...order, status});
  await renderBoard();
}

async function postOrder(id){
  const order = allOrders.find(o => Number(o.id) === Number(id));
  if(!order) return;
  if(order.posted_transaction_id){
    alert('This order has already been posted to Finance.');
    return;
  }
  if(!order.total_amount){
    alert('Total amount is required before posting to Finance.');
    return;
  }
  if(!order.payment_type){
    alert('Payment type is recommended before posting to Finance.');
    return;
  }
  if(confirm('Post this order to Finance as Income / Orders?')){
    await postOrderToFinance(order);
    await renderBoard();
    alert('Posted to Finance.');
  }
}

async function cancelOrder(id){
  const order = allOrders.find(o => Number(o.id) === Number(id));
  if(!order) return;
  if(confirm('Move this order to Cancelled?')){
    await upsertOrder({...order, status:'Cancelled'});
    await renderBoard();
  }
}

function orderCard(order){
  const posted = !!order.posted_transaction_id || order.status === 'Posted to Finance';
  const photo = order.photo_data ? `<img class="board-photo" src="${order.photo_data}" alt="Order photo reference">` : '';
  return `
    <article class="board-card" draggable="true" data-id="${order.id}">
      <div class="board-card-top">
        <strong>${escapeHtml(order.customer_name)}</strong>
        <span>${money(order.total_amount)}</span>
      </div>
      <div class="board-meta">
        <div><b>Pickup:</b> ${order.pickup_date || '-'}</div>
        <div><b>Source:</b> ${escapeHtml(order.media_source || '-')}</div>
        <div><b>Payment:</b> ${escapeHtml(order.payment_type || '-')}</div>
      </div>
      ${order.details ? `<p>${escapeHtml(order.details).slice(0,180)}</p>` : ''}
      ${photo}
      <div class="board-actions">
        <button type="button" onclick="editOrder(${order.id})">Edit</button>
        ${posted ? '<span class="posted-label">Posted</span>' : `<button type="button" class="primary" onclick="postOrder(${order.id})">Post</button>`}
        <button type="button" class="danger" onclick="cancelOrder(${order.id})">Cancel</button>
      </div>
    </article>
  `;
}

function bindDragDrop(){
  document.querySelectorAll('.board-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', card.dataset.id);
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });

  document.querySelectorAll('.board-column').forEach(col => {
    col.addEventListener('dragover', e => {
      e.preventDefault();
      col.classList.add('drag-over');
    });
    col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
    col.addEventListener('drop', async e => {
      e.preventDefault();
      col.classList.remove('drag-over');
      const id = e.dataTransfer.getData('text/plain');
      const status = col.dataset.status;
      if(id && status) await updateOrderStatus(id, status);
    });
  });
}

async function renderBoard(){
  allOrders = await loadOrders('all');

  BOARD_STATUSES.forEach(status => {
    const list = allOrders.filter(o => (o.status || 'New Orders') === status);
    const id = statusId(status);
    const listEl = $(`list${id}`);
    const countEl = $(`count${id}`);
    if(listEl) listEl.innerHTML = list.map(orderCard).join('') || '<p class="empty-column">Drop orders here.</p>';
    if(countEl) countEl.textContent = list.length;
  });

  const cancelled = allOrders.filter(o => o.status === 'Cancelled');
  $('cancelledOrders').innerHTML = cancelled.map(orderCard).join('') || '<p>No cancelled orders.</p>';
  bindDragDrop();
}

window.editOrder = id => {
  const order = allOrders.find(o => Number(o.id) === Number(id));
  if(order) openOrderForm(order);
};
window.postOrder = postOrder;
window.cancelOrder = cancelOrder;

async function init(){
  $('nav').innerHTML = nav({key:'orders', title:'Order Board', subtitle:'Digital workflow for paper order tickets'});
  $('footer').innerHTML = footer();
  $('orderDate').value = todayISO();
  $('newOrderBtn').onclick = () => openOrderForm(null);
  $('refreshBtn').onclick = renderBoard;
  $('closeFormBtn').onclick = closeOrderForm;
  $('parseBtn').onclick = parseQuickText;
  $('clearBtn').onclick = () => clearForm();
  $('orderForm').onsubmit = saveOrder;
  $('photoInput').onchange = async e => {
    const file = e.target.files[0];
    if(!file) return;
    currentPhotoData = await fileToDataUrl(file);
    $('photoPreviewWrap').innerHTML = `<img class="photo-preview" src="${currentPhotoData}"><p class="hint"><b>Photo attached.</b> The photo is kept as a reference. Enter the fields or use Quick Text before saving.</p>`;
  };
  await renderBoard();
}

init().catch(e => alert(e.message));
