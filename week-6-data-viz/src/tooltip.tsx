import * as React from "react";
import { createPortal } from "react-dom";

const GAP_PX = 6;
const EDGE_PX = 8;

const tipFor = (target: EventTarget | null) => (target instanceof Element ? target.closest("[data-tip]") : null);

/** Shows any element's "data-tip" on hover, focus or tap - fixed on <body> so panels can't clip it. */
export const Tooltip = () => {
	const [anchor, setAnchor] = React.useState<Element | null>(null);
	const tooltip = React.useRef<HTMLDivElement>(null);

	React.useEffect(() => {
		const hide = () => setAnchor(null);
		const onPointerOver = (event: PointerEvent) => {
			const element = tipFor(event.target);
			if (element && event.pointerType === "mouse") setAnchor(element);
		};
		const onPointerOut = (event: PointerEvent) => {
			if (tipFor(event.target) && event.pointerType === "mouse") hide();
		};
		const onPointerDown = (event: PointerEvent) => {
			if (!tipFor(event.target)) hide();
		};
		const onFocusIn = (event: FocusEvent) => {
			const element = tipFor(event.target);
			if (element) setAnchor(element);
		};
		// Also keeps a tap from toggling the filter checkbox the icon sits in.
		const onClick = (event: MouseEvent) => {
			const element = tipFor(event.target);
			if (element) {
				event.preventDefault();
				setAnchor(element);
			}
		};
		document.addEventListener("pointerover", onPointerOver);
		document.addEventListener("pointerout", onPointerOut);
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("focusin", onFocusIn);
		document.addEventListener("focusout", hide);
		document.addEventListener("click", onClick);
		document.addEventListener("scroll", hide, { capture: true, passive: true });
		return () => {
			document.removeEventListener("pointerover", onPointerOver);
			document.removeEventListener("pointerout", onPointerOut);
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("focusin", onFocusIn);
			document.removeEventListener("focusout", hide);
			document.removeEventListener("click", onClick);
			document.removeEventListener("scroll", hide, { capture: true });
		};
	}, []);

	// Above the element if there's room, else below - measured once the text is in.
	React.useLayoutEffect(() => {
		if (!anchor || !tooltip.current) {
			return;
		}
		const rect = anchor.getBoundingClientRect();
		const { width, height } = tooltip.current.getBoundingClientRect();
		const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, EDGE_PX), window.innerWidth - width - EDGE_PX);
		const above = rect.top - height - GAP_PX;
		tooltip.current.style.left = `${left}px`;
		tooltip.current.style.top = `${above < EDGE_PX ? rect.bottom + GAP_PX : above}px`;
	}, [anchor]);

	return createPortal(
		<div ref={tooltip} className="tooltip" role="tooltip" hidden={!anchor}>
			{anchor?.getAttribute("data-tip")}
		</div>,
		document.body,
	);
};
