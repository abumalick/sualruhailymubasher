export const ADMIN_HTML = String.raw`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>إدارة دروس البدر</title>
<style>
:root{--bg:#f6f1e6;--card:#ebe3cc;--brown:#5b2b00;--gold:#a67c37;--red:#c8321c;--text:#1c0b1a}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Tahoma,"Noto Naskh Arabic",sans-serif;overflow-x:hidden}
main{max-width:640px;margin:0 auto;padding:12px 16px 48px}
h1{color:var(--brown);font-size:22px;margin:8px 0}
h2{color:var(--brown);font-size:18px;margin:24px 0 8px;border-bottom:2px solid var(--gold);padding-bottom:4px}
h3{font-size:16px;margin:0 0 8px;color:var(--brown)}
.card{background:var(--card);border-radius:10px;padding:12px;margin:10px 0}
label{display:block;font-size:14px;margin:8px 0 2px}
input,select,textarea{width:100%;padding:8px;border:1px solid var(--gold);border-radius:6px;background:#fff;color:var(--text);font:inherit}
textarea{min-height:70px;direction:ltr;text-align:left}
input[type=checkbox]{width:auto}
.days{display:flex;flex-wrap:wrap;gap:4px 12px}
.days label{display:flex;align-items:center;gap:4px;margin:2px 0}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:0 8px}
button{background:var(--brown);color:#fff;border:0;border-radius:6px;padding:9px 14px;font:inherit;margin-top:10px;cursor:pointer}
button.danger{background:var(--red)}
button.ghost{background:transparent;color:var(--brown);border:1px solid var(--brown)}
.msg{margin-top:8px;font-size:14px;min-height:1.2em}
.msg.ok{color:#1d6b2f}.msg.err{color:var(--red)}
.warn{color:var(--red);font-size:14px}
.row{display:flex;justify-content:space-between;align-items:center;gap:8px}
.muted{color:var(--gold);font-size:13px}
[hidden]{display:none!important}
</style>
</head>
<body>
<main>
<div class="row"><h1>إدارة دروس البدر</h1><button id="logout" class="ghost" hidden>خروج</button></div>

<section id="login" class="card" hidden>
  <label for="tok">رمز الإدارة</label>
  <input id="tok" type="password" autocomplete="current-password">
  <button id="login-btn">دخول</button>
  <div class="msg" id="login-msg"></div>
</section>

<div id="app" hidden>
  <h2>الدورات</h2>
  <div id="courses"></div>

  <h2>الاستثناءات</h2>
  <div id="exceptions"></div>
  <form id="exc-form" class="card">
    <h3>إضافة استثناء</h3>
    <label for="exc-course">الدورة</label>
    <select id="exc-course"></select>
    <label for="exc-kind">النوع</label>
    <select id="exc-kind">
      <option value="cancel">إلغاء</option>
      <option value="pause">توقف</option>
      <option value="extra">درس إضافي</option>
      <option value="move">تأجيل</option>
    </select>
    <div class="grid">
      <div><label for="exc-from">من تاريخ</label><input id="exc-from" type="date" required></div>
      <div><label for="exc-to">إلى تاريخ (اختياري)</label><input id="exc-to" type="date"></div>
    </div>
    <label for="exc-time">الوقت (اختياري)</label>
    <input id="exc-time" type="time">
    <label for="exc-note">ملاحظة</label>
    <input id="exc-note" type="text">
    <button type="submit">إضافة</button>
    <div class="msg" id="exc-msg"></div>
  </form>

  <h2>آخر الدروس</h2>
  <div id="lessons"></div>

  <h2>البث المباشر</h2>
  <div class="card">
    <label for="live-mode">وضع البث</label>
    <select id="live-mode">
      <option value="embed">embed</option>
      <option value="direct">direct</option>
    </select>
    <p class="warn">لا تفعّل البث المباشر من الرابط المباشر إلا بعد موافقة أصحاب القناة على Mixlr</p>
    <button id="live-save">حفظ</button>
    <div class="msg" id="live-msg"></div>
  </div>

  <h2>أدوات</h2>
  <div class="card">
    <h3>إرسال تنبيه تجريبي</h3>
    <label for="push-topic">الموضوع (topic)</label>
    <input id="push-topic" type="text" dir="ltr" placeholder="c-tafsir-saadi-live">
    <button id="push-btn">إرسال تنبيه تجريبي</button>
    <div class="msg" id="push-msg"></div>
  </div>
  <div class="card">
    <button id="ingest-btn" style="margin-top:0">تحديث الدروس الآن</button>
    <div class="msg" id="ingest-msg"></div>
  </div>
</div>
</main>
<script>
(function () {
  var KEY = 'albadr-admin-token';
  var DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  var KINDS = { cancel: 'إلغاء', pause: 'توقف', extra: 'درس إضافي', move: 'تأجيل' };
  var courses = [];
  var $ = function (id) { return document.getElementById(id); };

  function getToken() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function setToken(v) { try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch (e) {} }

  function el(tag, props, children) {
    var n = document.createElement(tag);
    for (var k in props || {}) {
      if (k === 'text') n.textContent = props[k];
      else if (k in n) n[k] = props[k];
      else n.setAttribute(k, props[k]);
    }
    (children || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function field(label, input) {
    var wrap = el('div');
    wrap.appendChild(el('label', { text: label }));
    wrap.appendChild(input);
    return wrap;
  }
  function say(id, text, ok) {
    var n = $(id);
    n.textContent = text;
    n.className = 'msg ' + (ok ? 'ok' : 'err');
  }

  function showLogin(msg) {
    $('login').hidden = false;
    $('app').hidden = true;
    $('logout').hidden = true;
    $('login-msg').textContent = msg || '';
    $('login-msg').className = 'msg err';
  }

  function api(path, method, body) {
    var opts = { method: method || 'GET', headers: { Authorization: 'Bearer ' + getToken() } };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(path, opts).then(function (res) {
      if (res.status === 401) {
        setToken('');
        showLogin('الرمز غير صحيح، أدخله من جديد');
        throw new Error('unauthorized');
      }
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (j) {
          throw new Error(j.error || ('خطأ ' + res.status));
        });
      }
      return res.status === 204 ? null : res.json();
    });
  }

  function errText(e) { return 'تعذر التنفيذ: ' + e.message; }

  function courseCard(c) {
    var title = el('input', { value: c.title });
    var slot = el('select');
    slot.appendChild(el('option', { value: 'fajr', text: 'الفجر' }));
    slot.appendChild(el('option', { value: 'maghrib', text: 'المغرب' }));
    slot.value = c.slot;
    var time = el('input', { type: 'time', value: c.time });
    var series = el('input', { type: 'number', min: 0, value: String(c.seriesId) });
    var pdfs = el('textarea', { value: c.pdfUrls.join('\n') });
    var active = el('input', { type: 'checkbox', checked: c.active });
    var boxes = DAYS.map(function (d, i) {
      var cb = el('input', { type: 'checkbox', checked: c.weekdays.indexOf(i) >= 0 });
      return { cb: cb, node: el('label', {}, [cb, document.createTextNode(d)]) };
    });
    var msg = el('div', { className: 'msg' });
    var save = el('button', { text: 'حفظ الدورة' });
    save.onclick = function () {
      var body = {
        title: title.value.trim(),
        slot: slot.value,
        weekdays: boxes.map(function (b, i) { return b.cb.checked ? i : -1; }).filter(function (i) { return i >= 0; }),
        time: time.value,
        seriesId: Number(series.value),
        pdfUrls: pdfs.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean),
        active: active.checked
      };
      api('/api/admin/courses/' + encodeURIComponent(c.id), 'PUT', body).then(function () {
        msg.textContent = 'تم الحفظ'; msg.className = 'msg ok';
      }, function (e) { msg.textContent = errText(e); msg.className = 'msg err'; });
    };
    return el('div', { className: 'card' }, [
      el('h3', { text: c.id }),
      field('العنوان', title),
      el('div', { className: 'grid' }, [field('الفترة', slot), field('الوقت', time)]),
      el('label', { text: 'أيام الدرس' }),
      el('div', { className: 'days' }, boxes.map(function (b) { return b.node; })),
      field('رقم السلسلة في al-badr.net', series),
      field('روابط PDF (رابط في كل سطر)', pdfs),
      el('label', {}, [active, document.createTextNode(' الدورة فعّالة')]),
      save, msg
    ]);
  }

  function renderCourses() {
    var box = $('courses');
    box.textContent = '';
    courses.forEach(function (c) { box.appendChild(courseCard(c)); });
    var sel = $('exc-course');
    sel.textContent = '';
    sel.appendChild(el('option', { value: '', text: 'كل الدورات' }));
    courses.forEach(function (c) { sel.appendChild(el('option', { value: c.id, text: c.title })); });
  }

  function loadExceptions() {
    return api('/api/admin/exceptions').then(function (list) {
      var box = $('exceptions');
      box.textContent = '';
      if (!list.length) box.appendChild(el('p', { className: 'muted', text: 'لا توجد استثناءات قادمة' }));
      list.forEach(function (x) {
        var course = courses.filter(function (c) { return c.id === x.courseId; })[0];
        var range = x.dateFrom + (x.dateTo ? ' ← ' + x.dateTo : '') + (x.time ? ' ' + x.time : '');
        var del = el('button', { className: 'danger', text: 'حذف' });
        del.style.marginTop = '0';
        del.onclick = function () {
          api('/api/admin/exceptions/' + x.id, 'DELETE').then(function () {
            say('exc-msg', 'تم حذف الاستثناء', true);
            return loadExceptions();
          }, function (e) { say('exc-msg', errText(e), false); });
        };
        box.appendChild(el('div', { className: 'card row' }, [
          el('div', {}, [
            el('strong', { text: KINDS[x.kind] || x.kind }),
            document.createTextNode(' · ' + (course ? course.title : 'كل الدورات')),
            el('div', { className: 'muted', text: range + (x.note ? ' · ' + x.note : '') })
          ]),
          del
        ]));
      });
    }).catch(function (e) { if (e.message !== 'unauthorized') say('exc-msg', errText(e), false); });
  }

  function lessonCard(courseId, l) {
    var fields = [
      ['startPoint', 'نقطة البداية', 'text', l.startPoint],
      ['pdfIndex', 'رقم ملف PDF', 'number', l.pdfIndex],
      ['startPage', 'صفحة البداية', 'number', l.startPage],
      ['endPoint', 'نقطة النهاية', 'text', l.endPoint],
      ['endPage', 'صفحة النهاية', 'number', l.endPage]
    ];
    var inputs = fields.map(function (f) {
      var inp = el('input', { type: f[2], value: f[3] === null || f[3] === undefined ? '' : String(f[3]) });
      if (f[2] === 'number') inp.min = f[0] === 'pdfIndex' ? 0 : 1;
      return inp;
    });
    var msg = el('div', { className: 'msg' });
    var save = el('button', { text: 'حفظ الدرس' });
    save.onclick = function () {
      var patch = {};
      fields.forEach(function (f, i) {
        var raw = inputs[i].value.trim();
        var orig = f[3] === null || f[3] === undefined ? '' : String(f[3]);
        if (raw === orig || raw === '') return;
        patch[f[0]] = f[2] === 'number' ? Number(raw) : raw;
      });
      if (!Object.keys(patch).length) { msg.textContent = 'لا توجد تغييرات'; msg.className = 'msg'; return; }
      api('/api/admin/lessons/' + encodeURIComponent(courseId) + '/' + l.number, 'PATCH', patch).then(function () {
        fields.forEach(function (f, i) { if (patch[f[0]] !== undefined) f[3] = patch[f[0]]; });
        msg.textContent = 'تم الحفظ'; msg.className = 'msg ok';
      }, function (e) { msg.textContent = errText(e); msg.className = 'msg err'; });
    };
    var parts = [el('h3', { text: 'الدرس ' + l.number + ' · ' + l.hijriDate })];
    fields.forEach(function (f, i) { parts.push(field(f[1], inputs[i])); });
    parts.push(save, msg);
    return el('div', { className: 'card' }, parts);
  }

  function loadLessons() {
    var box = $('lessons');
    box.textContent = '';
    return Promise.all(courses.map(function (c) {
      return fetch('/api/courses/' + encodeURIComponent(c.id) + '/lessons?limit=10').then(function (r) { return r.json(); }).then(function (list) {
        var section = el('div', {}, [el('h3', { text: c.title })]);
        if (!list.length) section.appendChild(el('p', { className: 'muted', text: 'لا توجد دروس بعد' }));
        list.forEach(function (l) { section.appendChild(lessonCard(c.id, l)); });
        return section;
      });
    })).then(function (sections) {
      sections.forEach(function (s) { box.appendChild(s); });
    });
  }

  function loadMode() {
    return fetch('/api/state').then(function (r) { return r.json(); }).then(function (s) {
      $('live-mode').value = s.live.mode;
    });
  }

  function start() {
    $('login').hidden = true;
    $('app').hidden = false;
    $('logout').hidden = false;
    api('/api/admin/courses').then(function (list) {
      courses = list;
      renderCourses();
      return Promise.all([loadExceptions(), loadLessons(), loadMode()]);
    }).catch(function (e) {
      if (e.message !== 'unauthorized') say('login-msg', errText(e), false);
    });
  }

  $('login-btn').onclick = function () {
    var v = $('tok').value.trim();
    if (!v) return;
    setToken(v);
    $('tok').value = '';
    start();
  };
  $('logout').onclick = function () { setToken(''); showLogin(''); };

  $('exc-form').onsubmit = function (ev) {
    ev.preventDefault();
    var body = {
      courseId: $('exc-course').value || null,
      kind: $('exc-kind').value,
      dateFrom: $('exc-from').value,
      dateTo: $('exc-to').value || null,
      time: $('exc-time').value || null,
      note: $('exc-note').value.trim()
    };
    api('/api/admin/exceptions', 'POST', body).then(function () {
      say('exc-msg', 'تمت إضافة الاستثناء', true);
      $('exc-note').value = '';
      return loadExceptions();
    }, function (e) { say('exc-msg', errText(e), false); });
  };

  $('live-save').onclick = function () {
    api('/api/admin/settings/live_mode', 'PUT', { value: $('live-mode').value }).then(
      function () { say('live-msg', 'تم حفظ وضع البث', true); },
      function (e) { say('live-msg', errText(e), false); });
  };

  $('push-btn').onclick = function () {
    var topic = $('push-topic').value.trim();
    if (!topic) { say('push-msg', 'أدخل اسم الموضوع', false); return; }
    api('/api/admin/test-push', 'POST', { topic: topic }).then(
      function () { say('push-msg', 'تم إرسال التنبيه التجريبي', true); },
      function (e) { say('push-msg', errText(e), false); });
  };

  $('ingest-btn').onclick = function () {
    say('ingest-msg', 'جارٍ التحديث...', true);
    api('/api/admin/run/ingest', 'POST').then(function () {
      say('ingest-msg', 'تم تحديث الدروس', true);
      return loadLessons();
    }, function (e) { say('ingest-msg', errText(e), false); });
  };

  if (getToken()) start(); else showLogin('');
})();
</script>
</body>
</html>
`;
