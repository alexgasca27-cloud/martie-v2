const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const app = $('#app');

const demoProducts = [
  ['espresso','Espresso','Café',45,'☕'],['americano','Americano','Café',52,'☕'],['latte','Latte','Café',68,'🥛'],
  ['capuccino','Cappuccino','Café',68,'☕'],['coldbrew','Cold Brew','Fríos',75,'🧊'],['matcha','Matcha Latte','Fríos',82,'🍵'],
  ['croissant','Croissant','Panadería',58,'🥐'],['sandwich','Sándwich Martie','Comida',115,'🥪']
].map(([id,name,category,price,emoji])=>({id,name,category,price,emoji,description:'',available:1,sort_order:100}));

const S = {
  token: localStorage.martie_token || '',
  user: JSON.parse(localStorage.martie_user || 'null'),
  cart: JSON.parse(localStorage.martie_cart || '[]'),
  route: 'home',
  products: demoProducts,
  demo: false,
  points: Number(localStorage.martie_points || 0),
  orders: JSON.parse(localStorage.martie_orders || '[]'),
  birthday: null,
  loyalty: [],
  adminSection: 'dashboard',
  adminProducts: [],
  adminCustomers: [],
  adminOrders: [],
  posCart: []
};

function save(){
  localStorage.martie_cart = JSON.stringify(S.cart);
  localStorage.martie_user = JSON.stringify(S.user);
  localStorage.martie_points = String(S.points);
  localStorage.martie_orders = JSON.stringify(S.orders);
  if(S.token) localStorage.martie_token = S.token; else localStorage.removeItem('martie_token');
}
async function api(path,opt={}){
  const headers = {'content-type':'application/json',...(opt.headers||{})};
  if(S.token) headers.authorization = 'Bearer '+S.token;
  const response = await fetch(path,{...opt,headers});
  const data = await response.json().catch(()=>({}));
  if(!response.ok) throw Object.assign(new Error(data.error||'Error'),{status:response.status,data});
  return data;
}
const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(Number(n||0));
const fmtDate = value => value ? new Date(value).toLocaleString('es-MX',{timeZone:'America/Merida',dateStyle:'medium',timeStyle:'short'}) : '—';
const fmtShortDate = value => value ? new Date(value).toLocaleDateString('es-MX',{timeZone:'America/Merida',day:'2-digit',month:'short'}) : '—';
function emojiFor(c=''){if(c.includes('Pan'))return'🥐';if(c.includes('Frí'))return'🧊';if(c.includes('Comida'))return'🥪';return'☕'}
function safePhoto(value){const s=String(value||'');return /^https:\/\//i.test(s)||/^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(s)?s:''}
function photo(p){const url=safePhoto(p.image_url);return url?`<img src="${esc(url)}" alt="${esc(p.name)}" loading="lazy" referrerpolicy="no-referrer">`:esc(p.emoji||emojiFor(p.category))}
function statusText(s){return ({pending:'Pendiente',confirmed:'Confirmado',preparing:'Preparando',ready:'Listo',completed:'Completado',cancelled:'Cancelado'})[s]||s}
function paymentText(s){return ({cash:'Efectivo',card:'Tarjeta en terminal',transfer:'Transferencia'})[s]||s}
function sourceText(s){return s==='pos'?'Mostrador':'App'}
function message(target,text,type=''){const el=$(target);if(!el)return;el.textContent=text;el.className=type?`notice ${type}`:'muted';}

async function boot(){
  try{
    const health = await api('/api/health');
    S.demo = !health.db;
    if(health.db){
      const menu = await api('/api/menu');
      S.products = menu.products.map(p=>({...p,emoji:emojiFor(p.category)}));
      if(S.token) await syncMe();
    }
  }catch{ S.demo = true; }
  render();
}
async function syncMe(){
  try{
    const me = await api('/api/me');
    S.user = me.user; S.points = me.points; S.birthday = me.birthday || null; save();
  }catch(e){ if(e.status===401){S.token='';S.user=null;save();} }
}

function customerNav(){
  const items=[['home','⌂','Inicio'],['menu','☕','Menú'],['club','★','Club'],['orders','▤','Pedidos'],['profile','●','Perfil']];
  return `<nav class="nav">${items.map(([id,ico,label])=>`<button data-route="${id}" class="${S.route===id?'active':''}"><span class="ico">${ico}</span>${label}</button>`).join('')}</nav>`;
}
function header(title='MARTIE',tag='MOMENTOS QUE SABEN MEJOR'){
  return `<div class="row between topbar"><div><div class="brand">${title}</div><div class="tag">${tag}</div></div><span class="pill">${S.demo?'Modo demo':'En línea'}</span></div>`;
}
function layout(content){
  app.innerHTML = `<main class="app">${header()}${content}</main>${customerNav()}`;
  bindNav(); bindCustomerCommon();
}
function bindNav(){ $$('[data-route]').forEach(b=>b.onclick=()=>{S.route=b.dataset.route;render();}); }
function bindCustomerCommon(){
  $$('[data-add]').forEach(b=>b.onclick=()=>add(b.dataset.add));
  $$('[data-minus]').forEach(b=>b.onclick=()=>remove(b.dataset.minus));
  const checkoutBtn=$('[data-checkout]'); if(checkoutBtn) checkoutBtn.onclick=checkout;
}
function render(){
  if(!S.user) return renderAuth();
  if(['admin','staff'].includes(S.user.role)) return renderAdmin();
  if(S.route==='home') return home();
  if(S.route==='menu') return menu();
  if(S.route==='club') return club();
  if(S.route==='orders') return orders();
  return profile();
}

function renderAuth(){
  app.innerHTML=`<main class="app auth"><section class="auth-box">
    <div class="logo-cup">☕</div><div class="center"><h1 class="auth-title">Bienvenido a Martie</h1><p class="muted">Tu café, tus pedidos y tus puntos en un solo lugar.</p></div>
    <div class="card"><input id="name" class="input" placeholder="Nombre (solo para registro)"><input id="email" class="input" type="email" autocomplete="email" placeholder="Correo">
    <input id="pass" class="input" type="password" autocomplete="current-password" placeholder="Contraseña"><button id="login" class="btn full">Entrar</button>
    <button id="register" class="btn secondary full gap-top">Crear cuenta</button><button id="demo" class="btn ghost full gap-top">Entrar en modo demo</button><p id="msg" class="muted center"></p></div>
  </section></main>`;
  $('#login').onclick=login; $('#register').onclick=register;
  $('#demo').onclick=()=>{S.demo=true;S.user={id:'demo',name:$('#name').value||'Invitado Martie',email:'demo@martie.mx',role:'customer',created_at:new Date().toISOString()};save();render();};
}
async function login(){
  message('#msg','Entrando…');
  try{const d=await api('/api/auth/login',{method:'POST',body:JSON.stringify({email:$('#email').value,password:$('#pass').value})});S.token=d.token;S.user=d.user;S.demo=false;save();await syncMe();render();}
  catch(e){message('#msg',e.status===503?'D1 aún no está disponible. Puedes usar el modo demo.':e.message);}
}
async function register(){
  message('#msg','Creando cuenta…');
  try{const d=await api('/api/auth/register',{method:'POST',body:JSON.stringify({name:$('#name').value,email:$('#email').value,password:$('#pass').value})});S.token=d.token;S.user=d.user;S.demo=false;save();await syncMe();render();}
  catch(e){message('#msg',e.message);}
}

function home(){
  const first=(S.user.name||'Martie').split(' ')[0].toUpperCase();
  layout(`<section class="hero"><span class="tag hero-tag">HOLA, ${esc(first)}</span><h1>Tu momento Martie empieza aquí.</h1><p>Pide, acumula puntos y disfruta sin complicaciones.</p><div class="bubble">☕</div></section>
  <div class="admin-grid"><div class="card metric"><span class="muted">Tus puntos</span><strong>${S.points}</strong></div><div class="card metric"><span class="muted">En carrito</span><strong>${S.cart.reduce((s,x)=>s+x.qty,0)}</strong></div></div>
  <div class="section-title"><h2>Favoritos</h2><button class="btn ghost" data-route="menu">Ver menú</button></div><div class="grid">${S.products.slice(0,4).map(productCard).join('')}</div>${cartBar()}`);
}
function productCard(p){
  const cartItem=S.cart.find(x=>x.product_id===p.id);
  return `<article class="card product"><div class="pic">${photo(p)}</div><div><strong>${esc(p.name)}</strong><div class="muted">${esc(p.category)}</div>${p.description?`<div class="muted product-desc">${esc(p.description)}</div>`:''}</div>
    <div class="row between"><span class="price">${money(p.price)}</span>${cartItem?`<div class="qty"><button class="qty-btn" data-minus="${esc(p.id)}">−</button><b>${cartItem.qty}</b><button class="qty-btn" data-add="${esc(p.id)}">+</button></div>`:`<button class="btn secondary" data-add="${esc(p.id)}">+</button>`}</div></article>`;
}
function menu(){
  const cats=[...new Set(S.products.map(x=>x.category))];
  layout(`<div class="section-title"><div><h2>Menú</h2><p class="muted">Disponible hoy</p></div><span class="pill">${S.products.length} productos</span></div>${cats.map(c=>`<h3>${esc(c)}</h3><div class="grid">${S.products.filter(p=>p.category===c).map(productCard).join('')}</div>`).join('')}${cartBar()}`);
}
function add(id){const p=S.products.find(x=>x.id===id);if(!p)return;const i=S.cart.find(x=>x.product_id===id);if(i)i.qty=Math.min(20,i.qty+1);else S.cart.push({product_id:id,name:p.name,price:Number(p.price),qty:1});save();render();}
function remove(id){const i=S.cart.find(x=>x.product_id===id);if(!i)return;i.qty--;if(i.qty<=0)S.cart=S.cart.filter(x=>x.product_id!==id);save();render();}
function cartBar(){if(!S.cart.length)return'';const total=S.cart.reduce((s,x)=>s+x.price*x.qty,0);return `<div class="cartbar"><span>${S.cart.reduce((s,x)=>s+x.qty,0)} productos · <b>${money(total)}</b></span><button class="btn secondary" data-checkout>Finalizar</button></div>`;}
function demoSlots(){const out=[];let d=new Date(Date.now()+40*60000);d.setMinutes(Math.ceil(d.getMinutes()/15)*15,0,0);for(let i=0;i<12;i++){out.push(new Date(d));d=new Date(d.getTime()+15*60000);}return out.map(x=>x.toISOString());}
async function checkout(){
  if(!S.cart.length) return;
  layout(`<div class="section-title"><h2>Finalizar pedido</h2><span class="pill">Paso final</span></div><div class="card checkout-card"><div id="checkout-items">${S.cart.map(x=>`<div class="row between order-line"><span>${x.qty} × ${esc(x.name)}</span><span>${money(x.qty*x.price)}</span></div>`).join('')}</div><hr class="sep"><div class="row between total-line"><b>Total</b><b>${money(S.cart.reduce((s,x)=>s+x.price*x.qty,0))}</b></div>
    <label>¿Cómo lo quieres?</label><select id="fulfillment" class="input"><option value="pickup">Recoger en Martie</option><option value="delivery">Entrega a domicilio</option></select>
    <div id="address-wrap" class="hidden"><label>Dirección de entrega</label><input id="address" class="input" placeholder="Calle, número, colonia y referencias"></div>
    <label>Horario</label><select id="scheduled" class="input"><option>Cargando horarios…</option></select>
    <label>Forma de pago</label><select id="payment" class="input"><option value="cash">Efectivo</option><option value="card">Tarjeta en terminal al recibir/recoger</option><option value="transfer">Transferencia</option></select>
    <label>Notas</label><textarea id="notes" class="input" placeholder="Ej. sin azúcar, tocar timbre, etc."></textarea>
    <div class="notice">Martie opera de lunes a viernes, de 9:00 a 19:00. El primer horario se calcula a partir de 40 minutos y después avanza en bloques de 15 minutos.</div>
    <p id="checkout-msg" class="muted"></p><button id="place" class="btn full">Confirmar pedido</button></div>`);
  $('#fulfillment').onchange=()=>$('#address-wrap').classList.toggle('hidden',$('#fulfillment').value!=='delivery');
  let slots=[]; try{slots=S.demo?demoSlots():(await api('/api/slots')).slots;}catch{slots=demoSlots();}
  $('#scheduled').innerHTML=slots.map(s=>`<option value="${esc(s)}">${fmtDate(s)}</option>`).join('');
  $('#place').onclick=placeOrder;
}
async function placeOrder(){
  const fulfillment=$('#fulfillment').value; const address=$('#address')?.value||'';
  if(fulfillment==='delivery'&&address.trim().length<8){message('#checkout-msg','Agrega una dirección completa para la entrega.');return;}
  const payload={items:S.cart,fulfillment,address,payment_method:$('#payment').value,scheduled_at:$('#scheduled').value,notes:$('#notes').value};
  $('#place').disabled=true; message('#checkout-msg','Registrando pedido…');
  try{
    let order;
    const total=S.cart.reduce((s,x)=>s+x.price*x.qty,0);
    if(S.demo){order={order_id:'DEMO-'+Date.now(),total,points_earned:Math.floor(total/10),scheduled_at:payload.scheduled_at};S.orders.unshift({id:order.order_id,total,status:'pending',created_at:new Date().toISOString(),payment_method:payload.payment_method});}
    else order=await api('/api/orders',{method:'POST',body:JSON.stringify(payload)});
    S.points+=Number(order.points_earned||0);S.cart=[];save();
    const transfer=payload.payment_method==='transfer';
    layout(`<div class="card center success-card"><div class="success-icon">✓</div><h2>Pedido recibido</h2><p>Tu orden <b>#${esc(order.order_id.slice(0,8))}</b> quedó registrada.</p><p class="muted">Horario estimado: ${fmtDate(order.scheduled_at)}</p>
      ${transfer?'<div class="notice">Envía tu comprobante por WhatsApp para confirmar la transferencia.</div>':'<div class="notice success">Para efectivo o tarjeta, abre WhatsApp para confirmar el pedido.</div>'}
      <button id="wa" class="btn full gap-top">Abrir WhatsApp</button><button class="btn ghost full gap-top" data-route="home">Volver al inicio</button></div>`);
    $('#wa').onclick=()=>window.open(`https://wa.me/529993596815?text=${encodeURIComponent('Hola Martie, quiero confirmar mi pedido '+order.order_id+(transfer?' y enviar mi comprobante de transferencia.':'.'))}`,'_blank');
    bindNav();
  }catch(e){message('#checkout-msg',e.message);$('#place').disabled=false;}
}

async function club(){
  if(!S.demo){try{const d=await api('/api/loyalty');S.points=d.points;S.loyalty=d.ledger||[];S.birthday=d.birthday||S.birthday;save();}catch{}}
  const birthday=S.birthday||{eligible:false,redeemed:false,reason:'Agrega tu fecha de nacimiento para activar tu beneficio.'};
  layout(`<div class="section-title"><h2>Martie Club</h2><span class="pill">$100 = 10 puntos</span></div><div class="card center club-card"><div class="muted">Saldo del ciclo actual</div><div class="points">${S.points}</div><p>Puntos Martie</p><div class="notice ${birthday.eligible?'success':''}">${esc(birthday.reason||'')}</div></div>
    <div class="section-title"><h2>Movimientos</h2></div><div class="ledger">${S.loyalty.length?S.loyalty.map(x=>`<div class="item row between"><div><b>${esc(x.description||x.type)}</b><div class="muted">${fmtDate(x.created_at)}</div></div><strong class="${Number(x.points)<0?'negative':''}">${Number(x.points)>0?'+':''}${Number(x.points)}</strong></div>`).join(''):'<div class="card center"><p class="muted">Tus movimientos aparecerán aquí.</p></div>'}</div>
    <div class="section-title"><h2>Reglas</h2></div><div class="card"><p><b>Acumulación:</b> cada $100 MXN equivalen a 10 puntos.</p><p><b>Ciclo:</b> los puntos se administran por año.</p><p><b>Cumpleaños:</b> bebida gratis durante tu mes de cumpleaños cuando tu cuenta tenga al menos 3 meses de antigüedad.</p></div>`);
}
async function orders(){
  if(!S.demo){try{S.orders=(await api('/api/orders')).orders;}catch{}}
  layout(`<div class="section-title"><h2>Mis pedidos</h2><span class="pill">${S.orders.length}</span></div><div class="orders">${S.orders.length?S.orders.map(o=>`<div class="item"><div class="row between"><b>#${esc(String(o.id).slice(0,8))}</b><span class="pill status-${esc(o.status)}">${esc(statusText(o.status))}</span></div><div class="muted">${fmtDate(o.created_at)} · ${money(o.total)}</div><div class="muted">${paymentText(o.payment_method)}${o.scheduled_at?' · '+fmtDate(o.scheduled_at):''}</div></div>`).join(''):'<div class="card center"><p>Aún no tienes pedidos.</p></div>'}</div>`);
}
function profile(){
  layout(`<div class="section-title"><h2>Mi perfil</h2></div><div class="card"><label>Nombre</label><input id="pname" class="input" value="${esc(S.user.name||'')}"><label>Correo</label><input class="input" value="${esc(S.user.email||'')}" disabled><label>Teléfono</label><input id="pphone" class="input" value="${esc(S.user.phone||'')}"><label>Fecha de nacimiento</label><input id="pbirth" type="date" class="input" value="${esc(S.user.birthdate||'')}"><p id="profile-msg" class="muted"></p><button id="saveprofile" class="btn full">Guardar cambios</button><button id="logout" class="btn ghost full gap-top">Cerrar sesión</button></div>`);
  $('#saveprofile').onclick=saveProfile;$('#logout').onclick=logout;
}
async function saveProfile(){
  const payload={name:$('#pname').value.trim(),phone:$('#pphone').value.trim(),birthdate:$('#pbirth').value};
  if(!payload.name){message('#profile-msg','El nombre es obligatorio.');return;}
  $('#saveprofile').disabled=true;
  try{if(!S.demo)await api('/api/me',{method:'PATCH',body:JSON.stringify(payload)});Object.assign(S.user,payload);save();if(!S.demo)await syncMe();message('#profile-msg','Cambios guardados.','success');}
  catch(e){message('#profile-msg',e.message);}finally{$('#saveprofile').disabled=false;}
}
function logout(){S.user=null;S.token='';S.cart=[];save();render();}

const adminTabs=[['dashboard','Dashboard'],['sale','Nueva venta'],['customers','Clientes'],['products','Productos'],['analytics','Analytics']];
function adminShell(content){
  app.innerHTML=`<main class="app admin-app"><div class="row between topbar"><div><div class="brand">MARTIE ADMIN</div><div class="tag">OPERACIÓN</div></div><button id="logout" class="btn ghost">Salir</button></div>
  <div class="admin-tabs">${adminTabs.map(([id,label])=>`<button data-admin="${id}" class="btn ${S.adminSection===id?'':'ghost'}">${label}</button>`).join('')}</div>${content}</main>`;
  $('#logout').onclick=logout;$$('[data-admin]').forEach(b=>b.onclick=()=>{S.adminSection=b.dataset.admin;renderAdmin();});
}
async function renderAdmin(){
  if(S.adminSection==='dashboard') return adminDashboard();
  if(S.adminSection==='sale') return adminSale();
  if(S.adminSection==='customers') return adminCustomers();
  if(S.adminSection==='products') return adminProducts();
  return adminAnalytics();
}
async function adminDashboard(){
  adminShell('<p class="muted">Cargando operación…</p>');
  try{
    const [summary,orders]=await Promise.all([api('/api/admin/summary'),api('/api/admin/orders')]);S.adminOrders=orders.orders||[];
    adminShell(`<div class="section-title"><div><h2>Dashboard</h2><p class="muted">Operación de hoy</p></div><button class="btn secondary" data-admin="sale">+ Nueva venta</button></div>
      <div class="admin-grid"><div class="card metric"><span class="muted">Ventas hoy</span><strong>${money(summary.sales_today)}</strong></div><div class="card metric"><span class="muted">Pedidos</span><strong>${summary.orders_today}</strong></div><div class="card metric"><span class="muted">Clientes</span><strong>${summary.customers}</strong></div><div class="card metric"><span class="muted">Pendientes</span><strong>${summary.pending}</strong></div></div>
      <div class="section-title"><h2>Pedidos recientes</h2><span class="pill">${S.adminOrders.length}</span></div><div class="orders">${S.adminOrders.slice(0,30).map(adminOrderCard).join('')||'<div class="card">Sin pedidos todavía.</div>'}</div>`);
    $$('[data-admin]').forEach(b=>b.onclick=()=>{S.adminSection=b.dataset.admin;renderAdmin();});bindOrderStatuses();
  }catch(e){adminShell(`<div class="notice">${esc(e.message)}</div>`);}
}
function adminOrderCard(o){
  const states=['pending','confirmed','preparing','ready','completed','cancelled'];
  return `<div class="item admin-order"><div class="row between"><div><b>${esc(o.customer_name||'Cliente')} · ${money(o.total)}</b><div class="muted">#${esc(String(o.id).slice(0,8))} · ${fmtDate(o.created_at)}</div></div><span class="pill">${sourceText(o.source)}</span></div><div class="row admin-order-bottom"><span class="muted">${paymentText(o.payment_method)} · ${o.fulfillment==='delivery'?'Entrega':'Pickup'}</span><select data-status-order="${esc(o.id)}" class="input compact">${states.map(s=>`<option value="${s}" ${s===o.status?'selected':''}>${statusText(s)}</option>`).join('')}</select></div></div>`;
}
function bindOrderStatuses(){$$('[data-status-order]').forEach(s=>s.onchange=async()=>{s.disabled=true;try{await api('/api/admin/orders/'+encodeURIComponent(s.dataset.statusOrder),{method:'PATCH',body:JSON.stringify({status:s.value})});}catch(e){alert(e.message);}finally{renderAdmin();}});}

async function ensureAdminCatalog(){
  if(!S.adminProducts.length) S.adminProducts=(await api('/api/admin/products')).products||[];
  if(!S.adminCustomers.length) S.adminCustomers=(await api('/api/admin/customers')).customers||[];
}
async function adminSale(){
  adminShell('<p class="muted">Cargando punto de venta…</p>');
  try{await ensureAdminCatalog();renderPOS();}catch(e){adminShell(`<div class="notice">${esc(e.message)}</div>`);}
}
function renderPOS(note=''){
  const total=S.posCart.reduce((s,x)=>s+x.price*x.qty,0);
  adminShell(`<div class="section-title"><div><h2>Nueva venta</h2><p class="muted">Venta rápida de mostrador</p></div><span class="pill">${S.posCart.reduce((s,x)=>s+x.qty,0)} artículos</span></div>${note?`<div class="notice success">${esc(note)}</div>`:''}
  <div class="pos-layout"><section><div class="grid pos-products">${S.adminProducts.filter(p=>p.available).map(p=>`<button class="card pos-product" data-pos-add="${esc(p.id)}"><div class="pic">${photo(p)}</div><b>${esc(p.name)}</b><span class="price">${money(p.price)}</span></button>`).join('')}</div></section>
  <aside class="card pos-ticket"><h3>Ticket</h3>${S.posCart.length?S.posCart.map(x=>`<div class="row between ticket-line"><div><b>${esc(x.name)}</b><div class="muted">${x.qty} × ${money(x.price)}</div></div><div class="qty"><button class="qty-btn" data-pos-minus="${esc(x.product_id)}">−</button><b>${x.qty}</b><button class="qty-btn" data-pos-add="${esc(x.product_id)}">+</button></div></div>`).join(''):'<p class="muted">Agrega productos para comenzar.</p>'}<hr class="sep"><div class="row between total-line"><b>Total</b><b>${money(total)}</b></div>
    <label>Cliente (opcional)</label><select id="pos-customer" class="input"><option value="">Venta mostrador · sin puntos</option>${S.adminCustomers.map(c=>`<option value="${esc(c.id)}">${esc(c.name)} · ${esc(c.phone||c.email)}</option>`).join('')}</select>
    <label>Forma de pago</label><select id="pos-payment" class="input"><option value="cash">Efectivo</option><option value="card">Tarjeta en terminal</option><option value="transfer">Transferencia</option></select><textarea id="pos-notes" class="input" placeholder="Notas de la venta"></textarea><p id="pos-msg" class="muted"></p><button id="complete-sale" class="btn full" ${S.posCart.length?'':'disabled'}>Cobrar ${money(total)}</button></aside></div>`);
  $$('[data-pos-add]').forEach(b=>b.onclick=()=>{const p=S.adminProducts.find(x=>x.id===b.dataset.posAdd);const i=S.posCart.find(x=>x.product_id===p.id);if(i)i.qty=Math.min(20,i.qty+1);else S.posCart.push({product_id:p.id,name:p.name,price:Number(p.price),qty:1});renderPOS();});
  $$('[data-pos-minus]').forEach(b=>b.onclick=()=>{const i=S.posCart.find(x=>x.product_id===b.dataset.posMinus);if(!i)return;i.qty--;if(i.qty<=0)S.posCart=S.posCart.filter(x=>x.product_id!==i.product_id);renderPOS();});
  $('#complete-sale').onclick=completeSale;
}
async function completeSale(){
  if(!S.posCart.length)return;const btn=$('#complete-sale');btn.disabled=true;message('#pos-msg','Registrando venta…');
  const payload={items:S.posCart,customer_id:$('#pos-customer').value||null,payment_method:$('#pos-payment').value,notes:$('#pos-notes').value};
  try{const d=await api('/api/admin/sales',{method:'POST',body:JSON.stringify(payload)});S.posCart=[];renderPOS(`Venta #${d.order_id.slice(0,8)} registrada por ${money(d.total)}${d.points_earned?` · +${d.points_earned} puntos`:''}.`);}
  catch(e){message('#pos-msg',e.message);btn.disabled=false;}
}

async function adminCustomers(query=''){
  adminShell(`<div class="section-title"><h2>Clientes</h2></div><div class="card"><div class="row"><input id="customer-search" class="input no-margin" placeholder="Buscar por nombre, correo o teléfono" value="${esc(query)}"><button id="search-customers" class="btn">Buscar</button></div></div><p class="muted">Cargando clientes…</p>`);
  try{const d=await api('/api/admin/customers'+(query?'?q='+encodeURIComponent(query):''));S.adminCustomers=d.customers||[];showCustomers(query);}catch(e){adminShell(`<div class="notice">${esc(e.message)}</div>`);}
}
function showCustomers(query=''){
  adminShell(`<div class="section-title"><div><h2>Clientes</h2><p class="muted">${S.adminCustomers.length} resultados</p></div></div><div class="card search-card"><div class="row"><input id="customer-search" class="input no-margin" placeholder="Buscar por nombre, correo o teléfono" value="${esc(query)}"><button id="search-customers" class="btn">Buscar</button></div></div><div class="customer-list">${S.adminCustomers.map(c=>`<article class="card customer-card"><div class="row between"><div><h3>${esc(c.name)}</h3><div class="muted">${esc(c.phone||'Sin teléfono')} · ${esc(c.email)}</div></div><span class="pill">${Number(c.points||0)} pts</span></div><div class="customer-metrics"><div><span>Compras</span><b>${Number(c.orders_count||0)}</b></div><div><span>Gastado</span><b>${money(c.total_spent)}</b></div><div><span>Alta</span><b>${fmtShortDate(c.created_at)}</b></div></div><div class="notice ${c.birthday?.eligible?'success':''}">${esc(c.birthday?.reason||'')}</div>${c.birthday?.eligible?`<button class="btn secondary gap-top" data-redeem-birthday="${esc(c.id)}">Marcar bebida de cumpleaños como entregada</button>`:''}</article>`).join('')||'<div class="card center"><p>No encontramos clientes.</p></div>'}</div>`);
  $('#search-customers').onclick=()=>adminCustomers($('#customer-search').value.trim());$('#customer-search').onkeydown=e=>{if(e.key==='Enter')adminCustomers($('#customer-search').value.trim());};
  $$('[data-redeem-birthday]').forEach(b=>b.onclick=async()=>{if(!confirm('¿Confirmar que ya se entregó la bebida de cumpleaños?'))return;b.disabled=true;try{await api('/api/admin/customers/'+encodeURIComponent(b.dataset.redeemBirthday)+'/birthday',{method:'POST'});adminCustomers(query);}catch(e){alert(e.message);b.disabled=false;}});
}

async function adminProducts(){
  adminShell('<p class="muted">Cargando productos…</p>');
  try{S.adminProducts=(await api('/api/admin/products')).products||[];showProducts();}catch(e){adminShell(`<div class="notice">${esc(e.message)}</div>`);}
}
function showProducts(note=''){
  adminShell(`<div class="section-title"><div><h2>Productos</h2><p class="muted">${S.adminProducts.length} artículos</p></div><button id="new-product" class="btn">Agregar producto</button></div>${note?`<div class="notice success">${esc(note)}</div>`:''}<div class="grid catalog-grid">${S.adminProducts.map(p=>`<article class="card product"><div class="pic">${photo(p)}</div><strong>${esc(p.name)}</strong><span class="muted">${esc(p.category)}</span><span class="price">${money(p.price)}</span><span class="pill">${p.available?'Disponible':'Oculto'}</span><button class="btn secondary" data-edit-product="${esc(p.id)}">Editar</button></article>`).join('')||'<p>Aún no hay productos.</p>'}</div>`);
  $('#new-product').onclick=()=>editProduct();$$('[data-edit-product]').forEach(b=>b.onclick=()=>editProduct(S.adminProducts.find(p=>p.id===b.dataset.editProduct)));
}
function editProduct(existing){
  const p=existing||{name:'',description:'',category:'Café',price:'',image_url:'',available:1,sort_order:100};let imageData=p.image_url||'',processing=false;
  adminShell(`<div class="section-title"><h2>${existing?'Editar producto':'Agregar producto'}</h2></div><form id="product-form" class="card product-form"><div><label>Nombre</label><input id="product-name" class="input" required maxlength="120" value="${esc(p.name)}"><label>Categoría</label><input id="product-category" class="input" required maxlength="80" value="${esc(p.category)}"><label>Descripción</label><textarea id="product-description" class="input" maxlength="2000">${esc(p.description||'')}</textarea><label>Precio (MXN)</label><input id="product-price" class="input" type="number" min="0" max="1000000" step="0.01" required value="${esc(p.price)}"><label>Orden</label><input id="product-sort" class="input" type="number" min="0" max="99999" step="1" required value="${esc(p.sort_order)}"><label class="row"><input id="product-available" type="checkbox" ${p.available?'checked':''}> Disponible</label></div><div><label>Foto</label><input id="product-photo" class="input" type="file" accept="image/jpeg,image/png,image/webp"><p class="muted">JPG, PNG o WebP de hasta 10 MB.</p><div id="product-preview" class="pic photo-preview">${photo(p)}</div><button id="remove-photo" class="btn ghost" type="button">Quitar foto</button></div><div class="form-actions"><p id="product-message" class="muted"></p><button id="save-product" class="btn" type="submit">Guardar producto</button> <button id="cancel-product" class="btn ghost" type="button">Cancelar</button></div></form>`);
  const preview=()=>{$('#product-preview').innerHTML=photo({name:$('#product-name').value,image_url:imageData,category:$('#product-category').value});};
  $('#remove-photo').onclick=()=>{imageData='';$('#product-photo').value='';preview();};
  $('#product-photo').onchange=async()=>{const file=$('#product-photo').files[0];if(!file)return;processing=true;$('#save-product').disabled=true;message('#product-message','Preparando foto…');try{imageData=await resizeProductPhoto(file);preview();message('#product-message','Foto lista. Guarda para publicarla.','success');}catch(e){message('#product-message',e.message);}finally{processing=false;$('#save-product').disabled=false;}};
  $('#cancel-product').onclick=showProducts;
  $('#product-form').onsubmit=async e=>{e.preventDefault();if(processing)return;const payload={name:$('#product-name').value.trim(),category:$('#product-category').value.trim(),description:$('#product-description').value.trim(),price:Number($('#product-price').value),sort_order:Number($('#product-sort').value),available:$('#product-available').checked?1:0,image_url:imageData};$('#save-product').disabled=true;message('#product-message','Guardando…');try{await api('/api/admin/products'+(existing?'/'+encodeURIComponent(existing.id):''),{method:existing?'PATCH':'POST',body:JSON.stringify(payload)});S.adminProducts=(await api('/api/admin/products')).products||[];S.products=(await api('/api/menu')).products||[];showProducts('Producto guardado y menú actualizado.');}catch(err){message('#product-message',err.message);$('#save-product').disabled=false;}};
}
async function resizeProductPhoto(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw new Error('Elige una foto JPG, PNG o WebP de hasta 10 MB.');
  const bitmap=await createImageBitmap(file);try{const canvas=document.createElement('canvas');let size=640;for(let attempt=0;attempt<5;attempt++){const scale=Math.min(1,size/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);const data=canvas.toDataURL('image/jpeg',0.72);if(data.length<=85000)return data;size=Math.round(size*.75);}throw new Error('No se pudo reducir esta foto. Prueba con una más pequeña.');}finally{bitmap.close();}
}

async function adminAnalytics(){
  adminShell('<p class="muted">Calculando analytics…</p>');
  try{const d=await api('/api/admin/analytics');adminShell(`<div class="section-title"><div><h2>Analytics</h2><p class="muted">Resumen de operación</p></div></div><div class="admin-grid"><div class="card metric"><span class="muted">Ventas 7 días</span><strong>${money(d.seven.sales)}</strong><small>${d.seven.orders} pedidos</small></div><div class="card metric"><span class="muted">Ticket prom. 7 días</span><strong>${money(d.seven.avg_ticket)}</strong></div><div class="card metric"><span class="muted">Ventas 30 días</span><strong>${money(d.thirty.sales)}</strong><small>${d.thirty.orders} pedidos</small></div><div class="card metric"><span class="muted">Ticket prom. 30 días</span><strong>${money(d.thirty.avg_ticket)}</strong></div></div>
    <div class="analytics-grid"><section class="card"><h3>Últimos 7 días</h3><div class="analytics-bars">${d.by_day.map(x=>`<div class="bar-row"><span>${esc(x.day.slice(5))}</span><div class="bar"><i style="width:${Math.max(4,Math.min(100,(Number(x.sales)/(Math.max(...d.by_day.map(y=>Number(y.sales)),1)))*100))}%"></i></div><b>${money(x.sales)}</b></div>`).join('')||'<p class="muted">Sin ventas.</p>'}</div></section><section class="card"><h3>Productos más vendidos · 30 días</h3>${d.top_products.map((x,i)=>`<div class="row between rank-line"><span><b>#${i+1}</b> ${esc(x.name)}</span><span>${x.qty} uds · ${money(x.revenue)}</span></div>`).join('')||'<p class="muted">Sin datos.</p>'}</section><section class="card"><h3>Origen de ventas</h3>${d.by_source.map(x=>`<div class="row between rank-line"><span>${sourceText(x.source)}</span><span>${x.orders} · ${money(x.sales)}</span></div>`).join('')||'<p class="muted">Sin datos.</p>'}</section></div>`);}catch(e){adminShell(`<div class="notice">${esc(e.message)}</div>`);}
}

app.addEventListener('error',event=>{if(event.target?.tagName==='IMG'){const fallback=document.createElement('span');fallback.textContent='☕';event.target.replaceWith(fallback);}},true);
boot();
