export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number | boolean>,
  children?: (HTMLElement | string)[],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);

  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === true) {
        el.setAttribute(key, "");
      } else if (value !== false && value != null) {
        el.setAttribute(key, String(value));
      }
    }
  }

  if (children) {
    for (const child of children) {
      if (typeof child === "string") {
        el.appendChild(document.createTextNode(child));
      } else {
        el.appendChild(child);
      }
    }
  }

  return el;
}

export function removeAllChildren(parent: HTMLElement): void {
  while (parent.firstChild) {
    parent.removeChild(parent.firstChild);
  }
}

export function show(el: HTMLElement): void {
  el.style.display = "";
  el.removeAttribute("hidden");
}

export function hide(el: HTMLElement): void {
  el.style.display = "none";
}

export function isHidden(el: HTMLElement): boolean {
  return el.style.display === "none" || el.hasAttribute("hidden");
}

export function addClass(el: HTMLElement, ...classes: string[]): void {
  el.classList.add(...classes.filter(Boolean));
}

export function removeClass(el: HTMLElement, ...classes: string[]): void {
  el.classList.remove(...classes);
}

export function toggleClass(el: HTMLElement, className: string, force?: boolean): boolean {
  return el.classList.toggle(className, force);
}

export function setAttributes(
  el: HTMLElement,
  attrs: Record<string, string | number | boolean | null>,
): void {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) {
      el.removeAttribute(key);
    } else if (value === true) {
      el.setAttribute(key, "");
    } else if (value === false) {
      el.removeAttribute(key);
    } else {
      el.setAttribute(key, String(value));
    }
  }
}

export function on<K extends keyof HTMLElementEventMap>(
  el: HTMLElement | Document | Window,
  event: K,
  handler: (e: HTMLElementEventMap[K]) => void,
  options?: AddEventListenerOptions,
): () => void {
  el.addEventListener(event, handler as EventListener, options);
  return () => el.removeEventListener(event, handler as EventListener, options);
}

export function onDelegate<T extends HTMLElement>(
  parent: HTMLElement,
  selector: string,
  event: string,
  handler: (e: Event, target: T) => void,
  options?: AddEventListenerOptions,
): () => void {
  const listener = (e: Event) => {
    const target = (e.target as HTMLElement).closest(selector) as T | null;
    if (target) {
      handler(e, target);
    }
  };
  parent.addEventListener(event, listener, options);
  return () => parent.removeEventListener(event, listener, options);
}