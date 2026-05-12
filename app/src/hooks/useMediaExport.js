import { useEffect, useRef } from 'react';

// Serializes SVG to a data URI safely
function getSvgDataUri(svgNode) {
  const serializer = new XMLSerializer();
  let source = serializer.serializeToString(svgNode);
  if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
    source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  source = '<?xml version="1.0" standalone="no"?>\r\n' + source;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source);
}

/**
 * Export the live <svg> element as a standalone .svg file.
 *
 * The on-screen SVG is already self-contained — item asset strings have
 * their CSS variables substituted to hex at render time, and viewBox/transform
 * data lives directly on the elements. We just need to clone, ensure the
 * xmlns attributes are set so the file opens in any SVG viewer (Illustrator,
 * Inkscape, browsers), and serialize.
 *
 * Note: GSAP applies its transforms via inline `transform` style strings on
 * the rendered <g> elements; XMLSerializer preserves those, so positions
 * survive the export. For elements whose positions were animated by GSAP
 * (live composition items), we read computed transforms and bake them into
 * SVG `transform=` attributes — otherwise an SVG viewer outside the app
 * would render everything at the origin.
 */
export function exportSvgFile(svgNode, seedStr = '') {
  if (!svgNode) return;
  const clone = svgNode.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  const viewBoxAttr = clone.getAttribute('viewBox');
  if (viewBoxAttr) {
    const parts = viewBoxAttr.split(/\s+/);
    if (parts.length === 4) {
      clone.setAttribute('width', parts[2]);
      clone.setAttribute('height', parts[3]);
    }
  }

  // Bake GSAP transforms (which live in inline `style`) into SVG `transform=`
  // attributes so the file renders correctly outside this app. We walk the
  // LIVE tree to read computed styles, and apply the bake to the matching
  // node in the clone by traversing both trees in lockstep.
  const liveDescendants = svgNode.querySelectorAll('g, circle, rect, path, polygon');
  const cloneDescendants = clone.querySelectorAll('g, circle, rect, path, polygon');
  for (let i = 0; i < liveDescendants.length && i < cloneDescendants.length; i++) {
    const liveEl = liveDescendants[i];
    const cloneEl = cloneDescendants[i];
    const styleTransform = liveEl.style && liveEl.style.transform;
    if (styleTransform && styleTransform !== 'none') {
      // SVG `transform=` accepts CSS transform syntax in modern browsers,
      // but for max-compat we strip "px" suffixes that some viewers reject.
      const svgTransform = styleTransform.replace(/(-?\d+\.?\d*)px/g, '$1');
      cloneEl.setAttribute('transform', svgTransform);
      cloneEl.style.transform = '';
    }
    // Carry opacity from inline style to attribute for the same reason.
    if (liveEl.style && liveEl.style.opacity !== '') {
      cloneEl.setAttribute('opacity', liveEl.style.opacity);
    }
  }

  const serializer = new XMLSerializer();
  let source = serializer.serializeToString(clone);
  if (!source.match(/^<\?xml/)) {
    source = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + source;
  }
  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kinetic-curator-${seedStr || Date.now().toString(36)}.svg`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function exportSnapshot(svgNode, resolution = 1, seedStr = '') {
  if (!svgNode) return;

  const viewBoxAttr = svgNode.getAttribute('viewBox');
  if (!viewBoxAttr) return;
  const viewBox = viewBoxAttr.split(' ');
  const width = parseInt(viewBox[2]);
  const height = parseInt(viewBox[3]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return;
  
  const canvas = document.createElement('canvas');
  canvas.width = width * resolution;
  canvas.height = height * resolution;
  const ctx = canvas.getContext('2d');
  
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `kinetic-curator-${seedStr}-${resolution}x.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    }, 'image/png');
  };
  img.src = getSvgDataUri(svgNode);
}

export function useVideoRecorder({ svgRef, isRecording, seedStr = '', fps = 30 }) {
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    const svgNode = svgRef.current;
    if (!svgNode) return;

    const viewBox = svgNode.getAttribute('viewBox').split(' ');
    const width = parseInt(viewBox[2]);
    const height = parseInt(viewBox[3]);
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    const stream = canvas.captureStream(fps);
    let options = { mimeType: 'video/webm;codecs=vp9' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options = { mimeType: 'video/webm' };
    }
    
    const mediaRecorder = new MediaRecorder(stream, options);
    mediaRecorderRef.current = mediaRecorder;
    chunksRef.current = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `kinetic-curator-${seedStr}.webm`;
      a.click();
      URL.revokeObjectURL(a.href);
      mediaRecorderRef.current = null;
    };

    mediaRecorder.start();

    let lastTime = 0;
    const frameInterval = 1000 / fps;

    const drawFrame = (time) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') return;
      rafRef.current = requestAnimationFrame(drawFrame);

      if (time - lastTime < frameInterval) return;
      lastTime = time;

      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
      };
      img.src = getSvgDataUri(svgRef.current);
    };

    rafRef.current = requestAnimationFrame(drawFrame);

    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isRecording, svgRef, seedStr, fps]);
}
