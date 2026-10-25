// A stand-in for the Qasimha API and hosted checkout, for demos without sandbox access.
// Implements only what the demo uses: session create, order read, plan quote and a hosted page
// that lets the presenter pick the outcome. It runs on its own port so the checkout is
// cross-origin to the store, exactly like the real one.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const MIN_AMOUNT = 100;
const MAX_AMOUNT = 20000;
const RIYAL_PATHS = [
  'M699.62,1113.02h0c-20.06,44.48-33.32,92.75-38.4,143.37l424.51-90.24c20.06-44.47,33.31-92.75,38.4-143.37l-424.51,90.24Z',
  'M1085.73,895.8c20.06-44.47,33.32-92.75,38.4-143.37l-330.68,70.33v-135.2l292.27-62.11c20.06-44.47,33.32-92.75,38.4-143.37l-330.68,70.27V66.13c-50.67,28.45-95.67,66.32-132.25,110.99v403.35l-132.25,28.11V0c-50.67,28.44-95.67,66.32-132.25,110.99v525.69l-295.91,62.88c-20.06,44.47-33.33,92.75-38.42,143.37l334.33-71.05v170.26l-358.3,76.14c-20.06,44.47-33.32,92.75-38.4,143.37l375.04-79.7c30.53-6.35,56.77-24.4,73.83-49.24l68.78-101.97v-.02c7.14-10.55,11.3-23.27,11.3-36.97v-149.98l132.25-28.11v270.4l424.53-90.28Z',
];

const orders = new Map();

function envelope(code, data, success = true) {
  return { success, uuid: randomUUID(), code, message: code, data, errors: null };
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'X-Public-Key, Accept',
    ...headers,
  });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function schedule(total, count) {
  const cents = Math.round(total * 100);
  const base = Math.round(cents / count);
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? cents - base * (count - 1) : base) / 100);
}

