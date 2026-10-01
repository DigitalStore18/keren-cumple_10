/* =========================================================
   GENERACIÓN AUTOMÁTICA DE FOTOS E INICIALIZACIÓN DEL VISOR
========================================================= */

document.documentElement.classList.add("js-ready");

document.addEventListener("DOMContentLoaded", () => {
    const galleryContainers = document.querySelectorAll(".auto-gallery");

    galleryContainers.forEach(container => {
        const start = parseInt(container.getAttribute("data-start")) || 1;
        const end = parseInt(container.getAttribute("data-end")) || 111;
        const featuredCount = Math.max(0, parseInt(container.getAttribute("data-featured")) || 0);

        // Fila de fotos grandes al inicio + masonry con el resto
        let featureRow = null;
        if (featuredCount > 0) {
            featureRow = document.createElement("div");
            featureRow.className = "gallery-feature";
            container.appendChild(featureRow);
        }

        const masonry = document.createElement("div");
        masonry.className = "gallery-masonry";
        container.appendChild(masonry);

        for (let i = start; i <= end; i++) {
            const numeroFormateado = i < 10 ? "0" + i : i;
            const isFeatured = featureRow && (i - start) < featuredCount;

            const figure = document.createElement("figure");
            figure.classList.add("reveal");

            const img = document.createElement("img");
            img.src = `fotos/${numeroFormateado}.jpg`;
            img.alt = `Fotografía ${numeroFormateado}`;
            img.dataset.photo = i;
            img.loading = isFeatured ? "eager" : "lazy";

            if (isFeatured) {
                img.addEventListener("load", () => layoutFeatureRow(featureRow));
            }

            figure.appendChild(img);
            (isFeatured ? featureRow : masonry).appendChild(figure);
        }

        if (featureRow) layoutFeatureRow(featureRow);
    });

    initHeroRotation();
    initViewer();
    initChapterObserver();
});

/* =========================================================
   FILA DE FOTOS DESTACADAS
   Cada foto recibe un ancho proporcional a su relación de aspecto,
   así todas quedan a la misma altura sin recortarse.
========================================================= */
function layoutFeatureRow(row) {
    const figures = [...row.children];
    const imgs = figures.map(figure => figure.querySelector("img"));
    if (!imgs.length || !imgs.every(img => img.naturalWidth)) return;

    const ratios = imgs.map(img => img.naturalWidth / img.naturalHeight);
    figures.forEach((figure, i) => {
        figure.style.flexGrow = ratios[i] * 1000;
    });

    // Limitar la altura de la fila a ~75% de la pantalla
    const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
    const sum = ratios.reduce((a, b) => a + b, 0);
    const maxHeight = window.innerHeight * 0.75;
    row.style.maxWidth = `${maxHeight * sum + gap * (figures.length - 1)}px`;
}

window.addEventListener("resize", () => {
    document.querySelectorAll(".gallery-feature").forEach(layoutFeatureRow);
}, { passive: true });

/* =========================================================
   PORTADA: ROTACIÓN AUTOMÁTICA (fundido cada 2 s)
   Las fotos se definen en index.html: data-hero="70,53,82,86"
========================================================= */
const HERO_INTERVAL = 2000;
let heroPhoto = 0; // número de la foto de portada visible ahora

function initHeroRotation() {
    const heroImage = document.querySelector(".hero-image");
    if (!heroImage) return;

    const first = heroImage.querySelector("img");
    const list = (heroImage.dataset.hero || "")
        .split(",")
        .map(n => parseInt(n, 10))
        .filter(Boolean);
    if (!first || list.length < 2) return;

    const shade = heroImage.querySelector(".hero-shade");
    const pad = n => String(n).padStart(2, "0");

    const slides = list.map((n, i) => {
        const img = i === 0 ? first : document.createElement("img");
        img.src = `fotos/${pad(n)}.jpg`;
        img.alt = i === 0 ? "Portada" : "";
        if (i !== 0) heroImage.insertBefore(img, shade);
        return img;
    });

    let index = 0;
    heroPhoto = list[0];
    slides[0].classList.add("active");

    setInterval(() => {
        slides[index].classList.remove("active");
        index = (index + 1) % slides.length;
        slides[index].classList.add("active");
        heroPhoto = list[index];
    }, HERO_INTERVAL);
}

