(() => {
  "use strict";

  const POINTER_DRAG_THRESHOLD = 6;
  const WHEEL_ZOOM_SENSITIVITY = 0.0015;

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const distance = (first, second) => Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
  const midpoint = (first, second) => ({
    clientX: (first.clientX + second.clientX) / 2,
    clientY: (first.clientY + second.clientY) / 2,
  });
  const parseViewBox = (svg, fallback) => {
    const values = (svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
    if (values.length === 4 && values.every(Number.isFinite)) return values;
    return [...fallback];
  };
  const isEditableTarget = (target) => target instanceof Element
    && (target.matches("input, textarea, select, button, [contenteditable='true']") || target.closest("[contenteditable='true']"));

  class HallMapViewportController {
    static attachSvg({ viewport, svg, viewBox, maxScale = 5 }) {
      return new HallMapViewportController({ viewport, content: svg, mode: "svg", viewBox, maxScale });
    }

    static attachHtml({ viewport, content, maxScale = 5 }) {
      return new HallMapViewportController({ viewport, content, mode: "html", maxScale });
    }

    constructor({ viewport, content, mode, viewBox, maxScale }) {
      if (!viewport || !content) throw new Error("Hall map viewport and content are required.");
      this.viewport = viewport;
      this.content = content;
      this.mode = mode;
      this.maxScale = maxScale;
      this.pointerRecords = new Map();
      this.pan = null;
      this.pinch = null;
      this.frameId = 0;
      this.suppressSeatClickUntil = 0;
      this.hasDragged = false;
      this.layout = null;
      this.baseViewBox = mode === "svg" ? parseViewBox(content, viewBox) : null;
      this.state = mode === "svg"
        ? { scale: 1, translateX: 0, translateY: 0 }
        : { scale: 1, translateX: 0, translateY: 0, fitScale: 1, contentWidth: 1, contentHeight: 1 };

      viewport.classList.add("hall-map-viewport");
      viewport.setAttribute("tabindex", "0");
      viewport.setAttribute("data-hall-map-viewport", "true");
      if (mode === "html") viewport.setAttribute("data-seat-interaction-root", "true");
      content.classList.add("hall-map-surface");
      if (mode === "html") content.classList.add("hall-map-html-content");
      this.controls = this.createControls();
      viewport.appendChild(this.controls);
      this.bindEvents();
      this.measureLayout();
      this.fit();
      this.observeResize();
    }

    createControls() {
      const controls = document.createElement("div");
      controls.className = "hall-map-controls";
      controls.setAttribute("aria-label", "Hall map navigation");
      controls.innerHTML = [
        '<div class="hall-map-zoom-controls">',
        '<button type="button" data-map-action="zoom-in" aria-label="Zoom in">+</button>',
        '<button type="button" data-map-action="zoom-out" aria-label="Zoom out">−</button>',
        '<button type="button" data-map-action="fit" aria-label="Fit map to view">Fit</button>',
        "</div>",
      ].join("");
      return controls;
    }

    bindEvents() {
      this.controls.addEventListener("click", (event) => {
        const action = event.target.closest("button")?.dataset.mapAction;
        if (!action) return;
        event.preventDefault();
        this.viewport.focus({ preventScroll: true });
        if (action === "zoom-in") this.zoomAt(this.state.scale * 1.25, this.viewportCenter());
        if (action === "zoom-out") this.zoomAt(this.state.scale / 1.25, this.viewportCenter());
        if (action === "fit") this.fit();
        if (action === "pan-left") this.panByFraction(-0.28, 0);
        if (action === "pan-right") this.panByFraction(0.28, 0);
        if (action === "pan-up") this.panByFraction(0, -0.28);
        if (action === "pan-down") this.panByFraction(0, 0.28);
      });

      this.viewport.addEventListener("pointerdown", (event) => this.onPointerDown(event));
      this.viewport.addEventListener("pointermove", (event) => this.onPointerMove(event), { passive: false });
      this.viewport.addEventListener("pointerup", (event) => this.onPointerEnd(event));
      this.viewport.addEventListener("pointercancel", (event) => this.onPointerEnd(event));
      this.viewport.addEventListener("lostpointercapture", (event) => this.onPointerEnd(event));
      this.viewport.addEventListener("wheel", (event) => this.onWheel(event), { passive: false });
      this.viewport.addEventListener("keydown", (event) => this.onKeyDown(event));

      // This runs before the delegated seat click handler. Only a completed drag
      // is swallowed; a normal seat click continues through untouched.
      this.viewport.addEventListener("click", (event) => {
        if (Date.now() > this.suppressSeatClickUntil) return;
        this.suppressSeatClickUntil = 0;
        if (!event.target.closest(".seat[data-event-seat-id]")) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      }, true);
    }

    observeResize() {
      if (typeof ResizeObserver === "undefined") return;
      this.resizeObserver = new ResizeObserver(() => {
        this.measureLayout();
        if (this.mode === "html") this.measureHtmlContent();
        this.clampState();
        this.scheduleRender();
      });
      this.resizeObserver.observe(this.viewport);
    }

    viewportRect() {
      return this.layout?.viewport || this.viewport.getBoundingClientRect();
    }

    measureLayout() {
      const viewport = this.viewport.getBoundingClientRect();
      this.layout = { viewport };
      if (this.mode !== "svg") return;
      const rect = this.content.getBoundingClientRect();
      const aspect = this.baseViewBox[2] / Math.max(this.baseViewBox[3], 1);
      const width = Math.min(rect.width, rect.height * aspect);
      const height = width / Math.max(aspect, 1);
      this.layout.svgBox = {
        left: rect.left + (rect.width - width) / 2,
        top: rect.top + (rect.height - height) / 2,
        width: Math.max(width, 1),
        height: Math.max(height, 1),
      };
    }

    viewportCenter() {
      const rect = this.viewportRect();
      return { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
    }

    svgRenderedBox() {
      return this.layout?.svgBox || this.content.getBoundingClientRect();
    }

    visibleSvgViewBox() {
      const [baseX, baseY, baseWidth, baseHeight] = this.baseViewBox;
      const width = baseWidth / this.state.scale;
      const height = baseHeight / this.state.scale;
      return [
        baseX + (baseWidth - width) / 2 - this.state.translateX,
        baseY + (baseHeight - height) / 2 - this.state.translateY,
        width,
        height,
      ];
    }

    pointerInContent(event) {
      if (this.mode === "svg") {
        const rect = this.svgRenderedBox();
        return {
          x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
          y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
          width: rect.width,
          height: rect.height,
        };
      }
      const rect = this.viewportRect();
      return {
        x: clamp((event.clientX - rect.left) / Math.max(rect.width, 1), 0, 1),
        y: clamp((event.clientY - rect.top) / Math.max(rect.height, 1), 0, 1),
        width: Math.max(rect.width, 1),
        height: Math.max(rect.height, 1),
      };
    }

    onPointerDown(event) {
      if (event.target.closest(".hall-map-controls")) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      this.viewport.focus({ preventScroll: true });
      const record = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
        dragged: false,
      };
      this.pointerRecords.set(event.pointerId, record);
      if (this.pointerRecords.size === 1) this.startPan(record);
      if (this.pointerRecords.size === 2) this.startPinch();
    }

    onPointerMove(event) {
      const record = this.pointerRecords.get(event.pointerId);
      if (!record) return;
      record.clientX = event.clientX;
      record.clientY = event.clientY;

      if (this.pointerRecords.size >= 2) {
        this.updatePinch();
        event.preventDefault();
        return;
      }
      if (!this.pan || this.pan.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - this.pan.startX;
      const deltaY = event.clientY - this.pan.startY;
      if (!record.dragged && Math.hypot(deltaX, deltaY) < POINTER_DRAG_THRESHOLD) return;
      if (!record.dragged) {
        record.dragged = true;
        this.hasDragged = true;
        this.viewport.setPointerCapture?.(event.pointerId);
        this.setPanning(true);
      }
      const dimensions = this.pan.dimensions;
      this.state.translateX = this.pan.translateX + deltaX * dimensions.mapWidth / dimensions.screenWidth;
      this.state.translateY = this.pan.translateY + deltaY * dimensions.mapHeight / dimensions.screenHeight;
      this.clampState();
      this.scheduleRender();
      event.preventDefault();
    }

    onPointerEnd(event) {
      const record = this.pointerRecords.get(event.pointerId);
      if (record?.dragged || this.hasDragged) this.suppressSeatClickUntil = Date.now() + 450;
      this.pointerRecords.delete(event.pointerId);
      if (this.viewport.hasPointerCapture?.(event.pointerId)) this.viewport.releasePointerCapture(event.pointerId);
      this.pinch = null;
      this.setPanning(false);
      if (this.pointerRecords.size === 1) this.startPan([...this.pointerRecords.values()][0]);
      if (!this.pointerRecords.size) {
        this.pan = null;
        this.hasDragged = false;
      }
    }

    startPan(record) {
      this.pan = {
        pointerId: record.pointerId,
        startX: record.clientX,
        startY: record.clientY,
        translateX: this.state.translateX,
        translateY: this.state.translateY,
        dimensions: this.currentPanDimensions(),
      };
    }

    startPinch() {
      const [first, second] = [...this.pointerRecords.values()];
      this.pan = null;
      this.pinch = {
        firstId: first.pointerId,
        secondId: second.pointerId,
        distance: Math.max(distance(first, second), 1),
        midpoint: midpoint(first, second),
      };
      first.dragged = true;
      second.dragged = true;
      this.hasDragged = true;
      this.viewport.setPointerCapture?.(first.pointerId);
      this.viewport.setPointerCapture?.(second.pointerId);
      this.setPanning(true);
    }

    updatePinch() {
      const [first, second] = [...this.pointerRecords.values()];
      if (!first || !second) return;
      if (!this.pinch) this.startPinch();
      const nextDistance = Math.max(distance(first, second), 1);
      const nextMidpoint = midpoint(first, second);
      this.zoomAt(this.state.scale * nextDistance / this.pinch.distance, nextMidpoint, false);
      const deltaX = nextMidpoint.clientX - this.pinch.midpoint.clientX;
      const deltaY = nextMidpoint.clientY - this.pinch.midpoint.clientY;
      if (this.mode === "svg") {
        const dimensions = this.currentPanDimensions();
        this.state.translateX += deltaX * dimensions.mapWidth / dimensions.screenWidth;
        this.state.translateY += deltaY * dimensions.mapHeight / dimensions.screenHeight;
      } else {
        this.state.translateX += deltaX;
        this.state.translateY += deltaY;
      }
      this.pinch.distance = nextDistance;
      this.pinch.midpoint = nextMidpoint;
      this.clampState();
      this.scheduleRender();
    }

    onWheel(event) {
      if (event.target.closest(".hall-map-controls")) return;
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY);
      this.zoomAt(this.state.scale * factor, event);
    }

    onKeyDown(event) {
      if (isEditableTarget(event.target)) return;
      const keyActions = {
        ArrowLeft: () => this.panByFraction(-0.28, 0),
        ArrowRight: () => this.panByFraction(0.28, 0),
        ArrowUp: () => this.panByFraction(0, -0.28),
        ArrowDown: () => this.panByFraction(0, 0.28),
        "+": () => this.zoomAt(this.state.scale * 1.25, this.viewportCenter()),
        "=": () => this.zoomAt(this.state.scale * 1.25, this.viewportCenter()),
        "-": () => this.zoomAt(this.state.scale / 1.25, this.viewportCenter()),
        _: () => this.zoomAt(this.state.scale / 1.25, this.viewportCenter()),
        "0": () => this.fit(),
      };
      const action = keyActions[event.key];
      if (!action) return;
      event.preventDefault();
      action();
    }

    currentPanDimensions() {
      if (this.mode === "svg") {
        const viewBox = this.visibleSvgViewBox();
        const box = this.svgRenderedBox();
        return { mapWidth: viewBox[2], mapHeight: viewBox[3], screenWidth: box.width, screenHeight: box.height };
      }
      return {
        mapWidth: 1,
        mapHeight: 1,
        screenWidth: 1,
        screenHeight: 1,
      };
    }

    panByFraction(horizontal, vertical) {
      if (this.mode === "svg") {
        const [, , width, height] = this.visibleSvgViewBox();
        this.state.translateX += width * horizontal;
        this.state.translateY += height * vertical;
      } else {
        const rect = this.viewportRect();
        this.state.translateX += rect.width * horizontal;
        this.state.translateY += rect.height * vertical;
      }
      this.clampState();
      this.scheduleRender();
    }

    zoomAt(targetScale, focalEvent, render = true) {
      const oldScale = this.state.scale;
      const minimum = this.mode === "svg" ? 1 : this.state.fitScale;
      const nextScale = clamp(targetScale, minimum, this.maxScale);
      if (Math.abs(nextScale - oldScale) < 0.0001) return;
      if (this.mode === "svg") {
        const oldViewBox = this.visibleSvgViewBox();
        const pointer = this.pointerInContent(focalEvent);
        const focalX = oldViewBox[0] + oldViewBox[2] * pointer.x;
        const focalY = oldViewBox[1] + oldViewBox[3] * pointer.y;
        this.state.scale = nextScale;
        const [baseX, baseY, baseWidth, baseHeight] = this.baseViewBox;
        const nextWidth = baseWidth / nextScale;
        const nextHeight = baseHeight / nextScale;
        this.state.translateX = baseX + (baseWidth - nextWidth) / 2 - (focalX - nextWidth * pointer.x);
        this.state.translateY = baseY + (baseHeight - nextHeight) / 2 - (focalY - nextHeight * pointer.y);
      } else {
        const rect = this.viewportRect();
        const localX = focalEvent.clientX - rect.left;
        const localY = focalEvent.clientY - rect.top;
        const contentX = (localX - this.state.translateX) / oldScale;
        const contentY = (localY - this.state.translateY) / oldScale;
        this.state.scale = nextScale;
        this.state.translateX = localX - contentX * nextScale;
        this.state.translateY = localY - contentY * nextScale;
      }
      this.clampState();
      if (render) this.scheduleRender();
    }

    measureHtmlContent() {
      const width = Math.max(this.content.scrollWidth, this.content.offsetWidth, 1);
      const height = Math.max(this.content.scrollHeight, this.content.offsetHeight, 1);
      this.state.contentWidth = width;
      this.state.contentHeight = height;
    }

    fit() {
      if (this.mode === "svg") {
        this.state.scale = 1;
        this.state.translateX = 0;
        this.state.translateY = 0;
      } else {
        this.measureHtmlContent();
        const rect = this.viewportRect();
        const fitScale = Math.min(1, rect.width / this.state.contentWidth, rect.height / this.state.contentHeight);
        this.state.fitScale = Math.max(fitScale || 1, 0.01);
        this.state.scale = this.state.fitScale;
        this.state.translateX = (rect.width - this.state.contentWidth * this.state.scale) / 2;
        this.state.translateY = (rect.height - this.state.contentHeight * this.state.scale) / 2;
      }
      this.clampState();
      this.render();
    }

    clampState() {
      if (this.mode === "svg") {
        const [, , baseWidth, baseHeight] = this.baseViewBox;
        const width = baseWidth / this.state.scale;
        const height = baseHeight / this.state.scale;
        const overscrollX = Math.max(baseWidth * 0.045, width * 0.08);
        const overscrollY = Math.max(baseHeight * 0.045, height * 0.08);
        const limitX = Math.max(0, (baseWidth - width) / 2) + overscrollX;
        const limitY = Math.max(0, (baseHeight - height) / 2) + overscrollY;
        this.state.translateX = clamp(this.state.translateX, -limitX, limitX);
        this.state.translateY = clamp(this.state.translateY, -limitY, limitY);
        return;
      }
      const rect = this.viewportRect();
      const width = this.state.contentWidth * this.state.scale;
      const height = this.state.contentHeight * this.state.scale;
      const overscrollX = Math.min(rect.width * 0.12, Math.max(20, width * 0.08));
      const overscrollY = Math.min(rect.height * 0.12, Math.max(20, height * 0.08));
      const centeredX = (rect.width - width) / 2;
      const centeredY = (rect.height - height) / 2;
      const minX = width >= rect.width ? rect.width - width - overscrollX : centeredX - overscrollX;
      const maxX = width >= rect.width ? overscrollX : centeredX + overscrollX;
      const minY = height >= rect.height ? rect.height - height - overscrollY : centeredY - overscrollY;
      const maxY = height >= rect.height ? overscrollY : centeredY + overscrollY;
      this.state.translateX = clamp(this.state.translateX, minX, maxX);
      this.state.translateY = clamp(this.state.translateY, minY, maxY);
    }

    setPanning(isPanning) {
      this.viewport.classList.toggle("is-panning", isPanning);
      this.content.classList.toggle("is-panning", isPanning);
    }

    scheduleRender() {
      if (this.frameId) return;
      this.frameId = requestAnimationFrame(() => {
        this.frameId = 0;
        this.render();
      });
    }

    render() {
      if (this.mode === "svg") {
        const viewBox = this.visibleSvgViewBox();
        this.content.setAttribute("viewBox", viewBox.map((value) => value.toFixed(3)).join(" "));
        return;
      }
      this.content.style.transform = `translate(${this.state.translateX.toFixed(2)}px, ${this.state.translateY.toFixed(2)}px) scale(${this.state.scale.toFixed(4)})`;
    }
  }

  window.HallMapViewportController = HallMapViewportController;
})();
