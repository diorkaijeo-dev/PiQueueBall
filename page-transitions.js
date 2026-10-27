(function () {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  document.addEventListener("click", (event) => {
    if (reducedMotion.matches || event.defaultPrevented || event.button !== 0
      || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const link = event.target.closest("a");
    if (!link || link.target || link.hasAttribute("download")) return;
    const destination = new URL(link.href, window.location.href);
    const current = new URL(window.location.href);
    if (destination.protocol !== current.protocol || destination.host !== current.host
      || destination.pathname === current.pathname || !/\.html$/i.test(destination.pathname)) return;
    if (destination.pathname.slice(0, destination.pathname.lastIndexOf("/") + 1)
      !== current.pathname.slice(0, current.pathname.lastIndexOf("/") + 1)) return;

    event.preventDefault();
    document.body.classList.add("page-leaving");
    window.setTimeout(() => {
      window.location.assign(destination.href);
    }, 160);
  });
}());
