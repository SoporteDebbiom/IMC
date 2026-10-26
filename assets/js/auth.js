const Auth = (() => {
  const CLAVE_SESION = 'debbiom.sesion';
  const CLAVE_INTENTOS = 'debbiom.intentos';
  let empresa = null;

  const _memoria = {};
  const _probar = a => { try { if (!a) return false; a.setItem('__t__', '1'); a.removeItem('__t__'); return true; } catch { return false; } };
  const _ss = (typeof sessionStorage !== 'undefined' && _probar(sessionStorage)) ? sessionStorage : null;
  const _ls = (typeof localStorage !== 'undefined' && _probar(localStorage)) ? localStorage : null;
  const almacenar = {
    setS(k, v) { try { (_ss || _ls || { setItem: (a, b) => _memoria[a] = b }).setItem(k, v); } catch { _memoria[k] = v; } },
    getS(k) { try { const s = (_ss || _ls); return s ? s.getItem(k) : (_memoria[k] ?? null); } catch { return _memoria[k] ?? null; } },
    delS(k) { try { (_ss || _ls || { removeItem: a => delete _memoria[a] }).removeItem(k); } catch {} delete _memoria[k]; },
    setL(k, v) { try { (_ls || { setItem: (a, b) => _memoria[a] = b }).setItem(k, v); } catch { _memoria[k] = v; } },
    getL(k) { try { return _ls ? _ls.getItem(k) : (_memoria[k] ?? null); } catch { return _memoria[k] ?? null; } },
    delL(k) { try { (_ls || { removeItem: a => delete _memoria[a] }).removeItem(k); } catch {} delete _memoria[k]; },
  };

  let _hayPlano = false;
  async function cargarConfig() {
    empresa = (typeof window !== 'undefined') ? window.DEBBIOM_EMPRESA : null;
    const creds = (typeof window !== 'undefined') ? window.DEBBIOM_USUARIOS : null;
    const nubeActiva = (typeof Nube !== 'undefined' && Nube.activa());
    if (!empresa) throw new Error('CONFIG_NO_DISPONIBLE');
    const listaArchivo = (creds && Array.isArray(creds.usuarios)) ? creds.usuarios : [];
    const sinArchivo = !(creds && Array.isArray(creds.usuarios));
    if (sinArchivo && !nubeActiva) throw new Error('CONFIG_NO_DISPONIBLE');

    _hayPlano = listaArchivo.some(u => u && typeof u.password === 'string' && u.password);
    Datos.usuarios.sincronizarDesdeArchivo(listaArchivo);
    return { empresa, usuarios: Datos.usuarios.todos(), hayPlano: _hayPlano, compilacion: (creds && creds.compilacion) || 0, sinArchivo };
  }
  function hayPasswordsPlano() { return _hayPlano; }

  function getEmpresa() { return empresa; }

  // ---- Rol: NUNCA se guarda en el navegador; se deriva de una fuente firmada ----
  function _b64urlJSON(seg) {
    let s = String(seg).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = (typeof atob !== 'undefined') ? atob(s) : Buffer.from(s, 'base64').toString('binary');
    let pct = '';
    for (let i = 0; i < bin.length; i++) pct += '%' + ('00' + bin.charCodeAt(i).toString(16)).slice(-2);
    return JSON.parse(decodeURIComponent(pct));
  }
  // Lee el rol del JWT de Supabase (firmado por el servidor → no falsificable
  // editando el almacenamiento local). Sólo acepta valores conocidos.
  function _rolDeToken(token) {
    try {
      const seg = String(token || '').split('.')[1];
      if (!seg) return null;
      const o = _b64urlJSON(seg) || {};
      const am = o.app_metadata || {};
      const um = o.user_metadata || {};
      const n = am.nivel || um.nivel;
      return (n === 'Administrador' || n === 'Empleado') ? n : null;
    } catch (e) { return null; }
  }
  // Rol efectivo de una sesión, derivado al momento (token en la nube; lista de
  // usuarios en modo archivo). No depende de ningún campo guardado.
  function _rolActual(s) {
    if (!s) return 'Empleado';
    if (s.nube) {
      const r = _rolDeToken(s.token);
      if (r) return r;
      if (String(s.usuario || '').trim().toLowerCase() === 'sguerrero') return 'Administrador';
      return 'Empleado';
    }
    if (typeof Datos !== 'undefined' && s.usuario) {
      const u = Datos.usuarios.todos().find(x => x && x.usuario && x.usuario.toLowerCase() === String(s.usuario).toLowerCase());
      if (u && (u.nivel === 'Administrador' || u.nivel === 'Empleado')) return u.nivel;
    }
    return 'Empleado';
  }
  // Persiste SÓLO campos no sensibles. El rol nunca se escribe en el navegador.
  function _persistir(s) {
    const limpio = { usuario: s.usuario, inicio: s.inicio, ultima: s.ultima };
    if (s.nube) { limpio.nube = true; if (s.token) limpio.token = s.token; }
    almacenar.setS(CLAVE_SESION, JSON.stringify(limpio));
  }

  function _estadoIntentos() {
    try { return JSON.parse(almacenar.getL(CLAVE_INTENTOS)) || { n: 0, hasta: 0 }; }
    catch { return { n: 0, hasta: 0 }; }
  }
  function bloqueoRestante() {
    const ms = _estadoIntentos().hasta - Date.now();
    return ms > 0 ? Math.ceil(ms / 1000) : 0;
  }
  function _registrarFallo() {
    const max = empresa?.max_intentos_login ?? 5;
    const s = _estadoIntentos();
    s.n = (s.n || 0) + 1;
    if (s.n >= max) { s.hasta = Date.now() + (empresa?.bloqueo_min ?? 5) * 60000; s.n = 0; }
    almacenar.setL(CLAVE_INTENTOS, JSON.stringify(s));
  }
  function _limpiarIntentos() { almacenar.delL(CLAVE_INTENTOS); }
  function intentosRestantes() {
    return Math.max(0, (empresa?.max_intentos_login ?? 5) - (_estadoIntentos().n || 0));
  }

  async function ingresar(usuarioIn, contrasenaIn) {
    if (bloqueoRestante() > 0) return { ok: false, motivo: 'bloqueado', segundos: bloqueoRestante() };

    const usuario = Seguridad.limpiar(usuarioIn);
    const contrasena = String(contrasenaIn ?? '');
    if (!usuario || !contrasena) return { ok: false, motivo: 'vacio' };

    if (typeof Nube !== 'undefined' && Nube.activa()) {
      const rn = await Nube.entrar(usuario, contrasena);
      if (rn.ok) {
        _limpiarIntentos();
        const sesion = { usuario: rn.usuario, inicio: Date.now(), ultima: Date.now(), nube: true, token: rn.token };
        _persistir(sesion);
        Nube.registrarBitacora('Ingreso', rn.usuario, rn.nivel);
        return { ok: true, sesion: Object.assign({}, sesion, { nivel: rn.nivel }) };
      }
    }

    const registro = Datos.usuarios.todos().find(u => u.usuario.toLowerCase() === usuario.toLowerCase());

    let credencialOk = false;
    if (registro && typeof registro.password === 'string' && registro.password) {
      credencialOk = Seguridad.comparaSegura(contrasena, registro.password);
    } else {
      const sal = registro?.sal || 'sal-ficticia';
      const hashCalc = await Seguridad.hashPassword(sal, contrasena, registro?.iter);
      credencialOk = !!registro && Seguridad.comparaSegura(hashCalc, registro.hash || '');
    }

    if (!credencialOk || registro?.activo === false) {
      _registrarFallo();
      Datos.bitacora.registrar('Ingreso fallido', usuario, registro?.nivel || '—',
        registro ? (registro.activo === false ? 'usuario inactivo' : 'credencial incorrecta') : 'usuario inexistente');
      if (bloqueoRestante() > 0) return { ok: false, motivo: 'bloqueado', segundos: bloqueoRestante() };
      return { ok: false, motivo: 'credencial', intentos: intentosRestantes() };
    }

    _limpiarIntentos();
    const sesion = { usuario: registro.usuario, inicio: Date.now(), ultima: Date.now() };
    _persistir(sesion);
    Datos.bitacora.registrar('Ingreso', registro.usuario, registro.nivel);
    return { ok: true, sesion: Object.assign({}, sesion, { nivel: registro.nivel }) };
  }

  function sesion() {
    try {
      const s = JSON.parse(almacenar.getS(CLAVE_SESION));
      if (!s) return null;
      if (s.nube && s.token && typeof Nube !== 'undefined' && !Nube.autenticado()) Nube.fijarToken(s.token, s.usuario, _rolActual(s));
      s.nivel = _rolActual(s); // rol derivado en memoria; no se guarda
      return s;
    }
    catch { return null; }
  }
  const _timeoutMs = () => (empresa?.sesion_timeout_min ?? 15) * 60000;
  function vigente() {
    const s = sesion();
    return !!s && (Date.now() - s.ultima <= _timeoutMs());
  }
  function renovar() {
    const s = sesion();
    if (s) { s.ultima = Date.now(); _persistir(s); }
  }
  function salir(motivo = 'Salida') {
    const s = sesion();
    if (s) {
      if (s.nube && typeof Nube !== 'undefined') { Nube.registrarBitacora(motivo, s.usuario, s.nivel); Nube.presenciaSalir(s.usuario); }
      else Datos.bitacora.registrar(motivo, s.usuario, s.nivel);
    }
    if (typeof Nube !== 'undefined') Nube.cerrar();
    almacenar.delS(CLAVE_SESION);
  }
  const esAdmin = () => sesion()?.nivel === 'Administrador';

  function proteger() {
    if (!vigente()) {
      salir('Sesión expirada');
      location.replace('index.html?expiro=1');
      return false;
    }
    return true;
  }

  return {
    cargarConfig, getEmpresa, ingresar, sesion, vigente, renovar, salir,
    esAdmin, proteger, bloqueoRestante, intentosRestantes, hayPasswordsPlano
  };
})();
