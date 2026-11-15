import { APP_NAME, CONTACT_EMAIL, MIXLR_URL, PRIVACY_URL, SHEIKH_SITE, STORES } from '../site';
import { Back } from './Back';
import { Icon } from './Star';

function Row({ title, sub, href }: { title: string; sub: string; href: string }) {
  return (
    <a class="lesson" href={href} target="_blank" rel="noopener noreferrer">
      <div class="t">
        <span class="b">{title}</span>
        <span class="m" dir="ltr" style="text-align:start">
          {sub}
        </span>
      </div>
      <Icon id="i-back" class="fwd" />
    </a>
  );
}

export function About({ native }: { native: boolean }) {
  return (
    <>
      <div class="bar">
        <Back fallback="#/more" />
        <div class="t">
          <b>عن التطبيق</b>
          <span>{APP_NAME}</span>
        </div>
      </div>
      <div class="card about">
        <p>
          يجمع هذا التطبيق البث المباشر لدروس الشيخ سليمان الرحيلي في المسجد النبوي وتسجيلاتها، ويعرض موضع كل درس في الكتاب للتحضير
          والمراجعة.
        </p>
        <p>هذا تطبيق غير رسمي من إعداد طلاب العلم، ولا يتبع الشيخ ولا موقعه. الدروس من موقع الشيخ sualruhaily.com وبثه المباشر.</p>
      </div>

      {!native && (
        <>
          <p class="sec">تطبيق الجوال</p>
          <div class="card about">
            <p>في تطبيق الجوال تصلك تنبيهات بدء البث المباشر، وتذكير التحضير، وإشعار التسجيل للمراجعة. لا تتوفر التنبيهات في نسخة المتصفح.</p>
            <div class="acts start">
              {STORES.map((s) => (
                <a class="chip pri" href={s.url} target="_blank" rel="noopener noreferrer" key={s.id}>
                  {s.name}
                </a>
              ))}
            </div>
          </div>
        </>
      )}

      <p class="sec">المصادر</p>
      <div class="card">
        <Row title="موقع الشيخ" sub="sualruhaily.com" href={SHEIKH_SITE} />
        <Row title="البث المباشر على Mixlr" sub="sualruhaily.mixlr.com" href={MIXLR_URL} />
      </div>

      <p class="sec">الخصوصية والتواصل</p>
      <div class="card">
        <Row title="سياسة الخصوصية" sub="sualruhailymubasher.com/privacy" href={native ? PRIVACY_URL : '/privacy'} />
        <Row title="تواصل معنا" sub={CONTACT_EMAIL} href={`mailto:${CONTACT_EMAIL}`} />
      </div>
    </>
  );
}
