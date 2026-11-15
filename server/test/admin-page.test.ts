import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('GET /admin', () => {
  it('serves the Arabic RTL admin page', async () => {
    const res = await exports.default.fetch('http://example.com/admin');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('dir="rtl"');
    for (const label of ['إلغاء', 'توقف', 'درس إضافي', 'تأجيل', 'دقائق بعد الأذان/العصر/الغروب', 'المكان', 'العصر', 'إضافة دورة', 'id="load-msg"']) expect(html).toContain(label);
    expect(html).toContain('لا تفعّل البث المباشر من الرابط المباشر إلا بعد موافقة أصحاب القناة على Mixlr');
  });

  it('references no third-party origin', async () => {
    const html = await (await exports.default.fetch('http://example.com/admin')).text();
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/\/\/[a-z0-9-]+\.[a-z]/i);
  });

  it('only calls same-origin API paths', async () => {
    const html = await (await exports.default.fetch('http://example.com/admin')).text();
    const paths = [...html.matchAll(/api\('([^']+)'|fetch\('([^']+)'/g)].map((m) => m[1] ?? m[2]);
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) expect(p).toMatch(/^\/api\//);
  });
});

describe('GET /admin lesson list', () => {
  it('shows the lesson label, the date flag and the section order controls', async () => {
    const html = await (await exports.default.fetch('http://example.com/admin')).text();
    expect(html).toContain('l.label');
    expect(html).not.toContain("'الدرس ' + l.number");
    expect(html).toContain('l.dateFlag');
    expect(html).toContain('⚠ تاريخ غير مطابق لأيام الدرس');
    expect(html).toContain('/api/admin/sections/');
  });
});

describe('GET /admin ingest heartbeat', () => {
  it('fetches the heartbeat and has the empty and stale wording', async () => {
    const html = await (await exports.default.fetch('http://example.com/admin')).text();
    expect(html).toContain('/api/admin/heartbeats');
    expect(html).toContain('آخر قراءة لقناة التلغرام');
    expect(html).toContain('لم تُقرأ القناة بعد');
    expect(html).toContain('id="ingest-status"');
  });
});
