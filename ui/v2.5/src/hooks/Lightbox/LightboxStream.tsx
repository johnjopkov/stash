import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Gallery, { PhotoProps, RenderImageProps } from "react-photo-gallery";
import { LoadingIndicator } from "src/components/Shared/LoadingIndicator";
import { imageTitle } from "src/core/files";
import { imageThumbnailSrcSet } from "src/utils/imageSources";
import { isVideo } from "src/utils/visualFile";
import { ILightboxImage, LightboxStreamLoader } from "./types";

const CLASSNAME = "Lightbox-stream";

interface IStreamPhoto extends PhotoProps {
  fullSrc: string;
  globalIndex: number;
  image: ILightboxImage;
  video: boolean;
}

interface IProps {
  images: ILightboxImage[];
  initialIndex: number;
  page: number;
  pages: number;
  pageSize: number;
  totalCount: number;
  streamLoader?: LightboxStreamLoader;
  singleColumn: boolean;
  wallSize: number;
  removedImageIds: Set<string>;
  onActiveImage: (image: ILightboxImage, globalIndex: number) => void;
  onError: (error: unknown) => void;
}

const StreamImage: React.FC<RenderImageProps> = (props) => {
  const photo = props.photo as IStreamPhoto;
  const style: React.CSSProperties = {
    display: "block",
    height: photo.height,
    margin: props.margin,
    position: "relative",
    width: photo.width,
  };

  if (props.direction === "column") {
    style.left = props.left;
    style.position = "absolute";
    style.top = props.top;
  }

  return (
    <div
      className={`${CLASSNAME}-item`}
      data-lightbox-stream-index={photo.globalIndex}
      style={style}
    >
      {photo.video ? (
        <video
          autoPlay
          loop
          muted
          playsInline
          src={photo.src}
          width={photo.width}
          height={photo.height}
        />
      ) : (
        <img
          src={photo.src}
          srcSet={
            Array.isArray(photo.srcSet) ? photo.srcSet.join(", ") : photo.srcSet
          }
          sizes={`${Math.ceil(photo.width)}px`}
          width={photo.width}
          height={photo.height}
          loading="lazy"
          alt={photo.alt}
        />
      )}
    </div>
  );
};

const breakpointWallHeights = [
  { minWidth: 0, heights: [160, 220, 280, 360] },
  { minWidth: 576, heights: [180, 260, 360, 480] },
  { minWidth: 1200, heights: [220, 320, 440, 600] },
];

const SingleColumnImage: React.FC<{ photo: IStreamPhoto }> = ({ photo }) => (
  <div
    className={`${CLASSNAME}-item ${CLASSNAME}-single-item`}
    data-lightbox-stream-index={photo.globalIndex}
  >
    {photo.video ? (
      <video autoPlay loop muted playsInline src={photo.src} />
    ) : (
      <img src={photo.fullSrc} loading="lazy" alt={photo.alt} />
    )}
  </div>
);