let images = [];
let viewer, viewerNext, box, stage, counter, dots, prevButton, nextButton;

let current = 0;
let isAnimating = false;
let zoom = 1;

const desktopMaxZoom = 4;
const mobileMaxZoom = 3.5;

let zoomX = 0;
let zoomY = 0;

let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;

let pinchStartDistance = 0;
let pinchStartZoom = 1;
let isPinching = false;

let isPanning = false;
let startPanX = 0;
let startPanY = 0;
let lastTouchX = 0;
let lastTouchY = 0;

function initViewer() {
    images = [...document.querySelectorAll(".chapter figure img")];

    viewer = document.getElementById("viewer");
    viewerNext = document.getElementById("viewerNext");
    box = document.getElementById("lightbox");
    stage = document.querySelector(".stage");
    counter = document.getElementById("counter");
    dots = [...counter.querySelectorAll(".dot")];
    prevButton = document.querySelector(".prev");
    nextButton = document.querySelector(".next");

    // Forzar propiedades táctiles y de interacción en el visor por JS
    if (box) box.style.touchAction = "none";
    if (stage) stage.style.touchAction = "none";
    if (viewer) viewer.style.pointerEvents = "auto";
    if (viewerNext) viewerNext.style.pointerEvents = "auto";

    // Evitar que hacer clic o tocar la foto cierre el visor por error
    viewer.addEventListener("click", e => e.stopPropagation());
    viewerNext.addEventListener("click", e => e.stopPropagation());

    images.forEach((img, i) => {
        img.dataset.i = i;
        const clickable = img.closest("figure") || img.parentElement;
        clickable.addEventListener("click", () => openViewer(i));
    });

    const heroImage = document.querySelector(".hero-image");
    if (heroImage) {
        heroImage.addEventListener("click", () => {
            const index = images.findIndex(img => Number(img.dataset.photo) === heroPhoto);
            if (index >= 0) openViewer(index);
        });
    }

    prevButton.onclick = () => previousImage(420);
    nextButton.onclick = () => nextImage(420);
    document.querySelector(".close").onclick = closeViewer;

    box.addEventListener("click", event => {
        if (event.target === box || event.target === stage) {
            closeViewer();
        }
    });

    viewer.addEventListener("mousedown", event => {
        if (zoom > 1) {
            isPanning = true;
            startPanX = event.clientX - zoomX;
            startPanY = event.clientY - zoomY;
            viewer.style.cursor = "grabbing";
            event.preventDefault();
        }
    });

    window.addEventListener("mousemove", event => {
        if (!isPanning) return;
        zoomX = event.clientX - startPanX;
        zoomY = event.clientY - startPanY;
        limitPan();
        applyZoom();
    });

    window.addEventListener("mouseup", () => {
        isPanning = false;
        if (viewer) viewer.style.cursor = zoom > 1 ? "grab" : "default";
    });

    const revealObserver = new IntersectionObserver(
        entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("visible");
                    revealObserver.unobserve(entry.target);
                }
            });
        },
        { threshold: .05 }
    );

    document.querySelectorAll(".reveal").forEach(element => {
        revealObserver.observe(element);
    });

    initTouchGestures();
}

function openViewer(i) {
    current = i;
    resetZoom();
    resetSlider();
    updateViewer();

    box.classList.add("open");
    box.setAttribute("aria-hidden", "false");
    document.body.classList.add("lock");

    requestAnimationFrame(() => {
        positionNavigation();
    });
}

