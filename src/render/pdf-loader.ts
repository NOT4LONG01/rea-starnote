import * as pdfjsLib from "pdfjs-dist";
import { StarNoteDocument, ParsedTile, fitPageRect } from "../model/note-loader";
import { relayout } from "../model/pages";

// Set worker source using Vite-supported URL syntax
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

export interface PdfPageRenderResult {
  pageNumber: number;
  width: number;
  height: number;
  canvas: HTMLCanvasElement;
}

export interface LoadedPdfDocument {
  title: string;
  numPages: number;
  pages: PdfPageRenderResult[];
}

/**
 * Loads a PDF file buffer, renders pages to offscreen canvases at high DPI,
 * and returns metadata and page canvases ready for canvas tiles.
 */
export async function loadPdfDocument(
  data: ArrayBuffer,
  title: string = "Document.pdf",
  targetWidth: number = 2100.0,
  onProgress?: (current: number, total: number) => void
): Promise<LoadedPdfDocument> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(data),
    useSystemFonts: true,
  });

  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;
  const pages: PdfPageRenderResult[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    if (onProgress) {
      onProgress(pageNum, numPages);
    }
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });

    // Target coordinate units in StarNote canvas (default width 2100 units)
    const scaleFactor = targetWidth / viewport.width;
    const canvasHeight = viewport.height * scaleFactor;

    // Render at high-DPI (2x or devicePixelRatio) for crisp text on retina / tablets
    const dpr = Math.max(2.0, window.devicePixelRatio || 1);
    const renderScale = (targetWidth / viewport.width) * (dpr / 1.5);
    const renderViewport = page.getViewport({ scale: renderScale });

    const offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = Math.round(renderViewport.width);
    offscreenCanvas.height = Math.round(renderViewport.height);

    const ctx = offscreenCanvas.getContext("2d", { alpha: false });
    if (!ctx) continue;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);

    const renderContext = {
      canvasContext: ctx,
      viewport: renderViewport,
    };

    await (page.render(renderContext as any) as any).promise;

    pages.push({
      pageNumber: pageNum,
      width: targetWidth,
      height: canvasHeight,
      canvas: offscreenCanvas,
    });
  }

  return {
    title,
    numPages,
    pages,
  };
}

/**
 * Converts rendered PDF pages into a boundless StarNote document.
 * Each PDF page becomes an individual high-resolution canvas tile laid out vertically.
 */
export function convertPdfToStarNoteDocument(pdfDoc: LoadedPdfDocument): StarNoteDocument {
  const tiles = new Map<string, ParsedTile>();

  for (let i = 0; i < pdfDoc.pages.length; i++) {
    const page = pdfDoc.pages[i];
    const pageTag = `Page[${i}-0]`;

    const tile: ParsedTile = {
      pageTag,
      rect: {
        left: 0,
        top: i * 2100.0,
        right: 2100.0,
        bottom: (i + 1) * 2100.0,
      },
      strokes: [],
      textBoxes: [],
      backgroundImage: page.canvas,
      pageRect: fitPageRect(
        { left: 0, top: i * 2100.0, right: 2100.0, bottom: (i + 1) * 2100.0 },
        page.canvas.width,
        page.canvas.height
      ),
    };

    tiles.set(pageTag, tile);
  }

  const doc: StarNoteDocument = {
    uuid: crypto.randomUUID(),
    title: pdfDoc.title.replace(/\.pdf$/i, ""),
    tiles,
    isPdfImport: true,
    layout: "stack",
  };
  relayout(doc); // pages one under the other, each at its own aspect
  return doc;
}