export const LightboxStream: React.FC<IProps> = ({
  images,
  initialIndex,
  page,
  pages,
  pageSize,
  totalCount,
  streamLoader,
  singleColumn,
  wallSize,
  removedImageIds,
  onActiveImage,
  onError,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const initialScrollDone = useRef(false);
  const loadingRef = useRef(false);
  const mountedRef = useRef(true);
  const prependSnapshot = useRef<{ height: number; top: number }>();
  const activeFrame = useRef<number>();
  const activeIndexRef = useRef<number>();
  const previousLayout = useRef({ singleColumn, wallSize });

  const [loadedPages, setLoadedPages] = useState(
    () => new Map<number, ILightboxImage[]>([[page, images]])
  );
  const [pageCount, setPageCount] = useState(pages);
  const [knownTotal, setKnownTotal] = useState(totalCount);
  const [loadingDirection, setLoadingDirection] = useState<
    "previous" | "next" | null
  >(null);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (activeFrame.current !== undefined) {
        window.cancelAnimationFrame(activeFrame.current);
      }
    };
  }, []);

  useEffect(() => {
    setLoadedPages((current) => {
      if (current.get(page) === images) return current;
      const next = new Map(current);
      next.set(page, images);
      return next;
    });
    setPageCount(pages);
    setKnownTotal(totalCount);
  }, [images, page, pages, totalCount]);

  const pageEntries = useMemo(
    () => Array.from(loadedPages.entries()).sort(([a], [b]) => a - b),
    [loadedPages]
  );

  const photos = useMemo<IStreamPhoto[]>(() => {
    return pageEntries.flatMap(([pageNumber, pageImages]) =>
      pageImages.flatMap((image, index) => {
        if (image.id && removedImageIds.has(image.id)) return [];

        const visualFile = image.visual_files?.[0];
        const video = isVideo(visualFile ?? {});
        const src = video
          ? image.paths.preview || image.paths.image || image.paths.thumbnail
          : image.paths.thumbnail;
        if (!src) return [];

        return [
          {
            src,
            fullSrc: video ? src : image.paths.image || src,
            srcSet: video
              ? undefined
              : imageThumbnailSrcSet(image.paths.thumbnail),
            width: visualFile?.width || 1,
            height: visualFile?.height || 1,
            alt: imageTitle(image),
            key:
              image.id ??
              image.paths.image ??
              `${pageNumber}-${index.toString()}`,
            globalIndex: (pageNumber - 1) * pageSize + index,
            image,
            video,
          },
        ];
      })
    );
  }, [pageEntries, pageSize, removedImageIds]);

  const photosByIndex = useMemo(
    () => new Map(photos.map((photo) => [photo.globalIndex, photo])),
    [photos]
  );

  const updateActiveImage = useCallback(() => {
    if (activeFrame.current !== undefined) {
      window.cancelAnimationFrame(activeFrame.current);
    }

    activeFrame.current = window.requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const viewportCenter = containerRect.top + containerRect.height / 2;
      let closest: { distance: number; photo: IStreamPhoto } | undefined;

      container
        .querySelectorAll<HTMLElement>("[data-lightbox-stream-index]")
        .forEach((element) => {
          const globalIndex = Number(element.dataset.lightboxStreamIndex);
          const photo = photosByIndex.get(globalIndex);
          if (!photo) return;

          const rect = element.getBoundingClientRect();
          if (
            rect.bottom < containerRect.top ||
            rect.top > containerRect.bottom
          )
            return;

          const distance = Math.abs(
            rect.top + rect.height / 2 - viewportCenter
          );
          if (!closest || distance < closest.distance) {
            closest = { distance, photo };
          }
        });

      if (closest) {
        activeIndexRef.current = closest.photo.globalIndex;
        onActiveImage(closest.photo.image, closest.photo.globalIndex);
      }
    });
  }, [onActiveImage, photosByIndex]);

  useLayoutEffect(() => {
    if (photos.length === 0) return;

    const snapshot = prependSnapshot.current;
    const container = containerRef.current;
    if (snapshot && container) {
      container.scrollTop =
        snapshot.top + (container.scrollHeight - snapshot.height);
      prependSnapshot.current = undefined;
    }

    if (initialScrollDone.current || !container) return;

    const globalIndex = (page - 1) * pageSize + initialIndex;
    const target = container.querySelector<HTMLElement>(
      `[data-lightbox-stream-index="${globalIndex.toString()}"]`
    );
    if (!target) return;

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    container.scrollTop +=
      targetRect.top -
      containerRect.top -
      (container.clientHeight - targetRect.height) / 2;
    initialScrollDone.current = true;
    updateActiveImage();
  }, [initialIndex, page, pageSize, photos.length, updateActiveImage]);

  useEffect(() => {
    updateActiveImage();
  }, [updateActiveImage]);

  useLayoutEffect(() => {
    const previous = previousLayout.current;
    previousLayout.current = { singleColumn, wallSize };
    if (
      previous.singleColumn === singleColumn &&
      previous.wallSize === wallSize
    ) {
      return;
    }

    const container = containerRef.current;
    const activeIndex =
      activeIndexRef.current ?? (page - 1) * pageSize + initialIndex;
    const target = container?.querySelector<HTMLElement>(
      `[data-lightbox-stream-index="${activeIndex.toString()}"]`
    );
    if (!container || !target) return;

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    container.scrollTop +=
      targetRect.top -
      containerRect.top -
      (container.clientHeight - targetRect.height) / 2;
    updateActiveImage();
  }, [initialIndex, page, pageSize, singleColumn, updateActiveImage, wallSize]);

  const targetRowHeight = useCallback(
    (containerWidth: number) => {
      let height = breakpointWallHeights[0].heights[wallSize];
      breakpointWallHeights.forEach((breakpoint) => {
        if (containerWidth >= breakpoint.minWidth) {
          height = breakpoint.heights[wallSize];
        }
      });
      return height;
    },
    [wallSize]
  );

  const loadAdjacentPage = useCallback(
    async (requestedPage: number, direction: "previous" | "next") => {
      if (
        !streamLoader ||
        loadingRef.current ||
        requestedPage < 1 ||
        requestedPage > pageCount ||
        loadedPages.has(requestedPage)
      ) {
        return;
      }

      loadingRef.current = true;
      setLoadingDirection(direction);

      try {
        const result = await streamLoader(requestedPage);
        if (!mountedRef.current) return;

        if (direction === "previous" && containerRef.current) {
          prependSnapshot.current = {
            height: containerRef.current.scrollHeight,
            top: containerRef.current.scrollTop,
          };
        }

        setPageCount(result.pages);
        setKnownTotal(result.totalCount);
        setLoadedPages((current) => {
          const next = new Map(current);
          next.set(result.page, result.images);
          return next;
        });
      } catch (error) {
        onError(error);
      } finally {
        loadingRef.current = false;
        if (mountedRef.current) setLoadingDirection(null);
      }
    },
    [loadedPages, onError, pageCount, streamLoader]
  );

  const firstLoadedPage = pageEntries[0]?.[0] ?? page;
  const lastLoadedPage = pageEntries[pageEntries.length - 1]?.[0] ?? page;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !streamLoader) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          if (entry.target === topSentinelRef.current) {
            loadAdjacentPage(firstLoadedPage - 1, "previous");
          } else if (entry.target === bottomSentinelRef.current) {
            loadAdjacentPage(lastLoadedPage + 1, "next");
          }
        });
      },
      { root: container, rootMargin: "100% 0px" }
    );

    if (topSentinelRef.current) observer.observe(topSentinelRef.current);
    if (bottomSentinelRef.current) observer.observe(bottomSentinelRef.current);
    return () => observer.disconnect();
  }, [firstLoadedPage, lastLoadedPage, loadAdjacentPage, streamLoader]);

  return (
    <div className={CLASSNAME} ref={containerRef} onScroll={updateActiveImage}>
      {firstLoadedPage > 1 && (
        <div className={`${CLASSNAME}-sentinel`} ref={topSentinelRef} />
      )}
      {loadingDirection === "previous" && (
        <div className={`${CLASSNAME}-loading`}>
          <LoadingIndicator />
        </div>
      )}
      {singleColumn ? (
        <div className={`${CLASSNAME}-single-column`}>
          {photos.map((photo) => (
            <SingleColumnImage
              key={photo.key ?? photo.globalIndex}
              photo={photo}
            />
          ))}
        </div>
      ) : (
        <Gallery
          photos={photos}
          renderImage={StreamImage}
          margin={2}
          targetRowHeight={targetRowHeight}
        />
      )}
      {loadingDirection === "next" && (
        <div className={`${CLASSNAME}-loading`}>
          <LoadingIndicator />
        </div>
      )}
      {lastLoadedPage < pageCount && photos.length < knownTotal && (
        <div className={`${CLASSNAME}-sentinel`} ref={bottomSentinelRef} />
      )}
    </div>
  );
};