function closeViewer() {
    box.classList.remove("open");
    box.setAttribute("aria-hidden", "true");
    document.body.classList.remove("lock");
    resetZoom();
    resetSlider();
}

function updateViewer() {
    const img = images[current];
    viewer.src = img.currentSrc || img.src;
    viewer.alt = img.alt || "";

    viewerNext.src = "";
    viewerNext.alt = "";

    updateDots();
    preloadNeighbors();

    if (viewer.complete) {
        requestAnimationFrame(() => {
            positionNavigation();
        });
    } else {
        viewer.onload = () => {
            positionNavigation();
        };
    }
}

function prepareIncoming(index) {
    const img = images[index];
    viewerNext.src = img.currentSrc || img.src;
    viewerNext.alt = img.alt || "";

    return new Promise(resolve => {
        if (viewerNext.complete) {
            resolve();
            return;
        }
        viewerNext.onload = () => resolve();
        viewerNext.onerror = () => resolve();
    });
}

const SLIDE_EASE = "cubic-bezier(.22, .85, .3, 1)";
let slideToken = 0;      // invalida animaciones pendientes si se cierra el visor
let dragging = false;    // arrastrando con un dedo (sin zoom)
let dragLocked = null;   // eje del gesto: "x" | "y" | null
let dragSign = 0;        // 1 = entra la siguiente, -1 = entra la anterior

function hideIncoming() {
    viewerNext.style.transition = "none";
    viewerNext.style.opacity = "0";
    setViewerTransform(viewerNext, 1, 0, 0);
    viewerNext.src = "";
    viewerNext.alt = "";
}

function preloadNeighbors() {
    [1, -1].forEach(step => {
        const i = (current + step + images.length) % images.length;
        const pre = new Image();
        pre.src = images[i].currentSrc || images[i].src;
    });
}

// La imagen actual sale deslizando y la siguiente entra desde el lado opuesto
async function slideTo(direction, duration = 420, fromDrag = false) {
    if (isAnimating || !box.classList.contains("open")) return;

    isAnimating = true;
    const token = slideToken;
    const sign = direction === "next" ? 1 : -1;
    const nextIndex = (current + sign + images.length) % images.length;
    const W = window.innerWidth;

    await prepareIncoming(nextIndex);
    if (token !== slideToken) return;

    // Las flechas viajan hacia los bordes de la nueva foto durante el deslizamiento
    positionNavigation(viewerNext, duration);

    if (!fromDrag) {
        resetZoom();
        viewer.style.transition = "none";
        viewerNext.style.transition = "none";
        viewer.style.opacity = "1";
        viewerNext.style.opacity = "1";
        setViewerTransform(viewer, 1, 0, 0);
        setViewerTransform(viewerNext, 1, sign * W, 0);
        void viewerNext.offsetWidth; // fuerza reflow antes de animar
    }

    const t = `transform ${duration}ms ${SLIDE_EASE}`;
    viewer.style.transition = t;
    viewerNext.style.transition = t;
    setViewerTransform(viewer, 1, -sign * W, 0);
    setViewerTransform(viewerNext, 1, 0, 0);

    await new Promise(resolve => setTimeout(resolve, duration + 30));
    if (token !== slideToken) return;

    current = nextIndex;
    viewer.src = viewerNext.src;
    viewer.alt = viewerNext.alt;
    try { await viewer.decode(); } catch (e) {}
    if (token !== slideToken) return;

    // Mismo frame: la imagen nueva queda en el visor y se oculta la entrante
    viewer.style.transition = "none";
    viewer.style.opacity = "1";
    setViewerTransform(viewer, 1, 0, 0);
    hideIncoming();

    dragSign = 0;
    resetZoom();
    updateDots();
    positionNavigation();
    preloadNeighbors();
    isAnimating = false;
}

