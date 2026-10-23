'use client';

import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Render outside scrolling panels so table overflow cannot clip the explanation. */
export default function Info({ text }: { text: string }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const hovering = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  function show() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  }
  function enter() {
    hovering.current = true;
    show();
  }
  function deferClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      if (!hovering.current && document.activeElement !== trigger.current) setOpen(false);
    }, 120);
  }
  function leave() {
    hovering.current = false;
    deferClose();
  }

  useLayoutEffect(() => {
    if (!open || !trigger.current || !tooltip.current) return;
    const anchor = trigger.current.getBoundingClientRect();
    const bubble = tooltip.current.getBoundingClientRect();
    const margin = 12;
    const above = anchor.top - bubble.height - 8;
    setPosition({
      left: Math.max(
        margin,
        Math.min(anchor.right - bubble.width, window.innerWidth - bubble.width - margin),
      ),
      top: Math.max(
        margin,
        above >= margin
          ? above
          : Math.min(anchor.bottom + 8, window.innerHeight - bubble.height - margin),
      ),
    });
    const dismiss = () => setOpen(false);
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !trigger.current?.contains(event.target) &&
        !tooltip.current?.contains(event.target)
      )
        dismiss();
    };
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    document.addEventListener('keydown', keyDown);
    document.addEventListener('pointerdown', outside);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
      document.removeEventListener('keydown', keyDown);
      document.removeEventListener('pointerdown', outside);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, [open, text]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="info"
        aria-label="הסבר"
        aria-describedby={open ? id : undefined}
        onMouseEnter={enter}
        onMouseLeave={leave}
        onFocus={show}
        onBlur={deferClose}
        onClick={show}
      >
        ?
      </button>
      {open &&
        createPortal(
          <span
            ref={tooltip}
            id={id}
            className="tooltip"
            role="tooltip"
            dir="rtl"
            style={position}
            onMouseEnter={enter}
            onMouseLeave={leave}
          >
            {text}
          </span>,
          document.body,
        )}
    </>
  );
}
