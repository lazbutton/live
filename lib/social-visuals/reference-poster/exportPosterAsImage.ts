import html2canvas from "html2canvas";
import { getFontEmbedCSS, toCanvas } from "html-to-image";

import type { PosterExportOptions } from "./types";

let fontEmbedCssPromise: Promise<string> | null = null;

function applyClonedDocumentTypography(clonedDocument: Document, clonedElement?: HTMLElement) {
  clonedDocument.documentElement.style.fontSynthesis = "none";
  clonedDocument.documentElement.style.textRendering = "optimizeLegibility";
  clonedDocument.documentElement.style.setProperty("-webkit-font-smoothing", "antialiased");
  clonedDocument.documentElement.style.setProperty("-moz-osx-font-smoothing", "grayscale");
  clonedDocument.documentElement.style.background = "transparent";

  clonedDocument.body.style.fontSynthesis = "none";
  clonedDocument.body.style.textRendering = "optimizeLegibility";
  clonedDocument.body.style.setProperty("-webkit-font-smoothing", "antialiased");
  clonedDocument.body.style.setProperty("-moz-osx-font-smoothing", "grayscale");
  clonedDocument.body.style.background = "transparent";
  clonedDocument.body.style.margin = "0";
  clonedDocument.body.style.padding = "0";

  if (!clonedElement) {
    return;
  }

  const width = clonedElement.scrollWidth || clonedElement.clientWidth || clonedElement.offsetWidth;
  const height =
    clonedElement.scrollHeight || clonedElement.clientHeight || clonedElement.offsetHeight;

  const isolatedContainer = clonedDocument.createElement("div");
  isolatedContainer.style.position = "fixed";
  isolatedContainer.style.left = "0";
  isolatedContainer.style.top = "0";
  isolatedContainer.style.margin = "0";
  isolatedContainer.style.padding = "0";
  isolatedContainer.style.background = "transparent";
  isolatedContainer.style.overflow = "visible";
  if (width > 0) {
    isolatedContainer.style.width = `${width}px`;
    clonedDocument.body.style.width = `${width}px`;
  }
  if (height > 0) {
    isolatedContainer.style.height = `${height}px`;
    clonedDocument.body.style.height = `${height}px`;
  }

  clonedElement.style.margin = "0";
  clonedElement.style.position = "relative";
  clonedElement.style.left = "0";
  clonedElement.style.top = "0";
  clonedElement.style.transform = "none";

  isolatedContainer.appendChild(clonedElement);
  clonedDocument.body.replaceChildren(isolatedContainer);
}

async function getCachedFontEmbedCSS(node: HTMLElement) {
  if (!fontEmbedCssPromise) {
    fontEmbedCssPromise = getFontEmbedCSS(node, {
      preferredFontFormat: "woff2",
    }).catch(() => "");
  }

  return fontEmbedCssPromise;
}

function isCanvasLikelyBlank(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return false;
  }

  const width = canvas.width;
  const height = canvas.height;
  if (width <= 0 || height <= 0) {
    return true;
  }

  const sampleCount = 18;
  let referencePixel: string | null = null;
  let hasVariation = false;

  for (let index = 0; index < sampleCount; index += 1) {
    const x = Math.min(width - 1, Math.round((index / Math.max(sampleCount - 1, 1)) * (width - 1)));
    const y = Math.min(
      height - 1,
      Math.round((((index * 7) % sampleCount) / Math.max(sampleCount - 1, 1)) * (height - 1)),
    );
    const [red, green, blue, alpha] = context.getImageData(x, y, 1, 1).data;

    if (alpha === 0) {
      continue;
    }

    const pixel = `${red}-${green}-${blue}-${alpha}`;
    if (referencePixel === null) {
      referencePixel = pixel;
      continue;
    }

    if (pixel !== referencePixel) {
      hasVariation = true;
      break;
    }
  }

  return !hasVariation;
}

async function renderPosterCanvas(
  element: HTMLElement,
  options: {
    backgroundColor: string;
    foreignObjectRendering: boolean;
    scale: number;
    useCORS: boolean;
  },
) {
  const { backgroundColor, foreignObjectRendering, scale, useCORS } = options;

  return html2canvas(element, {
    backgroundColor,
    foreignObjectRendering,
    logging: false,
    onclone: (clonedDocument, clonedElement) => {
      applyClonedDocumentTypography(clonedDocument, clonedElement);
    },
    removeContainer: true,
    scale,
    useCORS,
  });
}

async function renderPosterCanvasWithHtmlToImage(
  element: HTMLElement,
  options: {
    backgroundColor: string;
    scale: number;
  },
) {
  const { backgroundColor, scale } = options;
  const width = element.scrollWidth || element.clientWidth || element.offsetWidth;
  const height = element.scrollHeight || element.clientHeight || element.offsetHeight;
  const fontEmbedCSS = await getCachedFontEmbedCSS(element);

  return toCanvas(element, {
    backgroundColor,
    cacheBust: false,
    fontEmbedCSS,
    height,
    includeQueryParams: true,
    pixelRatio: scale,
    preferredFontFormat: "woff2",
    skipAutoScale: true,
    width,
  });
}

export async function exportPosterAsImage(
  element: HTMLElement,
  options: PosterExportOptions = {},
) {
  const {
    backgroundColor = "#2a314f",
    download = true,
    fileName = "poster.png",
    scale = 2,
    useCORS = true,
  } = options;

  let canvas: HTMLCanvasElement;

  try {
    canvas = await renderPosterCanvasWithHtmlToImage(element, {
      backgroundColor,
      scale,
    });
  } catch {
    canvas = await renderPosterCanvas(element, {
      backgroundColor,
      foreignObjectRendering: false,
      scale,
      useCORS,
    });
  }

  if (isCanvasLikelyBlank(canvas)) {
    canvas = await renderPosterCanvas(element, {
      backgroundColor,
      foreignObjectRendering: false,
      scale,
      useCORS,
    });
  }

  const dataUrl = canvas.toDataURL("image/png");

  if (download && typeof document !== "undefined") {
    const link = document.createElement("a");
    link.download = fileName;
    link.href = dataUrl;
    link.click();
  }

  return {
    canvas,
    dataUrl,
  };
}