// Si el arrastre no llega al umbral, la foto vuelve a su sitio
function snapBack(sign) {
    const duration = 260;
    const token = slideToken;
    isAnimating = true;

    const t = `transform ${duration}ms ${SLIDE_EASE}`;
    viewer.style.transition = t;
    viewerNext.style.transition = t;
    setViewerTransform(viewer, 1, 0, 0);
    setViewerTransform(viewerNext, 1, sign * window.innerWidth, 0);

    setTimeout(() => {
        if (token !== slideToken) return;
        viewer.style.transition = "none";
        hideIncoming();
        dragSign = 0;
        isAnimating = false;
    }, duration + 20);
}

// Cancelación inmediata (p. ej. cuando entra un segundo dedo para hacer pinch)
function cancelDrag() {
    dragging = false;
    dragLocked = null;
    if (dragSign !== 0) {
        viewer.style.transition = "none";
        setViewerTransform(viewer, 1, 0, 0);
        hideIncoming();
        dragSign = 0;
    }
}

function nextImage(duration = 420) {
    slideTo("next", duration);
}

function previousImage(duration = 420) {
    slideTo("previous", duration);
}

function resetSlider() {
    slideToken++;
    dragging = false;
    dragLocked = null;
    dragSign = 0;

    viewer.style.transition = "none";
    setViewerTransform(viewer, 1, 0, 0);
    viewer.style.opacity = "1";
    hideIncoming();
    isAnimating = false;
}

function updateDots() {
    // Un punto activo que avanza con cada foto (cicla entre los puntos disponibles)
    const activeIndex = current % dots.length;

    dots.forEach((dot, index) => {
        dot.classList.toggle("active", index === activeIndex);
    });
}

// Coloca las flechas junto a los bordes de `target`.
// Con `duration` > 0 se desplazan suavemente (misma duración y curva que el deslizamiento).
function positionNavigation(target = viewer, duration = 0) {
    if (window.innerWidth <= 700 || !box.classList.contains("open")) {
        return;
    }

    if (!target.complete || !target.naturalWidth) {
        return;
    }

    // offsetWidth/Height ignoran el transform, así que sirven aunque la imagen
    // todavía esté fuera de pantalla; la imagen está centrada en el stage.
    const stageRect = stage.getBoundingClientRect();
    const imgWidth = target.offsetWidth;
    const imgHeight = target.offsetHeight;
    const imgLeft = stageRect.left + stageRect.width / 2 - imgWidth / 2;
    const imgRight = imgLeft + imgWidth;
    const imgCenterY = stageRect.top + stageRect.height / 2;

    const buttonWidth = prevButton.offsetWidth;
    const buttonHeight = prevButton.offsetHeight;
    const gap = 18;
    const minimumMargin = 10;

    const centerY = imgCenterY - buttonHeight / 2;
    let leftX = imgLeft - buttonWidth - gap;
    let rightX = imgRight + gap;

    if (leftX < minimumMargin) leftX = minimumMargin;
    if (rightX + buttonWidth > window.innerWidth - minimumMargin) {
        rightX = window.innerWidth - buttonWidth - minimumMargin;
    }

    const base = "transform .25s ease, background .25s ease";
    const transition = duration > 0
        ? `left ${duration}ms ${SLIDE_EASE}, top ${duration}ms ${SLIDE_EASE}, ${base}`
        : base;

    [prevButton, nextButton].forEach(button => {
        button.style.transition = transition;
    });

    prevButton.style.left = `${leftX}px`;
    prevButton.style.top = `${centerY}px`;
    nextButton.style.left = `${rightX}px`;
    nextButton.style.top = `${centerY}px`;
}

function setViewerTransform(element, scale, x, y) {
    element.style.transform = `translate3d(calc(-50% + ${x}px), calc(-50% + ${y}px), 0) scale(${scale})`;
}

function getMaxZoom() {
    return window.innerWidth <= 700 ? mobileMaxZoom : desktopMaxZoom;
}

