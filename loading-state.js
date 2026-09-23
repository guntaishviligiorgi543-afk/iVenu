(() => {
  const locks = new Set();
  const lockClass = "initial-load-scroll-locked";
  const bootToken = "page-boot";
  let loader = null;
  let renderFrame = 0;
  let observer = null;

  const visible = (element) => {
    const style = window.getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && bounds.width > 0 && bounds.height > 0 && bounds.bottom > 0 && bounds.top < window.innerHeight;
  };

  const addBlock = (fragment, bounds, logo = false) => {
    const block = document.createElement("span");
    block.className = `skeletonBlock initialPageLoaderBlock${logo ? " initialPageLoaderLogo" : ""}`;
    block.style.left = `${Math.max(0, bounds.left)}px`;
    block.style.top = `${Math.max(0, bounds.top)}px`;
    block.style.width = `${Math.min(window.innerWidth, bounds.right) - Math.max(0, bounds.left)}px`;
    block.style.height = `${Math.min(window.innerHeight, bounds.bottom) - Math.max(0, bounds.top)}px`;
    fragment.append(block);
  };

  const renderLoader = () => {
    if (!loader || !document.body) return;
    const header = document.querySelector("header");
    const main = document.querySelector("main");
    const firstSection = main?.querySelector(":scope > section") || main?.firstElementChild;
    const cart = document.querySelector("#eventCartToggle");
    const targets = [header, firstSection, cart].filter(Boolean);
    const fragment = document.createDocumentFragment();

    targets.forEach((target) => {
      const elements = [
        ...target.children,
        ...target.querySelectorAll("img, svg, button, input, select, textarea, label, a, p, h1, h2, h3, h4, h5, h6, li, [role], [class]"),
      ];
      const seen = new Set();
      elements.forEach((element) => {
        if (seen.has(element) || !visible(element)) return;
        seen.add(element);
        const logoImage = element.matches(".logo img, .auth-page-logo img");
        if (element.closest(".logo, .auth-page-logo") && !logoImage) return;
        addBlock(fragment, element.getBoundingClientRect(), logoImage);
      });
    });

    loader.replaceChildren(fragment);
  };

  const queueRender = () => {
    if (!loader || renderFrame) return;
    renderFrame = requestAnimationFrame(() => {
      renderFrame = 0;
      renderLoader();
    });
  };

  const mountLoader = () => {
    if (!document.body || loader) return;
    loader = document.createElement("div");
    loader.className = "initialPageLoader";
    loader.setAttribute("role", "status");
    loader.setAttribute("aria-label", "Loading page");
    document.body.append(loader);
    observer = new MutationObserver((records) => {
      if (records.some((record) => !loader.contains(record.target))) queueRender();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    renderLoader();
  };

  const unmountLoader = () => {
    if (renderFrame) cancelAnimationFrame(renderFrame);
    renderFrame = 0;
    observer?.disconnect();
    observer = null;
    loader?.remove();
    loader = null;
  };

  const sync = () => {
    const locked = locks.size > 0;
    document.documentElement.classList.toggle(lockClass, locked);
    document.body?.classList.toggle(lockClass, locked);
    if (locked) mountLoader();
    else unmountLoader();
  };

  const lock = (name) => {
    const token = name || Symbol("initial-load");
    let released = false;
    locks.add(token);
    sync();
    return () => {
      if (released) return;
      released = true;
      locks.delete(token);
      sync();
    };
  };

  const waitForImage = (image) =>
    new Promise((resolve) => {
      if (!image?.src) {
        resolve(false);
        return;
      }
      if (image.complete) {
        resolve(image.naturalWidth > 0);
        return;
      }
      image.addEventListener("load", () => resolve(true), { once: true });
      image.addEventListener("error", () => resolve(false), { once: true });
    });

  window.pageLoading = { lock, waitForImage };
  window.addEventListener("resize", queueRender, { passive: true });
  document.addEventListener("DOMContentLoaded", () => {
    sync();
    queueRender();
  }, { once: true });
  const releaseBoot = lock(bootToken);
  window.addEventListener("load", releaseBoot, { once: true });
  window.addEventListener("pagehide", () => {
    locks.clear();
    sync();
  });
})();
