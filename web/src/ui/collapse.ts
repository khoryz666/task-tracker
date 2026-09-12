/**
 * A smoothly animated show/hide wrapper (height 0 <-> natural height),
 * shared by the task edit panel and the "more options" add-task panel.
 */
export interface Collapse {
  root: HTMLDivElement;
  setExpanded(next: boolean): void;
  toggle(): void;
  isExpanded(): boolean;
}

export function createCollapse(content: HTMLElement): Collapse {
  const root = document.createElement("div");
  root.className = "collapse";
  root.style.maxHeight = "0px";
  root.append(content);

  let expanded = false;

  function setExpanded(next: boolean): void {
    if (next === expanded) return;
    expanded = next;

    if (next) {
      root.style.maxHeight = `${content.scrollHeight}px`;
      const onEnd = (e: TransitionEvent): void => {
        if (e.propertyName !== "max-height") return;
        root.removeEventListener("transitionend", onEnd);
        if (expanded) root.style.maxHeight = "none";
      };
      root.addEventListener("transitionend", onEnd);
    } else {
      // lock in the current rendered height (may be "none") before animating to 0
      root.style.maxHeight = `${content.scrollHeight}px`;
      requestAnimationFrame(() => {
        root.style.maxHeight = "0px";
      });
    }
  }

  // keep an expanded panel's height in sync as its content grows (e.g. a
  // resized textarea), so it doesn't get clipped mid-edit
  content.addEventListener("input", () => {
    if (expanded) root.style.maxHeight = `${content.scrollHeight}px`;
  });

  return { root, setExpanded, toggle: () => setExpanded(!expanded), isExpanded: () => expanded };
}
