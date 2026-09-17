interface Env {
  ASSETS: Fetcher;
  DB?: D1Database;
}

type Json = Record<string, unknown>;

const TZ_OFFSET_MS = -6 * 60 * 60 * 1000; // Mérida, Yucatán (UTC-6)
const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });
const bad = (message: string, status = 400) => json({ ok: false, error: message }, status);
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 120000, hash: "SHA-256" }, key, 256);
  return `pbkdf2$120000$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(bits))}`;
}
async function verifyPassword(password: string, stored: string) {
  if (stored.startsWith("pbkdf2$")) {
    const [, roundsText, saltText, expected] = stored.split("$");
    const rounds = Number(roundsText);
    if (!rounds || !saltText || !expected) return false;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: base64ToBytes(saltText), iterations: rounds, hash: "SHA-256" }, key, 256);
    return bytesToBase64(new Uint8Array(bits)) === expected;
  }
  const [salt, hash] = stored.split("$");
  return !!salt && !!hash && (await sha256(`${salt}:${password}:martie-v2`)) === hash;
}
function bearer(request: Request) {
  const h = request.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}
async function body<T = Json>(request: Request): Promise<T> {
  try { return await request.json<T>(); } catch { throw new Error("JSON inválido"); }
}
function cleanText(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}
function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

async function sessionUser(request: Request, env: Env) {
  if (!env.DB) return null;
  const token = bearer(request);
  if (!token) return null;
  const tokenHash = await sha256(token);
  return env.DB.prepare(`
    SELECT u.id,u.name,u.email,u.phone,u.birthdate,u.role,u.created_at
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=?1 AND s.expires_at > ?2
  `).bind(tokenHash, now()).first<any>();
}
async function requireUser(request: Request, env: Env, admin = false) {
  const user = await sessionUser(request, env);
  if (!user) return { response: bad("Sesión no válida", 401) };
  if (admin && !["admin", "staff"].includes(user.role)) return { response: bad("Sin permisos", 403) };
  return { user };
}
async function createSession(userId: string, env: Env) {
  const token = `${uid()}${uid()}`.replace(/-/g, "");
  const tokenHash = await sha256(token);
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  await env.DB!.prepare("INSERT INTO sessions (id,user_id,token_hash,expires_at,created_at) VALUES (?1,?2,?3,?4,?5)")
    .bind(uid(), userId, tokenHash, expires, now()).run();
  return token;
}

