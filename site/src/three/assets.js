import * as THREE from 'three';

// A scene's images, fetched only when asked for. texture() hands back the texture straight
// away, so a scene can build everything around it before a single byte has come in. An
// unloaded texture draws as opaque black: keep the scene hidden until load() has finished.

// the same browsers three's GLTFLoader keeps off ImageBitmap (bugs in their options)
const ua = navigator.userAgent;
const safari = /Safari\//.test(ua) && !/Chrome\//.test(ua) ? Number(ua.match(/Version\/(\d+)/)?.[1] ?? 0) : Infinity;
const firefox = Number(ua.match(/Firefox\/(\d+)/)?.[1] ?? Infinity);
const bitmaps = typeof createImageBitmap !== 'undefined' && safari >= 17 && firefox >= 98;

// Decodes off the main thread where it can. A bitmap is flipped here, as the renderer
// can't flip one on upload; it comes out the same as an image flipped on the way up.
async function fetchInto(texture, url) {
  if (bitmaps) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    texture.image = await createImageBitmap(await res.blob(), {
      imageOrientation: 'flipY',
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none',
    });
    texture.flipY = false;
  } else texture.image = await new THREE.ImageLoader().loadAsync(url);
  texture.needsUpdate = true;
}

export function createAssets() {
  const textures = [];
  const jobs = [];
  return {
    textures,
    texture(url) {
      const t = new THREE.Texture();
      textures.push(t);
      jobs.push(() => fetchInto(t, url));
      return t;
    },
    // anything else the scene has to wait for
    add: (job) => jobs.push(job),
    load: () => Promise.all(jobs.map((job) => job())),
  };
}
