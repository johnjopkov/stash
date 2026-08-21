const responsiveThumbnailWidths = [640, 1280, 1920];

function withThumbnailSize(path: string, size: number) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}size=${size}`;
}

export function imageThumbnailSrcSet(path?: string | null) {
  if (!path) return undefined;

  return responsiveThumbnailWidths
    .map((width) => `${withThumbnailSize(path, width)} ${width}w`)
    .join(", ");
}
