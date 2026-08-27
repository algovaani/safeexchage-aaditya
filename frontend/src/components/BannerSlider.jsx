import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { resolveAssetUrl } from '../utils/assetUrl.js';
import './BannerSlider.css';

const SLIDE_MS = 10_000;

/** Recommended upload size for dashboard banners (matches CSS aspect-ratio). */
export const BANNER_SIZE_HINT = {
  width: 1200,
  height: 400,
  ratio: '3:1',
  maxMb: 2,
  formats: 'JPG, PNG, WebP, GIF',
};

export default function BannerSlider({ banners = [] }) {
  const slides = Array.isArray(banners) ? banners.filter(Boolean) : [];
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setIndex(0);
  }, [slides.length]);

  useEffect(() => {
    if (slides.length <= 1 || paused) return undefined;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, SLIDE_MS);
    return () => window.clearInterval(id);
  }, [slides.length, paused]);

  if (!slides.length) return null;

  const current = slides[Math.min(index, slides.length - 1)];
  const imageSrc = current?.imageUrl ? resolveAssetUrl(current.imageUrl) : '';

  function go(delta) {
    if (slides.length <= 1) return;
    setIndex((i) => (i + delta + slides.length) % slides.length);
  }

  return (
    <div
      className="banner-slider ui-card"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="banner-slider__viewport">
        {imageSrc ? (
          <img
            key={String(current._id || current.id || index)}
            src={imageSrc}
            alt=""
            className="banner-slider__image"
            loading={index === 0 ? 'eager' : 'lazy'}
          />
        ) : (
          <div className="banner-slider__placeholder" aria-hidden />
        )}

        {slides.length > 1 ? (
          <>
            <button
              type="button"
              className="banner-slider__nav banner-slider__nav--prev"
              aria-label="Previous banner"
              onClick={() => go(-1)}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              className="banner-slider__nav banner-slider__nav--next"
              aria-label="Next banner"
              onClick={() => go(1)}
            >
              <ChevronRight size={18} />
            </button>
          </>
        ) : null}
      </div>

      {slides.length > 1 ? (
        <div className="banner-slider__dots" role="tablist" aria-label="Banner slides">
          {slides.map((b, i) => (
            <button
              key={String(b._id || b.id || i)}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Banner ${i + 1}`}
              className={`banner-slider__dot${i === index ? ' is-active' : ''}`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
