interface Env {
  ASSETS: Fetcher;
  DB?: D1Database;
}

type Json = Record<string, unknown>;

const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });

const bad = (message: string, status = 400) => json({ ok: false, error: message }, status);
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password: string, salt = uid()) {
  const hash = await sha256(`${salt}:${password}:martie-v2`);
  return `${salt}$${hash}`;
}

async function verifyPassword(password: string, stored: string) {
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

async function getMenu(env: Env) {
  if (!env.DB) return [];
  const r = await env.DB.prepare(`SELECT id,name,description,category,price,image_url,available FROM products WHERE available=1 ORDER BY category,sort_order,name`).all<any>();
  return r.results || [];
}

function nextSlot(base = new Date()) {
  const d = new Date(base);
  const day = d.getDay();
  if (day === 0) d.setDate(d.getDate() + 1);
  if (day === 6) d.setDate(d.getDate() + 2);
  const opening = new Date(d); opening.setHours(9,0,0,0);
  const closing = new Date(d); closing.setHours(19,0,0,0);
  let target = new Date(d.getTime() + 40 * 60000);
  if (target < opening) target = opening;
  if (target > closing) { target = new Date(opening); target.setDate(target.getDate() + (target.getDay() === 5 ? 3 : 1)); }
  const m = target.getMinutes();
  const rounded = Math.ceil(m / 15) * 15;
  target.setMinutes(rounded,0,0);
  return target.toISOString();
}

async function handleApi(request: Request, env: Env, url: URL) {
  const path = url.pathname;
  if (path === "/api/health") return json({ ok: true, db: !!env.DB, version: "2.0.0" });
  if (!env.DB) return bad("Cloudflare D1 aún no está vinculado. La interfaz funciona en modo demo local.", 503);

  if (path === "/api/menu" && request.method === "GET") return json({ ok: true, products: await getMenu(env) });

  if (path === "/api/auth/register" && request.method === "POST") {
    const b = await body<any>(request);
    const name = String(b.name || "").trim();
    const email = String(b.email || "").trim().toLowerCase();
    const password = String(b.password || "");
    if (!name || !email || password.length < 6) return bad("Nombre, email y contraseña de mínimo 6 caracteres son obligatorios");
    const exists = await env.DB.prepare("SELECT id FROM users WHERE email=?1").bind(email).first();
    if (exists) return bad("Ese correo ya está registrado", 409);
    const id = uid();
    await env.DB.prepare(`INSERT INTO users (id,name,email,phone,birthdate,password_hash,role,created_at) VALUES (?1,?2,?3,?4,?5,?6,'customer',?7)`)
      .bind(id, name, email, String(b.phone || ""), b.birthdate || null, await hashPassword(password), now()).run();
    const token = await createSession(id, env);
    return json({ ok: true, token, user: { id, name, email, role: "customer" } }, 201);
  }

  if (path === "/api/auth/login" && request.method === "POST") {
    const b = await body<any>(request);
    const email = String(b.email || "").trim().toLowerCase();
    const user = await env.DB.prepare("SELECT * FROM users WHERE email=?1").bind(email).first<any>();
    if (!user || !(await verifyPassword(String(b.password || ""), user.password_hash))) return bad("Correo o contraseña incorrectos", 401);
    const token = await createSession(user.id, env);
    delete user.password_hash;
    return json({ ok: true, token, user });
  }

  if (path === "/api/me" && request.method === "GET") {
    const auth = await requireUser(request, env); if (auth.response) return auth.response;
    const points = await env.DB.prepare("SELECT COALESCE(SUM(points),0) total FROM loyalty_ledger WHERE user_id=?1").bind(auth.user!.id).first<any>();
    return json({ ok: true, user: auth.user, points: Number(points?.total || 0) });
  }

  if (path === "/api/me" && request.method === "PATCH") {
    const auth = await requireUser(request, env); if (auth.response) return auth.response;
    const b = await body<any>(request);
    await env.DB.prepare("UPDATE users SET name=?1,phone=?2,birthdate=?3 WHERE id=?4")
      .bind(String(b.name || auth.user!.name), String(b.phone || ""), b.birthdate || null, auth.user!.id).run();
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
    const items = Array.isArray(b.items) ? b.items : [];
    if (!items.length) return bad("El carrito está vacío");
    const ids = items.map((x:any) => String(x.product_id));
    const products = await getMenu(env);
    let total = 0;
    const normalized:any[] = [];
    for (const item of items) {
      const p:any = products.find((x:any) => x.id === String(item.product_id));
      if (!p) return bad("Uno de los productos ya no está disponible", 409);
      const qty = Math.max(1, Math.min(20, Number(item.qty || 1)));
      total += Number(p.price) * qty;
      normalized.push({ product_id: p.id, name: p.name, qty, unit_price: Number(p.price) });
    }
    const fulfillment = b.fulfillment === "delivery" ? "delivery" : "pickup";
    const payment = ["cash","card","transfer"].includes(b.payment_method) ? b.payment_method : "cash";
    const orderId = uid();
    const scheduled = b.scheduled_at || nextSlot();
    await env.DB.prepare(`INSERT INTO orders (id,user_id,status,fulfillment,payment_method,payment_status,total,address,notes,scheduled_at,created_at)
      VALUES (?1,?2,'pending',?3,?4,?5,?6,?7,?8,?9,?10)`)
      .bind(orderId, auth.user!.id, fulfillment, payment, payment === "transfer" ? "awaiting_proof" : "pending", total,
        fulfillment === "delivery" ? String(b.address || "") : null, String(b.notes || ""), scheduled, now()).run();
    for (const i of normalized) {
      await env.DB.prepare("INSERT INTO order_items (id,order_id,product_id,name,qty,unit_price) VALUES (?1,?2,?3,?4,?5,?6)")
        .bind(uid(), orderId, i.product_id, i.name, i.qty, i.unit_price).run();
    }
    const earned = Math.floor(total / 10);
    await env.DB.prepare("INSERT INTO loyalty_ledger (id,user_id,order_id,points,type,description,created_at) VALUES (?1,?2,?3,?4,'earn',?5,?6)")
      .bind(uid(), auth.user!.id, orderId, earned, `Compra #${orderId.slice(0,8)}`, now()).run();
    return json({ ok: true, order_id: orderId, total, points_earned: earned, scheduled_at: scheduled }, 201);
  }

  if (path === "/api/loyalty" && request.method === "GET") {
    const auth = await requireUser(request, env); if (auth.response) return auth.response;
    const ledger = await env.DB.prepare("SELECT * FROM loyalty_ledger WHERE user_id=?1 ORDER BY created_at DESC LIMIT 100").bind(auth.user!.id).all<any>();
    const total = (ledger.results || []).reduce((s:number,x:any)=>s+Number(x.points),0);
    return json({ ok: true, points: total, ledger: ledger.results || [], rule: "100 pesos = 10 puntos" });
  }

  if (path === "/api/admin/summary" && request.method === "GET") {
    const auth = await requireUser(request, env, true); if (auth.response) return auth.response;
    const sales = await env.DB.prepare("SELECT COUNT(*) orders, COALESCE(SUM(total),0) sales FROM orders WHERE date(created_at)=date('now')").first<any>();
    const customers = await env.DB.prepare("SELECT COUNT(*) total FROM users WHERE role='customer'").first<any>();
    const pending = await env.DB.prepare("SELECT COUNT(*) total FROM orders WHERE status IN ('pending','confirmed','preparing')").first<any>();
    return json({ ok: true, sales_today:Number(sales?.sales||0), orders_today:Number(sales?.orders||0), customers:Number(customers?.total||0), pending:Number(pending?.total||0) });
  }

  if (path === "/api/admin/orders" && request.method === "GET") {
    const auth = await requireUser(request, env, true); if (auth.response) return auth.response;
    const r = await env.DB.prepare(`SELECT o.*,u.name customer_name,u.phone customer_phone FROM orders o LEFT JOIN users u ON u.id=o.user_id ORDER BY o.created_at DESC LIMIT 100`).all<any>();
    return json({ ok: true, orders:r.results || [] });
  }

  const orderMatch = path.match(/^\/api\/admin\/orders\/([^/]+)$/);
  if (orderMatch && request.method === "PATCH") {
    const auth = await requireUser(request, env, true); if (auth.response) return auth.response;
    const b = await body<any>(request);
    const allowed = ["pending","confirmed","preparing","ready","completed","cancelled"];
    if (!allowed.includes(b.status)) return bad("Estado inválido");
    await env.DB.prepare("UPDATE orders SET status=?1 WHERE id=?2").bind(b.status, orderMatch[1]).run();
    return json({ ok:true });
  }

  if (path === "/api/admin/products" && request.method === "GET") {
    const auth = await requireUser(request, env, true); if (auth.response) return auth.response;
    const r = await env.DB.prepare("SELECT * FROM products ORDER BY category,sort_order,name").all<any>();
    return json({ ok:true, products:r.results || [] });
  }

  if (path === "/api/admin/products" && request.method === "POST") {
    const auth = await requireUser(request, env, true); if (auth.response) return auth.response;
    const b = await body<any>(request); const id = uid();
    await env.DB.prepare(`INSERT INTO products (id,name,description,category,price,image_url,available,sort_order,created_at) VALUES (?1,?2,?3,?4,?5,?6,1,999,?7)`)
      .bind(id,String(b.name||"Producto"),String(b.description||""),String(b.category||"Otros"),Number(b.price||0),String(b.image_url||""),now()).run();
    return json({ok:true,id},201);
  }

  const productMatch = path.match(/^\/api\/admin\/products\/([^/]+)$/);
  if (productMatch && request.method === "PATCH") {
    const auth = await requireUser(request, env, true); if (auth.response) return auth.response;
    const b = await body<any>(request);
    await env.DB.prepare(`UPDATE products SET name=COALESCE(?1,name),description=COALESCE(?2,description),category=COALESCE(?3,category),price=COALESCE(?4,price),image_url=COALESCE(?5,image_url),available=COALESCE(?6,available) WHERE id=?7`)
      .bind(b.name ?? null,b.description ?? null,b.category ?? null,b.price ?? null,b.image_url ?? null,b.available ?? null,productMatch[1]).run();
    return json({ok:true});
  }

  return bad("Ruta no encontrada", 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, url);
      return env.ASSETS.fetch(request);
    } catch (error:any) {
      console.error(error);
      return bad(error?.message || "Error interno", 500);
    }
  }
};
