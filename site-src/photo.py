# Shared helper: responsive photo block (pictures live in site-src/img, copied to public/img).
def photo(name, alt, style="", pos="center", ratio="16/9", sizes="(max-width: 900px) 100vw, 760px", eager=False):
    load = 'fetchpriority="high"' if eager else 'loading="lazy"'
    # WebP for browsers that take it (about a third smaller), JPEG for the rest.
    return (f'<div class="art-img photo" style="{style}"><picture>'
            f'<source type="image/webp" srcset="/img/{name}-800.webp 800w, /img/{name}-1600.webp 1600w" sizes="{sizes}">'
            f'<img src="/img/{name}-1600.jpg" srcset="/img/{name}-800.jpg 800w, /img/{name}-1600.jpg 1600w" sizes="{sizes}" '
            f'alt="{alt}" {load} decoding="async" width="1600" height="900" '
            f'style="width:100%;height:auto;aspect-ratio:{ratio};object-fit:cover;object-position:{pos};display:block"></picture></div>')
