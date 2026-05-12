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

export function exportSnapshot(svgNode, resolution = 1, seedStr = '') {
  if (!svgNode) return;
  
  const viewBox = svgNode.getAttribute('viewBox').split(' ');
  const width = parseInt(viewBox[2]);
  const height = parseInt(viewBox[3]);
  
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
