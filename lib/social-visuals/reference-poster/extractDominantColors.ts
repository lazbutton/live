function clampChannel(value: number) {
  return Math.max(0, Math.min(255, value));
}

function toHex(value: number) {
  return clampChannel(Math.round(value)).toString(16).padStart(2, "0");
}

function rgbToHex(red: number, green: number, blue: number) {
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function colorDistance(
  a: { blue: number; green: number; red: number },
  b: { blue: number; green: number; red: number },
) {
  return Math.sqrt(
    (a.red - b.red) ** 2 + (a.green - b.green) ** 2 + (a.blue - b.blue) ** 2,
  );
}

function luminance(red: number, green: number, blue: number) {
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
}

function saturation(red: number, green: number, blue: number) {
  const max = Math.max(red, green, blue) / 255;
  const min = Math.min(red, green, blue) / 255;

  if (max === 0) {
    return 0;
  }

  return (max - min) / max;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    if (!src.startsWith("blob:") && !src.startsWith("data:")) {
      image.crossOrigin = "anonymous";
    }

    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image for palette extraction."));
    image.src = src;
  });
}

export interface ExtractDominantColorsOptions {
  colorCount?: number;
  sampleSize?: number;
}

export async function extractDominantColors(
  src: string,
  options: ExtractDominantColorsOptions = {},
) {
  if (!src || typeof document === "undefined") {
    return [];
  }

  const { colorCount = 6, sampleSize = 120 } = options;
  const image = await loadImage(src);
  const longestSide = Math.max(image.naturalWidth, image.naturalHeight, 1);
  const scale = Math.min(1, sampleSize / longestSide);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return [];
  }

  context.drawImage(image, 0, 0, width, height);

  const { data } = context.getImageData(0, 0, width, height);
  const buckets = new Map<
    string,
    { blue: number; count: number; green: number; red: number }
  >();
  const quantize = 24;

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const alpha = data[index + 3];

    if (alpha < 180) {
      continue;
    }

    const colorLuminance = luminance(red, green, blue);
    const colorSaturation = saturation(red, green, blue);

    if ((colorLuminance > 0.97 || colorLuminance < 0.03) && colorSaturation < 0.08) {
      continue;
    }

    const bucketRed = Math.round(red / quantize) * quantize;
    const bucketGreen = Math.round(green / quantize) * quantize;
    const bucketBlue = Math.round(blue / quantize) * quantize;
    const key = `${bucketRed}-${bucketGreen}-${bucketBlue}`;
    const bucket = buckets.get(key);

    if (bucket) {
      bucket.count += 1;
      bucket.red += red;
      bucket.green += green;
      bucket.blue += blue;
      continue;
    }

    buckets.set(key, {
      blue,
      count: 1,
      green,
      red,
    });
  }

  const rankedColors = Array.from(buckets.values())
    .map((bucket) => {
      const red = bucket.red / bucket.count;
      const green = bucket.green / bucket.count;
      const blue = bucket.blue / bucket.count;

      return {
        blue,
        count: bucket.count,
        green,
        hex: rgbToHex(red, green, blue),
        red,
        score: bucket.count * (0.7 + saturation(red, green, blue) * 0.9),
      };
    })
    .sort((left, right) => right.score - left.score);

  const palette: string[] = [];
  const keptColors: Array<{ blue: number; green: number; red: number }> = [];

  for (const color of rankedColors) {
    const isTooClose = keptColors.some((candidate) => colorDistance(candidate, color) < 42);

    if (isTooClose) {
      continue;
    }

    palette.push(color.hex);
    keptColors.push(color);

    if (palette.length >= colorCount) {
      break;
    }
  }

  return palette;
}
