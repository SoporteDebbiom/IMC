const Datos = (() => {
  const PREFIJO = 'debbiom.v1.';

  const _mem = {};
  let _lsOK = null;
  function _localStorageOK() {
    if (_lsOK !== null) return _lsOK;
    try {
      if (typeof localStorage === 'undefined') return (_lsOK = false);
      localStorage.setItem('__t__', '1'); localStorage.removeItem('__t__');
      _lsOK = true;
    } catch { _lsOK = false; }
    return _lsOK;
  }
  const _clon = v => { try { return JSON.parse(JSON.stringify(v)); } catch { return v; } };

  function _leer(clave, def) {
    const k = PREFIJO + clave;
    if (_localStorageOK()) {
      try { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : def; }
      catch { return def; }
    }
    return (k in _mem) ? _clon(_mem[k]) : def;
  }
  function _guardar(clave, valor) {
    const k = PREFIJO + clave;
    _mem[k] = _clon(valor);
    if (_localStorageOK()) {
      try { localStorage.setItem(k, JSON.stringify(valor)); return true; }
      catch { return false; }
    }
    return true;
  }

  const id = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const ahoraISO = () => new Date().toISOString();

  function _nubeOK() { return typeof Nube !== 'undefined' && Nube.autenticado(); }
  function _marcarSync(id) {
    const l = _leer('registros_imc', []);
    const i = l.findIndex(x => x.id === id);
    if (i >= 0 && l[i]._sync !== true) { l[i]._sync = true; _guardar('registros_imc', l); }
  }
  function _marcarSyncMol(id) {
    const l = _leer('registros_mol', []);
    const i = l.findIndex(x => x.id === id);
    if (i >= 0 && l[i]._sync !== true) { l[i]._sync = true; _guardar('registros_mol', l); }
  }

  const imc = {
    todos: () => _leer('registros_imc', []),
    agregar(r) { const l = imc.todos(); l.unshift(r); _guardar('registros_imc', l); if (_nubeOK()) Nube.estudioGuardar(r).then(() => _marcarSync(r.id)).catch(() => {}); return r; },
    actualizar(r) { _guardar('registros_imc', imc.todos().map(x => x.id === r.id ? Object.assign({}, r, { _sync: false }) : x)); if (_nubeOK()) Nube.estudioGuardar(r).then(() => _marcarSync(r.id)).catch(() => {}); return r; },
    eliminar(rid) { _guardar('registros_imc', imc.todos().filter(x => x.id !== rid)); if (_nubeOK()) Nube.estudioBorrar(rid).catch(() => {}); },
    guardarTodos(lista) { _guardar('registros_imc', lista); },
  };

  const mol = {
    todos: () => _leer('registros_mol', []),
    agregar(r) { const l = mol.todos(); l.unshift(r); _guardar('registros_mol', l); if (_nubeOK()) Nube.molGuardar(r).then(() => _marcarSyncMol(r.id)).catch(() => {}); return r; },
    actualizar(r) { _guardar('registros_mol', mol.todos().map(x => x.id === r.id ? Object.assign({}, r, { _sync: false }) : x)); if (_nubeOK()) Nube.molGuardar(r).then(() => _marcarSyncMol(r.id)).catch(() => {}); return r; },
    eliminar(rid) { _guardar('registros_mol', mol.todos().filter(x => x.id !== rid)); if (_nubeOK()) Nube.molBorrar(rid).catch(() => {}); },
    guardarTodos(lista) { _guardar('registros_mol', lista); },
  };

  const bitacora = {
    todos: () => _leer('bitacora', []),
    registrar(evento, usuario, nivel, detalle = '') {
      const l = bitacora.todos();
      l.unshift({ fecha: ahoraISO(), evento, usuario: usuario || '—', nivel: nivel || '—', detalle });
      _guardar('bitacora', l.slice(0, 2000));
      if (_nubeOK()) Nube.registrarBitacora(evento, usuario, nivel, detalle);
    },
    reemplazar(lista) { _guardar('bitacora', Array.isArray(lista) ? lista.slice(0, 2000) : []); },
  };

  const usuarios = {
    obtener() { return _leer('usuarios', null); },
    sembrar(lista) { if (!usuarios.obtener()) _guardar('usuarios', lista); },
    sincronizarDesdeArchivo(listaArchivo) {
      const locales = usuarios.obtener() || [];
      const enArchivo = new Set(listaArchivo.map(u => u.usuario.toLowerCase()));
      const pendientes = locales.filter(u => u._local && !enArchivo.has(u.usuario.toLowerCase()));
      const lista = [...listaArchivo.map(u => ({ ...u })), ...pendientes];
      const ovr = _leer('pw_overrides', {});
      let cambio = false;
      for (const u of lista) {
        const o = ovr[u.usuario.toLowerCase()];
        if (!o) continue;
        if (typeof u.password === 'string' && u.password) {
          delete ovr[u.usuario.toLowerCase()]; cambio = true;
          continue;
        }
        if (u.hash === o.hash) { delete ovr[u.usuario.toLowerCase()]; cambio = true; }
        else { u.sal = o.sal; u.hash = o.hash; if (o.iter) u.iter = o.iter; }
      }
      if (cambio) _guardar('pw_overrides', ovr);
      _guardar('usuarios', lista);
    },
    guardarOverridePassword(usuario, sal, hash, iter) {
      const o = _leer('pw_overrides', {});
      o[usuario.toLowerCase()] = { sal, hash, iter };
      _guardar('pw_overrides', o);
    },
    todos() { return usuarios.obtener() || []; },
    guardar(lista) { _guardar('usuarios', lista); },
  };

  function _celdaCSV(v) {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return /[",\n;]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
  }
  function exportarCSV(nombre, columnas, filas) {
    const enc = columnas.map(c => c.titulo);
    const cuerpo = filas.map(f => columnas.map(c => _celdaCSV(c.valor(f))));
    const csv = '\uFEFF' + [enc, ...cuerpo].map(r => r.map(_celdaCSV).join(',')).join('\r\n');
    _descargar(nombre, csv, 'text/csv;charset=utf-8');
  }
  function exportarJSON(nombre, obj) {
    _descargar(nombre, JSON.stringify(obj, null, 2), 'application/json');
  }
  function exportarTexto(nombre, contenido, tipo = 'text/plain;charset=utf-8') {
    _descargar(nombre, contenido, tipo);
  }
  function _descargar(nombre, contenido, tipo) {
    const seguro = (typeof Seguridad !== 'undefined' && Seguridad.nombreArchivoSeguro) ? Seguridad.nombreArchivoSeguro(nombre, 'descarga') : nombre;
    const blob = new Blob([contenido], { type: tipo });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = seguro;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return { id, ahoraISO, imc, mol, bitacora, usuarios, exportarCSV, exportarJSON, exportarTexto };
})();
