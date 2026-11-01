// Asks for a GL context off the main thread: drawing in software, just getting one can take
// seconds. Replies true (a GPU), false (software only) or null (can't tell from here).
function test(force) {
  if (typeof OffscreenCanvas === 'undefined') return null;
  const gl = new OffscreenCanvas(1, 1).getContext('webgl2', { failIfMajorPerformanceCaveat: !force });
  // no context: a caveat if a plain one works, otherwise no WebGL here at all
  if (!gl) return new OffscreenCanvas(1, 1).getContext('webgl2') ? false : null;
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : '';
  return force || !/swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
}

self.onmessage = (e) => self.postMessage(test(e.data));
