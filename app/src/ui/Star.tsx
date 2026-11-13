export function Defs() {
  return (
    <svg width="0" height="0" style="position:absolute" aria-hidden="true">
      <defs>
        <symbol id="star" viewBox="0 0 100 100">
          <polygon points="50.0,2.0 64.1,16.1 83.9,16.1 83.9,35.9 98.0,50.0 83.9,64.1 83.9,83.9 64.1,83.9 50.0,98.0 35.9,83.9 16.1,83.9 16.1,64.1 2.0,50.0 16.1,35.9 16.1,16.1 35.9,16.1" />
        </symbol>
        <symbol id="play" viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z" /></symbol>
        <symbol id="i-pause" viewBox="0 0 24 24"><path d="M7 4.5h3.5v15H7zM13.5 4.5H17v15h-3.5z" /></symbol>
        <symbol id="i-stop" viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2" /></symbol>
        <symbol id="i-home" viewBox="0 0 24 24"><path d="M4 11l8-6 8 6v8h-5v-5H9v5H4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /></symbol>
        <symbol id="i-book" viewBox="0 0 24 24"><path d="M12 6c-2-1.5-5-2-8-1.5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5v-13c-3-.5-6 0-8 1.5zM12 6v13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /></symbol>
        <symbol id="i-bell" viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15zM10 20a2 2 0 004 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /></symbol>
        <symbol id="i-link" viewBox="0 0 24 24"><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></symbol>
        <symbol id="i-pdf" viewBox="0 0 24 24"><path d="M7 3h7l4 4v14H7zM14 3v4h4" stroke-linejoin="round" /></symbol>
        <symbol id="i-check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" stroke-linecap="round" stroke-linejoin="round" /></symbol>
        <symbol id="i-down" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></symbol>
        <symbol id="i-back" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></symbol>
        <symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M12 11v5.5M12 7.6v.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></symbol>
        <symbol id="i-sun" viewBox="0 0 24 24"><path d="M3 17h18M6.5 17a5.5 5.5 0 0111 0M12 6v2M5.6 9.6l1.4 1.4M18.4 9.6L17 11M3 13.5h1.5M19.5 13.5H21M8 20.5h8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></symbol>
        <symbol id="i-moon" viewBox="0 0 24 24"><path d="M19.5 14.5A8 8 0 119.5 4.5a6.5 6.5 0 0010 10z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></symbol>
        <symbol id="i-more" viewBox="0 0 24 24"><circle cx="6" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18" cy="12" r="1.3" /></symbol>
        <symbol id="i-rev" viewBox="0 0 24 24"><path d="M4 12a8 8 0 108-8 8 8 0 00-6 2.7M4 4v4h4" stroke-linecap="round" stroke-linejoin="round" /></symbol>
      </defs>
    </svg>
  );
}

export const Icon = ({ id, class: cls }: { id: string; class?: string }) => (
  <svg class={cls} aria-hidden="true"><use href={`#${id}`} /></svg>
);

export function Disc({ icon, label, onClick, live }: { icon: 'play' | 'i-book' | 'i-rev'; label: string; onClick?: () => void; live?: 'pulse' | 'still' }) {
  return (
    <div class={live ? `disc live${live === 'pulse' ? ' pulse' : ''}` : 'disc'}>
      <svg class="st" viewBox="0 0 100 100" aria-hidden="true">
        <use href="#star" fill="none" stroke="var(--gold)" stroke-width="1.2" />
      </svg>
      <svg class="st" viewBox="0 0 100 100" style="transform:rotate(22.5deg) scale(.86)" aria-hidden="true">
        <use href="#star" fill="none" stroke="var(--gold)" stroke-width="1" opacity=".5" />
      </svg>
      {/* A live disc repeats the worded button below it: it stays tappable but out of the accessibility tree. */}
      <button class="btn" aria-label={live ? undefined : label} aria-hidden={live ? 'true' : undefined} tabIndex={live ? -1 : undefined} onClick={onClick} disabled={!onClick}>
        <Icon id={icon} class={icon === 'play' ? 'pl' : 'ln'} />
      </button>
    </div>
  );
}

export function Tick({ label, done, onClick, compact }: { label: string; done: boolean; onClick: () => void; compact?: boolean }) {
  return (
    <button
      class={`chip${done ? ' done' : ''}${compact ? ' tick' : ''}`}
      aria-pressed={done}
      aria-label={compact ? label : undefined}
      onClick={onClick}
    >
      <Icon id="i-check" />
      {!compact && label}
    </button>
  );
}
