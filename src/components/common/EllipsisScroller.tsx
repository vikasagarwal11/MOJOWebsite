import React, { HTMLAttributes } from "react";

type Props = {
  text?: string | null;
  asLink?: "mailto" | "tel" | null;
} & HTMLAttributes<HTMLDivElement>;

/**
 * Single-line, ellipsized text that becomes horizontally scrollable
 * on hover/focus. Works great inside tables/grids.
 */
export function EllipsisScroller({ text, asLink, className = "", ...rest }: Props) {
  const value = (text ?? "").trim();
  if (!value) return <span className="text-xs text-gray-400">-</span>;

  const content =
    asLink === "mailto" ? (
      <a href={`mailto:${value}`} className="no-underline text-inherit">
        {value}
      </a>
    ) : asLink === "tel" ? (
      <a href={`tel:${value}`} className="no-underline text-inherit">
        {value}
      </a>
    ) : (
      value
    );

  return (
    <div
      // outer wrapper needs min-w-0 so truncation can work inside grids/flex
      className={`min-w-0 ${className}`}
      title={value}               // quick full-text on hover
      {...rest}
    >
      <div
        // default: hidden + truncate; on hover/focus: allow horizontal scroll
        className="
          inline-block max-w-full align-middle
          whitespace-nowrap overflow-hidden truncate
          focus:outline-none
          group/scroll
        "
        tabIndex={0}               // keyboard focus to scroll with arrows
        onWheel={(e) => {          // make mouse wheel scroll horizontally
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            (e.currentTarget as HTMLElement).scrollLeft += e.deltaY;
          }
        }}
        // Tailwind can't toggle overflow via :hover on the same class list,
        // so we do it inline dynamically with onMouseEnter/Leave (simple & reliable)
        onMouseEnter={(e) => (e.currentTarget.style.overflowX = "auto")}
        onMouseLeave={(e) => (e.currentTarget.style.overflowX = "hidden")}
        onFocus={(e) => (e.currentTarget.style.overflowX = "auto")}
        onBlur={(e) => (e.currentTarget.style.overflowX = "hidden")}
      >
        <span className="block text-xs text-gray-700 pr-1">{content}</span>
      </div>
    </div>
  );
}

