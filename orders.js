let currentPhotoData='';

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
    alert('Photo upload is saved as a reference image, but this version does not read handwriting from the photo yet. Type or paste the order details into Quick Text, then click Fill From Quick Text.');
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

  alert('Filled what I could. Review the fields before saving.');
}

function fileToDataUrl(file){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onload=()=>resolve(r.result);
    r.onerror=reject;
    r.readAsDataURL(file);
  });
}

async function saveOrder(e){
  e.preventDefault();
  const order={
    id:$('orderId').value||undefined,
    order_date:$('orderDate').value||todayISO(),
    pickup_date:$('pickupDate').value||null,
    customer_name:$('customerName').value.trim(),
    media_source:$('mediaSource').value,
    details:$('details').value,
    total_amount:Number($('totalAmount').value)||0,
    payment_type:$('paymentType').value,
    status:$('status').value,
    photo_data:currentPhotoData||null
  };
  if(!order.customer_name)return alert('Customer name is required.');
  await upsertOrder(order);
  alert('Order saved.');
  clearForm();
  await renderOrders();
}

function clearForm(){
  $('orderForm').reset();
  $('orderId').value='';
  $('orderDate').value=todayISO();
  currentPhotoData='';
  $('photoPreviewWrap').innerHTML='';
  $('status').value='Open';
}

function editOrder(id){
  const o=window._orders.find(x=>x.id===id);
  if(!o)return;
  $('orderId').value=o.id;
  $('orderDate').value=o.order_date||todayISO();
  $('pickupDate').value=o.pickup_date||'';
  $('customerName').value=o.customer_name||'';
  $('mediaSource').value=o.media_source||'';
  $('details').value=o.details||'';
  $('totalAmount').value=o.total_amount||'';
  $('paymentType').value=o.payment_type||'';
  $('status').value=o.status||'Open';
  currentPhotoData=o.photo_data||'';
  $('photoPreviewWrap').innerHTML=currentPhotoData?`<img class="photo-preview" src="${currentPhotoData}">`:'';
  scrollTo({top:0,behavior:'smooth'});
}

async function postOrder(id){
  const o=window._orders.find(x=>x.id===id);
  if(!o)return;
  if(!o.total_amount)return alert('Total amount is required before posting to Finance.');
  if(confirm('Post this order to Finance as Income / Orders?')){
    await postOrderToFinance(o);
    alert('Posted to Finance.');
    await renderOrders();
  }
}

async function renderOrders(){
  const status=$('statusFilter').value;
  window._orders=await loadOrders(status);
  $('ordersList').innerHTML=window._orders.map(o=>`<div class="order-card"><div><h3>${escapeHtml(o.customer_name)} <span class="status-pill">${escapeHtml(o.status||'Open')}</span></h3><p><b>Order:</b> ${o.order_date||''} | <b>Pickup:</b> ${o.pickup_date||''} | <b>Source:</b> ${escapeHtml(o.media_source||'')} | <b>Payment:</b> ${escapeHtml(o.payment_type||'')} | <b>Total:</b> ${money(o.total_amount)}</p><p>${escapeHtml(o.details||'')}</p>${o.photo_data?`<img class="photo-preview" src="${o.photo_data}">`:''}</div><div><button onclick="editOrder(${o.id})">Edit</button> <button class="primary" onclick="postOrder(${o.id})">Post to Finance</button></div></div>`).join('')||'<p>No orders found.</p>';
}

async function init(){
  $('nav').innerHTML=nav({key:'orders',title:'Order Capture',subtitle:'Paper Order Sheet Tracking and Finance Posting'});
  $('footer').innerHTML=footer();
  $('orderDate').value=todayISO();
  $('parseBtn').onclick=parseQuickText;
  $('clearBtn').onclick=clearForm;
  $('orderForm').onsubmit=saveOrder;
  $('statusFilter').onchange=renderOrders;
  $('photoInput').onchange=async e=>{
    const f=e.target.files[0];
    if(!f)return;
    currentPhotoData=await fileToDataUrl(f);
    $('photoPreviewWrap').innerHTML=`<img class="photo-preview" src="${currentPhotoData}"><p class="hint"><b>Photo attached.</b> Use Quick Text to fill fields, or manually enter the fields before saving.</p>`;
  };
  await renderOrders();
}

init().catch(e=>alert(e.message));