function meridaDate(date = new Date()) {
  return new Date(date.getTime() + TZ_OFFSET_MS);
}
function meridaParts(date = new Date()) {
  const d = meridaDate(date);
  return {
    year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
    weekday: d.getUTCDay(), hour: d.getUTCHours(), minute: d.getUTCMinutes()
  };
}
function fromMerida(year: number, month: number, day: number, hour: number, minute: number) {
  return new Date(Date.UTC(year, month - 1, day, hour - TZ_OFFSET_MS / 3600000, minute, 0, 0));
}
function nextBusinessDay(date: Date) {
  let d = new Date(date);
  while ([0, 6].includes(meridaParts(d).weekday)) d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
  return d;
}
function firstAvailableSlot(base = new Date()) {
  let target = new Date(base.getTime() + 40 * 60 * 1000);
  let p = meridaParts(target);
  if ([0, 6].includes(p.weekday)) {
    target = nextBusinessDay(target);
    p = meridaParts(target);
    target = fromMerida(p.year, p.month, p.day, 9, 0);
  } else if (p.hour < 9) {
    target = fromMerida(p.year, p.month, p.day, 9, 0);
  } else if (p.hour > 19 || (p.hour === 19 && p.minute > 0)) {
    target = nextBusinessDay(new Date(fromMerida(p.year, p.month, p.day, 9, 0).getTime() + 24 * 60 * 60 * 1000));
    p = meridaParts(target);
    target = fromMerida(p.year, p.month, p.day, 9, 0);
  }
  p = meridaParts(target);
  const rounded = Math.ceil(p.minute / 15) * 15;
  target = fromMerida(p.year, p.month, p.day, p.hour, rounded);
  p = meridaParts(target);
  if (p.hour > 19 || (p.hour === 19 && p.minute > 0)) {
    const tomorrow = new Date(target.getTime() + 24 * 60 * 60 * 1000);
    const next = nextBusinessDay(tomorrow);
    const n = meridaParts(next);
    target = fromMerida(n.year, n.month, n.day, 9, 0);
  }
  return target;
}
function slotList(base = new Date(), count = 16) {
  const slots: string[] = [];
  let cursor = firstAvailableSlot(base);
  while (slots.length < count) {
    const p = meridaParts(cursor);
    if (![0, 6].includes(p.weekday) && p.hour >= 9 && (p.hour < 19 || (p.hour === 19 && p.minute === 0))) {
      slots.push(cursor.toISOString());
      cursor = new Date(cursor.getTime() + 15 * 60 * 1000);
      continue;
    }
    const next = nextBusinessDay(new Date(cursor.getTime() + 24 * 60 * 60 * 1000));
    const n = meridaParts(next);
    cursor = fromMerida(n.year, n.month, n.day, 9, 0);
  }
  return slots;
}
function validScheduledAt(value: unknown) {
  if (!value) return firstAvailableSlot().toISOString();
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  const first = firstAvailableSlot();
  if (d < first || d.getTime() > first.getTime() + 7 * 24 * 60 * 60 * 1000) return null;
  const p = meridaParts(d);
  if ([0, 6].includes(p.weekday) || p.hour < 9 || p.hour > 19 || (p.hour === 19 && p.minute !== 0) || p.minute % 15 !== 0) return null;
  return d.toISOString();
}
function currentCycleStart() {
  const p = meridaParts();
  return fromMerida(p.year, 1, 1, 0, 0).toISOString();
}
async function getPoints(env: Env, userId: string) {
  const r = await env.DB!.prepare("SELECT COALESCE(SUM(points),0) total FROM loyalty_ledger WHERE user_id=?1 AND created_at>=?2")
    .bind(userId, currentCycleStart()).first<any>();
  return Number(r?.total || 0);
}
async function birthdayStatus(env: Env, user: any) {
  if (!user.birthdate) return { eligible: false, redeemed: false, reason: "Agrega tu fecha de nacimiento en tu perfil." };
  const created = new Date(user.created_at);
  const ageMs = Date.now() - created.getTime();
  if (!Number.isFinite(ageMs) || ageMs < 90 * 24 * 60 * 60 * 1000) return { eligible: false, redeemed: false, reason: "El beneficio se activa después de 3 meses de antigüedad." };
  const birth = String(user.birthdate).split("-");
  const month = Number(birth[1]);
  const current = meridaParts();
  if (month !== current.month) return { eligible: false, redeemed: false, reason: "Tu bebida de cumpleaños estará disponible durante tu mes de cumpleaños." };
  const redeemed = await env.DB!.prepare("SELECT id FROM birthday_rewards WHERE user_id=?1 AND year=?2").bind(user.id, current.year).first();
  return { eligible: !redeemed, redeemed: !!redeemed, reason: redeemed ? "Beneficio de cumpleaños ya utilizado este año." : "Bebida de cumpleaños disponible." };
}

