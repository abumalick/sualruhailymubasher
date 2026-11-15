import type { CourseDTO } from '@sualruhaily/shared';
import { topicsFor } from '../src/logic/topics';

// A listener past the first launch, with every notification of `ids` on.
export function seedPrefs(store: Map<string, string>, courses: CourseDTO[], ids = courses.map((c) => c.id)) {
  store.set('prefs', JSON.stringify({ wanted: topicsFor(ids), known: courses.map((c) => [c.id, c.slot]) }));
  store.set('onboarded', '1');
}
