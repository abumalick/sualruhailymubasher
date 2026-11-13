import type { StateDTO } from '@albadr/shared';
import { Back } from './Back';
import { Icon } from './Star';

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

export function Links({ state }: { state: StateDTO | null }) {
  return (
    <>
      <div class="bar">
        <Back fallback="#/more" />
        <div class="t">
          <b>روابط</b>
          <span>الموقع والقنوات والمجتمعات</span>
        </div>
      </div>
      {state && (
        <div class="card">
          {state.links.map((l) => (
            <a class="lesson" href={l.url} target="_blank" rel="noopener noreferrer" key={l.url}>
              <div class="t">
                <span class="b">{l.title}</span>
                <span class="m" dir="ltr" style="text-align:start">
                  {host(l.url)}
                </span>
              </div>
              <Icon id="i-back" class="fwd" />
            </a>
          ))}
        </div>
      )}
    </>
  );
}
