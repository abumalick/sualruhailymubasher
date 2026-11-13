// Page zoom is only meant for the book (its .pdfwrap allows pinch-zoom; everything else in the shell allows only panning,
// see app.css). A page left zoomed in after the book could not be zoomed back out, so leaving the book resets it.

export const leavesBook = (from: string | null, to: string): boolean => from === 'book' && to !== 'book';

// Capping the viewport's scale at 1 for a moment snaps a zoomed page back; the cap is then lifted so the book can zoom.
// A second reset while one is pending keeps the uncapped content it saved and restarts its timer.
let pending: { meta: HTMLMetaElement; content: string; timer: ReturnType<typeof setTimeout> } | null = null;
export function resetZoom(): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name=viewport]');
  if (!meta) return;
  const content = pending?.meta === meta ? pending.content : meta.content;
  if (pending) clearTimeout(pending.timer);
  meta.content = `${content}, maximum-scale=1`;
  const timer = setTimeout(() => {
    meta.content = content;
    pending = null;
  }, 300);
  pending = { meta, content, timer };
}
