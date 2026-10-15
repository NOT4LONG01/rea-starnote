import {
  interpolateStrokePoints,
  generateRibbonGeometry,
  renderStrokeToCanvas,
  ribbonToPath,
  RawStrokePoint,
  BrushParameters
} from "../model/stroke-interpolator";
import { StarNoteDocument, ParsedTile, ParsedStroke, ParsedTextBox } from "../model/note-loader";
import { isMathText, latexOf } from "../model/math";
import { PenType, penById, penScaleOf } from "../model/pens";
import { ShapeKind, shapePoints } from "../model/shapes";
import { DEFAULT_FORMAT, PageFormat, PageTemplate, cellTag, drawPageTemplate, gridRectOf, newCanvasTile, newPageTile, nextPageTag, relayout, sizeOfPage, spacingOf } from "../model/pages";

type PageRect = { left: number; top: number; right: number; bottom: number };
type Action =
  | { kind: "draw"; stroke: ParsedStroke }
  | { kind: "erase"; strokes: ParsedStroke[] }
  | { kind: "replace"; from: ParsedStroke[]; to: ParsedStroke[] } // move / recolor / resize a selection
  | { kind: "text"; from: ParsedTextBox[]; to: ParsedTextBox[] }; // create / edit / delete a text box

/** Everything needed to park an open note (editor tab) and come back to it. */
export interface ViewSnapshot {
  doc: StarNoteDocument | null;
  strokes: ParsedStroke[];
  undoStack: Action[];
  redoStack: Action[];
  panX: number;
  panY: number;
  zoom: number;
}

/** Copied drawings, in world coordinates. Module-level, so they survive switching to another note. */
type ClipStroke = Pick<ParsedStroke, "color" | "width" | "alpha" | "sens" | "pen" | "durationMs" | "points">;
let drawingClipboard: ClipStroke[] = [];

/** What the view shows before any note is open. */
const NO_DOC_PAGE: PageRect = { left: 0, top: 0, right: 2100, bottom: 2100 };

