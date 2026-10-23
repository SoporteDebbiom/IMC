(async function () {
  const BUILD = 27;
  const $ = s => document.querySelector(s);
  const aviso = $('#aviso');
  function mostrarAviso(tipo, texto) {
    aviso.className = 'aviso mostrar aviso-' + tipo;
    aviso.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v5M12 16h.01"/></svg><span>${Seguridad.escapar(texto)}</span>`;
  }
  function ocultarAviso() { aviso.className = 'aviso'; }
  function mostrarApp() {
    $('#setup').classList.add('oculto');
    $('#login').classList.add('oculto');
    document.getElementById('app').classList.remove('oculto');
    document.title = 'Debbiom · Sistema';
    if (window.arrancarApp) window.arrancarApp();
  }

  let configVieja = false, cfg = null;
  try {
    cfg = await Auth.cargarConfig();
    configVieja = !cfg.sinArchivo && (cfg.compilacion || 0) < BUILD;
  } catch (e) {
    $('#setup').classList.remove('oculto');
    return;
  }

  if (Auth.vigente()) { mostrarApp(); return; }

  $('#marcaNombre').textContent = cfg.empresa.nombre || 'Debbiom';
  document.title = (cfg.empresa.nombre || 'Debbiom') + ' · Acceso';
  $('#login').classList.remove('oculto');
  const verEl = document.getElementById('verConfig');
  if (verEl) verEl.textContent = cfg.sinArchivo ? 'acceso: solo nube' : ('archivo usuarios: compilación ' + (cfg.compilacion || 'antigua'));

  $('#verPwd').addEventListener('click', () => {
    const p = $('#password');
    p.type = p.type === 'password' ? 'text' : 'password';
  });

  let tmr = null, mostrandoBloqueo = false;
  function pintarBloqueo() {
    const seg = Auth.bloqueoRestante();
    if (seg > 0) {
      $('#btnEntrar').disabled = true;
      mostrarAviso('error', `Demasiados intentos. Espera ${seg} s para volver a intentar.`);
      mostrandoBloqueo = true;
      tmr = setTimeout(pintarBloqueo, 1000);
    } else {
      $('#btnEntrar').disabled = false;
      if (mostrandoBloqueo) { ocultarAviso(); mostrandoBloqueo = false; }
      if (tmr) { clearTimeout(tmr); tmr = null; }
    }
  }
  pintarBloqueo();

  if (Auth.bloqueoRestante() === 0) {
    const params = new URLSearchParams(location.search);
    if (params.get('salida')) mostrarAviso('ok', 'Cerraste sesión correctamente.');
    if (params.get('expiro')) mostrarAviso('alerta', 'Tu sesión expiró por inactividad. Vuelve a iniciar sesión.');
    if (configVieja) mostrarAviso('error', 'El archivo config/usuarios.js está DESACTUALIZADO. Bórralo y reemplázalo con el del ZIP nuevo (compilación ' + BUILD + '); mientras tanto, las contraseñas no coincidirán.');
  }

  $('#formLogin').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    ocultarAviso();
    const btn = $('#btnEntrar');
    btn.disabled = true; btn.querySelector('span').textContent = 'Verificando…';

    let r;
    try {
      r = await Auth.ingresar($('#usuario').value, $('#password').value);
    } catch (err) {
      btn.querySelector('span').textContent = 'Entrar';
      btn.disabled = false;
      const detalle = (err && err.message) ? err.message : String(err);
      mostrarAviso('error', 'No se pudo verificar (' + detalle + '). Recarga con Ctrl+F5.');
      return;
    }

    if (r.ok) {
      btn.querySelector('span').textContent = 'Bienvenido';
      mostrarApp();
      return;
    }

    btn.querySelector('span').textContent = 'Entrar';
    btn.disabled = false;
    $('#password').value = '';

    if (r.motivo === 'bloqueado') { pintarBloqueo(); }
    else if (r.motivo === 'vacio') { mostrarAviso('error', 'Escribe tu usuario y contraseña.'); }
    else {
      const rest = r.intentos;
      mostrarAviso('error', 'Usuario o contraseña incorrectos.' +
        (rest !== undefined ? ` Te quedan ${rest} intento(s).` : ''));
    }
  });
})();
