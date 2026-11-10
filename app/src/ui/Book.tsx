import type { CourseDTO } from '@albadr/shared';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useRef, useState } from 'preact/hooks';
import { dropPdf, getPdf } from '../pdf/cache';
import { ar, arText } from './format';
import { Icon, Tick } from './Star';
import type { TickKind, Ticks } from '../logic/ticks';

interface Props {
  course: CourseDTO;
  pdfIndex: number;
  page: number;
  marker: boolean;
  ticks: Ticks;
  onTick: (kind: TickKind, courseId: string, n: number) => void;
}

type Doc = { status: 'loading' } | { status: 'error' } | { status: 'ready'; pdf: PDFDocumentProxy };

const isPdf = (data: Uint8Array) => String.fromCharCode(...data.subarray(0, 5)) === '%PDF-';

const clamp = (n: number, total: number) => Math.min(Math.max(n, 1), total);

// Matches .pdfwrap .pg max-width: wider canvases only cost memory on a desktop screen.
const MAX_PAGE_WIDTH = 900;

export function Book({ course, pdfIndex, page: requested, marker, ticks, onTick }: Props) {
  const url = course.pdfUrls[pdfIndex] as string | undefined;
  const [doc, setDoc] = useState<Doc>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState(requested);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!url) return setDoc({ status: 'error' });
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    setDoc({ status: 'loading' });
    (async () => {
      const [{ getDocument, GlobalWorkerOptions }, { default: workerSrc }] = await Promise.all([
        import('pdfjs-dist/legacy/build/pdf.mjs'),
        import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
      ]);
      GlobalWorkerOptions.workerSrc = workerSrc;
      const file = { courseId: course.id, index: pdfIndex, url };
      const data = await getPdf(file);
      if (cancelled) return;
      task = getDocument({ data });
      let loaded: PDFDocumentProxy;
      try {
        loaded = await task.promise;
      } catch (e) {
        if (!cancelled && !isPdf(data)) await dropPdf(file);
        throw e;
      }
      if (cancelled) return;
      setPage((p) => clamp(p, loaded.numPages));
      setDoc({ status: 'ready', pdf: loaded });
    })().catch(() => !cancelled && setDoc({ status: 'error' }));
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [url, attempt]);

  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => setPage(requested), [requested]);

  const pdf = doc.status === 'ready' ? doc.pdf : null;
  const total = pdf?.numPages ?? 0;
  const current = pdf ? clamp(page, total) : page;

  useEffect(() => {
    if (!pdf || !canvas.current || !wrap.current) return;
    let cancelled = false;
    let task: { cancel(): void } | null = null;
    (async () => {
      const p = await pdf.getPage(current);
      if (cancelled) return;
      const base = p.getViewport({ scale: 1 });
      const width = Math.min((wrap.current!.clientWidth || 360) - 28, MAX_PAGE_WIDTH);
      const viewport = p.getViewport({ scale: (width / base.width) * (devicePixelRatio || 1) });
      const el = canvas.current!;
      el.width = Math.floor(viewport.width);
      el.height = Math.floor(viewport.height);
      const render = p.render({ canvas: el, viewport });
      task = render;
      await render.promise;
    })().catch((e) => {
      if (!cancelled && e?.name !== 'RenderingCancelledException') setDoc({ status: 'error' });
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, current, width]);

  const go = (delta: number) => pdf && setPage(clamp(current + delta, total));
  const onTouchEnd = (e: TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx > 0 ? 1 : -1);
  };

  const next = course.next;
  const showTick = next !== null;
  const range = marker && next?.startPage != null && next.estEndPage != null ? `ص ${ar(next.startPage)} إلى نحو ${ar(next.estEndPage)}` : '';

  return (
    <div class="book">
      <div class="pdfbar">
        <a class="back" href={`#/course/${course.id}`} aria-label="رجوع">
          <Icon id="i-back" />
        </a>
        <div class="t">
          <b>{arText(course.title)}</b>
          {range && <span>{range}</span>}
        </div>
        {pdf && <span class="pill o">ص {ar(current)}</span>}
      </div>
      <div
        class="pdfwrap"
        ref={wrap}
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={onTouchEnd}
      >
        {doc.status === 'loading' && <p class="quiet">…</p>}
        {doc.status === 'error' && (
          <div class="booker">
            <p class="quiet">تعذّر تحميل الكتاب</p>
            <button class="chip retry" onClick={() => setAttempt((a) => a + 1)}>
              إعادة المحاولة
            </button>
            {url && (
              <a class="chip" href={url} target="_blank" rel="noopener">
                افتح في المتصفح
              </a>
            )}
          </div>
        )}
        {pdf && (
          <div class="pg">
            {marker && current === clamp(requested, total) && <span class="mkbanner">بداية الدرس القادم تقريبًا</span>}
            <canvas ref={canvas} />
          </div>
        )}
      </div>
      <div class="pdffoot">
        {showTick ? (
          <Tick label="قرأتُه" done={ticks.read.has(`${course.id}:${next.number}`)} onClick={() => onTick('read', course.id, next.number)} />
        ) : (
          <span />
        )}
        {pdf && (
          <div class="pager">
            <button class="chip" aria-label="الصفحة السابقة" disabled={current <= 1} onClick={() => go(-1)}>
              ›
            </button>
            <span>
              ص {ar(current)} / {ar(total)}
            </span>
            <button class="chip" aria-label="الصفحة التالية" disabled={current >= total} onClick={() => go(1)}>
              ‹
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
