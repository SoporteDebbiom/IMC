const Seguridad = (() => {
  const PBKDF2_ITER = 120000;

  const K = new Uint32Array([
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);

  function sha256(msg) {
    const len = msg.length, bitLen = len * 8;
    const total = (((len + 8) >> 6) + 1) << 6;
    const buf = new Uint8Array(total);
    buf.set(msg); buf[len] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(total - 4, bitLen >>> 0, false);
    dv.setUint32(total - 8, Math.floor(bitLen / 0x100000000), false);
    const H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
    const w = new Uint32Array(64);
    for (let off = 0; off < total; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
      for (let i = 16; i < 64; i++) {
        const a = w[i-15], b = w[i-2];
        const s0 = ((a>>>7)|(a<<25)) ^ ((a>>>18)|(a<<14)) ^ (a>>>3);
        const s1 = ((b>>>17)|(b<<15)) ^ ((b>>>19)|(b<<13)) ^ (b>>>10);
        w[i] = (w[i-16] + s0 + w[i-7] + s1) | 0;
      }
      let a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
      for (let i = 0; i < 64; i++) {
        const S1 = ((e>>>6)|(e<<26)) ^ ((e>>>11)|(e<<21)) ^ ((e>>>25)|(e<<7));
        const ch = (e&f) ^ ((~e)&g);
        const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
        const S0 = ((a>>>2)|(a<<30)) ^ ((a>>>13)|(a<<19)) ^ ((a>>>22)|(a<<10));
        const maj = (a&b) ^ (a&c) ^ (b&c);
        const t2 = (S0 + maj) | 0;
        h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
      }
      H[0]=(H[0]+a)|0; H[1]=(H[1]+b)|0; H[2]=(H[2]+c)|0; H[3]=(H[3]+d)|0;
      H[4]=(H[4]+e)|0; H[5]=(H[5]+f)|0; H[6]=(H[6]+g)|0; H[7]=(H[7]+h)|0;
    }
    const out = new Uint8Array(32), odv = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) odv.setUint32(i * 4, H[i] >>> 0, false);
    return out;
  }
  function _concat(a, b) { const c = new Uint8Array(a.length + b.length); c.set(a); c.set(b, a.length); return c; }
  function _hmac(key, msg) {
    if (key.length > 64) key = sha256(key);
    const k = new Uint8Array(64); k.set(key);
    const ip = new Uint8Array(64), op = new Uint8Array(64);
    for (let i = 0; i < 64; i++) { ip[i] = k[i] ^ 0x36; op[i] = k[i] ^ 0x5c; }
    return sha256(_concat(op, sha256(_concat(ip, msg))));
  }
  function _pbkdf2(pwd, salt, iter, dkLen) {
    const out = new Uint8Array(dkLen);
    const blocks = Math.ceil(dkLen / 32);
    let offset = 0;
    for (let b = 1; b <= blocks; b++) {
      const bi = new Uint8Array(4); new DataView(bi.buffer).setUint32(0, b, false);
      let u = _hmac(pwd, _concat(salt, bi));
      const t = u.slice();
      for (let i = 1; i < iter; i++) { u = _hmac(pwd, u); for (let j = 0; j < 32; j++) t[j] ^= u[j]; }
      const take = Math.min(32, dkLen - offset);
      out.set(t.subarray(0, take), offset); offset += take;
    }
    return out;
  }
  const _hex = u => [...u].map(x => x.toString(16).padStart(2, '0')).join('');

  async function hashPassword(sal, contrasena, iter = PBKDF2_ITER) {
    const pwd = new TextEncoder().encode(String(contrasena));
    const salt = new TextEncoder().encode(String(sal));
    try {
      if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.importKey) {
        const key = await crypto.subtle.importKey('raw', pwd, { name: 'PBKDF2' }, false, ['deriveBits']);
        const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, key, 256);
        return _hex(new Uint8Array(bits));
      }
    } catch (e) {}
    return _hex(_pbkdf2(pwd, salt, iter, 32));
  }

  function generarSal() {
    const b = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(b);
    else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    return _hex(b);
  }

  const ITERACIONES = PBKDF2_ITER;

  function comparaSegura(a, b) {
    a = String(a); b = String(b);
    if (a.length !== b.length) return false;
    let dif = 0;
    for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return dif === 0;
  }

  function escapar(txt) {
    if (txt === null || txt === undefined) return '';
    return String(txt)
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  }

  function limpiar(txt) { return String(txt ?? '').trim().replace(/\s+/g, ' '); }

  function requerido(txt, etiqueta = 'Este campo') {
    const v = limpiar(txt);
    return v ? { ok: true, valor: v } : { ok: false, msg: `${etiqueta} es obligatorio.` };
  }
  function textoSeguro(txt, { etiqueta = 'Campo', min = 1, max = 120 } = {}) {
    const v = limpiar(txt);
    if (v.length < min) return { ok: false, msg: `${etiqueta}: mínimo ${min} caracteres.` };
    if (v.length > max) return { ok: false, msg: `${etiqueta}: máximo ${max} caracteres.` };
    if (/[\u0000-\u001F\u007F]/.test(v)) return { ok: false, msg: `${etiqueta}: contiene caracteres no permitidos.` };
    return { ok: true, valor: v };
  }
  function numero(txt, { etiqueta = 'Valor', min = -Infinity, max = Infinity, decimales = null } = {}) {
    const v = limpiar(txt).replace(',', '.');
    if (v === '') return { ok: false, msg: `${etiqueta} es obligatorio.` };
    if (!/^-?\d+(\.\d+)?$/.test(v)) return { ok: false, msg: `${etiqueta} debe ser numérico.` };
    const n = Number(v);
    if (!Number.isFinite(n)) return { ok: false, msg: `${etiqueta} no es un número válido.` };
    if (n < min) return { ok: false, msg: `${etiqueta}: mínimo ${min}.` };
    if (n > max) return { ok: false, msg: `${etiqueta}: máximo ${max}.` };
    if (decimales !== null) {
      const dec = (v.split('.')[1] || '').length;
      if (dec > decimales) return { ok: false, msg: `${etiqueta}: máximo ${decimales} decimales.` };
    }
    return { ok: true, valor: n };
  }
  function enteroPositivo(txt, { etiqueta = 'Cantidad', min = 1, max = 1e9 } = {}) {
    const v = limpiar(txt);
    if (!/^\d+$/.test(v)) return { ok: false, msg: `${etiqueta} debe ser un entero.` };
    const n = parseInt(v, 10);
    if (n < min) return { ok: false, msg: `${etiqueta}: mínimo ${min}.` };
    if (n > max) return { ok: false, msg: `${etiqueta}: máximo ${max}.` };
    return { ok: true, valor: n };
  }
  function fecha(txt, { etiqueta = 'Fecha' } = {}) {
    const v = limpiar(txt);
    if (!v) return { ok: false, msg: `${etiqueta} es obligatoria.` };
    const d = new Date(v);
    if (isNaN(d.getTime())) return { ok: false, msg: `${etiqueta} no es válida.` };
    return { ok: true, valor: v };
  }
  function fortalezaPassword(pwd) {
    pwd = String(pwd || '');
    const reglas = [
      [pwd.length >= 10, 'al menos 10 caracteres'],
      [/[A-Z]/.test(pwd), 'una mayúscula'],
      [/[a-z]/.test(pwd), 'una minúscula'],
      [/\d/.test(pwd), 'un número'],
      [/[^A-Za-z0-9]/.test(pwd), 'un símbolo'],
    ];
    const faltan = reglas.filter(r => !r[0]).map(r => r[1]);
    return { ok: faltan.length === 0, faltan };
  }

  return {
    hashPassword, generarSal, comparaSegura, escapar, limpiar, ITERACIONES,
    requerido, textoSeguro, numero, enteroPositivo, fecha, fortalezaPassword
  };
})();