function appendQuery(url, params) {
  const u = new URL(url);
  for (const [key, value] of Object.entries(params)) u.searchParams.set(key, value);
  return u.toString();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function money(value) {
  const svg = `<svg viewBox="0 0 1124.14 1256.39" aria-label="SAR" role="img" style="height:.8em;width:auto">${RIYAL_PATHS.map((d) => `<path d="${d}" fill="currentColor"/>`).join('')}</svg>`;
  const text = Number(value).toLocaleString('en-US', { minimumFractionDigits: value % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return `<span dir="ltr" style="display:inline-flex;gap:.15em;align-items:center;white-space:nowrap">${svg}<span>${text}</span></span>`;
}

function hostedPage(order, lang) {
  const ar = lang !== 'en';
  const t = ar
    ? { title: 'قسّمها — بيئة تجريبية', mock: 'صفحة دفع تجريبية (محاكاة)', pay: 'إجمالي الطلب', plan: '4 دفعات شهرية', approve: 'الموافقة والدفع', decline: 'محاكاة الرفض', cancel: 'إلغاء والعودة إلى المتجر', ref: 'رقم الطلب', note: 'في البيئة الحقيقية يوثّق العميل هويته عبر نفاذ ويدفع الدفعة الأولى هنا.' }
    : { title: 'Qasimha — sandbox', mock: 'Mock hosted checkout (simulation)', pay: 'Order total', plan: '4 monthly payments', approve: 'Approve and pay', decline: 'Simulate decline', cancel: 'Cancel and return to store', ref: 'Order reference', note: 'In the real checkout the shopper verifies with Nafath and pays the first instalment here.' };
  const rows = schedule(order.totalAmount, 4)
    .map((amount, i) => `<li><span>${i + 1}</span>${money(amount)}</li>`)
    .join('');
  const disabled = order.status !== 'AwaitingCheckout' ? 'disabled' : '';
  return `<!doctype html><html lang="${ar ? 'ar' : 'en'}" dir="${ar ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t.title}</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#f1f5f4;color:#1f2937}main{max-width:420px;margin:0 auto;padding:24px 16px}
.brand{display:inline-block;background:#fd6c43;color:#fff8f6;border-radius:999px;padding:4px 14px;font-weight:700}.mock{background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;border-radius:8px;padding:6px 10px;font-size:13px;margin:12px 0}
.card{background:#fff;border-radius:14px;padding:18px;box-shadow:0 1px 3px rgb(0 0 0/.08);margin-top:12px}.total{font-size:28px;font-weight:700;margin:4px 0}
ul{list-style:none;padding:0;margin:12px 0 0}li{display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid #eef2f1}
button,a.btn{display:block;width:100%;box-sizing:border-box;margin-top:10px;padding:12px;border-radius:10px;border:none;font:inherit;font-weight:600;cursor:pointer;text-align:center;text-decoration:none}
.approve{background:#fd6c43;color:#fff8f6}.decline{background:#fee2e2;color:#991b1b}.cancel{background:none;color:#6b7280;text-decoration:underline}.muted{color:#6b7280;font-size:13px}</style></head>
<body><main><span class="brand">${ar ? 'قسّمها' : 'Qasimha'}</span><div class="mock">${t.mock}</div>
<div class="card"><div class="muted">${t.pay}</div><div class="total">${money(order.totalAmount)}</div><div class="muted">${t.ref}: ${escapeHtml(order.orderReferenceId)}</div>
<div class="muted" style="margin-top:10px">${t.plan}</div><ul>${rows}</ul></div>
<form method="post" action="/pay/${order.id}/complete?lang=${ar ? 'ar' : 'en'}"><button class="approve" name="outcome" value="confirmed" ${disabled}>${t.approve}</button>
<button class="decline" name="outcome" value="declined" ${disabled}>${t.decline}</button><button class="cancel" name="outcome" value="cancelled" ${disabled}>${t.cancel}</button></form>
<p class="muted">${t.note}</p></main></body></html>`;
}

export function startMockQasimha({ port, host = '127.0.0.1', log = console.log, publicOrigin }) {
    log("startMockQasimha")
  // The address the shopper's browser opens; MOCK_PUBLIC_ORIGIN when the mock runs behind Docker.
  const origin = publicOrigin || process.env.MOCK_PUBLIC_ORIGIN || `http://localhost:${port}`;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, origin);

    try {
      if (req.method === 'OPTIONS') return send(res, 204, {});

      if (req.method === 'POST' && url.pathname === '/api/v1/pay/session/create') {
        if (!/^sk_test_/.test(req.headers['x-api-key'] ?? '')) return send(res, 401, '');
        const body = await readJson(req);
        const id = randomUUID();
        const lang = (req.headers['accept-language'] ?? '').startsWith('en') ? 'en' : 'ar';
        orders.set(id, {
          id,
          orderReferenceId: body.orderReferenceId,
          status: 'AwaitingCheckout',
          totalAmount: body.totalAmount,
          currencyCode: 'SAR',
          countryCode: 'SA',
          instalments: 4,
          createdAt: new Date().toISOString(),
          confirmedAt: null,
          items: body.items,
          customer: { id: randomUUID(), name: `${body.consumer?.firstName ?? ''} ${body.consumer?.lastName ?? ''}`.trim(), email: body.consumer?.email ?? null, phone: body.consumer?.phoneNumber ?? null },
          merchantUrl: body.merchantUrl,
        });
        log(`[mock-qasimha] SESSION_CREATED ${id} ref=${body.orderReferenceId} total=${body.totalAmount}`);
        return send(res, 201, envelope('SESSION_CREATED', { installmentId: id, providerSessionId: '', paymentUrl: `${origin}/pay/${id}?lang=${lang}`, status: 'AwaitingCheckout' }));
      }

      const orderMatch = /^\/api\/v1\/merchant\/orders\/([0-9a-f-]{36})$/.exec(url.pathname);
      if (req.method === 'GET' && orderMatch) {
        const order = orders.get(orderMatch[1]);
        if (!order) return send(res, 404, envelope('NOT_FOUND', null, false));
        const data = { ...order };
        delete data.merchantUrl;
        const amounts = schedule(order.totalAmount, 4);
        data.installments = amounts.map((amount, i) => ({ sequence: i + 1, amount, status: i === 0 && order.status === 'Confirmed' ? 'Paid' : 'Scheduled' }));
        return send(res, 200, envelope('OK', data));
      }

      if (req.method === 'GET' && url.pathname === '/api/v1/widget/plans') {
        if (!/^pk_test_[A-Za-z0-9]+$/.test(req.headers['x-public-key'] ?? '')) return send(res, 401, envelope('INVALID_PUBLIC_KEY', null, false));
        const amount = Number(url.searchParams.get('amount'));
        const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'ar';
        const plans = [];
        if (amount >= MIN_AMOUNT && amount <= MAX_AMOUNT) {
          for (const n of [4, 3, 2]) {
            const s = schedule(amount, n);
            plans.push({ instalments: n, frequency: 'monthly', instalmentAmount: s[0], firstInstalmentAmount: s[0], lastInstalmentAmount: s[n - 1], feesIncludingVat: 0, totalPayable: amount, shariaCompliant: true });
          }
        }
        return send(res, 200, envelope('OK', { merchantName: lang === 'ar' ? 'متجر قسّمها التجريبي' : 'Qasimha Demo Store', currency: 'SAR', minAmount: MIN_AMOUNT, maxAmount: MAX_AMOUNT, plans }));
      }

      const pageMatch = /^\/pay\/([0-9a-f-]{36})(\/complete)?$/.exec(url.pathname);
      if (pageMatch) {
        const order = orders.get(pageMatch[1]);
        if (!order) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end('Unknown checkout');
        }
        const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'ar';
        if (req.method === 'POST' && pageMatch[2]) {
          const form = new URLSearchParams(await new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); }));
          const outcome = form.get('outcome');
          if (order.status === 'AwaitingCheckout') {
            order.status = outcome === 'confirmed' ? 'Confirmed' : outcome === 'declined' ? 'Declined' : 'AwaitingCheckout';
            if (order.status === 'Confirmed') order.confirmedAt = new Date().toISOString();
          }
          log(`[mock-qasimha] CHECKOUT_${String(outcome).toUpperCase()} ${order.id}`);
          const target = outcome === 'confirmed' ? order.merchantUrl?.success : outcome === 'declined' ? order.merchantUrl?.failure : order.merchantUrl?.cancel;
          const status = outcome === 'confirmed' ? 'confirmed' : outcome === 'declined' ? 'declined' : 'cancelled';
          if (!target) {
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end(`Order ${status}. No return URL was given.`);
          }
          res.writeHead(303, { Location: appendQuery(target, { orderId: order.id, orderReferenceId: order.orderReferenceId, status }) });
          return res.end();
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'SAMEORIGIN', 'Cross-Origin-Opener-Policy': 'same-origin-allow-popups' });
        return res.end(hostedPage(order, lang));
      }

      send(res, 404, envelope('NOT_FOUND', null, false));
    } catch (error) {
      log(`[mock-qasimha] error ${error?.message}`);
      send(res, 500, envelope('INTERNAL_ERROR', null, false));
    }
  });
  server.listen(port, host);
  return { origin, server };
}

// `node mock-qasimha.mjs` runs the mock on its own, for the PHP, .NET and Java demo backends.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 4301;
  const host = process.env.HOST || '127.0.0.1';
  const { origin } = startMockQasimha({ port, host });
  console.log(`[mock-qasimha] listening on ${origin} (sk_test_… keys, pk_test_… keys)`);
}
