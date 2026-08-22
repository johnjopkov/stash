import React, { useEffect, useRef, useState, useCallback } from "react";
import * as GQL from "src/core/generated-graphql";
import {
  CONTINUOUS_WHEEL_NAVIGATION_THRESHOLD,
  getZoomTranslationDelta,
  isContinuousWheelEvent,
} from "./LightboxInput";

const ZOOM_STEP = 1.1;
const ZOOM_FACTOR = 700;
const SCROLL_PAN_STEP = 75;
const SCROLL_PAN_FACTOR = 2;
const CLASSNAME = "Lightbox";
const CLASSNAME_CAROUSEL = `${CLASSNAME}-carousel`;
const CLASSNAME_IMAGE = `${CLASSNAME_CAROUSEL}-image`;

interface PointerPosition {
  pointerId: number;
  clientX: number;
  clientY: number;
}

function calculateDefaultZoom(
  width: number,
  height: number,
  boundWidth: number,
  boundHeight: number,
  displayMode: GQL.ImageLightboxDisplayMode,
  scaleUp: boolean
) {
  // set initial zoom level based on options
  let xZoom: number;
  let yZoom: number;
  let newZoom = 1;
  switch (displayMode) {
    case GQL.ImageLightboxDisplayMode.FitXy:
      xZoom = boundWidth / width;
      yZoom = boundHeight / height;

      if (!scaleUp) {
        xZoom = Math.min(xZoom, 1);
        yZoom = Math.min(yZoom, 1);
      }
      newZoom = Math.min(xZoom, yZoom);
      break;
    case GQL.ImageLightboxDisplayMode.FitX:
      newZoom = boundWidth / width;

      if (!scaleUp) {
        newZoom = Math.min(newZoom, 1);
      }
      break;
    case GQL.ImageLightboxDisplayMode.Original:
      newZoom = 1;
      break;
  }

  return newZoom;
}

interface IProps {
  src: string;
  width: number;
  height: number;
  displayMode: GQL.ImageLightboxDisplayMode;
  scaleUp: boolean;
  scrollMode: GQL.ImageLightboxScrollMode;
  resetPosition?: boolean;
  zoom: number;
  scrollAttemptsBeforeChange: number;
  // Shared between images so a continuous gesture cannot navigate twice while
  // the carousel swaps the current LightboxImage.
  firstScroll: React.MutableRefObject<number | null>;
  inScrollGroup: React.MutableRefObject<boolean>;
  current: boolean;
  // set to true to align image with bottom instead of top
  alignBottom?: boolean;
  setZoom: (v: number) => number;
  debouncedScrollReset: () => void;
  onLeft: () => void;
  onRight: () => void;
  isVideo: boolean;
}