function resetZoom() {
    zoom = 1;
    zoomX = 0;
    zoomY = 0;
    isPanning = false;
    isPinching = false;

    if (viewer) viewer.style.cursor = "default";
    setViewerTransform(viewer, 1, 0, 0);
    setViewerTransform(viewerNext, 1, 0, 0);
    box.classList.remove("zooming");
}

function applyZoom() {
    setViewerTransform(viewer, zoom, zoomX, zoomY);
    box.classList.toggle("zooming", zoom > 1);
}

// ZOOM CON RUEDA DEL RATÓN
window.addEventListener("wheel", event => {
    if (!box.classList.contains("open")) return;

    event.preventDefault();

    const oldZoom = zoom;
    const factor = event.deltaY < 0 ? 1.18 : .85;

    zoom = Math.max(1, Math.min(getMaxZoom(), zoom * factor));

    if (zoom === 1) {
        resetZoom();
        return;
    }

    const rect = viewer.getBoundingClientRect();
    const cursorX = event.clientX - (rect.left + rect.width / 2);
    const cursorY = event.clientY - (rect.top + rect.height / 2);
    const ratio = zoom / oldZoom;

    zoomX = zoomX - cursorX * (ratio - 1);
    zoomY = zoomY - cursorY * (ratio - 1);

    limitPan();
    applyZoom();
}, { passive: false });

function limitPan() {
    if (zoom <= 1) {
        zoomX = 0;
        zoomY = 0;
        return;
    }

    // offsetWidth/Height ignoran el transform; getBoundingClientRect ya incluye el zoom
    const maxX = Math.max(0, (viewer.offsetWidth * zoom - window.innerWidth) / 2);
    const maxY = Math.max(0, (viewer.offsetHeight * zoom - window.innerHeight) / 2);

    zoomX = Math.max(-maxX, Math.min(maxX, zoomX));
    zoomY = Math.max(-maxY, Math.min(maxY, zoomY));
}

document.addEventListener("keydown", event => {
    if (!box.classList.contains("open")) return;

    if (event.key === "Escape") {
        closeViewer();
        return;
    }
    if (event.key === "ArrowRight") {
        nextImage(420);
        return;
    }
    if (event.key === "ArrowLeft") {
        previousImage(420);
    }
});

/* =========================================================
   GESTIÓN TÁCTIL (SWIPE Y PINCH ZOOM EN MÓVIL)
========================================================= */