async function getMenu(env: Env, includeHidden = false) {
  if (!env.DB) return [];
  const where = includeHidden ? "" : "WHERE available=1";
  const r = await env.DB.prepare(`SELECT id,name,description,category,price,image_url,available,sort_order FROM products ${where} ORDER BY category,sort_order,name`).all<any>();
  return r.results || [];
}
function validProduct(b: any) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return false;
  if (typeof b.name !== "string" || !b.name.trim() || b.name.length > 120) return false;
  if (typeof b.category !== "string" || !b.category.trim() || b.category.length > 80) return false;
  if (typeof b.description !== "string" || b.description.length > 2000) return false;
  if (typeof b.price !== "number" || !Number.isFinite(b.price) || b.price < 0 || b.price > 1000000) return false;
  if (![0, 1].includes(b.available) || !Number.isInteger(b.sort_order) || b.sort_order < 0 || b.sort_order > 99999) return false;
  if (typeof b.image_url !== "string" || b.image_url.length > 85000) return false;
  if (b.image_url && !/^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(b.image_url)) {
    try { const u = new URL(b.image_url); if (u.protocol !== "https:" || u.username || u.password || b.image_url.length > 2048) return false; } catch { return false; }
  }
  return true;
}
async function normalizeItems(env: Env, items: any[]) {
  if (!Array.isArray(items) || !items.length) throw new Error("El carrito está vacío");
  const products = await getMenu(env);
  let total = 0;
  const normalized: any[] = [];
  for (const item of items) {
    const p: any = products.find((x: any) => x.id === String(item.product_id));
    if (!p) throw new Error("Uno de los productos ya no está disponible");
    const qtyRaw = Number(item.qty || 1);
    const qty = Math.max(1, Math.min(20, Number.isFinite(qtyRaw) ? Math.floor(qtyRaw) : 1));
    total += Number(p.price) * qty;
    normalized.push({ product_id: p.id, name: p.name, qty, unit_price: Number(p.price) });
  }
  return { total: Math.round(total * 100) / 100, normalized };
}
async function insertOrderItems(env: Env, orderId: string, items: any[]) {
  for (const i of items) {
    await env.DB!.prepare("INSERT INTO order_items (id,order_id,product_id,name,qty,unit_price) VALUES (?1,?2,?3,?4,?5,?6)")
      .bind(uid(), orderId, i.product_id, i.name, i.qty, i.unit_price).run();
  }
}
async function adjustOrderPoints(env: Env, orderId: string, userId: string, total: number, active: boolean, description: string) {
  const current = await env.DB!.prepare("SELECT COALESCE(SUM(points),0) total FROM loyalty_ledger WHERE order_id=?1").bind(orderId).first<any>();
  const desired = active ? Math.floor(total / 10) : 0;
  const delta = desired - Number(current?.total || 0);
  if (!delta) return 0;
  await env.DB!.prepare("INSERT INTO loyalty_ledger (id,user_id,order_id,points,type,description,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)")
    .bind(uid(), userId, orderId, delta, delta > 0 ? "earn" : "reversal", description, now()).run();
  return delta;
}
async function ensureWalkInUser(env: Env) {
  const email = "mostrador@martie.local";
  let user = await env.DB!.prepare("SELECT id,name,email,phone,birthdate,role,created_at FROM users WHERE email=?1").bind(email).first<any>();
  if (user) return user;
  const id = uid();
  const created = now();
  await env.DB!.prepare("INSERT INTO users (id,name,email,phone,birthdate,password_hash,role,created_at) VALUES (?1,'Venta mostrador',?2,'',NULL,?3,'customer',?4)")
    .bind(id, email, await hashPassword(uid()), created).run();
  return { id, name: "Venta mostrador", email, phone: "", birthdate: null, role: "customer", created_at: created };
}

