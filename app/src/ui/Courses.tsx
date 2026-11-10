import type { StateDTO } from '@albadr/shared';
import type { ComponentChildren } from 'preact';
import { ar, schedule, slotName } from './format';
import { Icon } from './Star';

export function Courses({ state, notice }: { state: StateDTO | null; notice?: ComponentChildren }) {
  return (
    <>
      <div class="bar">
        <div class="t">
          <b>الدروس</b>
          <span>الدروس العلمية الحالية</span>
        </div>
      </div>
      {notice}
      {state && (
        <div class="card">
          {state.courses.map((c) => (
            <a class="lesson" href={`#/course/${c.id}`} key={c.id}>
              <div class="t">
                <span class="k">
                  درس {slotName(c.slot)} · {schedule(c.weekdays)}
                </span>
                <span class="b">{c.title}</span>
                {c.latest[0] && <span class="m">وصلنا إلى الدرس {ar(c.latest[0].number)}</span>}
              </div>
              <Icon id="i-back" class="fwd" />
            </a>
          ))}
        </div>
      )}
    </>
  );
}