export const LightboxImage: React.FC<IProps> = ({
  src,
  width,
  height,
  displayMode,
  scaleUp,
  scrollMode,
  resetPosition,
  zoom,
  scrollAttemptsBeforeChange,
  firstScroll,
  inScrollGroup,
  current,
  alignBottom,
  setZoom,
  debouncedScrollReset,
  onLeft,
  onRight,
  isVideo,
}) => {
  const [defaultZoom, setDefaultZoom] = useState(1);
  const [moving, setMoving] = useState(false);
  const [positionX, setPositionX] = useState(0);
  const [positionY, setPositionY] = useState(0);
  const [imageWidth, setImageWidth] = useState(width);
  const [imageHeight, setImageHeight] = useState(height);
  const [boxWidth, setBoxWidth] = useState(0);
  const [boxHeight, setBoxHeight] = useState(0);
  const dimensionsProvided = width > 0 && height > 0;

  const resetPositionRef = useRef(resetPosition);

  const container = useRef<HTMLDivElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const startPoints = useRef<number[]>([0, 0]);
  const pointerCache = useRef<PointerPosition[]>([]);
  const prevDiff = useRef<number | undefined>();
  const scrollAttempts = useRef(0);

  useEffect(() => {
    const box = container.current;
    if (box) {
      setBoxWidth(box.offsetWidth);
      setBoxHeight(box.offsetHeight);
    }

    function toggleVideoPlay() {
      if (container.current) {
        const openVideo = container.current.getElementsByTagName("video");
        if (openVideo.length > 0) {
          if (current) {
            openVideo[0].play();
          } else {
            openVideo[0].pause();
          }
        }
      }
    }

    const toggleTimer = window.setTimeout(() => {
      toggleVideoPlay();
    }, 250);

    return () => window.clearTimeout(toggleTimer);
  }, [current]);

  useEffect(() => {
    if (dimensionsProvided) {
      return;
    }
    let mounted = true;
    const img = new Image();
    function onLoad() {
      if (mounted) {
        setImageWidth(img.width);
        setImageHeight(img.height);
      }
    }

    img.onload = onLoad;
    img.src = src;

    return () => {
      mounted = false;
    };
  }, [src, dimensionsProvided]);

  const minMaxY = useCallback(
    (appliedZoom: number) => {
      let minY: number, maxY: number;
      const inBounds = appliedZoom * imageHeight <= boxHeight;

      // NOTE: I don't even know how these work, but they do
      if (!inBounds) {
        if (imageHeight > boxHeight) {
          minY =
            (appliedZoom * imageHeight - imageHeight) / 2 -
            appliedZoom * imageHeight +
            boxHeight;
          maxY = (appliedZoom * imageHeight - imageHeight) / 2;
        } else {
          minY = (boxHeight - appliedZoom * imageHeight) / 2;
          maxY = (appliedZoom * imageHeight - boxHeight) / 2;
        }
      } else {
        minY = Math.min((boxHeight - imageHeight) / 2, 0);
        maxY = minY;
      }

      return [minY, maxY];
    },
    [imageHeight, boxHeight]
  );

  const calculateInitialPosition = useCallback(
    (appliedZoom: number) => {
      // Center image from container's center
      const newPositionX = Math.min((boxWidth - imageWidth) / 2, 0);
      let newPositionY: number;

      if (displayMode === GQL.ImageLightboxDisplayMode.FitXy) {
        newPositionY = Math.min((boxHeight - imageHeight) / 2, 0);
      } else {
        // otherwise, align image with container
        const [minY, maxY] = minMaxY(appliedZoom);
        if (!alignBottom) {
          newPositionY = maxY;
        } else {
          newPositionY = minY;
        }
      }

      return [newPositionX, newPositionY];
    },
    [
      displayMode,
      boxWidth,
      imageWidth,
      boxHeight,
      imageHeight,
      alignBottom,
      minMaxY,
    ]
  );

  useEffect(() => {
    // don't set anything until we have the dimensions
    if (!imageWidth || !imageHeight || !boxWidth || !boxHeight) {
      return;
    }

    if (!scaleUp && imageWidth < boxWidth && imageHeight < boxHeight) {
      setDefaultZoom(1);
      setPositionX(0);
      setPositionY(0);
      return;
    }

    // set initial zoom level based on options
    const newZoom = calculateDefaultZoom(
      imageWidth,
      imageHeight,
      boxWidth,
      boxHeight,
      displayMode,
      scaleUp
    );

    setDefaultZoom(newZoom);

    const [newPositionX, newPositionY] = calculateInitialPosition(newZoom * 1);

    setPositionX(newPositionX);
    setPositionY(newPositionY);

    scrollAttempts.current = alignBottom
      ? scrollAttemptsBeforeChange
      : -scrollAttemptsBeforeChange;
  }, [
    imageWidth,
    imageHeight,
    boxWidth,
    boxHeight,
    displayMode,
    scaleUp,
    alignBottom,
    calculateInitialPosition,
    scrollAttemptsBeforeChange,
  ]);

  useEffect(() => {
    if (resetPosition !== resetPositionRef.current) {
      resetPositionRef.current = resetPosition;

      const [x, y] = calculateInitialPosition(zoom * defaultZoom);
      setPositionX(x);
      setPositionY(y);
    }
  }, [zoom, defaultZoom, resetPosition, calculateInitialPosition]);

  function getScrollMode(ev: React.WheelEvent) {
    if (ev.shiftKey) {
      switch (scrollMode) {
        case GQL.ImageLightboxScrollMode.Zoom:
          return GQL.ImageLightboxScrollMode.Navigate;
        case GQL.ImageLightboxScrollMode.PanY:
        case GQL.ImageLightboxScrollMode.Navigate:
          return GQL.ImageLightboxScrollMode.Zoom;
      }
    }

    return scrollMode;
  }

  function onContainerScroll(ev: React.WheelEvent) {
    const effectiveScrollMode = getScrollMode(ev);
    // Image events bubble through this container. Only zoom blank space here;
    // Pan Y needs the container as well because a fitted image may not fill it.
    if (
      effectiveScrollMode === GQL.ImageLightboxScrollMode.PanY ||
      (effectiveScrollMode === GQL.ImageLightboxScrollMode.Zoom &&
        ev.target === ev.currentTarget)
    ) {
      onImageScroll(ev);
    }
  }

  function onLeftScroll(continuous: boolean, scrollable: boolean) {
    if (continuous) {
      if (!inScrollGroup.current) {
        onLeft();
        inScrollGroup.current = true;
      }
      return;
    }

    if (!scrollable || scrollAttempts.current <= -scrollAttemptsBeforeChange) {
      scrollAttempts.current = 0;
      onLeft();
    } else {
      scrollAttempts.current--;
    }
  }

  function onRightScroll(continuous: boolean, scrollable: boolean) {
    if (continuous) {
      if (!inScrollGroup.current) {
        onRight();
        inScrollGroup.current = true;
      }
      return;
    }

    if (!scrollable || scrollAttempts.current >= scrollAttemptsBeforeChange) {
      scrollAttempts.current = 0;
      onRight();
    } else {
      scrollAttempts.current++;
    }
  }

  function onImageScrollPanY(ev: React.WheelEvent, continuous: boolean) {
    const [minY, maxY] = minMaxY(zoom * defaultZoom);
    const scrollable = positionY !== maxY || positionY !== minY;
    const newPositionY = continuous
      ? positionY - ev.deltaY / SCROLL_PAN_FACTOR
      : positionY + (ev.deltaY < 0 ? SCROLL_PAN_STEP : -SCROLL_PAN_STEP);

    if (newPositionY > maxY && positionY === maxY) {
      if (
        !continuous ||
        Math.abs(ev.deltaY) >= CONTINUOUS_WHEEL_NAVIGATION_THRESHOLD
      ) {
        onLeftScroll(continuous, scrollable);
      }
    } else if (newPositionY < minY && positionY === minY) {
      if (
        !continuous ||
        Math.abs(ev.deltaY) >= CONTINUOUS_WHEEL_NAVIGATION_THRESHOLD
      ) {
        onRightScroll(continuous, scrollable);
      }
    } else {
      scrollAttempts.current = 0;
      setPositionY(Math.max(minY, Math.min(newPositionY, maxY)));
    }

    ev.stopPropagation();
  }

  function setZoomAroundPoint(
    requestedZoom: number,
    clientX: number,
    clientY: number
  ) {
    const appliedZoom = setZoom(requestedZoom);
    const ratio = appliedZoom / zoom;
    const rect = wrapper.current?.getBoundingClientRect();
    if (!rect || ratio === 1) return;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    setPositionX(
      (value) => value + getZoomTranslationDelta(ratio, clientX, centerX)
    );
    setPositionY(
      (value) => value + getZoomTranslationDelta(ratio, clientY, centerY)
    );
  }

  function onImageScroll(ev: React.WheelEvent) {
    if (!current || ev.deltaY === 0) return;

    const effectiveScrollMode = getScrollMode(ev);
    if (effectiveScrollMode === GQL.ImageLightboxScrollMode.Navigate) return;

    const firstDeltaY = firstScroll.current;
    const continuous = isContinuousWheelEvent(
      ev.deltaY,
      ev.deltaMode,
      firstDeltaY
    );

    if (effectiveScrollMode === GQL.ImageLightboxScrollMode.PanY) {
      onImageScrollPanY(ev, continuous);
    } else {
      const percent = continuous
        ? 1 - ev.deltaY / ZOOM_FACTOR
        : ev.deltaY < 0
          ? ZOOM_STEP
          : 1 / ZOOM_STEP;
      setZoomAroundPoint(zoom * percent, ev.clientX, ev.clientY);
    }

    if (firstDeltaY === null) firstScroll.current = ev.deltaY;
    debouncedScrollReset();
  }

  function onImageMouseOver(ev: React.MouseEvent) {
    if (!moving) return;

    if (!ev.buttons) {
      setMoving(false);
      return;
    }

    const posX = ev.pageX - startPoints.current[0];
    const posY = ev.pageY - startPoints.current[1];
    startPoints.current = [ev.pageX, ev.pageY];

    setPositionX(positionX + posX);
    setPositionY(positionY + posY);
  }

  function onImageMouseDown(ev: React.MouseEvent) {
    startPoints.current = [ev.pageX, ev.pageY];
    setMoving(true);
  }

  function onTouchStart(ev: React.TouchEvent) {
    if (ev.touches.length === 1) {
      startPoints.current = [ev.touches[0].pageX, ev.touches[0].pageY];
      setMoving(true);
    }
  }

  function onTouchEnd(ev: React.TouchEvent) {
    if (ev.touches.length === 1) {
      startPoints.current = [ev.touches[0].pageX, ev.touches[0].pageY];
      setMoving(true);
    } else {
      setMoving(false);
    }
  }

  function onTouchMove(ev: React.TouchEvent) {
    if (!moving) return;

    if (ev.touches.length === 1) {
      const posX = ev.touches[0].pageX - startPoints.current[0];
      const posY = ev.touches[0].pageY - startPoints.current[1];
      startPoints.current = [ev.touches[0].pageX, ev.touches[0].pageY];

      setPositionX(positionX + posX);
      setPositionY(positionY + posY);
    }
  }

  function onPointerDown(ev: React.PointerEvent) {
    // replace pointer event with the same id, if applicable
    pointerCache.current = pointerCache.current.filter(
      (e) => e.pointerId !== ev.pointerId
    );

    pointerCache.current.push({
      pointerId: ev.pointerId,
      clientX: ev.clientX,
      clientY: ev.clientY,
    });
    prevDiff.current = undefined;
    ev.currentTarget.setPointerCapture(ev.pointerId);
  }

  function onPointerUp(ev: React.PointerEvent) {
    for (let i = 0; i < pointerCache.current.length; i++) {
      if (pointerCache.current[i].pointerId === ev.pointerId) {
        pointerCache.current.splice(i, 1);
        break;
      }
    }
    prevDiff.current = undefined;
    if (ev.currentTarget.hasPointerCapture(ev.pointerId)) {
      ev.currentTarget.releasePointerCapture(ev.pointerId);
    }
  }

  function onPointerMove(ev: React.PointerEvent) {
    // find the event in the cache
    const cachedIndex = pointerCache.current.findIndex(
      (c) => c.pointerId === ev.pointerId
    );
    if (cachedIndex !== -1) {
      pointerCache.current[cachedIndex] = {
        pointerId: ev.pointerId,
        clientX: ev.clientX,
        clientY: ev.clientY,
      };
    }

    // compare the difference between the two pointers
    if (pointerCache.current.length === 2) {
      const ev1 = pointerCache.current[0];
      const ev2 = pointerCache.current[1];
      const diffX = Math.abs(ev1.clientX - ev2.clientX);
      const diffY = Math.abs(ev1.clientY - ev2.clientY);
      const diff = Math.sqrt(diffX ** 2 + diffY ** 2);

      if (prevDiff.current !== undefined) {
        const diffDiff = diff - prevDiff.current;
        const factor = (Math.abs(diffDiff) / 20) * 0.1 + 1;

        if (diffDiff > 0) {
          setZoomAroundPoint(
            zoom * factor,
            (ev1.clientX + ev2.clientX) / 2,
            (ev1.clientY + ev2.clientY) / 2
          );
        } else if (diffDiff < 0) {
          setZoomAroundPoint(
            zoom / factor,
            (ev1.clientX + ev2.clientX) / 2,
            (ev1.clientY + ev2.clientY) / 2
          );
        }
      }

      prevDiff.current = diff;
    }
  }

  const ImageView = isVideo ? "video" : "img";

  return (
    <div
      ref={container}
      className={`${CLASSNAME_IMAGE}`}
      onWheel={(e) => onContainerScroll(e)}
    >
      {defaultZoom ? (
        /* The transform is applied to this wrapper rather than the <img>
           to work around a Safari rendering bug: `transform: scale` on
           an <img> with very large intrinsic dimensions distorts the
           image's aspect ratio. See #5087. */
        <div
          ref={wrapper}
          className={`${CLASSNAME_IMAGE}-wrapper`}
          style={{
            transform: `translate(${positionX}px, ${positionY}px) scale(${
              defaultZoom * zoom
            })`,
          }}
        >
          <source srcSet={src} media="(min-width: 800px)" />
          {/* XXbiome-ignore jsx-a11y/no-noninteractive-element-interactions */}
          <ImageView
            loop={isVideo}
            src={src}
            alt=""
            draggable={false}
            style={{ touchAction: "none" }}
            onWheel={current ? (e) => onImageScroll(e) : undefined}
            onMouseDown={onImageMouseDown}
            onMouseUp={() => setMoving(false)}
            onMouseMove={onImageMouseOver}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={() => setMoving(false)}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerMove={onPointerMove}
          />
        </div>
      ) : undefined}
    </div>
  );
};