async function handleApi(request: Request, env: Env, url: URL) {
  const path = url.pathname;
  if (path === "/api/health") return json({ ok: true, db: !!env.DB, version: "2.1.0" });
  if (!env.DB) return bad("Cloudflare D1 aún no está vinculado. La interfaz funciona en modo demo local.", 503);

  if (path === "/api/menu" && request.method === "GET") return json({ ok: true, products: await getMenu(env) });
  if (path === "/api/slots" && request.method === "GET") return json({ ok: true, slots: slotList(), timezone: "America/Merida" });

  if (path === "/api/auth/register" && request.method === "POST") {
    const b = await body<any>(request);
    const name = cleanText(b.name, 120);
    const email = cleanText(b.email, 254).toLowerCase();
    const password = String(b.password || "");
    if (!name || !validEmail(email) || password.length < 8) return bad("Nombre, correo válido y contraseña de mínimo 8 caracteres son obligatorios");
    const exists = await env.DB.prepare("SELECT id FROM users WHERE email=?1").bind(email).first();
    if (exists) return bad("Ese correo ya está registrado", 409);
    const id = uid();
    await env.DB.prepare("INSERT INTO users (id,name,email,phone,birthdate,password_hash,role,created_at) VALUES (?1,?2,?3,?4,?5,?6,'customer',?7)")
      .bind(id, name, email, cleanText(b.phone, 30), b.birthdate || null, await hashPassword(password), now()).run();
    const token = await createSession(id, env);
    return json({ ok: true, token, user: { id, name, email, role: "customer" } }, 201);
  }

  if (path === "/api/auth/login" && request.method === "POST") {
    const b = await body<any>(request);
    const email = cleanText(b.email, 254).toLowerCase();
    const user = await env.DB.prepare("SELECT * FROM users WHERE email=?1").bind(email).first<any>();
    if (!user || !(await verifyPassword(String(b.password || ""), user.password_hash))) return bad("Correo o contraseña incorrectos", 401);
    const token = await createSession(user.id, env);
    delete user.password_hash;
    return json({ ok: true, token, user });
  }

  if (path === "/api/me" && request.method === "GET") {
    const auth = await requireUser(request, env); if (auth.response) return auth.response;
    return json({ ok: true, user: auth.user, points: await getPoints(env, auth.user!.id), birthday: await birthdayStatus(env, auth.user) });
  }
  if (path === "/api/me" && request.method === "PATCH") {
    const auth = await requireUser(request, env); if (auth.response) return auth.response;
    const b = await body<any>(request);
    const name = cleanText(b.name || auth.user!.name, 120);
    const phone = cleanText(b.phone, 30);
    const birthdate = b.birthdate ? String(b.birthdate).slice(0, 10) : null;
    if (!name) return bad("El nombre es obligatorio");
    await env.DB.prepare("UPDATE users SET name=?1,phone=?2,birthdate=?3 WHERE id=?4").bind(name, phone, birthdate, auth.user!.id).run();
    return json({ ok: true });
  }

  if (path === "/api/orders" && request.method === "GET") {
    const auth = await requireUser(request, env); if (auth.response) return auth.response;
    const r = await env.DB.prepare("SELECT * FROM orders WHERE user_id=?1 ORDER BY created_at DESC LIMIT 50").bind(auth.user!.id).all<any>();
    return json({ ok: true, orders: r.results || [] });
  }
  if (path === "/api/orders" && request.method === "POST") {
    const auth = await requireUser(request, env); if (auth.response) return auth.response;
    const b = await body<any>(request);
    let normalized;
    try { normalized = await normalizeItems(env, b.items); } catch (e: any) { return bad(e.message, 409); }
    const fulfillment = b.fulfillment === "delivery" ? "delivery" : "pickup";
    const address = cleanText(b.address, 500);
    if (fulfillment === "delivery" && address.length < 8) return bad("Agrega una dirección de entrega válida");
    const payment = ["cash", "card", "transfer"].includes(b.payment_method) ? b.payment_method : "cash";
    const scheduled = validScheduledAt(b.scheduled_at);
    if (!scheduled) return bad("El horario seleccionado ya no está disponible. Elige otro horario.", 409);
    const orderId = uid();
    await env.DB.prepare(`INSERT INTO orders (id,user_id,status,fulfillment,payment_method,payment_status,total,address,notes,scheduled_at,created_at,source,created_by)
      VALUES (?1,?2,'pending',?3,?4,?5,?6,?7,?8,?9,?10,'app',NULL)`)
      .bind(orderId, auth.user!.id, fulfillment, payment, payment === "transfer" ? "awaiting_proof" : "pending", normalized.total,
        fulfillment === "delivery" ? address : null, cleanText(b.notes, 1000), scheduled, now()).run();
    await insertOrderItems(env, orderId, normalized.normalized);
    const earned = await adjustOrderPoints(env, orderId, auth.user!.id, normalized.total, true, `Compra #${orderId.slice(0, 8)}`);
    return json({ ok: true, order_id: orderId, total: normalized.total, points_earned: earned, scheduled_at: scheduled }, 201);
  }

  if (path === "/api/loyalty" && request.method === "GET") {
    const auth = await requireUser(request, env); if (auth.response) return auth.response;
    const ledger = await env.DB.prepare("SELECT * FROM loyalty_ledger WHERE user_id=?1 AND created_at>=?2 ORDER BY created_at DESC LIMIT 100")
      .bind(auth.user!.id, currentCycleStart()).all<any>();
    return json({ ok: true, points: await getPoints(env, auth.user!.id), ledger: ledger.results || [], rule: "100 pesos = 10 puntos", birthday: await birthdayStatus(env, auth.user) });
  }

  if (path === "/api/admin/summary" && request.method === "GET") {
    const auth = await requireUser(request, env, true); if (auth.response) return auth.response;
    const today = meridaParts();
    const dayStart = fromMerida(today.year, today.month, today.day, 0, 0).toISOString();
    const sales = await env.DB.prepare("SELECT COUNT(*) orders, COALESCE(SUM(CASE WHEN status!='cancelled' THEN total ELSE 0 END),0) sales FROM orders WHERE created_at>=?1").bind(dayStart).first<any>();
    const customers = await env.DB.prepare("SELECT COUNT(*) total FROM users WHERE role='customer' AND email!='mostrador@martie.local'").first<any>();
    const pending = await env.DB.prepare("SELECT COUNT(*) total FROM orders WHERE status IN ('pending','confirmed','preparing')").first<any>();
    return json({ ok: true, sales_today: Number(sales?.sales || 0), orders_today: Number(sales?.orders || 0), customers: Number(customers?.total || 0), pending: Number(pending?.total || 0) });
  }
  if (path === "/api/admin/orders" && request.method === "GET") {
    const auth = await requireUser(request, env, true); if (auth.response) return auth.response;
    const r = await env.DB.prepare(`SELECT o.*,u.name customer_name,u.phone customer_phone,u.email customer_email
      FROM orders o LEFT JOIN users u ON u.id=o.user_id ORDER BY o.created_at DESC LIMIT 150`).all<any>();
    return json({ ok: true, orders: r.results || [] });
  }
  const orderMatch = path.match(/^\/api\/admin\/orders\/([^/]+)$/);
  if (orderMatch && request.method === "PATCH") {
    const auth = await requireUser(request, env, true); if (auth.response) return auth.response;
    const b = await body<any>(request);
    const allowed = ["pending", "confirmed", "preparing", "ready", "completed", "cancelled"];
    if (!allowed.includes(b.status)) return bad("Estado inválido");
    const order = await env.DB.prepare("SELECT id,user_id,total,status FROM orders WHERE id=?1").bind(orderMatch[1]).first<any>();
    if (!order) return bad("Pedido no encontrado", 404);
    await env.DB.prepare("UPDATE orders SET status=?1 WHERE id=?2").bind(b.status, order.id).run();
    await adjustOrderPoints(env, order.id, order.user_id, Number(order.total), b.status !== "cancelled", b.status === "cancelled" ? `Cancelación #${order.id.slice(0, 8)}` : `Reactivación #${order.id.slice(0, 8)}`);
    return json({ ok: true });
  }

  if (path === "/api/admin/customers" && request.method === "GET") {
    const auth = await requireUser(request, env, true); if (auth.response) return auth.response;
    const q = cleanText(url.searchParams.get("q"), 120).toLowerCase();
    const like = `%${q}%`;
    const rows = await env.DB.prepare(`SELECT u.id,u.name,u.email,u.phone,u.birthdate,u.created_at,
      COUNT(DISTINCT o.id) orders_count,
      COALESCE(SUM(CASE WHEN o.status!='cancelled' THEN o.total ELSE 0 END),0) total_spent,
      COALESCE((SELECT SUM(l.points) FROM loyalty_ledger l WHERE l.user_id=u.id AND l.created_at>=?1),0) points
      FROM users u LEFT JOIN orders o ON o.user_id=u.id
      WHERE u.role='customer' AND u.email!='mostrador@martie.local' AND (?2='' OR lower(u.name) LIKE ?3 OR lower(u.email) LIKE ?3 OR lower(u.phone) LIKE ?3)
      GROUP BY u.id ORDER BY u.created_at DESC LIMIT 200`)
      .bind(currentCycleStart(), q, like).all<any>();
    const customers = [];
    for (const customer of rows.results || []) customers.push({ ...customer, birthday: await birthdayStatus(env, customer) });
    return json({ ok: true, customers });
  }
  const birthdayMatch = path.match(/^\/api\/admin\/customers\/([^/]+)\/birthday$/);
  if (birthdayMatch && request.method === "POST") {
    const auth = await requireUser(request, env, true); if (auth.response) return auth.response;
    const customer = await env.DB.prepare("SELECT id,name,email,phone,birthdate,role,created_at FROM users WHERE id=?1 AND role='customer'").bind(birthdayMatch[1]).first<any>();
    if (!customer) return bad("Cliente no encontrado", 404);
    const status = await birthdayStatus(env, customer);
    if (!status.eligible) return bad(status.reason || "Beneficio no disponible", 409);
    const year = meridaParts().year;
    await env.DB.prepare("INSERT INTO birthday_rewards (id,user_id,year,redeemed_at) VALUES (?1,?2,?3,?4)").bind(uid(), customer.id, year, now()).run();
    return json({ ok: true });
  }

  if (path === "/api/admin/sales" && request.method === "POST") {
    const auth = await requireUser(request, env, true); if (auth.response) return auth.response;
    const b = await body<any>(request);
    let normalized;
    try { normalized = await normalizeItems(env, b.items); } catch (e: any) { return bad(e.message, 409); }
    let customer: any = null;
    if (b.customer_id) customer = await env.DB.prepare("SELECT id,name,email FROM users WHERE id=?1 AND role='customer'").bind(String(b.customer_id)).first<any>();
    const walkIn = !customer;
    if (!customer) customer = await ensureWalkInUser(env);
    const payment = ["cash", "card", "transfer"].includes(b.payment_method) ? b.payment_method : "cash";
    const orderId = uid();
    await env.DB.prepare(`INSERT INTO orders (id,user_id,status,fulfillment,payment_method,payment_status,total,address,notes,scheduled_at,created_at,source,created_by)
      VALUES (?1,?2,'completed','pickup',?3,?4,?5,NULL,?6,?7,?7,'pos',?8)`)
      .bind(orderId, customer.id, payment, payment === "transfer" ? "awaiting_proof" : "paid", normalized.total, cleanText(b.notes, 1000), now(), auth.user!.id).run();
    await insertOrderItems(env, orderId, normalized.normalized);
    const pointsEarned = walkIn ? 0 : await adjustOrderPoints(env, orderId, customer.id, normalized.total, true, `Venta mostrador #${orderId.slice(0, 8)}`);
    return json({ ok: true, order_id: orderId, total: normalized.total, points_earned: pointsEarned, customer: walkIn ? null : customer }, 201);
  }

  if (path === "/api/admin/analytics" && request.method === "GET") {
    const auth = await requireUser(request, env, true); if (auth.response) return auth.response;
    const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const seven = await env.DB.prepare("SELECT COUNT(*) orders,COALESCE(SUM(total),0) sales,COALESCE(AVG(total),0) avg_ticket FROM orders WHERE status!='cancelled' AND created_at>=?1").bind(since7).first<any>();
    const thirty = await env.DB.prepare("SELECT COUNT(*) orders,COALESCE(SUM(total),0) sales,COALESCE(AVG(total),0) avg_ticket FROM orders WHERE status!='cancelled' AND created_at>=?1").bind(since30).first<any>();
    const byDay = await env.DB.prepare(`SELECT substr(created_at,1,10) day,COUNT(*) orders,ROUND(SUM(total),2) sales
      FROM orders WHERE status!='cancelled' AND created_at>=?1 GROUP BY substr(created_at,1,10) ORDER BY day`).bind(since7).all<any>();
    const top = await env.DB.prepare(`SELECT oi.name,SUM(oi.qty) qty,ROUND(SUM(oi.qty*oi.unit_price),2) revenue
      FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.status!='cancelled' AND o.created_at>=?1
      GROUP BY oi.name ORDER BY qty DESC,revenue DESC LIMIT 8`).bind(since30).all<any>();
    const source = await env.DB.prepare(`SELECT COALESCE(source,'app') source,COUNT(*) orders,ROUND(SUM(total),2) sales
      FROM orders WHERE status!='cancelled' AND created_at>=?1 GROUP BY COALESCE(source,'app')`).bind(since30).all<any>();
    return json({ ok: true, seven: { orders: Number(seven?.orders || 0), sales: Number(seven?.sales || 0), avg_ticket: Number(seven?.avg_ticket || 0) }, thirty: { orders: Number(thirty?.orders || 0), sales: Number(thirty?.sales || 0), avg_ticket: Number(thirty?.avg_ticket || 0) }, by_day: byDay.results || [], top_products: top.results || [], by_source: source.results || [] });
  }

  if (path === "/api/admin/products" && request.method === "GET") {
    const auth = await requireUser(request, env, true); if (auth.response) return auth.response;
    return json({ ok: true, products: await getMenu(env, true) });
  }
  if (path === "/api/admin/products" && request.method === "POST") {
    const auth = await requireUser(request, env, true); if (auth.response) return auth.response;
    const input = await request.json<any>().catch(() => null);
    const b = { description: "", image_url: "", available: 1, sort_order: 100, ...input };
    if (!validProduct(b)) return bad("Revisa nombre, categoría, precio, disponibilidad y foto del producto");
    const id = uid();
    await env.DB.prepare("INSERT INTO products (id,name,description,category,price,image_url,available,sort_order,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)")
      .bind(id, b.name.trim(), b.description.trim(), b.category.trim(), Math.round(b.price * 100) / 100, b.image_url, b.available, b.sort_order, now()).run();
    return json({ ok: true, id }, 201);
  }
  const productMatch = path.match(/^\/api\/admin\/products\/([^/]+)$/);
  if (productMatch && request.method === "PATCH") {
    const auth = await requireUser(request, env, true); if (auth.response) return auth.response;
    const input = await request.json<any>().catch(() => null);
    if (!input || typeof input !== "object" || Array.isArray(input)) return bad("Producto inválido");
    const current = await env.DB.prepare("SELECT * FROM products WHERE id=?1").bind(productMatch[1]).first<any>();
    if (!current) return bad("Producto no encontrado", 404);
    const b = { ...current, ...input };
    if (!validProduct(b)) return bad("Revisa nombre, categoría, precio, disponibilidad y foto del producto");
    await env.DB.prepare("UPDATE products SET name=?1,description=?2,category=?3,price=?4,image_url=?5,available=?6,sort_order=?7 WHERE id=?8")
      .bind(b.name.trim(), b.description.trim(), b.category.trim(), Math.round(b.price * 100) / 100, b.image_url, b.available, b.sort_order, productMatch[1]).run();
    return json({ ok: true });
  }

  return bad("Ruta no encontrada", 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, url);
      return env.ASSETS.fetch(request);
    } catch (error: any) {
      console.error(error);
      return bad(error?.message || "Error interno", 500);
    }
  }
};