function initTouchGestures() {
    box.addEventListener("touchstart", event => {
        if (!box.classList.contains("open") || isAnimating) return;

        if (event.touches.length === 2) {
            cancelDrag();
            isPinching = true;
            isPanning = false;
            const a = event.touches[0];
            const b = event.touches[1];

            pinchStartDistance = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
            pinchStartZoom = zoom;
        } else if (event.touches.length === 1) {
            const touch = event.touches[0];
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            lastTouchX = touch.clientX;
            lastTouchY = touch.clientY;
            touchStartTime = performance.now();

            isPinching = false;
            isPanning = zoom > 1;

            dragging = zoom === 1;
            dragLocked = null;
            dragSign = 0;
            viewer.style.transition = "none";
        }
    }, { passive: true });

    box.addEventListener("touchmove", event => {
        if (!box.classList.contains("open") || isAnimating) return;

        if (event.touches.length === 2) {
            event.preventDefault();
            isPinching = true;
            isPanning = false;

            const a = event.touches[0];
            const b = event.touches[1];
            const distance = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);

            if (pinchStartDistance <= 0) return;

            const ratio = distance / pinchStartDistance;
            zoom = Math.max(1, Math.min(getMaxZoom(), pinchStartZoom * ratio));

            if (zoom === 1) {
                zoomX = 0;
                zoomY = 0;
            }

            limitPan();
            applyZoom();
        } else if (event.touches.length === 1 && zoom > 1 && isPanning) {
            event.preventDefault();
            const touch = event.touches[0];

            zoomX += touch.clientX - lastTouchX;
            zoomY += touch.clientY - lastTouchY;

            lastTouchX = touch.clientX;
            lastTouchY = touch.clientY;

            limitPan();
            applyZoom();
        } else if (event.touches.length === 1 && dragging) {
            const touch = event.touches[0];
            const dx = touch.clientX - touchStartX;
            const dy = touch.clientY - touchStartY;

            // Bloquear el eje del gesto: solo reaccionamos al arrastre horizontal
            if (!dragLocked) {
                if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
                dragLocked = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
            }
            if (dragLocked !== "x") return;

            event.preventDefault();
            const W = window.innerWidth;
            const sign = dx < 0 ? 1 : -1;

            // Cambió el sentido: cargar la vecina correspondiente
            if (sign !== dragSign) {
                dragSign = sign;
                const idx = (current + sign + images.length) % images.length;
                const img = images[idx];
                viewerNext.src = img.currentSrc || img.src;
                viewerNext.alt = img.alt || "";
                viewerNext.style.transition = "none";
                viewerNext.style.opacity = "1";
            }

            // La foto actual y la vecina siguen al dedo
            setViewerTransform(viewer, 1, dx, 0);
            setViewerTransform(viewerNext, 1, dx + sign * W, 0);
        }
    }, { passive: false });

    box.addEventListener("touchend", event => {
        if (!box.classList.contains("open") || isAnimating) return;

        if (isPinching) {
            isPinching = false;
            if (zoom <= 1) resetZoom();
            return;
        }

        if (isPanning) {
            isPanning = false;
            return;
        }

        if (!(dragging && dragLocked === "x" && dragSign !== 0)) {
            dragging = false;
            return;
        }

        const touch = event.changedTouches[0];
        const dx = touch.clientX - touchStartX;
        const elapsed = Math.max(performance.now() - touchStartTime, 1);
        const velocity = Math.abs(dx) / elapsed; // px/ms
        const W = window.innerWidth;
        const sign = dragSign;

        dragging = false;
        dragLocked = null;

        // Confirmar si pasó ~20% del ancho o fue un "flick" rápido
        const commit = Math.abs(dx) > W * 0.2 || (Math.abs(dx) > 30 && velocity > 0.5);
        const sameDirection = Math.sign(dx) === -sign;

        if (commit && sameDirection) {
            const remaining = 1 - Math.min(Math.abs(dx) / W, 1);
            const duration = Math.round(160 + 260 * remaining);
            slideTo(sign === 1 ? "next" : "previous", duration, true);
        } else {
            snapBack(sign);
        }
    }, { passive: true });

    box.addEventListener("touchcancel", () => {
        const sign = dragSign;
        dragging = false;
        dragLocked = null;
        isPinching = false;
        isPanning = false;
        if (sign !== 0 && !isAnimating) snapBack(sign);
    }, { passive: true });
}

const progress = document.getElementById("progress");
const progressSpan = progress ? progress.querySelector("span") : null;

function updateProgress() {
    const max = document.documentElement.scrollHeight - innerHeight;
    const percentage = max ? (scrollY / max) * 100 : 0;

    if (progressSpan) {
        progressSpan.style.width = percentage + "%";
    }
}

addEventListener("scroll", updateProgress, { passive: true });
updateProgress();

addEventListener("resize", () => {
    if (box.classList.contains("open")) {
        requestAnimationFrame(() => positionNavigation());
    }
}, { passive: true });

function initChapterObserver() {
    const chapters = [...document.querySelectorAll(".chapter")];

    const chapterObserver = new IntersectionObserver(
        entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting && entry.intersectionRatio >= .20) {
                    entry.target.classList.add("butterfly-active");
                    chapterObserver.unobserve(entry.target);
                }
            });
        },
        { threshold: [.20] }
    );

    chapters.forEach(chapter => {
        chapterObserver.observe(chapter);
    });
}