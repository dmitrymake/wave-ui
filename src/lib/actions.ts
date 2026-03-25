export function longpress(node: HTMLElement, duration = 2000): { destroy(): void } {
  let timer: ReturnType<typeof setTimeout>;

  const handleStart = (e: MouseEvent | TouchEvent): void => {
    if (e.type === "mousedown" && (e as MouseEvent).button !== 0) return;

    timer = setTimeout(() => {
      node.dispatchEvent(
        new CustomEvent("longpress", {
          detail: { originalEvent: e },
        }),
      );
    }, duration);
  };

  const handleEnd = (): void => {
    clearTimeout(timer);
  };

  node.addEventListener("mousedown", handleStart);
  node.addEventListener("touchstart", handleStart, { passive: true });

  node.addEventListener("mouseup", handleEnd);
  node.addEventListener("mouseleave", handleEnd);
  node.addEventListener("touchend", handleEnd);
  node.addEventListener("touchcancel", handleEnd);
  node.addEventListener("touchmove", handleEnd);

  return {
    destroy() {
      node.removeEventListener("mousedown", handleStart);
      node.removeEventListener("touchstart", handleStart);
      node.removeEventListener("mouseup", handleEnd);
      node.removeEventListener("mouseleave", handleEnd);
      node.removeEventListener("touchend", handleEnd);
      node.removeEventListener("touchcancel", handleEnd);
      node.removeEventListener("touchmove", handleEnd);
    },
  };
}