export interface TextDraft {
  x: number; y: number; box: ParsedTextBox | null; text: string; caret: number; caretOn: boolean;
  size: number; bold: boolean; italic: boolean; color: string;
  /** Typeset formula (math drafts): shown instead of `text`; null while it is empty or not ready. */
  math?: { img: HTMLImageElement | null; w: number; h: number };
}

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private doc: StarNoteDocument | null = null;

  // Viewport transforms
  public panX: number = 0;
  public panY: number = 0;
  public zoom: number = 0.5; // Start at 50% to see multiple tiles

  // Active stylus drawing session
  public activeTool: "pan" | "pen" | "eraser" | "lasso" | "shape" | "text" = "pen";
  public shapeKind: ShapeKind = "rect";
  /** How close (screen px) the eraser has to be to a stroke to take it. */
  public eraserReach = 14;
  public penColor: string = "#B33333";
  public penWidth: number = 5.0;
  /** The pen type in use: scales the width and sets opacity and pressure response of new strokes. */
  public penType: PenType = penById("fountain");
  public smoothLevel: number = 0.2;
  public pressureSensitivity: number = 0.375;

  // Multiplatform / Android / Tablet features
  public stylusOnly: boolean = false; // Palm-rejection: ignore touch events when drawing
  public eInkMode: boolean = false;   // High-contrast rendering for Onyx Boox / E-ink screens

  // Zoom change callback for UI synchronization
  public onZoomChange?: (zoom: number) => void;
  /** Fired when strokes or undo history change (drives dirty flag and toolbar state). */
  public onChange?: () => void;
  /** Fired after every repaint (pan, zoom, draw): used to keep the page label in sync. */
  public onRender?: () => void;
  private bars!: Record<"x" | "y", { track: HTMLElement; thumb: HTMLElement }>;

  // Rendering: the page canvas is repainted only when the page changes (and merely slid when panning); a pen move repaints just the overlay
  private overlay: HTMLCanvasElement = document.createElement("canvas"); // transparent layer above the page: live stroke, selection, lasso
  private octx!: CanvasRenderingContext2D;
  private overlayDirty = false;
  /** Text being typed right on the page: drawn live on the overlay (the box it replaces is hidden on the page meanwhile). */
  private textDraft: TextDraft | null = null;
  private sceneValid = false;
  private frame = 0;                // pending requestAnimationFrame id (redraws are coalesced to one per frame)
  private frameFull = false;        // that frame must repaint the scene, not only the overlay
  private strokeCache = new WeakMap<ParsedStroke, { pts: RawStrokePoint[]; smooth: number; viewerSens: number; path: Path2D | null; l: number; t: number; r: number; b: number }>();
  private view = { l: 0, t: 0, r: 0, b: 0 }; // visible area in world coordinates, for culling
  private predicted: RawStrokePoint[] = [];  // where the pen is about to be (drawn, never saved)
  private lastSampleTime = -1;              // timestamp of the newest pen sample taken, so a sample is never taken twice
  private lastLiveDraw = 0;
  private sceneZoom = 0; private scenePanX = 0; private scenePanY = 0; // view the cached scene was painted for
  private notifyTimer = 0;      // onRender is throttled: it drives DOM (page label, buttons), the canvas must not wait for it
  private zoomPreview = false;     // during a zoom gesture the painted bitmap is scaled instead of repainted
  private zoomSettle = 0;
  private zoomBase: HTMLCanvasElement | null = null;
  private slideBuf: HTMLCanvasElement | null = null;
  private isDrawing: boolean = false;
  private drawingPointerId: number | null = null;
  private isPanning: boolean = false;
  private isPinching: boolean = false;

  private lastMouseX: number = 0;
  private lastMouseY: number = 0;
  private currentStrokePoints: RawStrokePoint[] = [];
  private strokeStartTime: number = 0;
  private userDrawnStrokes: ParsedStroke[] = [];
  private undoStack: Action[] = [];
  private redoStack: Action[] = [];
  private isErasing: boolean = false;
  // Lasso selection: strokes (pending or saved) picked with a freehand loop, then moved / recolored / deleted
  private selected = new Set<ParsedStroke>();
  private selBox: { l: number; t: number; r: number; b: number } | null = null; // world coords
  private lassoPath: { x: number; y: number }[] = [];
  private isLassoing: boolean = false;
  private isMovingSel: boolean = false;
  private textTap: { id: number; x: number; y: number } | null = null; // Text tool: pointer went down, waiting for the tap to finish
  /** The Text tool was tapped at this spot; `box` is the text box under it, if any. */
  public onTextRequest?: (at: { x: number; y: number; clientX: number; clientY: number; box: ParsedTextBox | null }) => void;
  private mathCache = new Map<string, { img: HTMLImageElement | null; w: number; h: number }>();
  private shapeFrom: { x: number; y: number } | null = null; // a shape is being dragged out
  private shapeTo: { x: number; y: number } = { x: 0, y: 0 };
  private moveFrom = { x: 0, y: 0 };
  private selOffset = { x: 0, y: 0 };
  /** Fired when something was copied, so the Paste button can appear. */
  public onClipboardChange?: () => void;
  /** Fired when the selection appears, changes or goes away. */
  public onSelectionChange?: () => void;
  /** A short message for the user (e.g. why a move was refused). */
  public onNotice?: (msg: string) => void;
  private eraseBySignal: boolean = false; // erasing because of the pen's eraser end / button, not the selected tool
  private erasedNow: ParsedStroke[] = [];

  // Multi-touch tracking for pinch-zoom on Android & touch displays
  private activePointers = new Map<number, { x: number; y: number; pointerType: string }>();
  private initialPinchDist: number = 0;
  private initialZoom: number = 1.0;
  private lastPinchMidX: number = 0;
  private lastPinchMidY: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Could not get 2D canvas context");
    this.ctx = ctx;

    this.overlay.className = "note-overlay";
    this.canvas.insertAdjacentElement("afterend", this.overlay);
    this.octx = this.overlay.getContext("2d", { alpha: true, desynchronized: true })!;
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.bindPointerEvents();
    this.createScrollbars();
  }

  public setDocument(doc: StarNoteDocument) {
    if (doc.tiles.size === 0) { // every open note has at least one page
      doc.layout = "stack";
      doc.tiles.set("Page[0-0]", newPageTile("Page[0-0]", DEFAULT_FORMAT));
      relayout(doc);
    }
    this.doc = doc;
    this.userDrawnStrokes = [];
    this.undoStack = [];
    this.redoStack = [];
    this.clearSelection();
    this.onChange?.();

    // Focus on the first tile or center of document
    if (doc.layout === "stack") {
      this.fit("page", this.stackTiles()[0].pageRect);
    } else if (doc.infinite) {
      this.fit("width", gridRectOf("Page[0-0]"));
    } else {
      this.centerOnTile(doc.tiles.values().next().value as ParsedTile);
    }
  }

  public getDocument(): StarNoteDocument | null {
    return this.doc;
  }

  public getUserStrokes(): ParsedStroke[] {
    return this.userDrawnStrokes;
  }

  /** Drop exactly the strokes that were written to the archive (others drawn meanwhile stay pending). */
  public markSaved(saved: ParsedStroke[], deleted: ParsedStroke[] = []) {
    const gone = new Set([...saved, ...deleted]);
    this.clearSelection(); // saved copies are new objects
    this.userDrawnStrokes = this.userDrawnStrokes.filter((s) => !gone.has(s));
    const keep = (a: Action) =>
      a.kind === "draw" ? !gone.has(a.stroke)
      : a.kind === "erase" ? !a.strokes.some((s) => gone.has(s))
      : a.kind === "text" ? false // saved boxes were written: their history ends here, like strokes'
      : ![...a.from, ...a.to].some((s) => gone.has(s));
    this.undoStack = this.undoStack.filter(keep);
    this.redoStack = this.redoStack.filter(keep);
    this.onChange?.();
    this.render();
  }

  public canUndo(): boolean { return this.undoStack.length > 0; }
  public canRedo(): boolean { return this.redoStack.length > 0; }

  public undo(): boolean {
    const a = this.undoStack.pop();
    if (!a) return false;
    this.apply(a, true);
    this.redoStack.push(a);
    this.afterHistory();
    return true;
  }

  public redo(): boolean {
    const a = this.redoStack.pop();
    if (!a) return false;
    this.apply(a, false);
    this.undoStack.push(a);
    this.afterHistory();
    return true;
  }

  private apply(a: Action, reverse: boolean) {
    const add = (list: ParsedStroke[]) => {
      for (const st of list) {
        const tile = st.src && this.doc?.tiles.get(st.src.tag);
        if (tile) { // a saved stroke: back into its page, no longer queued for deletion
          tile.strokes.push(st);
          this.doc!.removedStrokes = (this.doc!.removedStrokes ?? []).filter((x) => x !== st);
        } else this.userDrawnStrokes.push(st);
      }
    };
    const del = (list: ParsedStroke[]) => {
      for (const st of list) this.removeStroke(st);
    };
    if (a.kind === "replace") {
      if (reverse) { del(a.to); add(a.from); } else { del(a.from); add(a.to); }
      return;
    }
    if (a.kind === "text") {
      const [gone, back] = reverse ? [a.to, a.from] : [a.from, a.to];
      gone.forEach((b) => this.dropTextBox(b));
      back.forEach((b) => this.putTextBox(b));
      return;
    }
    const strokes = a.kind === "draw" ? [a.stroke] : a.strokes;
    // draw: forward adds, reverse removes. erase: forward removes, reverse adds back.
    if ((a.kind === "draw") !== reverse) add(strokes); else del(strokes);
  }

  private afterHistory() {
    this.clearSelection();
    this.onChange?.();
    this.render();
  }

  private commit(a: Action) {
    this.undoStack.push(a);
    this.redoStack = [];
    this.onChange?.();
  }

  public snapshot(): ViewSnapshot {
    return {
      doc: this.doc,
      strokes: this.userDrawnStrokes,
      undoStack: this.undoStack,
      redoStack: this.redoStack,
      panX: this.panX,
      panY: this.panY,
      zoom: this.zoom,
    };
  }

  public restore(v: ViewSnapshot) {
    this.clearSelection();
    this.doc = v.doc;
    this.userDrawnStrokes = v.strokes;
    this.undoStack = v.undoStack;
    this.redoStack = v.redoStack;
    this.panX = v.panX;
    this.panY = v.panY;
    this.zoom = v.zoom;
    this.onChange?.();
    this.render();
    this.notifyZoom();
  }

  public centerOnTile(tile: ParsedTile) {
    const tileCenterX = tile.rect.left + 1050.0;
    const tileCenterY = tile.rect.top + 1050.0;
    this.panX = this.canvas.width / 2 - tileCenterX * this.zoom;
    this.panY = this.canvas.height / 2 - tileCenterY * this.zoom;
    this.render();
    this.notifyZoom();
  }

  public resize() {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    if (!rect) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.overlay.width = this.canvas.width;
    this.overlay.height = this.canvas.height;
    this.render();
  }

  private notifyZoom() {
    if (this.onZoomChange) {
      this.onZoomChange(this.zoom);
    }
  }

  private bindPointerEvents() {
    // Wheel zoom (Desktop)
    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      // Plain wheel / two-finger scroll pans like a document; Ctrl (or trackpad pinch) zooms.
      if (!e.ctrlKey && !e.metaKey) {
        const dpr = window.devicePixelRatio || 1;
        const unit = e.deltaMode === 1 ? 16 : 1; // lines -> px
        this.panX -= e.deltaX * unit * dpr;
        this.panY -= e.deltaY * unit * dpr;
        this.scheduleRender("pan");
        return;
      }
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const mouseX = e.clientX - this.canvas.getBoundingClientRect().left;
      const mouseY = e.clientY - this.canvas.getBoundingClientRect().top;

      const dpr = window.devicePixelRatio || 1;
      const worldX = (mouseX * dpr - this.panX) / this.zoom;
      const worldY = (mouseY * dpr - this.panY) / this.zoom;

      this.zoom = Math.min(3.0, Math.max(0.05, this.zoom * zoomFactor));
      this.panX = mouseX * dpr - worldX * this.zoom;
      this.panY = mouseY * dpr - worldY * this.zoom;

      this.scheduleRender("zoom");
      this.notifyZoom();
    }, { passive: false });

    // Pointer down (mouse, pen, touch)
    this.canvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.canvas.setPointerCapture(e.pointerId);

      this.activePointers.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
        pointerType: e.pointerType,
      });

      const isPen = e.pointerType === "pen";
      const isTouch = e.pointerType === "touch";

      // Palm Rejection: If user is already drawing with pen, ignore any resting palm touches!
      if (this.isDrawing && this.drawingPointerId !== null && isTouch) {
        return;
      }

      // Check multi-touch pinch zoom detection (only if both pointers are touch and not pen drawing)
      if (this.activePointers.size === 2 && !this.isDrawing) {
        const pts = Array.from(this.activePointers.values());
        if (pts.every(p => p.pointerType === "touch")) {
          this.isPinching = true;
          this.isPanning = false;
          this.initialPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          this.initialZoom = this.zoom;
          this.lastPinchMidX = (pts[0].x + pts[1].x) / 2;
          this.lastPinchMidY = (pts[0].y + pts[1].y) / 2;
          return;
        }
      }

      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;

      // Stylus-only palm rejection mode:
      if (this.stylusOnly && isTouch) {
        // Touch is restricted strictly to panning
        this.isPanning = true;
        return;
      }

      const tool = this.toolFor(e);
      if (tool === "pan" || e.button === 1 || (e as any).spaceKey) {
        this.isPanning = true;
        return;
      }

      if (tool === "eraser") {
        this.beginErase(e, this.activeTool !== "eraser");
        return;
      }

      if (tool === "shape") {
        this.beginShape(e);
        return;
      }

      if (tool === "text") {
        this.textTap = { id: e.pointerId, x: e.clientX, y: e.clientY };
        return;
      }

      if (tool === "lasso") {
        const w = this.toWorld(e);
        if (this.selBox && this.insideSelBox(w.x, w.y)) this.beginMove(e, w); else this.beginLasso(e, w);
        return;
      }

      if (tool === "pen") {
        // If a pen touches down while panning was active from touch, pen takes immediate priority
        if (isPen && this.isPanning) {
          this.isPanning = false;
        }
        this.beginDraw(e);
      }
    });

    this.canvas.addEventListener("pointermove", (e) => {
      if (this.activePointers.has(e.pointerId)) {
        this.activePointers.set(e.pointerId, {
          x: e.clientX,
          y: e.clientY,
          pointerType: e.pointerType,
        });
      }

      const dpr = window.devicePixelRatio || 1;
      const rect = this.canvas.getBoundingClientRect();

      // Handle 2-finger pinch-to-zoom and pan
      if (this.isPinching && this.activePointers.size === 2) {
        const pts = Array.from(this.activePointers.values());
        const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const currentMidX = (pts[0].x + pts[1].x) / 2;
        const currentMidY = (pts[0].y + pts[1].y) / 2;

        if (this.initialPinchDist > 0) {
          const factor = currentDist / this.initialPinchDist;
          const newZoom = Math.min(3.0, Math.max(0.05, this.initialZoom * factor));

          const canvasMidX = (currentMidX - rect.left) * dpr;
          const canvasMidY = (currentMidY - rect.top) * dpr;

          const worldMidX = (canvasMidX - this.panX) / this.zoom;
          const worldMidY = (canvasMidY - this.panY) / this.zoom;

          this.zoom = newZoom;
          this.panX = canvasMidX - worldMidX * this.zoom;
          this.panY = canvasMidY - worldMidY * this.zoom;

          // Pan by midpoint delta
          const deltaMidX = (currentMidX - this.lastPinchMidX) * dpr;
          const deltaMidY = (currentMidY - this.lastPinchMidY) * dpr;
          this.panX += deltaMidX;
          this.panY += deltaMidY;

          this.lastPinchMidX = currentMidX;
          this.lastPinchMidY = currentMidY;

          this.scheduleRender("zoom");
          this.notifyZoom();
        }
        return;
      }

      const mouseX = (e.clientX - rect.left) * dpr;
      const mouseY = (e.clientY - rect.top) * dpr;
      const worldX = (mouseX - this.panX) / this.zoom;
      const worldY = (mouseY - this.panY) / this.zoom;

      if (this.isPanning && !this.isDrawing) {
        const dx = (e.clientX - this.lastMouseX) * dpr;
        const dy = (e.clientY - this.lastMouseY) * dpr;
        this.panX += dx;
        this.panY += dy;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.scheduleRender("pan");
        return;
      }

      if (this.shapeFrom && e.pointerId === this.drawingPointerId) {
        this.shapeTo = { x: worldX, y: worldY };
        this.scheduleRender("overlay");
        return;
      }

      if (e.pointerId === this.drawingPointerId && (this.isLassoing || this.isMovingSel)) {
        if (this.isLassoing) this.lassoPath.push({ x: worldX, y: worldY });
        else this.selOffset = { x: worldX - this.moveFrom.x, y: worldY - this.moveFrom.y };
        this.scheduleRender("overlay");
        return;
      }

      if (e.pointerType === "pen" && e.pointerId === this.drawingPointerId) { // eraser end / barrel button pressed or released mid-stroke
        const want = this.toolFor(e);
        if (this.isDrawing && want === "eraser") { this.endDraw(); this.beginErase(e, true); return; }
        if (this.isErasing && this.eraseBySignal && want === "pen") { this.endErase(); this.beginDraw(e); return; }
      }

      if (this.isErasing && e.pointerId === this.drawingPointerId) {
        this.eraseAt(e);
        return;
      }

      // Drawing only responds to the pointer that initiated it
      if (this.isDrawing && e.pointerId === this.drawingPointerId) {
        // a pen reports faster than the screen refreshes: take every sample, not just the last one, and look ahead a little
        const batch = e.getCoalescedEvents?.();
        for (const c of batch && batch.length ? batch : [e]) this.addPointFromEvent(c); // (some sources report an empty list)
        this.predicted = [];
        for (const pe of e.getPredictedEvents?.() ?? []) this.predicted.push(this.pointFrom(pe));
        this.scheduleRender("overlay");
      }
    });

    // The pen reports before the screen is ready for the next frame (pointerrawupdate): put the new samples on the overlay
    // at once instead of waiting for the animation frame, which takes about a frame of latency off the ink following the tip.
    this.canvas.addEventListener("pointerrawupdate", (ev: Event) => {
      const e = ev as PointerEvent;
      if (!this.isDrawing || e.pointerId !== this.drawingPointerId || e.pointerType !== "pen") return;
      const batch = e.getCoalescedEvents?.();
      for (const c of batch && batch.length ? batch : [e]) this.addPointFromEvent(c);
      this.predicted = []; // stale: pointermove looks ahead again once per frame
      const now = performance.now();
      if (now - this.lastLiveDraw < 3) return; // a very fast pen: the next frame picks the rest up
      this.lastLiveDraw = now;
      this.drawOverlay();
    });

    const stopAction = (e: PointerEvent) => {
      this.activePointers.delete(e.pointerId);

      if (this.textTap && this.textTap.id === e.pointerId) {
        const t = this.textTap;
        this.textTap = null;
        if (e.type === "pointerup" && Math.hypot(e.clientX - t.x, e.clientY - t.y) < 8) {
          const w = this.toWorld(e);
          this.onTextRequest?.({ x: w.x, y: w.y, clientX: e.clientX, clientY: e.clientY, box: this.textBoxAt(w.x, w.y) });
        }
      }

      if (this.isPinching && this.activePointers.size < 2) {
        this.isPinching = false;
        this.initialPinchDist = 0;
      }

      if (this.isPanning && this.activePointers.size === 0) {
        this.isPanning = false;
      }

      if (this.isErasing && e.pointerId === this.drawingPointerId) this.endErase();
      if (this.shapeFrom && e.pointerId === this.drawingPointerId) this.endShape();
      if (this.isLassoing && e.pointerId === this.drawingPointerId) this.endLasso();
      if (this.isMovingSel && e.pointerId === this.drawingPointerId) this.endMove();

      // Only finish drawing if the drawing pointer itself lifted!
      // If a resting palm lifted while pen is still down, do NOT end the pen stroke!
      if (this.isDrawing && e.pointerId === this.drawingPointerId) this.endDraw();
    };

    this.canvas.addEventListener("pointerup", stopAction);
    this.canvas.addEventListener("pointercancel", stopAction);
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault()); // a pen barrel button must not open a menu
  }

  /** The tool this pointer acts with: the pen's eraser end (buttons & 32) erases, its side button (buttons & 2) lassos. */
  private toolFor(e: PointerEvent): "pan" | "pen" | "eraser" | "lasso" | "shape" | "text" {
    if (e.pointerType === "pen") {
      if ((e.buttons & 32) || e.button === 5) return "eraser";
      if (this.activeTool === "pen" && ((e.buttons & 2) || e.button === 2)) return "lasso";
    }
    return this.activeTool;
  }

  private beginErase(e: PointerEvent, bySignal: boolean) {
    this.isErasing = true;
    this.eraseBySignal = bySignal;
    this.drawingPointerId = e.pointerId;
    this.erasedNow = [];
    this.eraseAt(e);
  }

  private endErase() {
    this.isErasing = false;
    this.eraseBySignal = false;
    this.drawingPointerId = null;
    if (this.erasedNow.length > 0) this.commit({ kind: "erase", strokes: this.erasedNow });
    this.erasedNow = [];
  }

  private beginDraw(e: PointerEvent) {
    if (this.selected.size) { this.clearSelection(); this.render(); }
    this.isDrawing = true;
    this.drawingPointerId = e.pointerId;
    this.strokeStartTime = e.timeStamp;
    this.currentStrokePoints = [];
    this.predicted = [];
    this.lastSampleTime = -1;
    this.addPointFromEvent(e);
  }

  // ------------------------------------------------------------ text boxes
  private tileAt(x: number, y: number): ParsedTile | null {
    if (this.doc?.infinite) { this.ensureTiles([{ x, y }]); return this.doc.tiles.get(cellTag(x, y)) ?? null; }
    for (const t of this.doc?.tiles.values() ?? []) {
      const r = t.pageRect ?? t.rect;
      if (x >= r.left && x < r.right && y >= r.top && y < r.bottom) return t;
    }
    return null;
  }

  /** Show (or with null, remove) the text being typed in place. `x`,`y` is the text's top-left in world coordinates. */
  public setTextDraft(d: TextDraft | null) {
    const boxChanged = this.textDraft?.box !== d?.box;
    this.textDraft = d;
    if (boxChanged) this.render(); else this.touchOverlay();
  }
  public updateTextDraft(patch: Partial<TextDraft>) {
    if (this.textDraft) { Object.assign(this.textDraft, patch); this.touchOverlay(); }
  }
  /** Pan (not zoom) so that a world rectangle is on screen, clear of a panel docked over the right/bottom edge (CSS px). */
  public revealRect(r: { l: number; t: number; r: number; b: number }, inset: { right: number; bottom: number }) {
    const dpr = this.canvas.width / (this.canvas.clientWidth || 1), pad = 16 * dpr;
    const W = this.canvas.width - inset.right * dpr, H = this.canvas.height - inset.bottom * dpr;
    const shift = (lo: number, hi: number, size: number) => { let d = hi > size - pad ? size - pad - hi : 0; if (lo + d < pad) d = pad - lo; return d; };
    const dx = shift(r.l * this.zoom + this.panX, r.r * this.zoom + this.panX, W);
    const dy = shift(r.t * this.zoom + this.panY, r.b * this.zoom + this.panY, H);
    if (dx || dy) { this.panX += dx; this.panY += dy; this.render(); }
  }
  public blinkCaret() { if (this.textDraft) this.updateTextDraft({ caretOn: !this.textDraft.caretOn }); }
  public touchOverlay() { this.overlayDirty = true; this.drawOverlay(); }
  public textDraftRect(): { l: number; t: number; r: number; b: number } | null {
    const d = this.textDraft;
    if (!d) return null;
    const m = d.math ? { width: d.math.w, height: d.math.h } : this.measureText(d.text, d.size, d.bold, d.italic);
    return { l: d.x - 4, t: d.y - 4, r: d.x + Math.max(m.width, d.size * 2) + 4, b: d.y + Math.max(m.height, d.size) + 4 };
  }

  private drawTextDraft(d: TextDraft) {
    const ctx = this.ctx, fs = Math.max(16, d.size), lh = fs * 1.25, accent = "#3b82f6";
    if (d.math) { // a formula: the typeset image (the last good one while the source has an error), in the same frame
      const r = this.textDraftRect()!;
      ctx.save();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5 / this.zoom;
      ctx.setLineDash([6 / this.zoom, 4 / this.zoom]);
      ctx.strokeRect(r.l, r.t, r.r - r.l, r.b - r.t);
      if (d.math.img) ctx.drawImage(d.math.img, d.x, d.y, d.math.w, d.math.h);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.font = this.textFont(d.size, d.bold, d.italic);
    ctx.textBaseline = "top";
    const lines = d.text.split("\n");
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width), fs * 2);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5 / this.zoom;
    ctx.setLineDash([6 / this.zoom, 4 / this.zoom]);
    ctx.strokeRect(d.x - 4, d.y - 4, w + 8, lines.length * lh + 8);
    ctx.fillStyle = this.eInkMode ? "#000000" : d.color;
    lines.forEach((l, i) => ctx.fillText(l, d.x, d.y + i * lh));
    if (d.caretOn) {
      const before = d.text.slice(0, d.caret).split("\n");
      ctx.fillStyle = accent;
      ctx.fillRect(d.x + ctx.measureText(before[before.length - 1]).width, d.y + (before.length - 1) * lh, 2 / this.zoom, fs);
    }
    ctx.restore();
  }

  /** Top-left of a text box in world coordinates (box rects are tile-local). */
  public textBoxOrigin(b: ParsedTextBox): { x: number; y: number } {
    const t = b.tag ? this.doc?.tiles.get(b.tag) : null;
    return { x: (t?.rect.left ?? 0) + b.rect.left, y: (t?.rect.top ?? 0) + b.rect.top };
  }

  public textBoxAt(x: number, y: number): ParsedTextBox | null {
    const pad = 16 / this.zoom; // ~16 device px around a box: a finger or pen tap just outside still edits it
    let hit: ParsedTextBox | null = null;
    for (const t of this.doc?.tiles.values() ?? []) {
      for (const b of t.textBoxes ?? []) {
        if (x >= t.rect.left + b.rect.left - pad && x <= t.rect.left + b.rect.right + pad && y >= t.rect.top + b.rect.top - pad && y <= t.rect.top + b.rect.bottom + pad) hit = b;
      }
    }
    return hit;
  }

  private putTextBox(b: ParsedTextBox) {
    const tile = b.tag ? this.doc?.tiles.get(b.tag) : null;
    if (!tile || !this.doc) return;
    (tile.textBoxes ??= []).push(b);
    if (b.saved) this.doc.removedTextBoxes = (this.doc.removedTextBoxes ?? []).filter((x) => x !== b);
    else (this.doc.addedTextBoxes ??= []).push(b);
  }

  private dropTextBox(b: ParsedTextBox) {
    const tile = b.tag ? this.doc?.tiles.get(b.tag) : null;
    if (!tile || !this.doc) return;
    tile.textBoxes = (tile.textBoxes ?? []).filter((x) => x !== b);
    if (b.saved) (this.doc.removedTextBoxes ??= []).push(b);
    else this.doc.addedTextBoxes = (this.doc.addedTextBoxes ?? []).filter((x) => x !== b);
  }

  private textFont(size: number, bold?: boolean, italic?: boolean) {
    return `${italic ? "italic " : ""}${bold ? "bold " : "500 "}${Math.max(16, size)}px system-ui, -apple-system, sans-serif`;
  }

  /** Size of plain text laid out the way renderTile draws it. */
  public measureText(text: string, size: number, bold?: boolean, italic?: boolean) {
    this.ctx.save();
    this.ctx.font = this.textFont(size, bold, italic);
    const lines = text.split("\n");
    const width = Math.max(...lines.map((l) => this.ctx.measureText(l).width), 10);
    this.ctx.restore();
    return { width, height: lines.length * Math.max(16, size) * 1.25 };
  }

  /**
   * Create / change / delete a text box. `at` is the spot that was tapped (world coordinates); a box that already
   * exists keeps its page. `size` is the box's width and height (measured text, or the typeset math).
   * A change is one undo step.
   */
  public commitTextBox(existing: ParsedTextBox | null, spec: { text: string; color: string; fontSize: number; isBold?: boolean; isItalic?: boolean; size: { width: number; height: number } } | null, at: { x: number; y: number }): boolean {
    if (!this.doc) return false;
    let next: ParsedTextBox | null = null;
    if (spec && spec.text.trim()) {
      const tile = existing?.tag ? this.doc.tiles.get(existing.tag) ?? null : this.tileAt(at.x, at.y);
      if (!tile) { this.onNotice?.("Tap on a page to place text."); return false; }
      const pr = tile.pageRect ?? tile.rect;
      const maxRight = pr.right - tile.rect.left, maxBottom = pr.bottom - tile.rect.top;
      const w = Math.min(spec.size.width, maxRight - 20), h = Math.min(spec.size.height, maxBottom - 20);
      let left = existing ? existing.rect.left : at.x - tile.rect.left, top = existing ? existing.rect.top : at.y - tile.rect.top;
      left = Math.max(pr.left - tile.rect.left + 10, Math.min(left, maxRight - w - 10));
      top = Math.max(pr.top - tile.rect.top + 10, Math.min(top, maxBottom - h - 10));
      next = { tag: tile.pageTag, saved: false, shapeUuid: crypto.randomUUID(), text: spec.text, color: spec.color, fontSize: spec.fontSize, isBold: !!spec.isBold, isItalic: !!spec.isItalic, rect: { left, top, right: left + w, bottom: top + h } };
    }
    if (!existing && !next) return true;
    const from = existing ? [existing] : [], to = next ? [next] : [];
    from.forEach((b) => this.dropTextBox(b));
    to.forEach((b) => this.putTextBox(b));
    this.commit({ kind: "text", from, to });
    this.render();
    return true;
  }

  /** Typeset math as an image, loaded lazily; the canvas repaints when it is ready. */
  private drawMath(tb: ParsedTextBox) {
    const color = this.eInkMode ? "#000000" : tb.color;
    const key = `${latexOf(tb.text)}|${tb.fontSize}|${color}`;
    let m = this.mathCache.get(key);
    if (!m) {
      m = { img: null, w: 0, h: 0 };
      this.mathCache.set(key, m);
      const entry = m;
      void import("../model/math").then(({ renderMath }) => renderMath(latexOf(tb.text), Math.max(16, tb.fontSize), color)).then((r) => {
        const img = new Image();
        img.onload = () => { entry.img = img; entry.w = r.width; entry.h = r.height; this.render(); };
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(r.svg);
      }).catch(() => { /* the raw LaTeX stays visible */ });
    }
    if (m.img) this.ctx.drawImage(m.img, tb.rect.left, tb.rect.top, m.w, m.h);
    return !!m.img;
  }

  private beginShape(e: PointerEvent) {
    if (this.selected.size) this.clearSelection();
    this.drawingPointerId = e.pointerId;
    this.shapeFrom = this.toWorld(e);
    this.shapeTo = this.shapeFrom;
  }

  private shapeStroke(): ParsedStroke | null {
    if (!this.shapeFrom) return null;
    const base = this.newStrokeBase();
    return { ...base, shapeUuid: crypto.randomUUID(), parentUuid: crypto.randomUUID(), durationMs: 200, points: shapePoints(this.shapeKind, this.shapeFrom, this.shapeTo, base.width) };
  }

  private endShape() {
    const st = this.shapeStroke();
    const tiny = this.shapeFrom && Math.hypot(this.shapeTo.x - this.shapeFrom.x, this.shapeTo.y - this.shapeFrom.y) * this.zoom < 6;
    this.shapeFrom = null;
    this.drawingPointerId = null;
    if (!st || tiny) { this.render(); return; }
    if (st.points.some((p) => !this.isOnPage(p.x, p.y))) { this.onNotice?.("The shape has to stay on the page."); this.render(); return; }
    this.ensureTiles(st.points);
    this.userDrawnStrokes.push(st);
    this.commit({ kind: "draw", stroke: st });
    this.paintFinished(st);
  }

  /** Colour, size, opacity and pressure response a new stroke gets from the selected pen. */
  private newStrokeBase() {
    return { color: this.penColor, width: this.penWidth * this.penType.widthScale, alpha: this.penType.alpha, sens: this.penType.sensitivity, pen: this.penType.id };
  }

  private endDraw() {
    this.isDrawing = false;
    this.drawingPointerId = null;
    this.predicted = [];
    if (this.currentStrokePoints.length === 0) return;
    const stroke: ParsedStroke = {
      ...this.newStrokeBase(),
      shapeUuid: crypto.randomUUID(),
      parentUuid: crypto.randomUUID(),
      durationMs: Math.round(performance.now() - this.strokeStartTime),
      points: [...this.currentStrokePoints],
    };
    this.ensureTiles(stroke.points);
    this.userDrawnStrokes.push(stroke);
    this.commit({ kind: "draw", stroke });
    this.currentStrokePoints = [];
    this.paintFinished(stroke);
  }

  /** World-space extent of the note: union of page tiles (or the origin tile when blank). */
  private contentBounds() {
    if (!this.doc) return { l: 0, t: 0, r: 2100, b: 2100 };
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const tile of this.doc.tiles.values()) {
      const rect = tile.pageRect ?? tile.rect;
      l = Math.min(l, rect.left); t = Math.min(t, rect.top);
      r = Math.max(r, rect.right); b = Math.max(b, rect.bottom);
    }
    return { l, t, r, b };
  }

  /** Geometry per axis: viewport and total extent in world units (total = content ∪ viewport). */
  private axis(a: "x" | "y") {
    const c = this.contentBounds();
    const [cMin, cMax, pan, size] = a === "x"
      ? [c.l, c.r, this.panX, this.canvas.width]
      : [c.t, c.b, this.panY, this.canvas.height];
    const v0 = -pan / this.zoom, v1 = v0 + size / this.zoom;
    const min = Math.min(cMin, v0), max = Math.max(cMax, v1);
    return { v0, v1, min, total: max - min, view: v1 - v0 };
  }

  private createScrollbars() {
    const host = this.canvas.parentElement!;
    const make = (a: "x" | "y") => {
      const track = document.createElement("div");
      track.className = `sb sb-${a}`;
      const thumb = document.createElement("div");
      thumb.className = "sb-thumb";
      track.appendChild(thumb);
      host.appendChild(track);

      const setView = (v0: number) => {
        if (a === "x") this.panX = -v0 * this.zoom; else this.panY = -v0 * this.zoom;
        this.render();
      };
      const trackLen = () => (a === "x" ? track.clientWidth : track.clientHeight);

      thumb.addEventListener("pointerdown", (e) => {
        e.preventDefault(); e.stopPropagation();
        thumb.setPointerCapture(e.pointerId);
        const start = this.axis(a), from = a === "x" ? e.clientX : e.clientY;
        const move = (m: PointerEvent) => {
          const d = ((a === "x" ? m.clientX : m.clientY) - from) / trackLen() * start.total;
          setView(start.v0 + d); // total is frozen at drag start so the thumb tracks the cursor
        };
        const up = () => { thumb.removeEventListener("pointermove", move); thumb.removeEventListener("pointerup", up); };
        thumb.addEventListener("pointermove", move);
        thumb.addEventListener("pointerup", up);
      });
      track.addEventListener("pointerdown", (e) => {
        if (e.target !== track) return;
        const r = track.getBoundingClientRect(), g = this.axis(a);
        const f = ((a === "x" ? e.clientX - r.left : e.clientY - r.top) / trackLen());
        setView(g.min + f * g.total - g.view / 2); // jump: centre the view on the click
      });
      return { track, thumb };
    };
    this.bars = { x: make("x"), y: make("y") };
    this.updateScrollbars(); // resize() already rendered before the bars existed
  }

  private updateScrollbars() {
    if (!this.bars) return;
    for (const a of ["x", "y"] as const) {
      const { track, thumb } = this.bars[a];
      const g = this.axis(a);
      const frac = g.view / g.total;
      track.style.display = frac >= 0.999 || this.doc?.infinite ? "none" : "block"; // nothing to scroll (and no meaningful extent on an infinite canvas)
      const pos = ((g.v0 - g.min) / g.total) * 100;
      if (a === "x") { thumb.style.left = `${pos}%`; thumb.style.width = `${Math.max(frac * 100, 4)}%`; }
      else { thumb.style.top = `${pos}%`; thumb.style.height = `${Math.max(frac * 100, 4)}%`; }
    }
  }

  /** The page tile under the view centre (or nearest to it); origin tile on a blank canvas. */
  private currentPageRect() {
    if (this.doc?.infinite) { // the grid cell under the middle of the screen
      return gridRectOf(cellTag((this.canvas.width / 2 - this.panX) / this.zoom, (this.canvas.height / 2 - this.panY) / this.zoom));
    }
    const rects = this.pageRects();
    const cx = (this.canvas.width / 2 - this.panX) / this.zoom;
    const cy = (this.canvas.height / 2 - this.panY) / this.zoom;
    let best = rects[0], bestD = Infinity;
    for (const r of rects) {
      const dx = Math.max(r.left - cx, 0, cx - r.right), dy = Math.max(r.top - cy, 0, cy - r.bottom);
      const d = dx * dx + dy * dy; // 0 when the centre is inside the page
      if (d < bestD) { bestD = d; best = r; }
    }
    return best;
  }

  /** Page rects in reading order (top to bottom, then left to right). */
  private pageRects(): PageRect[] {
    if (this.doc?.infinite) return [this.currentPageRect()];
    const list = this.doc ? [...this.doc.tiles.values()].map((t) => t.pageRect ?? t.rect) : [NO_DOC_PAGE];
    return list.sort((a, b) => a.top - b.top || a.left - b.left);
  }

  public pageInfo(): { index: number; total: number } {
    const rects = this.pageRects();
    const cur = this.currentPageRect();
    return { index: Math.max(0, rects.indexOf(cur)), total: rects.length };
  }

  /** Jump to the previous/next page, fitted to the screen width. */
  public gotoPage(delta: number) {
    const rects = this.pageRects();
    const i = Math.min(rects.length - 1, Math.max(0, this.pageInfo().index + delta));
    this.fit("width", rects[i]);
  }

  /** Fit the current page: whole page, its width, or its height. */
  public fit(mode: "page" | "width" | "height", target?: PageRect) {
    const r = target ?? this.currentPageRect();
    const pad = 16 * (window.devicePixelRatio || 1);
    const w = r.right - r.left, h = r.bottom - r.top;
    const padX = mode === "width" ? 0 : pad; // width fit is flush, like paper filling the screen
    const zx = (this.canvas.width - 2 * padX) / w, zy = (this.canvas.height - 2 * pad) / h;
    this.zoom = Math.min(3.0, Math.max(0.05, mode === "width" ? zx : mode === "height" ? zy : Math.min(zx, zy)));
    this.panX = (this.canvas.width - w * this.zoom) / 2 - r.left * this.zoom; // centred horizontally
    this.panY = mode === "width"
      ? pad - r.top * this.zoom                                                // top of the page, then scroll down
      : (this.canvas.height - h * this.zoom) / 2 - r.top * this.zoom;
    this.render();
    this.notifyZoom();
  }

  // ------------------------------------------------------------ pages (a stack of finite pages)
  /** Fired when pages were added, removed, moved or reformatted. */
  public onPagesChange?: () => void;

  public isStack(): boolean { return this.doc?.layout === "stack"; }
  public isInfinite(): boolean { return !!this.doc?.infinite; }

  /** Infinite canvas: make sure every grid cell the points touch has a tile (the archive stores ink per tile). */
  private ensureTiles(points: { x: number; y: number }[]) {
    const doc = this.doc;
    if (!doc?.infinite) return;
    let last = "";
    for (const p of points) {
      const tag = cellTag(p.x, p.y);
      if (tag === last) continue;
      last = tag;
      if (!doc.tiles.has(tag)) { doc.tiles.set(tag, newCanvasTile(tag, doc.infinite.template, doc.infinite.spacing)); doc.pagesChanged = true; }
    }
  }

  private stackTiles(): ParsedTile[] { return this.doc ? [...this.doc.tiles.values()] : []; }

  public pageFormatAt(index: number): PageFormat | null {
    const t = this.stackTiles()[index];
    return t ? { ...sizeOfPage(t), template: t.template ?? "ruled", spacing: t.spacing } : null;
  }

  public hasBackgroundAt(index: number): boolean { return !!this.stackTiles()[index]?.backgroundImage; }

  /** Re-stacks the pages. Unsaved ink is in world coordinates, so it moves with the page it is on. */
  private restack() {
    if (!this.doc) return;
    const tiles = this.stackTiles();
    const rectOf = (t: ParsedTile) => ({ ...(t.pageRect ?? t.rect) });
    const old = new Map(tiles.map((t) => [t, rectOf(t)]));
    const owner = (x: number, y: number) => {
      let best = tiles[0], bestD = Infinity;
      for (const t of tiles) {
        const r = old.get(t)!;
        const d = Math.max(r.left - x, 0, x - r.right) ** 2 + Math.max(r.top - y, 0, y - r.bottom) ** 2;
        if (d < bestD) { bestD = d; best = t; }
      }
      return best;
    };
    const owners = this.userDrawnStrokes.map((st) => st.points.map((p) => owner(p.x, p.y)));
    this.clearSelection();
    relayout(this.doc);
    this.userDrawnStrokes.forEach((st, i) => {
      st.points = st.points.map((p, k) => {
        const t = owners[i][k], o = old.get(t)!, n = t.pageRect!;
        return { ...p, x: p.x + n.left - o.left, y: p.y + n.top - o.top };
      });
    });
    this.doc.pagesChanged = true;
    this.onChange?.();
    this.onPagesChange?.();
    this.render();
  }

  /** Inserts a page after `after` (the end by default) and shows it. Returns its index. */
  public addPage(format: PageFormat, after?: number): number {
    if (!this.doc) return -1;
    const doc = this.doc;
    doc.layout = "stack";
    const at = after === undefined ? doc.tiles.size : Math.min(doc.tiles.size, Math.max(0, after + 1));
    const tag = nextPageTag(doc);
    const entries = [...doc.tiles.entries()];
    entries.splice(at, 0, [tag, newPageTile(tag, format)]);
    doc.tiles = new Map(entries);
    this.restack();
    this.fit("page", doc.tiles.get(tag)!.pageRect);
    return at;
  }

  /** Deletes a page and everything on it. The last page can't be deleted. History is cleared (it may point at the page). */
  public deletePage(index: number): boolean {
    if (!this.doc || this.stackTiles().length <= 1) return false;
    const tile = this.stackTiles()[index];
    if (!tile) return false;
    const pr = tile.pageRect!;
    this.userDrawnStrokes = this.userDrawnStrokes.filter((st) => st.points.filter((p) => p.x >= pr.left && p.x <= pr.right && p.y >= pr.top && p.y <= pr.bottom).length * 2 < st.points.length);
    this.doc.removedStrokes = (this.doc.removedStrokes ?? []).filter((st) => st.src?.tag !== tile.pageTag);
    this.doc.removedTextBoxes = (this.doc.removedTextBoxes ?? []).filter((b) => b.tag !== tile.pageTag);
    this.doc.addedTextBoxes = (this.doc.addedTextBoxes ?? []).filter((b) => b.tag !== tile.pageTag);
    this.undoStack = [];
    this.redoStack = [];
    if (tile.saved !== false) (this.doc.removedPages ??= []).push(tile.pageTag);
    this.doc.tiles.delete(tile.pageTag);
    this.restack();
    this.fit("page", this.stackTiles()[Math.min(index, this.stackTiles().length - 1)].pageRect);
    return true;
  }

  public movePage(index: number, delta: number): number {
    if (!this.doc) return index;
    const entries = [...this.doc.tiles.entries()], to = index + delta;
    if (to < 0 || to >= entries.length || index < 0 || index >= entries.length) return index;
    entries.splice(to, 0, ...entries.splice(index, 1));
    this.doc.tiles = new Map(entries);
    this.restack();
    this.fit("page", this.stackTiles()[to].pageRect);
    return to;
  }

  /** Changes size and/or template of the given pages (a page with a PDF background keeps its size). */
  public setPageFormat(indices: number[], f: Partial<PageFormat>) {
    const tiles = this.stackTiles();
    for (const i of indices) {
      const t = tiles[i];
      if (!t) continue;
      if (f.template) t.template = f.template;
      if (f.spacing) t.spacing = f.spacing;
      if (f.w && f.h && !t.backgroundImage) {
        const pr = t.pageRect ?? t.rect;
        t.pageRect = { left: pr.left, top: pr.top, right: pr.left + Math.min(2100, f.w), bottom: pr.top + Math.min(2100, f.h) };
      }
    }
    this.restack();
  }

  /** True when the end of the last page is on screen: the moment to offer "add page". */
  public endOfNoteVisible(): boolean {
    const tiles = this.stackTiles();
    if (tiles.length === 0 || this.canvas.height === 0) return false;
    const last = tiles[tiles.length - 1].pageRect!;
    return last.bottom * this.zoom + this.panY <= this.canvas.height - 4;
  }

  // ------------------------------------------------------------ lasso selection
  private toWorld(e: PointerEvent) {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * dpr - this.panX) / this.zoom, y: ((e.clientY - r.top) * dpr - this.panY) / this.zoom };
  }

  /** Where a stroke's own coordinates start in the world: a saved stroke is tile-local, a pending one is already world. */
  private originOf(st: ParsedStroke) {
    const t = st.src && this.doc?.tiles.get(st.src.tag);
    return t ? { x: t.rect.left, y: t.rect.top } : { x: 0, y: 0 };
  }

  private allStrokes(): ParsedStroke[] {
    const out = [...this.userDrawnStrokes];
    for (const t of this.doc?.tiles.values() ?? []) out.push(...t.strokes);
    return out;
  }

  public hasSelection(): boolean { return this.selected.size > 0; }

  /** True while a pen/finger gesture is in progress (drawing, erasing, a lasso, a move, a shape being dragged). */
  public isBusy(): boolean { return this.isDrawing || this.isErasing || this.isLassoing || this.isMovingSel || !!this.shapeFrom; }

  public clearSelection() {
    if (this.selected.size === 0 && !this.isLassoing && !this.isMovingSel) return;
    this.selected.clear();
    this.selBox = null;
    this.isLassoing = false;
    this.isMovingSel = false;
    this.lassoPath = [];
    this.selOffset = { x: 0, y: 0 };
    this.onSelectionChange?.();
  }

  private setSelection(list: ParsedStroke[]) {
    this.selected = new Set(list);
    this.selBox = null;
    if (list.length) {
      let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
      for (const st of list) {
        const o = this.originOf(st), pad = st.width / 2;
        for (const p of st.points) {
          l = Math.min(l, p.x + o.x - pad); t = Math.min(t, p.y + o.y - pad);
          r = Math.max(r, p.x + o.x + pad); b = Math.max(b, p.y + o.y + pad);
        }
      }
      this.selBox = { l, t, r, b };
    }
    this.onSelectionChange?.();
  }

  private dropFromSelection(list: ParsedStroke[]) {
    if (!list.some((s) => this.selected.has(s))) return;
    this.setSelection([...this.selected].filter((s) => !list.includes(s)));
  }

  private insideSelBox(x: number, y: number): boolean {
    const b = this.selBox!, pad = (14 * (window.devicePixelRatio || 1)) / this.zoom;
    return x >= b.l - pad && x <= b.r + pad && y >= b.t - pad && y <= b.b + pad;
  }

  private beginLasso(e: PointerEvent, w: { x: number; y: number }) {
    this.clearSelection();
    this.isLassoing = true;
    this.drawingPointerId = e.pointerId;
    this.lassoPath = [w];
  }

  /** A stroke is picked when at least half of its points are inside the loop. */
  private endLasso() {
    const poly = this.lassoPath;
    this.isLassoing = false;
    this.drawingPointerId = null;
    this.lassoPath = [];
    const inside = (x: number, y: number) => {
      let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        if ((poly[i].y > y) !== (poly[j].y > y) && x < ((poly[j].x - poly[i].x) * (y - poly[i].y)) / (poly[j].y - poly[i].y) + poly[i].x) c = !c;
      }
      return c;
    };
    const picked = poly.length < 3 ? [] : this.allStrokes().filter((st) => {
      const o = this.originOf(st);
      return st.points.filter((p) => inside(p.x + o.x, p.y + o.y)).length * 2 >= st.points.length;
    });
    this.setSelection(picked);
    this.render();
  }

  private beginMove(e: PointerEvent, w: { x: number; y: number }) {
    this.isMovingSel = true;
    this.drawingPointerId = e.pointerId;
    this.moveFrom = w;
    this.selOffset = { x: 0, y: 0 };
    this.render(); // repaint the page without the selected strokes; they follow the pen as an overlay
  }

  private endMove() {
    const { x: dx, y: dy } = this.selOffset;
    this.isMovingSel = false;
    this.drawingPointerId = null;
    this.selOffset = { x: 0, y: 0 };
    if (Math.hypot(dx, dy) * this.zoom < 3) { this.render(); return; } // a tap, not a drag
    const offPage = [...this.selected].some((st) => {
      const o = this.originOf(st);
      return st.points.some((p) => !this.isOnPage(p.x + o.x + dx, p.y + o.y + dy));
    });
    if (offPage) { this.onNotice?.("Strokes have to stay on the page."); this.render(); return; }
    this.replaceSelection({ dx, dy });
  }

  /**
   * Move / recolor / resize the selection. Every changed stroke becomes a new pending stroke in world
   * coordinates and the old one is erased (a saved one is deleted from the archive on the next save), so one
   * undo step restores the previous state.
   */
  private replaceSelection(change: { dx?: number; dy?: number; color?: string; width?: number }) {
    const from = [...this.selected];
    if (from.length === 0) return;
    const to: ParsedStroke[] = from.map((st) => {
      const o = this.originOf(st);
      return {
        shapeUuid: crypto.randomUUID(),
        parentUuid: crypto.randomUUID(),
        color: change.color ?? st.color,
        width: change.width === undefined ? st.width : change.width * penScaleOf(st),
        alpha: st.alpha,
        sens: st.sens,
        pen: st.pen,
        durationMs: st.durationMs,
        points: st.points.map((p) => ({ ...p, x: p.x + o.x + (change.dx ?? 0), y: p.y + o.y + (change.dy ?? 0) })),
      };
    });
    for (const st of from) this.removeStroke(st);
    to.forEach((st) => this.ensureTiles(st.points));
    this.userDrawnStrokes.push(...to);
    this.commit({ kind: "replace", from, to });
    this.setSelection(to);
    this.render();
  }

  public hasClipboard(): boolean { return drawingClipboard.length > 0; }

  public copySelection(): boolean {
    if (this.selected.size === 0) return false;
    drawingClipboard = [...this.selected].map((st) => {
      const o = this.originOf(st);
      return { color: st.color, width: st.width, alpha: st.alpha, sens: st.sens, pen: st.pen, durationMs: st.durationMs, points: st.points.map((p) => ({ ...p, x: p.x + o.x, y: p.y + o.y })) };
    });
    this.onClipboardChange?.();
    return true;
  }

  public cutSelection(): boolean {
    if (!this.copySelection()) return false;
    this.deleteSelection();
    return true;
  }

  /** Puts the copied drawings in the middle of the view (or where they were, if that is the only place on the page). */
  public pasteClipboard(): boolean {
    if (drawingClipboard.length === 0) return false;
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const c of drawingClipboard) for (const p of c.points) { l = Math.min(l, p.x); t = Math.min(t, p.y); r = Math.max(r, p.x); b = Math.max(b, p.y); }
    const view = { x: (this.canvas.width / 2 - this.panX) / this.zoom, y: (this.canvas.height / 2 - this.panY) / this.zoom };
    const fits = (dx: number, dy: number) => drawingClipboard.every((c) => c.points.every((p) => this.isOnPage(p.x + dx, p.y + dy)));
    const centred = { x: view.x - (l + r) / 2, y: view.y - (t + b) / 2 };
    const shift = fits(centred.x, centred.y) ? centred : fits(0, 0) ? { x: 0, y: 0 } : null;
    if (!shift) { this.onNotice?.("There's no room on this page for the pasted drawing."); return false; }
    const to: ParsedStroke[] = drawingClipboard.map((c) => ({
      ...c,
      shapeUuid: crypto.randomUUID(),
      parentUuid: crypto.randomUUID(),
      points: c.points.map((p) => ({ ...p, x: p.x + shift.x, y: p.y + shift.y })),
    }));
    this.clearSelection();
    to.forEach((st) => this.ensureTiles(st.points));
    this.userDrawnStrokes.push(...to);
    this.commit({ kind: "replace", from: [], to });
    this.setSelection(to); // ready to drag into place
    this.render();
    return true;
  }

  public recolorSelection(color: string) { this.replaceSelection({ color }); }
  public resizeSelection(width: number) { this.replaceSelection({ width }); }

  /** Erases every drawing on the page in view (text stays). One undo step brings it back. Returns how many strokes went. */
  public clearPage(): number {
    const pr = this.currentPageRect();
    const inPage = (x: number, y: number) => x >= pr.left && x <= pr.right && y >= pr.top && y <= pr.bottom;
    const hit = this.allStrokes().filter((st) => {
      const o = this.originOf(st);
      return st.points.filter((p) => inPage(p.x + o.x, p.y + o.y)).length * 2 >= st.points.length;
    });
    if (hit.length === 0) return 0;
    for (const st of hit) this.removeStroke(st);
    this.commit({ kind: "erase", strokes: hit });
    this.clearSelection();
    this.render();
    return hit.length;
  }

  public deleteSelection() {
    const strokes = [...this.selected];
    if (strokes.length === 0) return;
    for (const st of strokes) this.removeStroke(st);
    this.commit({ kind: "erase", strokes });
    this.clearSelection();
    this.render();
  }

  private renderSelectionOverlay() {
    const ctx = this.ctx, off = this.isMovingSel ? this.selOffset : { x: 0, y: 0 };
    const px = 1 / this.zoom;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const st of this.selected) {
      const o = this.originOf(st);
      ctx.save();
      ctx.translate(o.x + off.x, o.y + off.y);
      if (this.isMovingSel) { // the stroke itself follows the pen
        this.drawStroke(st, false);
      }
      ctx.strokeStyle = "rgba(70,130,255,0.35)";
      ctx.lineWidth = st.width + 10 * px;
      ctx.beginPath();
      st.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (st.points.length === 1) ctx.lineTo(st.points[0].x + 0.01, st.points[0].y);
      ctx.stroke();
      ctx.restore();
    }
    if (this.selBox) {
      const b = this.selBox;
      ctx.strokeStyle = "#4682ff";
      ctx.lineWidth = 1.5 * px;
      ctx.setLineDash([6 * px, 4 * px]);
      ctx.strokeRect(b.l + off.x, b.t + off.y, b.r - b.l, b.b - b.t);
    }
    ctx.restore();
  }

  private renderLassoPath() {
    const ctx = this.ctx, px = 1 / this.zoom, p = this.lassoPath;
    if (p.length < 2) return;
    ctx.save();
    ctx.strokeStyle = "#4682ff";
    ctx.fillStyle = "rgba(70,130,255,0.10)";
    ctx.lineWidth = 2 * px;
    ctx.setLineDash([8 * px, 5 * px]);
    ctx.beginPath();
    p.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /** Takes a stroke out of the page it is drawn on. A saved one is queued so the next save deletes it from the archive. */
  private removeStroke(st: ParsedStroke) {
    const tile = st.src && this.doc?.tiles.get(st.src.tag);
    if (tile) {
      tile.strokes = tile.strokes.filter((x) => x !== st);
      (this.doc!.removedStrokes ??= []).push(st);
    } else {
      this.userDrawnStrokes = this.userDrawnStrokes.filter((x) => x !== st);
    }
  }

  /** Erase every stroke under the pointer, drawn this session or loaded from the .note. */
  private eraseAt(e: PointerEvent) {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) * dpr - this.panX) / this.zoom;
    const y = ((e.clientY - r.top) * dpr - this.panY) / this.zoom;
    const reach = (this.eraserReach * dpr) / this.zoom;
    const near = (s: ParsedStroke, ox: number, oy: number) => { // (ox, oy): where the stroke's coordinates start in the world
      const pad = reach + s.width / 2;
      const p = s.points;
      const px = x - ox, py = y - oy;
      if (p.length === 1) return Math.hypot(p[0].x - px, p[0].y - py) <= pad;
      for (let i = 1; i < p.length; i++) {
        const [ax, ay, bx, by] = [p[i - 1].x, p[i - 1].y, p[i].x, p[i].y];
        const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
        const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
        if (Math.hypot(ax + t * dx - px, ay + t * dy - py) <= pad) return true;
      }
      return false;
    };
    const hit = this.userDrawnStrokes.filter((s) => near(s, 0, 0));
    for (const tile of this.doc?.tiles.values() ?? []) {
      for (const s of tile.strokes) if (near(s, tile.rect.left, tile.rect.top)) hit.push(s);
    }
    if (hit.length === 0) return;
    for (const s of hit) this.removeStroke(s);
    this.dropFromSelection(hit);
    this.erasedNow.push(...hit);
    this.render();
  }

  public isOnPage(x: number, y: number): boolean {
    if (this.doc?.infinite) return true; // a tile appears wherever you write (see ensureTiles)
    for (const t of this.doc?.tiles.values() ?? []) {
      const r = t.pageRect ?? t.rect;
      if (x >= r.left && x < r.right && y >= r.top && y < r.bottom) return true;
    }
    return false;
  }

  /** A pointer sample as a stroke point in world coordinates (dt = ms since the stroke began). */
  private pointFrom(e: PointerEvent): RawStrokePoint {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    // StarNote pressure is 15 bit (0..32767); a pointer without pressure counts as half
    const pressure = e.pressure && e.pressure > 0 ? Math.round(e.pressure * 32767.0) : 16384;
    return { dt: Math.max(0, Math.round(e.timeStamp - this.strokeStartTime)), x: ((e.clientX - r.left) * dpr - this.panX) / this.zoom, y: ((e.clientY - r.top) * dpr - this.panY) / this.zoom, pressure };
  }

  private addPointFromEvent(e: PointerEvent) {
    if (e.timeStamp <= this.lastSampleTime) return; // already taken (pointerrawupdate and pointermove both report it)
    this.lastSampleTime = e.timeStamp;
    const pt = this.pointFrom(e);
    // Ink only lands on the note: drop points outside every page tile.
    // ponytail: leaving and re-entering mid-stroke joins the two points with a straight segment.
    if (!this.isOnPage(pt.x, pt.y)) return;
    const last = this.currentStrokePoints[this.currentStrokePoints.length - 1];
    if (last && last.x === pt.x && last.y === pt.y && last.pressure === pt.pressure) return; // a repeat adds nothing
    this.currentStrokePoints.push(pt);
  }

  /**
   * Keeps the note on screen: the view can never leave the pages (plus a small margin), whatever moved it
   * (wheel, drag, pinch, zoom, scrollbar). A note smaller than the screen stays centred on that axis.
   */
  private clampPan() {
    const W = this.canvas.width, H = this.canvas.height;
    if (W === 0 || H === 0) return; // hidden view
    if (this.doc?.infinite) return; // an infinite canvas has no edge to stay inside
    const c = this.contentBounds();
    const m = 48 * (window.devicePixelRatio || 1);
    const fit = (pan: number, size: number, lo: number, hi: number) => {
      const len = (hi - lo) * this.zoom;
      if (len + 2 * m <= size) return (size - len) / 2 - lo * this.zoom;           // smaller than the screen: centre it
      return Math.min(m - lo * this.zoom, Math.max(size - m - hi * this.zoom, pan)); // else stay within the pages
    };
    this.panX = fit(this.panX, W, c.l, c.r);
    this.panY = fit(this.panY, H, c.t, c.b);
  }

  /** Repaints everything now: call after anything that changes what is on the page or the view. */
  public render() {
    this.sceneValid = false;
    this.zoomPreview = false;
    this.draw();
  }

  /** Like render(), but at most once per display frame (pointer events arrive faster than the screen refreshes). */
  /** `pan` keeps the cached page and slides it, `overlay` repaints only the live layer, `zoom` scales the painted page, `full` repaints. */
  private scheduleRender(mode: "full" | "pan" | "overlay" | "zoom" = "full") {
    if (mode === "full") this.frameFull = true;
    if (mode === "zoom") this.zoomPreview = true;
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.zoomPreview) {
        this.previewZoom();
        clearTimeout(this.zoomSettle);
        this.zoomSettle = window.setTimeout(() => this.render(), 110); // the gesture paused: one crisp repaint
        return;
      }
      if (this.frameFull) this.sceneValid = false;
      this.frameFull = false;
      this.draw();
    });
  }

  /** While zooming, scale what is already painted (cheap) instead of repainting every page at every step. */
  private previewZoom() {
    const W = this.canvas.width, H = this.canvas.height;
    if (!this.sceneValid || W === 0 || H === 0 || this.sceneZoom === 0) { this.zoomPreview = false; this.render(); return; }
    this.clampPan();
    if (!this.zoomBase) { // the last accurately painted page, kept until the repaint
      this.zoomBase = document.createElement("canvas");
      this.zoomBase.width = W; this.zoomBase.height = H;
      this.zoomBase.getContext("2d")!.drawImage(this.canvas, 0, 0);
    }
    const k = this.zoom / this.sceneZoom, ctx = this.ctx; // the snapshot is of the scene as painted
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.eInkMode ? "#ffffff" : "#2b2b2b";
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(k, 0, 0, k, this.panX - k * this.scenePanX, this.panY - k * this.scenePanY);
    ctx.drawImage(this.zoomBase, 0, 0);
    ctx.restore();
    this.drawOverlay();
    this.updateScrollbars();
  }

  /**
   * The page contents (background, pages, ink) into the cached scene bitmap. With a `region` (device pixels) only that
   * part is repainted, and only the pages and strokes that reach into it are drawn.
   */
  private paintScene(region?: { x: number; y: number; w: number; h: number }) {
    const W = this.canvas.width, H = this.canvas.height;
    const ctx = this.ctx;
    ctx.imageSmoothingQuality = "high";
    const rg = region ?? { x: 0, y: 0, w: W, h: H };
    ctx.save();
    if (region) { ctx.beginPath(); ctx.rect(rg.x, rg.y, rg.w, rg.h); ctx.clip(); }
    ctx.fillStyle = this.eInkMode ? "#ffffff" : "#2b2b2b";
    ctx.fillRect(rg.x, rg.y, rg.w, rg.h);
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);
    const v = { l: (rg.x - this.panX) / this.zoom, t: (rg.y - this.panY) / this.zoom, r: (rg.x + rg.w - this.panX) / this.zoom, b: (rg.y + rg.h - this.panY) / this.zoom };
    this.view = v;
    const m = 40; // page shadow
    const infinite = !!this.doc?.infinite;
    if (infinite) this.paintInfiniteBackdrop(v);
    for (const tile of this.doc?.tiles.values() ?? []) {
      const pr = tile.pageRect ?? tile.rect;
      if (pr.right + m < v.l || pr.left - m > v.r || pr.bottom + m < v.t || pr.top - m > v.b) continue; // page not in view
      if (infinite) this.renderTileInk(tile, false); else this.renderTile(tile);
    }
    if (this.userDrawnStrokes.length) {
      ctx.save();
      this.clipToPages(ctx);
      for (const stroke of this.userDrawnStrokes) {
        if (this.isMovingSel && this.selected.has(stroke)) continue; // drawn by the overlay at its new place
        this.drawStroke(stroke);
      }
      ctx.restore();
    }
    ctx.restore();
    this.sceneValid = true;
    if (!region) { this.sceneZoom = this.zoom; this.scenePanX = this.panX; this.scenePanY = this.panY; this.zoomBase = null; }
  }

  /** Limits drawing to the pages (world coordinates; the current transform must already be the view's). */
  private clipToPages(ctx: CanvasRenderingContext2D) {
    if (this.doc?.infinite) return; // no page edges to respect
    ctx.beginPath();
    for (const t of this.doc?.tiles.values() ?? []) { const r = t.pageRect ?? t.rect; ctx.rect(r.left, r.top, r.right - r.left, r.bottom - r.top); }
    ctx.clip();
  }

  /**
   * Panning without repainting the page: the cached bitmap slides, and only the strip that scrolled into view is painted.
   * Returns false when that isn't possible (zoom changed, or the move was bigger than the screen).
   */
  private slideScene(): boolean {
    if (!this.sceneValid || this.zoom !== this.sceneZoom) return false;
    const W = this.canvas.width, H = this.canvas.height;
    const dx = Math.round(this.panX - this.scenePanX), dy = Math.round(this.panY - this.scenePanY);
    if (dx === 0 && dy === 0) { this.panX = this.scenePanX; this.panY = this.scenePanY; return true; }
    if (Math.abs(dx) >= W || Math.abs(dy) >= H) return false;
    this.scenePanX += dx; this.scenePanY += dy;
    this.panX = this.scenePanX; this.panY = this.scenePanY; // pan stays on whole device pixels, so the bitmap never blurs
    // Slide through a scratch canvas: drawing a canvas onto itself is not reliable on every GPU backend (it can come out black)
    const buf = (this.slideBuf ??= document.createElement("canvas"));
    if (buf.width !== W || buf.height !== H) { buf.width = W; buf.height = H; }
    const bctx = buf.getContext("2d")!;
    bctx.globalCompositeOperation = "copy";
    bctx.drawImage(this.canvas, 0, 0);
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(buf, dx, dy); // the uncovered strip below is repainted in full right after
    ctx.restore();
    if (dx !== 0) this.paintScene({ x: dx > 0 ? 0 : W + dx, y: 0, w: Math.abs(dx), h: H });
    if (dy !== 0) this.paintScene({ x: 0, y: dy > 0 ? 0 : H + dy, w: W, h: Math.abs(dy) });
    return true;
  }

  private draw() {
    if (this.canvas.width === 0 || this.canvas.height === 0) return; // the editor is hidden
    this.clampPan();
    if (!this.slideScene()) this.paintScene();

    this.drawOverlay();
    this.updateScrollbars();
    if (!this.notifyTimer) { // page label, add-page button...: a few times a second is plenty, and it keeps DOM work out of the frame
      this.notifyTimer = window.setTimeout(() => { this.notifyTimer = 0; this.onRender?.(); }, 80);
    }
  }

  /** What changes while the pen moves goes on the overlay: the stroke being drawn, a shape being dragged, the selection. */
  private drawOverlay() {
    const live = this.currentStrokePoints.length > 0 || !!this.shapeFrom || this.selected.size > 0 || this.isLassoing || !!this.textDraft;
    if (!live && !this.overlayDirty) return;
    const base = this.ctx, o = this.octx;
    this.ctx = o; // the drawing helpers paint into whichever context is current
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.clearRect(0, 0, this.overlay.width, this.overlay.height);
    if (live) {
      o.save();
      o.translate(this.panX, this.panY);
      o.scale(this.zoom, this.zoom);
      if (this.currentStrokePoints.length > 0) {
        this.drawStroke({ ...this.newStrokeBase(), shapeUuid: "", parentUuid: "", durationMs: 0, points: [...this.currentStrokePoints, ...this.predicted] }, false);
      }
      if (this.shapeFrom) { const st = this.shapeStroke(); if (st) this.drawStroke(st, false); }
      if (this.selected.size) this.renderSelectionOverlay();
      if (this.isLassoing) this.renderLassoPath();
      if (this.textDraft) this.drawTextDraft(this.textDraft);
      o.restore();
    }
    this.ctx = base;
    this.overlayDirty = live;
  }

  /** A stroke that was just finished: paint only it on top of the page (it is the newest ink) instead of repainting everything. */
  private paintFinished(st: ParsedStroke) {
    if (!this.sceneValid || this.zoomPreview) { this.render(); return; }
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.zoom, 0, 0, this.zoom, this.panX, this.panY);
    this.view = { l: -this.panX / this.zoom, t: -this.panY / this.zoom, r: (this.canvas.width - this.panX) / this.zoom, b: (this.canvas.height - this.panY) / this.zoom };
    this.clipToPages(ctx);
    this.drawStroke(st);
    ctx.restore();
    this.draw(); // clears the live stroke from the overlay
  }

  /** Smoothed outline of a stroke as a Path2D plus its bounds: computed once, then reused until the stroke changes. */
  private strokeInfo(st: ParsedStroke) {
    const sens = st.sens ?? this.pressureSensitivity;
    let c = this.strokeCache.get(st);
    // a stroke's points, width and own sensitivity never change in place (edits make a new stroke), so only the viewer's settings can age an entry
    if (c && c.pts === st.points && c.smooth === this.smoothLevel && c.viewerSens === this.pressureSensitivity) return c;
    const brush: BrushParameters = { baseWidth: st.width, color: st.color, alpha: 1, pressureSensitivity: sens, smoothLevel: this.smoothLevel };
    const ribbon = generateRibbonGeometry(interpolateStrokePoints(st.points, brush, 4), st.color);
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const p of st.points) { l = Math.min(l, p.x); t = Math.min(t, p.y); r = Math.max(r, p.x); b = Math.max(b, p.y); }
    const pad = st.width * 1.5 + 2;
    c = { pts: st.points, smooth: this.smoothLevel, viewerSens: this.pressureSensitivity, path: ribbonToPath(ribbon), l: l - pad, t: t - pad, r: r + pad, b: b + pad };
    this.strokeCache.set(st, c);
    return c;
  }

  /**
   * Draws one stroke with its own opacity and pressure response (falls back to the viewer's setting).
   * `cached`: false for strokes that change every frame (the one being drawn).
   */
  private drawStroke(st: ParsedStroke, cached = true, ox = 0, oy = 0) {
    const ctx = this.ctx;
    const color = this.eInkMode ? "#000000" : st.color;
    const alpha = st.alpha ?? 1;
    const translucent = alpha < 1 && !this.eInkMode;
    if (cached) {
      const c = this.strokeInfo(st);
      if (!c.path) return;
      const v = this.view;
      if (c.r + ox < v.l || c.l + ox > v.r || c.b + oy < v.t || c.t + oy > v.b) return; // off screen
      if (translucent) { ctx.save(); ctx.globalAlpha = alpha; }
      ctx.fillStyle = color;
      ctx.fill(c.path);
      if (translucent) ctx.restore();
      return;
    }
    const brush: BrushParameters = { baseWidth: st.width, color, alpha, pressureSensitivity: st.sens ?? this.pressureSensitivity, smoothLevel: this.smoothLevel };
    const ribbon = generateRibbonGeometry(interpolateStrokePoints(st.points, brush, 4), color);
    if (translucent) { ctx.save(); ctx.globalAlpha = alpha; }
    renderStrokeToCanvas(ctx, ribbon);
    if (translucent) ctx.restore();
  }

  /** Lines, grid or dots printed on a page (nothing for a blank one). */
  private drawTemplate(kind: PageTemplate, pr: PageRect, spacing?: number, seamless = false) {
    drawPageTemplate(this.ctx, kind, pr, { line: this.eInkMode ? "#d1d5db" : "#f1f5f9", dot: this.eInkMode ? "#9ca3af" : "#cbd5e1", lineWidth: 0.8, dotRadius: 2.6 }, spacing, seamless);
  }

  /** The paper of an infinite canvas: one white sheet under everything, ruled the whole way (nothing when too dense to see). */
  private paintInfiniteBackdrop(v: { l: number; t: number; r: number; b: number }) {
    const inf = this.doc?.infinite;
    if (!inf) return;
    const ctx = this.ctx;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(v.l, v.t, v.r - v.l, v.b - v.t);
    const dense = inf.spacing * this.zoom < (inf.template === "dots" ? 12 : 7); // device pixels
    if (inf.template === "blank" || dense) return;
    // aligned to the 2100-unit grid, so the ruling lines up the same way in every tile
    this.drawTemplate(inf.template, { left: Math.floor(v.l / 2100) * 2100, top: Math.floor(v.t / 2100) * 2100, right: Math.ceil(v.r / 2100) * 2100, bottom: Math.ceil(v.b / 2100) * 2100 }, inf.spacing, true);
  }

  private renderTile(tile: ParsedTile) {
    const ctx = this.ctx;

    // Tile Page background (a PDF page keeps its own aspect inside the tile)
    const pr = tile.pageRect ?? tile.rect;
    ctx.fillStyle = "#ffffff";
    if (!this.eInkMode) {
      ctx.shadowColor = "rgba(0,0,0,0.4)";
      ctx.shadowBlur = 15;
    }
    ctx.fillRect(pr.left, pr.top, pr.right - pr.left, pr.bottom - pr.top);
    ctx.shadowColor = "transparent";

    // If PDF page image is attached, render it
    if (tile.backgroundImage) {
      ctx.drawImage(tile.backgroundImage, pr.left, pr.top, pr.right - pr.left, pr.bottom - pr.top);
    } else {
      this.drawTemplate(tile.template ?? "ruled", pr, spacingOf(tile));
    }

    // Tile Boundary outline
    ctx.strokeStyle = this.eInkMode ? "#000000" : "#e2e8f0";
    ctx.lineWidth = this.eInkMode ? 2.0 / this.zoom : 1.0 / this.zoom;
    ctx.strokeRect(pr.left, pr.top, pr.right - pr.left, pr.bottom - pr.top);
    this.renderTileInk(tile, true);
  }

  /** A tile's text and strokes. `clip`: cut them at the page edge (not on an infinite canvas, where tiles are just storage). */
  private renderTileInk(tile: ParsedTile, clip: boolean) {
    const ctx = this.ctx;
    const { left, top } = tile.rect;
    const pr = tile.pageRect ?? tile.rect;

    // Render Tile Contents OFFSET BY TILE ORIGIN (left, top)
    // Both text boxes and stroke points are stored in tile-local space [0, 2100] x [0, 2100]
    ctx.save();
    ctx.translate(left, top);

    if (clip) {
      ctx.beginPath(); // ink and text never show outside their page (a fast stroke's width or smoothing can overshoot the edge)
      ctx.rect(pr.left - left, pr.top - top, pr.right - pr.left, pr.bottom - pr.top);
      ctx.clip();
    }

    // 1. Render Text Boxes (math is typeset; until it is ready, or if it can't be, the LaTeX source shows)
    if (tile.textBoxes && tile.textBoxes.length > 0) {
      for (const tb of tile.textBoxes) {
        if (tb === this.textDraft?.box) continue; // being edited: shown live on the overlay
        if (isMathText(tb.text) && this.drawMath(tb)) continue;
        ctx.save();
        ctx.fillStyle = this.eInkMode ? "#000000" : tb.color;
        const fontSize = Math.max(16, tb.fontSize);
        ctx.font = this.textFont(fontSize, tb.isBold, tb.isItalic);
        ctx.textBaseline = "top";

        const lines = tb.text.split("\n");
        let lineY = tb.rect.top;
        for (const line of lines) {
          if (line.trim().length > 0) {
            ctx.fillText(line, tb.rect.left, lineY);
          }
          lineY += fontSize * 1.25;
        }
        ctx.restore();
      }
    }

    // 2. Render Strokes
    for (const stroke of tile.strokes) {
      if (this.isMovingSel && this.selected.has(stroke)) continue;
      this.drawStroke(stroke, true, tile.rect.left, tile.rect.top);
    }

    ctx.restore();
  }
}
