import { useNavigate, useLocation } from "@remix-run/react";
import { MoreVertical, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DropdownMenu, DropdownMenuItem } from "~/components/ui/dropdown-menu";
import { useTabs, normTabPath } from "~/lib/tabs";
import { useKeyboardShortcuts, type Shortcut } from "~/lib/useKeyboardShortcuts";
import { useT } from "~/lib/site-context";
import { cn } from "~/lib/utils";

/**
 * Drives a custom overlay scrollbar over a horizontally-scrolling element whose
 * native scrollbar is hidden (`.scrollbar-none`). Returns a ref to attach to the
 * scroll container, the thumb geometry (as 0–1 fractions of the track), and a
 * flag for whether the content overflows at all.
 *
 * The thumb is positioned/sized from `scrollLeft / scrollWidth / clientWidth`,
 * recomputed on scroll, resize, and whenever the tab set changes.
 */
function useOverlayScrollbar(deps: unknown[]) {
  const ref = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ width: 0, left: 0 });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { scrollWidth, clientWidth, scrollLeft } = el;
    if (scrollWidth <= clientWidth) {
      setThumb({ width: 0, left: 0 });
      return;
    }
    setThumb({
      width: clientWidth / scrollWidth,
      left: scrollLeft / scrollWidth,
    });
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Translate vertical wheel ticks into horizontal scroll, the way VS Code does.
  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    // Only hijack a predominantly-vertical wheel; let trackpad horizontal
    // gestures (deltaX) scroll natively.
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      el.scrollLeft += e.deltaY;
    }
  }, []);

  return {
    ref,
    thumb,
    onScroll: measure,
    onWheel,
    hasOverflow: thumb.width > 0,
  };
}

/**
 * Editor-style tab strip shown **only above the content area** (right of the
 * sidebar). Renders nothing when no tabs are open. The active tab is whichever
 * one matches the current URL. Clicking a tab navigates to it; the × button
 * closes it — closing the active tab activates a neighbor (right, else left).
 * A vertical-dots button at the far end (always visible, outside the scroll
 * region) closes all tabs at once.
 */
export default function TabBar() {
  const t = useT();
  const { tabs, closeTab, closeAll } = useTabs();
  const navigate = useNavigate();
  const location = useLocation();
  const { ref, thumb, onScroll, onWheel, hasOverflow } = useOverlayScrollbar([
    tabs.length,
  ]);

  const cur = normTabPath(location.pathname);

  // Close a tab by path: drop it, and if it was the active one, move to a
  // neighbor (prefer the right, else the left). Shared by the × button and the
  // `w` shortcut. Defined before the empty-tabs early return so the hook below
  // it always runs (hooks can't follow a conditional return).
  const closePath = useCallback(
    (path: string) => {
      const norm = normTabPath(path);
      const idx = tabs.findIndex((t) => normTabPath(t.path) === norm);
      const wasActive = norm === cur;
      closeTab(path);
      if (wasActive && tabs.length > 1) {
        const neighbor = tabs[idx + 1] ?? tabs[idx - 1];
        if (neighbor) navigate(neighbor.path);
      }
    },
    [tabs, cur, closeTab, navigate]
  );

  // `w` (outside text fields) closes the current tab — bare key, so no clash
  // with the browser's reserved Ctrl/Cmd+W. No-op when no tab matches the URL.
  const tabShortcuts = useMemo<Shortcut[]>(
    () => [
      {
        keys: "w",
        label: "close current tab",
        group: "tabs",
        run: () => {
          if (tabs.some((t) => normTabPath(t.path) === cur)) closePath(cur);
        },
      },
    ],
    [tabs, cur, closePath]
  );
  useKeyboardShortcuts(tabShortcuts);

  if (tabs.length === 0) return null;

  const close = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    e.preventDefault();
    closePath(path);
  };

  // Stickiness is handled by the grid cell wrapper in root.tsx (sticky top-11),
  // since a sticky grid item can travel the whole grid height while this inner
  // strip's own parent box is only as tall as the strip.
  return (
    <div
      data-tab-strip
      className="flex h-9 items-stretch border-b bg-background max-md:hidden"
    >
      {/* Scrollable tab list wrapper. `group/strip relative` is the positioning
			    context for the overlay scrollbar, which sits as a non-scrolling
			    sibling pinned to the bottom edge. */}
      <div className="group/strip relative flex min-w-0 flex-1 items-stretch">
        {/* The scroll region itself. The native scrollbar is hidden
				    (`scrollbar-none`) so it reserves no vertical space and never
				    shifts the tab text. Vertical wheel ticks scroll it horizontally
				    (VS Code style) via onWheel. */}
        <div
          ref={ref}
          onScroll={onScroll}
          onWheel={onWheel}
          className="flex min-w-0 flex-1 items-stretch overflow-x-auto scrollbar-none"
        >
          {tabs.map((tab) => {
            const isActive = normTabPath(tab.path) === cur;
            return (
              <div
                key={tab.path}
                title={tab.title}
                onClick={() => navigate(tab.path)}
                className={cn(
                  "group flex max-w-[12rem] shrink-0 cursor-pointer items-center gap-1.5 border-r pl-3 pr-1.5 text-sm select-none",
                  "transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-foreground"
                    : "bg-background text-muted-foreground hover:bg-sidebar-accent/60"
                )}
              >
                <span className="min-w-0 truncate">{tab.title}</span>
                <button
                  type="button"
                  aria-label={`${t('close')} ${tab.title}`}
                  // The `w` shortcut closes the *active* tab, so only hint it there.
                  title={isActive ? t('closeTabHint') : undefined}
                  onClick={(e) => close(e, tab.path)}
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded hover:bg-foreground/10",
                    isActive
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100"
                  )}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
        {/* Overlay scrollbar. Non-scrolling sibling pinned to the bottom edge
				    of the strip; only rendered when the tabs overflow. The thumb's
				    width/offset are fractions of the track, derived from the scroll
				    geometry. It's invisible until the strip is hovered, then fades in
				    — so it costs no layout space and stays out of the way. */}
        {hasOverflow && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5">
            <div
              className={cn(
                "h-full rounded-full bg-border opacity-0 transition-opacity",
                "group-hover/strip:opacity-100"
              )}
              style={{
                width: `${thumb.width * 100}%`,
                marginLeft: `${thumb.left * 100}%`,
              }}
            />
          </div>
        )}
      </div>
      {/* Actions menu: pinned at the end, outside the scroll region, so the
			    trigger stays visible no matter how far the tab list scrolls. The
			    vertical-dots button opens a dropdown with "close all tabs". */}
      <DropdownMenu
        align="end"
        label={t('tabActions')}
        className={({ open }) =>
          cn(
            "flex h-full w-9 shrink-0 items-center justify-center border-l text-muted-foreground",
            "transition-colors hover:bg-sidebar-accent/60 hover:text-foreground",
            open && "bg-sidebar-accent text-foreground"
          )
        }
        trigger={() => <MoreVertical className="size-4" />}
      >
        <DropdownMenuItem onSelect={closeAll}>
          <X className="size-4 shrink-0 text-muted-foreground" />
          <span>{t('closeAllTabs')} ({tabs.length})</span>
        </DropdownMenuItem>
      </DropdownMenu>
    </div>
  );
}
