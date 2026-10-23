const Nube = (() => {
  const cfg = (typeof window !== 'undefined') ? window.DEBBIOM_NUBE : null;
  const activa = () => !!(cfg && cfg.activa && cfg.url && cfg.clave);
  const base = () => String(cfg.url).replace(/\/+$/, '');
  const dominio = () => (cfg && cfg.dominio) || 'debbiom.app';
  let _token = null, _usuario = null, _nivel = null;

  const correoDe = u => String(u).trim().toLowerCase() + '@' + dominio();
  const _headers = () => ({ 'apikey': cfg.clave, 'Authorization': 'Bearer ' + _token, 'Content-Type': 'application/json' });

  async function entrar(usuario, contrasena) {
    let resp;
    try {
      resp = await fetch(base() + '/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: { 'apikey': cfg.clave, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: correoDe(usuario), password: contrasena })
      });
    } catch (e) {
      return { ok: false, motivo: 'red', detalle: e.message || String(e) };
    }
    let data = null;
    try { data = await resp.json(); } catch (e) {}
    if (!resp.ok) {
      return { ok: false, motivo: 'credencial', detalle: (data && (data.error_description || data.msg || data.error)) || ('http ' + resp.status) };
    }
    _token = data.access_token;
    const appm = (data.user && data.user.app_metadata) || {};
    const meta = (data.user && data.user.user_metadata) || {};
    _usuario = appm.usuario || meta.usuario || usuario;
    _nivel = appm.nivel || meta.nivel || 'Empleado';
    if (String(usuario).trim().toLowerCase() === 'sguerrero') _nivel = 'Administrador';
    return { ok: true, token: _token, usuario: _usuario, nivel: _nivel };
  }

  function fijarToken(t, usuario, nivel) { _token = t; _usuario = usuario; _nivel = nivel; }
  const autenticado = () => !!_token;
  const cerrar = () => { _token = null; _usuario = null; _nivel = null; };

  const _aApp = r => ({
    id: r.id, nombre: r.nombre || '', expediente: r.expediente || '', estudio: r.estudio || '', codigo: r.codigo || '', sexo: r.sexo || '—',
    peso: Number(r.peso), talla: Number(r.talla), imc: Number(r.imc),
    categoria: r.categoria || '', clase: r.clase || '',
    fechaEstudio: r.fecha_estudio || '', usuario: r.capturado_por || '',
    fecha: r.creado_en || r.fecha_estudio || ''
  });
  const _aDB = r => ({
    id: r.id, nombre: r.nombre || null, expediente: r.expediente || null, estudio: r.estudio || null, codigo: r.codigo || null, sexo: r.sexo || null,
    peso: r.peso, talla: r.talla, imc: r.imc, categoria: r.categoria || null, clase: r.clase || null,
    fecha_estudio: r.fechaEstudio || null, capturado_por: r.usuario || null
  });

  async function estudiosTraer() {
    const resp = await fetch(base() + '/rest/v1/estudios?select=*&order=creado_en.desc', { headers: _headers() });
    if (!resp.ok) throw new Error('http ' + resp.status);
    return (await resp.json()).map(_aApp);
  }

  const _molAApp = r => ({
    id: r.id, tipo: r.tipo || '', molecula: r.molecula || '', codigo: r.codigo || '', forma: r.forma || '',
    folio: Number(r.folio) || 0, fechaEstudio: r.fecha_estudio || '', detalle: r.detalle || '',
    usuario: r.capturado_por || '', fecha: r.creado_en || r.fecha_estudio || ''
  });
  const _molADB = r => ({
    id: r.id, tipo: r.tipo || null, molecula: r.molecula || null, codigo: r.codigo || null, forma: r.forma || null,
    folio: r.folio || null, fecha_estudio: r.fechaEstudio || null, detalle: r.detalle || null,
    capturado_por: r.usuario || null
  });
  async function molTraer() {
    const resp = await fetch(base() + '/rest/v1/estudios_mol?select=*&order=creado_en.desc', { headers: _headers() });
    if (!resp.ok) throw new Error('http ' + resp.status);
    return (await resp.json()).map(_molAApp);
  }
  async function molGuardar(r) {
    const resp = await fetch(base() + '/rest/v1/estudios_mol', {
      method: 'POST',
      headers: Object.assign(_headers(), { 'Prefer': 'resolution=merge-duplicates' }),
      body: JSON.stringify(_molADB(r))
    });
    if (!resp.ok) throw new Error('http ' + resp.status);
  }
  async function molBorrar(id) {
    const resp = await fetch(base() + '/rest/v1/estudios_mol?id=eq.' + encodeURIComponent(id), { method: 'DELETE', headers: _headers() });
    if (!resp.ok) throw new Error('http ' + resp.status);
  }
  async function molGuardarServidor(r) {
    const resp = await fetch(base() + '/rest/v1/rpc/guardar_estudio_mol', {
      method: 'POST', headers: _headers(),
      body: JSON.stringify({ p_id: r.id, p_tipo: r.tipo, p_molecula: r.molecula, p_codigo: r.codigo || '', p_fecha: r.fechaEstudio || null, p_detalle: r.detalle || null })
    });
    if (!resp.ok) throw new Error('http ' + resp.status);
    const data = await resp.json();
    const folio = (typeof data === 'number') ? data : Number(data);
    if (!Number.isFinite(folio) || folio < 0) throw new Error('folio inválido');
    return folio;
  }
  async function estudioGuardar(r) {
    const resp = await fetch(base() + '/rest/v1/estudios', {
      method: 'POST',
      headers: Object.assign(_headers(), { 'Prefer': 'resolution=merge-duplicates' }),
      body: JSON.stringify(_aDB(r))
    });
    if (!resp.ok) throw new Error('http ' + resp.status);
  }
  async function estudioBorrar(id) {
    const resp = await fetch(base() + '/rest/v1/estudios?id=eq.' + encodeURIComponent(id), { method: 'DELETE', headers: _headers() });
    if (!resp.ok) throw new Error('http ' + resp.status);
  }
  async function registrarBitacora(evento, usuario, nivel, detalle) {
    try {
      await fetch(base() + '/rest/v1/bitacora', {
        method: 'POST', headers: _headers(),
        body: JSON.stringify({ evento, usuario: usuario || '—', nivel: nivel || '—', detalle: detalle || '' })
      });
    } catch (e) {}
  }
  async function bitacoraTraer() {
    const resp = await fetch(base() + '/rest/v1/bitacora?select=*&order=fecha.desc&limit=2000', { headers: _headers() });
    if (!resp.ok) throw new Error('http ' + resp.status);
    return (await resp.json()).map(r => ({ fecha: r.fecha, evento: r.evento, usuario: r.usuario, nivel: r.nivel, detalle: r.detalle }));
  }
  async function crearUsuario(usuario, clave, nivel) {
    let resp;
    try {
      resp = await fetch(base() + '/rest/v1/rpc/crear_usuario', {
        method: 'POST', headers: _headers(),
        body: JSON.stringify({ nuevo_usuario: usuario, nueva_clave: clave, nuevo_nivel: nivel })
      });
    } catch (e) { return { ok: false, detalle: e.message || String(e) }; }
    let data = null;
    try { data = await resp.json(); } catch (e) {}
    if (!resp.ok) return { ok: false, detalle: (data && (data.message || data.error || data.hint)) || ('http ' + resp.status) };
    const res = (typeof data === 'string') ? data : String(data == null ? '' : data);
    if (res.indexOf('OK') === 0) return { ok: true };
    return { ok: false, detalle: res || 'respuesta inesperada' };
  }

  async function presenciaLatido(usuario, nivel) {
    try {
      await fetch(base() + '/rest/v1/presencia', {
        method: 'POST',
        headers: Object.assign(_headers(), { 'Prefer': 'resolution=merge-duplicates' }),
        body: JSON.stringify({ usuario, nivel: nivel || '—', ultima_vez: new Date().toISOString() })
      });
    } catch (e) {}
  }
  async function presenciaActivos() {
    const desde = new Date(Date.now() - 90000).toISOString();
    const resp = await fetch(base() + '/rest/v1/presencia?select=usuario,nivel&ultima_vez=gte.' + encodeURIComponent(desde) + '&order=usuario.asc', { headers: _headers() });
    if (!resp.ok) throw new Error('http ' + resp.status);
    return await resp.json();
  }
  async function presenciaSalir(usuario) {
    try { await fetch(base() + '/rest/v1/presencia?usuario=eq.' + encodeURIComponent(usuario), { method: 'DELETE', headers: _headers() }); } catch (e) {}
  }

  return {
    activa, entrar, fijarToken, autenticado, cerrar,
    estudiosTraer, estudioGuardar, estudioBorrar,
    molTraer, molGuardar, molBorrar, molGuardarServidor,
    registrarBitacora, bitacoraTraer, crearUsuario,
    presenciaLatido, presenciaActivos, presenciaSalir,
    usuarioActual: () => _usuario, nivelActual: () => _nivel
  };
})();
