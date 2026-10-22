async function arrancarApp() {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  if (!Auth.vigente()) { location.reload(); return; }

  async function sincronizarNube() {
    if (!(typeof Nube !== 'undefined' && Nube.autenticado())) return false;
    let cloud;
    try { cloud = await Nube.estudiosTraer(); } catch (e) { return false; }
    cloud.forEach(r => { r._sync = true; });
    const idsCloud = new Set(cloud.map(r => r.id));
    const nuevosLocales = Datos.imc.todos().filter(r => r && r.id && !idsCloud.has(r.id) && r._sync !== true);
    const merged = [...nuevosLocales, ...cloud].sort((a, b) => String(b.fechaEstudio || b.fecha || '').localeCompare(String(a.fechaEstudio || a.fecha || '')));
    Datos.imc.guardarTodos(merged);
    nuevosLocales.forEach(r => { try { Nube.estudioGuardar(r).catch(() => {}); } catch (e) {} });
    return true;
  }
  async function sincronizarBitacora() {
    if (!(typeof Nube !== 'undefined' && Nube.autenticado())) return;
    if (!Auth.esAdmin()) return;
    try { Datos.bitacora.reemplazar(await Nube.bitacoraTraer()); } catch (e) {}
  }
  async function sincronizarNubeMol() {
    if (!(typeof Nube !== 'undefined' && Nube.autenticado())) return false;
    let cloud;
    try { cloud = await Nube.molTraer(); } catch (e) { return false; }
    cloud.forEach(r => { r._sync = true; });
    const idsCloud = new Set(cloud.map(r => r.id));
    const nuevosLocales = Datos.mol.todos().filter(r => r && r.id && !idsCloud.has(r.id) && r._sync !== true);
    const merged = [...nuevosLocales, ...cloud];
    Datos.mol.guardarTodos(merged);
    nuevosLocales.forEach(r => { try { Nube.molGuardar(r).catch(() => {}); } catch (e) {} });
    return true;
  }

  await sincronizarNube();
  await sincronizarNubeMol();
  await sincronizarBitacora();

  const empresa = Auth.getEmpresa();
  const ses = Auth.sesion();
  const esAdmin = Auth.esAdmin();

  if (typeof Nube !== 'undefined' && Nube.autenticado()) {
    const actualizarEnLinea = async () => {
      try {
        await Nube.presenciaLatido(ses.usuario, ses.nivel);
        const activos = await Nube.presenciaActivos();
        const el = $('#enLinea');
        if (!el) return;
        if (activos && activos.length) {
          el.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:#2E9E6B;display:inline-block"></span> En línea (${activos.length}): ${activos.map(a => Seguridad.escapar(a.usuario)).join(', ')}`;
          el.style.display = 'flex';
        } else { el.style.display = 'none'; }
      } catch (e) {}
    };
    actualizarEnLinea();
    setInterval(actualizarEnLinea, 30000);
    window.addEventListener('beforeunload', () => { try { Nube.presenciaSalir(ses.usuario); } catch (e) {} });

    setInterval(async () => {
      if (!Nube.autenticado()) return;
      if (!['panel', 'imc', 'pacientes', 'mol'].includes(vistaActual)) return;
      if ($('#modalFondo') && $('#modalFondo').classList.contains('abierto')) return;
      const antes = _huellaDatos();
      const ok = await sincronizarNube();
      if (ok && _huellaDatos() !== antes && typeof refrescarLista === 'function') { try { refrescarLista(); } catch (e) {} }
    }, 6000);
  }

  $('#marcaNombreApp').textContent = empresa.nombre || 'Debbiom';
  document.title = (empresa.nombre || 'Debbiom') + ' · Sistema';
  $('#userNombre').textContent = ses.usuario;
  $('#avatar').textContent = (ses.usuario[0] || 'U').toUpperCase();
  const rol = $('#userRol');
  rol.textContent = ses.nivel;
  rol.className = 'rol ' + (esAdmin ? 'rol-admin' : 'rol-empleado');
  if (!esAdmin) $$('.solo-admin').forEach(el => el.classList.add('oculto'));

  function tick() {
    $('#reloj').textContent = new Date().toLocaleString('es-MX', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }
  tick(); setInterval(tick, 30000);

  let ultimaRenovacion = 0;
  function renovarSiCorresponde() {
    const ahora = Date.now();
    if (ahora - ultimaRenovacion > 20000) { ultimaRenovacion = ahora; Auth.renovar(); }
  }
  ['click', 'keydown', 'mousemove', 'touchstart', 'scroll'].forEach(ev =>
    document.addEventListener(ev, renovarSiCorresponde, { passive: true }));
  setInterval(() => { if (!Auth.vigente()) { Auth.salir('Sesión expirada'); location.reload(); } }, 15000);

  $('#btnSalir').addEventListener('click', () => { Auth.salir('Salida'); location.reload(); });
  $('#btnPwd').addEventListener('click', modalCambiarPassword);
  $('#btnMenu').addEventListener('click', () => $('#barra').classList.toggle('abierta'));

  function toast(msg, tipo = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + tipo;
    t.innerHTML = `<span>${Seguridad.escapar(msg)}</span>`;
    $('#toastZona').appendChild(t);
    setTimeout(() => t.remove(), 3400);
  }

  let _focoPrevio = null;
  const modal = {
    abrir(titulo, cuerpoHTML, pieHTML) {
      _focoPrevio = document.activeElement;
      $('#modalTitulo').textContent = titulo;
      $('#modalCuerpo').innerHTML = cuerpoHTML;
      $('#modalPie').innerHTML = pieHTML || '';
      $('#modalFondo').classList.add('abierto');
      const foco = $('#modalFondo').querySelector('input,select,textarea,button');
      if (foco) setTimeout(() => foco.focus(), 30);
    },
    cerrar() {
      $('#modalFondo').classList.remove('abierto');
      if (_focoPrevio && _focoPrevio.focus) _focoPrevio.focus();
    }
  };
  $('#modalCerrar').addEventListener('click', modal.cerrar);
  $('#modalFondo').addEventListener('click', e => { if (e.target === $('#modalFondo')) modal.cerrar(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#modalFondo').classList.contains('abierto')) modal.cerrar(); });
  $('#modalFondo').addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const foc = $$('#modalFondo a[href],#modalFondo button:not([disabled]),#modalFondo input:not([disabled]),#modalFondo select:not([disabled]),#modalFondo textarea:not([disabled])').filter(el => el.offsetParent !== null);
    if (!foc.length) return;
    const first = foc[0], last = foc[foc.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  function marcarError(idCampo, msg) {
    const inp = document.getElementById(idCampo);
    if (!inp) return;
    const campo = inp.closest('.campo');
    campo.classList.add('error');
    let m = campo.querySelector('.msg-error');
    if (!m) { m = document.createElement('div'); m.className = 'msg-error'; campo.appendChild(m); }
    m.textContent = msg;
  }
  const limpiarErrores = cont => cont.querySelectorAll('.campo.error').forEach(c => c.classList.remove('error'));

  const fechaCorta = iso => { const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
  const fechaHora = iso => { const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  const hoyInput = () => new Date().toISOString().slice(0, 10);

  let _pdfProm = null;
  function cargarScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('no se pudo cargar ' + src));
      document.head.appendChild(s);
    });
  }
  function cargarPDF() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
    if (!_pdfProm) _pdfProm = cargarScript('assets/vendor/jspdf.umd.min.js?v=12')
      .then(() => cargarScript('assets/vendor/jspdf.plugin.autotable.min.js?v=12'));
    return _pdfProm;
  }
  let _xlsProm = null;
  function cargarExcel() {
    if (window.XLSX) return Promise.resolve();
    if (!_xlsProm) _xlsProm = cargarScript('assets/vendor/xlsx.full.min.js?v=12');
    return _xlsProm;
  }

  const vista = $('#vista');
  const META = {
    panel: { titulo: 'Panel', desc: 'Resumen de los estudios registrados.' },
    imc: { titulo: 'Registro de IMC', desc: 'Cálculo de IMC con el método del IMSS.' },
    pacientes: { titulo: 'Pacientes', desc: 'Seguimiento de IMC por paciente.' },
    mol: { titulo: 'Estudios', desc: 'Registros de IMC organizados en carpetas por estudio y código.' },
    usuarios: { titulo: 'Usuarios', desc: 'Altas, bajas y permisos de los usuarios.' },
    bitacora: { titulo: 'Bitácora', desc: 'Accesos y actividad del sistema.' },
  };
  let vistaActual = 'panel';
  let refrescarLista = null;
  function _huellaDatos() {
    return Datos.imc.todos().map(r => `${r.id}:${r.imc}:${r.estudio || ''}:${r.codigo || ''}:${r.editado || r.fechaEstudio || ''}`).join('|');
  }
  async function irA(nombre) {
    if ((nombre === 'usuarios' || nombre === 'bitacora') && !esAdmin) nombre = 'imc';
    $$('.nav-item').forEach(b => b.classList.toggle('activo', b.dataset.vista === nombre));
    $('#tituloVista').textContent = META[nombre].titulo;
    $('#descVista').textContent = META[nombre].desc;
    $('#barra').classList.remove('abierta');
    if (typeof Nube !== 'undefined' && Nube.autenticado()) {
      if (nombre === 'panel' || nombre === 'imc' || nombre === 'pacientes' || nombre === 'mol') await sincronizarNube();
      else if (nombre === 'bitacora') await sincronizarBitacora();
    }
    vistaActual = nombre;
    refrescarLista = null;
    ({ panel: vistaPanel, imc: vistaIMC, pacientes: vistaPacientes, mol: vistaEstudiosMol, usuarios: vistaUsuarios, bitacora: vistaBitacora }[nombre])();
  }
  $$('.nav-item').forEach(b => b.addEventListener('click', () => irA(b.dataset.vista)));

  const filtroIMC = { q: '', cat: '', orden: 'fecha_desc' };
  let editandoId = null;

  function vistaIMC() {
    editandoId = null;
    vista.innerHTML = `
      <style>
        #imcTabla details { margin: 6px 0; }
        #imcTabla summary { cursor:pointer; padding:9px 12px; border:1.5px solid var(--linea-fuerte); border-radius:var(--r-md); background:var(--acero-tenue); display:flex; align-items:center; gap:8px; list-style:none; font-size:.92rem; -webkit-user-select:none; user-select:none; }
        #imcTabla summary::-webkit-details-marker { display:none; }
        #imcTabla .carpeta-ico { display:inline-block; transition:transform .15s; color:var(--acero-hondo); font-size:.8rem; }
        #imcTabla details[open] > summary .carpeta-ico { transform:rotate(90deg); }
        #imcTabla .carpeta-forma > summary { background:#fff; }
        #imcTabla details.destacado > summary { box-shadow:0 0 0 2px var(--acero); }
      </style>
      <div class="rejilla dos" style="align-items:start">
        <section class="panel">
          <div class="panel-cab"><div><h2 id="tituloForma">Nuevo estudio</h2><div class="hint">El IMC se calcula al capturar peso y talla.</div></div></div>
          <div class="panel-cuerpo">
            <form id="fImc" novalidate>
              <div class="forma-grid">
                <div class="campo col-2">
                  <label for="iNombre">Nombre del paciente</label>
                  <input id="iNombre" type="text" maxlength="80" placeholder="Nombre y apellidos (opcional)">
                </div>
                <div class="campo">
                  <label for="iEstudio">Estudio</label>
                  <input id="iEstudio" type="text" list="dlEstImc" maxlength="60" placeholder="Ej. Biocomparabilidad" autocomplete="off">
                </div>
                <div class="campo">
                  <label for="iCodigo">Código de molécula</label>
                  <input id="iCodigo" type="text" list="dlCodImc" maxlength="40" placeholder="Ej. PARA-500" autocomplete="off">
                </div>
                <div class="campo col-2">
                  <div class="ayuda" id="iUbicHint"></div>
                </div>
                <div class="campo">
                  <label for="iSexo">Sexo</label>
                  <select id="iSexo"><option value="">—</option><option value="Femenino">Femenino</option><option value="Masculino">Masculino</option></select>
                </div>
                <datalist id="dlEstImc"></datalist><datalist id="dlCodImc"></datalist>
                <div class="campo">
                  <label for="iPeso">Peso (kg)</label>
                  <input id="iPeso" type="text" inputmode="decimal" placeholder="Ej. 70.5">
                  <div class="ayuda">Entre 1 y 500 kg.</div>
                </div>
                <div class="campo">
                  <label for="iTalla">Talla (m)</label>
                  <input id="iTalla" type="text" inputmode="decimal" placeholder="Ej. 1.72">
                  <div class="ayuda">Entre 0.30 y 2.50 m.</div>
                </div>
                <div class="campo col-2">
                  <label for="iFecha">Fecha del estudio</label>
                  <input id="iFecha" type="date" value="${hoyInput()}" max="${hoyInput()}">
                </div>
              </div>
              <div class="acciones" style="margin-top:18px">
                <button type="submit" class="btn btn-primario" style="width:auto" id="bGuardar">Registrar estudio</button>
                <button type="button" class="btn btn-fantasma" id="bLimpiar">Limpiar</button>
              </div>
            </form>
          </div>
        </section>

        <section class="panel">
          <div class="panel-cab"><div><h2>Resultado</h2><div class="hint">IMC = PESO / TALLA², redondeado a 2 decimales (método IMSS).</div></div></div>
          <div class="panel-cuerpo" id="lecturaWrap">${lecturaVacia()}</div>
        </section>
      </div>

      <section class="panel" style="margin-top:22px">
        <div class="panel-cab" style="flex-wrap:wrap;gap:12px">
          <div><h2>Estudios registrados</h2><div class="hint" id="imcConteo"></div></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-fantasma btn-sm" id="bExpImc" title="Exportar a CSV">CSV</button>
            <button class="btn btn-fantasma btn-sm" id="bXlsImc" title="Descargar Excel (.xlsx)">Excel</button>
            <button class="btn btn-primario btn-sm" id="bPdfImc" title="Descargar PDF">PDF</button>
            <button class="btn btn-fantasma btn-sm" id="bRespaldo" title="Exportar registros (JSON, para respaldo)">Exportar</button>
            <button class="btn btn-fantasma btn-sm" id="bRestaurar" title="Importar registros desde un archivo exportado">Importar</button>
            <input type="file" id="fileRestaurar" accept="application/json,.json" class="oculto">
          </div>
        </div>
        <div class="panel-cuerpo">
          <div id="imcGuardadoEn" style="display:none;margin-bottom:14px;padding:10px 12px;border-radius:var(--r-md);background:var(--acero-tenue);border:1px solid var(--linea-fuerte);font-size:.9rem;color:var(--acero-hondo)"></div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
            <input id="imcBuscar" type="search" placeholder="Buscar por nombre, estudio o código" style="flex:1;min-width:200px;padding:9px 12px;border:1.5px solid var(--linea-fuerte);border-radius:var(--r-md);font-family:var(--f-cuerpo)">
            <select id="imcCat" style="padding:9px 12px;border:1.5px solid var(--linea-fuerte);border-radius:var(--r-md);font-family:var(--f-cuerpo)">
              <option value="">Todas las categorías</option>
              <option value="bajo">Bajo peso</option><option value="normal">Peso normal</option>
              <option value="sobre">Sobrepeso</option><option value="obes">Obesidad</option>
            </select>
            <button class="btn btn-fantasma btn-sm" id="bImcExpandir">Expandir</button>
            <button class="btn btn-fantasma btn-sm" id="bImcColapsar">Colapsar</button>
          </div>
          <div id="imcTabla"></div>
        </div>
      </section>`;

    const fImc = $('#fImc'), iPeso = $('#iPeso'), iTalla = $('#iTalla');

    function calcularVivo() {
      const vp = Seguridad.numero(iPeso.value, { min: 1, max: 500 });
      const vt = Seguridad.numero(iTalla.value, { min: 0.30, max: 2.50 });
      if (!vp.ok || !vt.ok) { $('#lecturaWrap').innerHTML = lecturaVacia(); return; }
      const r = IMC.calcular(vp.valor, vt.valor);
      $('#lecturaWrap').innerHTML = r ? lecturaHTML(r) : lecturaVacia();
    }
    iPeso.addEventListener('input', calcularVivo);
    iTalla.addEventListener('input', calcularVivo);

    function actualizarUbicImc() {
      const e = $('#iEstudio').value.trim(), c = $('#iCodigo').value.trim();
      const h = $('#iUbicHint');
      if (e) h.textContent = `Se archivará en ${e}${c ? ' › ' + c : ''}.`;
      else h.textContent = 'Estudio y código son opcionales. Sin estudio queda en la carpeta “— sin estudio —”.';
    }
    $('#iEstudio').addEventListener('input', actualizarUbicImc);
    $('#iCodigo').addEventListener('input', actualizarUbicImc);

    $('#bLimpiar').addEventListener('click', () => { salirEdicion(); });

    fImc.addEventListener('submit', (e) => {
      e.preventDefault();
      limpiarErrores(fImc);
      const vp = Seguridad.numero(iPeso.value, { etiqueta: 'Peso', min: 1, max: 500 });
      const vt = Seguridad.numero(iTalla.value, { etiqueta: 'Talla', min: 0.30, max: 2.50 });
      const vf = Seguridad.fecha($('#iFecha').value, { etiqueta: 'Fecha' });
      let ok = true;
      if (!vp.ok) { marcarError('iPeso', vp.msg); ok = false; }
      if (!vt.ok) { marcarError('iTalla', vt.msg); ok = false; }
      if (!vf.ok) { marcarError('iFecha', vf.msg); ok = false; }
      if (!ok) return;
      const r = IMC.calcular(vp.valor, vt.valor);
      if (!r) { marcarError('iTalla', 'La talla no puede ser cero.'); return; }

      const base = {
        nombre: Seguridad.limpiar($('#iNombre').value),
        estudio: Seguridad.limpiar($('#iEstudio').value),
        codigo: Seguridad.limpiar($('#iCodigo').value),
        sexo: $('#iSexo').value || '—',
        fechaEstudio: vf.valor,
        peso: r.peso, talla: r.talla, imc: r.imc, categoria: r.categoria, clase: r.clase,
      };
      const claves = _claveImc(base);
      if (editandoId) {
        const prev = Datos.imc.todos().find(x => x.id === editandoId);
        Datos.imc.actualizar({ ...prev, ...base, editadoPor: ses.usuario, editado: Datos.ahoraISO() });
        Datos.bitacora.registrar('Editó IMC', ses.usuario, ses.nivel, `${claves.ruta} · IMC ${r.imc}`);
        toast('Estudio actualizado.', 'ok');
        salirEdicion();
      } else {
        Datos.imc.agregar({ id: Datos.id(), fecha: Datos.ahoraISO(), usuario: ses.usuario, ...base });
        Datos.bitacora.registrar('Registro IMC', ses.usuario, ses.nivel, `${claves.ruta} · IMC ${r.imc} (${r.categoria})`);
        toast('Estudio registrado.', 'ok');
        const est = base.estudio, cod = base.codigo;
        salirEdicion();
        $('#iEstudio').value = est; $('#iCodigo').value = cod; actualizarUbicImc();
      }
      _imcAbierto[claves.kt] = true; _imcAbierto[claves.kf] = true;
      pintarTablaImc();
      const ub = $('#imcGuardadoEn');
      if (ub) { ub.textContent = `✓ Archivado en  ${claves.ruta}  —  ${base.nombre || 'sin nombre'}, IMC ${r.imc}`; ub.style.display = 'block'; }
      const nodo = $$('#imcTabla details').find(d => d.dataset.k === claves.kf);
      if (nodo) { nodo.classList.add('destacado'); if (nodo.scrollIntoView) nodo.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => nodo.classList.remove('destacado'), 2500); }
    });

    $('#bExpImc').addEventListener('click', exportarCSVImc);
    $('#bXlsImc').addEventListener('click', exportarExcelImc);
    $('#bPdfImc').addEventListener('click', descargarPDFImc);
    $('#bRespaldo').addEventListener('click', descargarRespaldo);
    $('#bRestaurar').addEventListener('click', () => $('#fileRestaurar').click());
    $('#fileRestaurar').addEventListener('change', restaurarRespaldo);

    $('#imcBuscar').addEventListener('input', e => { filtroIMC.q = e.target.value; pintarTablaImc(); });
    $('#imcCat').addEventListener('change', e => { filtroIMC.cat = e.target.value; pintarTablaImc(); });
    $('#imcBuscar').value = filtroIMC.q; $('#imcCat').value = filtroIMC.cat;
    $('#bImcExpandir').addEventListener('click', () => { Datos.imc.todos().forEach(r => { const k = _claveImc(r); _imcAbierto[k.kt] = true; _imcAbierto[k.kf] = true; }); pintarTablaImc(); });
    $('#bImcColapsar').addEventListener('click', () => { for (const k in _imcAbierto) delete _imcAbierto[k]; pintarTablaImc(); });

    actualizarUbicImc();
    pintarTablaImc();
    refrescarLista = pintarTablaImc;
  }

  function salirEdicion() {
    editandoId = null;
    const f = $('#fImc'); if (f) { f.reset(); limpiarErrores(f); $('#iFecha').value = hoyInput(); }
    $('#lecturaWrap') && ($('#lecturaWrap').innerHTML = lecturaVacia());
    $('#tituloForma') && ($('#tituloForma').textContent = 'Nuevo estudio');
    $('#bGuardar') && ($('#bGuardar').textContent = 'Registrar estudio');
  }

  function entrarEdicion(id) {
    const r = Datos.imc.todos().find(x => x.id === id);
    if (!r) return;
    editandoId = id;
    $('#iNombre').value = r.nombre || '';
    $('#iEstudio').value = r.estudio || '';
    $('#iCodigo').value = r.codigo || '';
    { const h = $('#iUbicHint'); if (h) h.textContent = r.estudio ? `Se archivará en ${r.estudio}${r.codigo ? ' › ' + r.codigo : ''}.` : ''; }
    $('#iSexo').value = (r.sexo && r.sexo !== '—') ? r.sexo : '';
    $('#iPeso').value = r.peso;
    $('#iTalla').value = r.talla;
    $('#iFecha').value = (r.fechaEstudio || (r.fecha || '').slice(0, 10)) || hoyInput();
    $('#tituloForma').textContent = 'Editar estudio';
    $('#bGuardar').textContent = 'Guardar cambios';
    const calc = IMC.calcular(r.peso, r.talla);
    $('#lecturaWrap').innerHTML = calc ? lecturaHTML(calc) : lecturaVacia();
    $('#fImc').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function lecturaVacia() {
    return `<div class="vacio-lectura"><div class="n mono">—.—</div><p>Captura el peso y la talla para ver el IMC.</p></div>`;
  }
  function lecturaHTML(r) {
    const bandas = [['var(--imc-bajo)', 14], ['var(--imc-normal)', 14], ['var(--imc-sobre)', 20], ['var(--imc-obes)', 52]];
    const barra = bandas.map(b => `<i style="width:${b[1]}%;background:${b[0]}"></i>`).join('');
    const pos = IMC.posicionEscala(r.imc);
    const colorCat = { bajo: 'var(--imc-bajo)', normal: 'var(--imc-normal)', sobre: 'var(--imc-sobre)', obes: 'var(--imc-obes)' }[r.clase];
    return `
      <div class="lectura">
        <div class="etq">Índice de Masa Corporal</div>
        <div class="valor">${r.imc.toFixed(2)}</div>
        <span class="categoria" style="background:${colorCat};color:#fff">${Seguridad.escapar(r.categoria)}</span>
        <div class="escala">
          <div class="escala-barra">${barra}<span class="escala-aguja" style="left:${pos}%"></span></div>
          <div class="escala-ejes"><span>15</span><span>18.5</span><span>25</span><span>30</span><span>40</span></div>
        </div>
        <div class="detalle">peso ${r.peso} kg · talla ${r.talla} m · talla² = ${r.tallaCuadrada.toFixed(4)}</div>
      </div>`;
  }

  function filasFiltradas() {
    let filas = Datos.imc.todos();
    const q = filtroIMC.q.trim().toLowerCase();
    if (q) filas = filas.filter(r => (`${r.nombre || ''} ${r.estudio || ''} ${r.codigo || ''} ${r.expediente || ''}`).toLowerCase().includes(q));
    if (filtroIMC.cat) filas = filas.filter(r => r.clase === filtroIMC.cat);
    return filas;
  }

  const _imcAbierto = {};
  const _imcLabel = r => String(r.codigo || '').trim() || 'sin código';
  function _claveImc(r) {
    const e = String(r.estudio || '').trim() || '—';
    const c = _imcLabel(r);
    return { kt: _normMol(e), kf: _normMol(e) + '¦' + _normMol(c), ruta: `${e} › ${c}` };
  }
  function agruparImc(lista) {
    const est = new Map();
    lista.forEach(r => {
      const e = String(r.estudio || '').trim() || '—';
      const c = _imcLabel(r);
      if (!est.has(e)) est.set(e, new Map());
      const mm = est.get(e);
      if (!mm.has(c)) mm.set(c, []);
      mm.get(c).push(r);
    });
    return est;
  }

  function pintarTablaImc() {
    const total = Datos.imc.todos().length;
    const filas = filasFiltradas();
    $('#imcConteo') && ($('#imcConteo').textContent = `${filas.length} de ${total} estudio(s) · en este dispositivo`);
    { const est = new Set(), cod = new Set();
      Datos.imc.todos().forEach(r => { if (r.estudio) est.add(r.estudio); if (r.codigo) cod.add(r.codigo); });
      (typeof Datos.mol !== 'undefined' ? Datos.mol.todos() : []).forEach(r => { if (r.tipo) est.add(r.tipo); if (r.codigo) cod.add(r.codigo); });
      const op = s => [...s].sort().map(v => `<option value="${Seguridad.escapar(v)}"></option>`).join('');
      const dE = $('#dlEstImc'), dC = $('#dlCodImc');
      if (dE) dE.innerHTML = op(est); if (dC) dC.innerHTML = op(cod); }
    const chip = { bajo: 'chip-bajo', normal: 'chip-normal', sobre: 'chip-sobre', obes: 'chip-obes' };
    const esc = Seguridad.escapar;
    const icoEdit = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
    const icoDel = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>';
    if (!filas.length) {
      $('#imcTabla').innerHTML = `<div class="tabla-vacia">${total ? 'Ningún estudio coincide con el filtro.' : 'Aún no hay estudios registrados.'}</div>`;
      return;
    }
    const grupos = agruparImc(filas);
    let html = '';
    for (const [est, cods] of grupos) {
      const kt = _normMol(est);
      let nEst = 0; cods.forEach(arr => nEst += arr.length);
      let htmlCod = '';
      for (const [cod, regs] of cods) {
        const kf = kt + '¦' + _normMol(cod);
        const fil = regs.slice().sort((a, b) => String(b.fechaEstudio || b.fecha || '').localeCompare(String(a.fechaEstudio || a.fecha || ''))).map(r => `<tr>
          <td>${fechaCorta(r.fechaEstudio || r.fecha)}</td>
          <td>${esc(r.nombre || '—')}</td>
          <td>${esc(r.sexo || '—')}</td>
          <td class="num">${r.peso}</td>
          <td class="num">${r.talla}</td>
          <td class="num"><b>${Number(r.imc).toFixed(2)}</b></td>
          <td><span class="chip ${chip[r.clase]}">${esc(r.categoria || '')}</span></td>
          <td class="mono" style="font-size:.78rem;color:var(--tinta-45)">${esc(r.usuario || '—')}</td>
          <td style="white-space:nowrap;text-align:right">
            <button class="icon-btn" data-edit="${esc(r.id)}" title="Editar">${icoEdit}</button>
            <button class="icon-btn peligro" data-del="${esc(r.id)}" title="Eliminar">${icoDel}</button>
          </td></tr>`).join('');
        htmlCod += `<details class="carpeta carpeta-forma" data-k="${esc(kf)}"${_imcAbierto[kf] ? ' open' : ''}>
          <summary><span class="carpeta-ico">▸</span> ${esc(cod)} <span class="chip chip-normal">${regs.length}</span></summary>
          <div class="tabla-wrap"><table class="tabla">
            <thead><tr><th>Fecha</th><th>Nombre</th><th>Sexo</th><th class="num">Peso</th><th class="num">Talla</th><th class="num">IMC</th><th>Categoría</th><th>Registró</th><th></th></tr></thead>
            <tbody>${fil}</tbody></table></div>
        </details>`;
      }
      html += `<details class="carpeta carpeta-tipo" data-k="${esc(kt)}"${_imcAbierto[kt] ? ' open' : ''}>
        <summary><span class="carpeta-ico">▸</span> <b>${esc(est)}</b> <span class="chip chip-sobre">${nEst}</span></summary>
        <div style="padding-left:14px">${htmlCod}</div>
      </details>`;
    }
    $('#imcTabla').innerHTML = html;
    $$('#imcTabla details').forEach(d => d.addEventListener('toggle', () => { _imcAbierto[d.dataset.k] = d.open; }));
    $$('#imcTabla [data-edit]').forEach(b => b.addEventListener('click', () => entrarEdicion(b.dataset.edit)));
    $$('#imcTabla [data-del]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.del;
      modal.abrir('Eliminar estudio', `<p>¿Eliminar este registro de IMC? Esta acción no se puede deshacer.</p>`,
        `<button class="btn btn-fantasma" id="mNo">Cancelar</button><button class="btn btn-peligro" id="mSi">Eliminar</button>`);
      $('#mNo').onclick = modal.cerrar;
      $('#mSi').onclick = () => { Datos.imc.eliminar(id); Datos.bitacora.registrar('Eliminó IMC', ses.usuario, ses.nivel); modal.cerrar(); if (editandoId === id) salirEdicion(); pintarTablaImc(); toast('Registro eliminado.', 'ok'); };
    }));
  }

  function _clavePac(r) { return String(r.expediente || r.nombre || '').toLowerCase(); }
  function agruparPacientes() {
    const mapa = new Map();
    Datos.imc.todos().forEach(r => {
      const k = _clavePac(r);
      if (!k) return;
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k).push(r);
    });
    const lista = [];
    mapa.forEach((estudios, k) => {
      estudios.sort((a, b) => (a.fechaEstudio || a.fecha || '').localeCompare(b.fechaEstudio || b.fecha || ''));
      const ultimo = estudios[estudios.length - 1], primero = estudios[0];
      lista.push({
        clave: k,
        nombre: estudios.find(e => e.nombre)?.nombre || ultimo.expediente || '—',
        expediente: estudios.find(e => e.expediente)?.expediente || '',
        estudio: estudios.find(e => e.estudio)?.estudio || '',
        codigo: estudios.find(e => e.codigo)?.codigo || '',
        sexo: estudios.find(e => e.sexo && e.sexo !== '—')?.sexo || '—',
        n: estudios.length, ultimo, primero, ultimoIMC: ultimo.imc,
        ultimaFecha: ultimo.fechaEstudio || ultimo.fecha, tendencia: ultimo.imc - primero.imc
      });
    });
    lista.sort((a, b) => String(b.ultimaFecha || '').localeCompare(String(a.ultimaFecha || '')));
    return lista;
  }
  function pacientePorExpediente(exp) {
    const k = String(exp || '').toLowerCase();
    if (!k) return null;
    return agruparPacientes().find(p => (p.expediente || '').toLowerCase() === k || p.clave === k) || null;
  }

  const filtroPac = { q: '' };
  function vistaPacientes() {
    const chip = { bajo: 'chip-bajo', normal: 'chip-normal', sobre: 'chip-sobre', obes: 'chip-obes' };
    const flecha = t => t > 0.1 ? '<span style="color:var(--imc-obes)">▲</span>' : t < -0.1 ? '<span style="color:var(--imc-normal)">▼</span>' : '<span style="color:var(--tinta-45)">—</span>';
    const render = () => {
      let pacientes = agruparPacientes();
      const q = filtroPac.q.trim().toLowerCase();
      if (q) pacientes = pacientes.filter(p => (p.nombre + ' ' + p.estudio + ' ' + p.codigo).toLowerCase().includes(q));
      $('#pacConteo').textContent = `${pacientes.length} paciente(s) · toca uno para ver su seguimiento`;
      $('#pacLista').innerHTML = pacientes.length ? `
        <div class="tabla-wrap"><table class="tabla">
          <thead><tr><th>Paciente</th><th>Estudio</th><th>Sexo</th><th class="num">Estudios</th><th class="num">Último IMC</th><th>Categoría</th><th class="num">Tendencia</th><th>Última fecha</th></tr></thead>
          <tbody>${pacientes.map(p => `<tr style="cursor:pointer" data-pac="${Seguridad.escapar(p.clave)}">
            <td><b>${Seguridad.escapar(p.nombre)}</b></td>
            <td>${Seguridad.escapar(p.estudio || '—')}${p.codigo ? ' · ' + Seguridad.escapar(p.codigo) : ''}</td>
            <td>${Seguridad.escapar(p.sexo)}</td>
            <td class="num">${p.n}</td>
            <td class="num"><b>${p.ultimoIMC.toFixed(2)}</b></td>
            <td><span class="chip ${chip[p.ultimo.clase]}">${Seguridad.escapar(p.ultimo.categoria)}</span></td>
            <td class="num">${flecha(p.tendencia)} ${p.n > 1 ? (p.tendencia > 0 ? '+' : '') + p.tendencia.toFixed(1) : ''}</td>
            <td>${fechaCorta(p.ultimaFecha)}</td>
          </tr>`).join('')}</tbody></table></div>` : `<div class="tabla-vacia">${filtroPac.q ? 'Ningún paciente coincide.' : 'Aún no hay pacientes. Registra un estudio en Registro de IMC.'}</div>`;
      $$('#pacLista [data-pac]').forEach(tr => tr.addEventListener('click', () => modalHistorial(tr.dataset.pac)));
    };
    vista.innerHTML = `
      <section class="panel">
        <div class="panel-cab"><div><h2>Pacientes</h2><div class="hint" id="pacConteo"></div></div></div>
        <div class="panel-cuerpo">
          <input id="pacBuscar" type="search" placeholder="Buscar por nombre o estudio" style="width:100%;padding:9px 12px;border:1.5px solid var(--linea-fuerte);border-radius:var(--r-md);font-family:var(--f-cuerpo);margin-bottom:16px">
          <div id="pacLista"></div>
        </div>
      </section>`;
    $('#pacBuscar').value = filtroPac.q;
    $('#pacBuscar').addEventListener('input', e => { filtroPac.q = e.target.value; render(); });
    render();
    refrescarLista = render;
  }

  function modalHistorial(ident) {
    const key = String(ident).toLowerCase();
    const estudios = Datos.imc.todos()
      .filter(r => String(r.expediente || r.nombre || '').toLowerCase() === key)
      .sort((a, b) => (a.fechaEstudio || a.fecha || '').localeCompare(b.fechaEstudio || b.fecha || ''));
    const nombre = estudios.find(e => e.nombre)?.nombre || ident;
    const cuerpo = `
      <p style="margin:0 0 4px;color:var(--tinta-45);font-size:.85rem">${estudios.length} estudio(s)</p>
      <h3 style="margin:0 0 14px">${Seguridad.escapar(nombre)}</h3>
      ${graficaTendencia(estudios)}
      <div class="tabla-wrap" style="margin-top:14px"><table class="tabla">
        <thead><tr><th>Fecha</th><th class="num">Peso</th><th class="num">Talla</th><th class="num">IMC</th><th>Categoría</th></tr></thead>
        <tbody>${estudios.map(r => `<tr>
          <td>${fechaCorta(r.fechaEstudio || r.fecha)}</td>
          <td class="num">${r.peso}</td><td class="num">${r.talla}</td>
          <td class="num"><b>${r.imc.toFixed(2)}</b></td>
          <td><span class="chip chip-${r.clase}">${Seguridad.escapar(r.categoria)}</span></td>
        </tr>`).join('')}</tbody></table></div>`;
    modal.abrir('Historial del paciente', cuerpo, `<button class="btn btn-primario" id="mOk">Cerrar</button>`);
    $('#mOk').onclick = modal.cerrar;
  }

  function graficaTendencia(estudios) {
    if (estudios.length < 2) return `<p style="color:var(--tinta-45);font-size:.85rem;margin:0">Se necesitan al menos 2 estudios para ver la tendencia.</p>`;
    const W = 480, H = 170, pad = 34;
    const imcs = estudios.map(e => e.imc);
    const min = Math.min(...imcs, 18), max = Math.max(...imcs, 27);
    const rango = (max - min) || 1;
    const x = i => pad + (i / (estudios.length - 1)) * (W - pad - 12);
    const y = v => H - pad - ((v - min) / rango) * (H - pad - 14);
    const pts = estudios.map((e, i) => `${x(i)},${y(e.imc)}`).join(' ');
    const circ = estudios.map((e, i) => `<circle cx="${x(i)}" cy="${y(e.imc)}" r="3.5" fill="var(--acero)"/><text x="${x(i)}" y="${y(e.imc) - 8}" font-size="9" fill="var(--tinta-70)" text-anchor="middle" font-family="monospace">${e.imc.toFixed(1)}</text>`).join('');
    const ejes = estudios.map((e, i) => `<text x="${x(i)}" y="${H - 12}" font-size="8" fill="var(--tinta-45)" text-anchor="middle">${fechaCorta(e.fechaEstudio || e.fecha).slice(0, 5)}</text>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;background:var(--acero-tenue);border-radius:var(--r-md)" role="img" aria-label="Tendencia de IMC">
      <line x1="${pad}" y1="${H - pad}" x2="${W - 12}" y2="${H - pad}" stroke="var(--linea-fuerte)" stroke-width="1"/>
      <polyline points="${pts}" fill="none" stroke="var(--acero)" stroke-width="2"/>
      ${circ}${ejes}
    </svg>`;
  }

  function exportarCSVImc() {
    const filas = filasFiltradas();
    if (!filas.length) return toast('No hay estudios para exportar.', 'error');
    Datos.exportarCSV('debbiom_imc.csv', [
      { titulo: 'Fecha', valor: r => fechaCorta(r.fechaEstudio || r.fecha) },
      { titulo: 'Estudio', valor: r => r.estudio || '' },
      { titulo: 'Código', valor: r => r.codigo || '' },
      { titulo: 'Nombre', valor: r => r.nombre || '' },
      { titulo: 'Sexo', valor: r => r.sexo || '' },
      { titulo: 'Peso (kg)', valor: r => r.peso },
      { titulo: 'Talla (m)', valor: r => r.talla },
      { titulo: 'IMC', valor: r => r.imc },
      { titulo: 'Categoría', valor: r => r.categoria },
      { titulo: 'Capturó', valor: r => r.usuario || '' },
    ], filas);
    toast('CSV exportado.', 'ok');
  }

  async function exportarExcelImc() {
    const filas = filasFiltradas();
    if (!filas.length) return toast('No hay estudios para exportar.', 'error');
    const btn = $('#bXlsImc'); const txt = btn.textContent; btn.disabled = true; btn.textContent = 'Generando…';
    try {
      await cargarExcel();
      if (!window.XLSX) throw new Error('librería no cargada');
      const datos = filas.map(r => ({
        'Fecha': fechaCorta(r.fechaEstudio || r.fecha),
        'Estudio': r.estudio || '',
        'Código': r.codigo || '',
        'Nombre': r.nombre || '',
        'Sexo': r.sexo || '',
        'Peso (kg)': r.peso,
        'Talla (m)': r.talla,
        'IMC': r.imc,
        'Categoría': r.categoria,
        'Capturó': r.usuario || '',
      }));
      const ws = XLSX.utils.json_to_sheet(datos);
      ws['!cols'] = [{ wch: 11 }, { wch: 14 }, { wch: 22 }, { wch: 11 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 18 }, { wch: 14 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Estudios IMC');
      XLSX.writeFile(wb, 'debbiom_imc_' + new Date().toISOString().slice(0, 10) + '.xlsx');
      Datos.bitacora.registrar('Exportó Excel', ses.usuario, ses.nivel, filas.length + ' registro(s)');
      toast('Excel descargado.', 'ok');
    } catch (e) {
      toast('No se pudo generar el Excel (' + (e.message || e) + ').', 'error');
    } finally { btn.disabled = false; btn.textContent = txt; }
  }

  async function descargarPDFImc() {
    const filas = filasFiltradas();
    if (!filas.length) return toast('No hay estudios para exportar.', 'error');
    const btn = $('#bPdfImc'); const txt = btn.textContent; btn.disabled = true; btn.textContent = 'Generando…';
    try {
      await cargarPDF();
      const JsPDF = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : window.jsPDF;
      if (!JsPDF) throw new Error('librería no cargada');
      const doc = new JsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const anchoPag = doc.internal.pageSize.getWidth(), altoPag = doc.internal.pageSize.getHeight();
      const empresaNom = (Auth.getEmpresa() && Auth.getEmpresa().nombre) || 'Debbiom';
      const ahora = new Date().toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

      doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(10, 74, 85);
      doc.text(empresaNom, 40, 42);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(70, 70, 70);
      doc.text('Registro de estudios de IMC (método IMSS)', 40, 60);
      doc.setFontSize(9); doc.setTextColor(120, 120, 120);
      doc.text('Generado: ' + ahora + '   ·   Por: ' + ses.usuario + '   ·   Estudios: ' + filas.length, 40, 76);
      doc.setDrawColor(214, 224, 224); doc.line(40, 84, anchoPag - 40, 84);

      const head = [['Fecha', 'Estudio', 'Código', 'Nombre', 'Sexo', 'Peso (kg)', 'Talla (m)', 'IMC', 'Categoría']];
      const body = filas.map(r => [
        fechaCorta(r.fechaEstudio || r.fecha), r.estudio || '—', r.codigo || '—', r.nombre || '—',
        r.sexo || '—', String(r.peso), String(r.talla), r.imc.toFixed(2), r.categoria
      ]);
      const auto = (typeof doc.autoTable === 'function') ? (o) => doc.autoTable(o)
        : (window.jspdf && typeof window.jspdf.autoTable === 'function') ? (o) => window.jspdf.autoTable(doc, o) : null;
      if (!auto) throw new Error('componente de tabla no disponible');
      auto({
        head, body, startY: 96, margin: { left: 40, right: 40 },
        styles: { fontSize: 9, cellPadding: 5, lineColor: [222, 230, 230], lineWidth: 0.5 },
        headStyles: { fillColor: [15, 110, 126], textColor: 255, fontStyle: 'bold', halign: 'left' },
        alternateRowStyles: { fillColor: [241, 247, 247] },
        columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right', fontStyle: 'bold' } },
        didDrawPage: () => {
          doc.setFontSize(8); doc.setTextColor(150, 150, 150);
          doc.text('Página ' + doc.internal.getNumberOfPages(), anchoPag - 70, altoPag - 18);
          doc.text('Debbiom · Documento interno', 40, altoPag - 18);
        }
      });
      doc.save('debbiom_registros_imc_' + new Date().toISOString().slice(0, 10) + '.pdf');
      Datos.bitacora.registrar('Exportó PDF', ses.usuario, ses.nivel, filas.length + ' registro(s)');
      toast('PDF descargado.', 'ok');
    } catch (e) {
      toast('No se pudo generar el PDF (' + (e.message || e) + ').', 'error');
    } finally { btn.disabled = false; btn.textContent = txt; }
  }

  function descargarRespaldo() {
    const estudios = Datos.imc.todos();
    if (!estudios.length) return toast('No hay estudios para exportar.', 'error');
    Datos.exportarJSON('debbiom_registros_' + new Date().toISOString().slice(0, 10) + '.json', {
      tipo: 'debbiom-respaldo', version: 1, fecha: Datos.ahoraISO(), estudios
    });
    Datos.bitacora.registrar('Exportó registros', ses.usuario, ses.nivel, estudios.length + ' estudio(s)');
    toast('Registros exportados.', 'ok');
  }

  function restaurarRespaldo(ev) {
    const file = ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let datos;
      try { datos = JSON.parse(reader.result); } catch { return toast('El archivo no es válido.', 'error'); }
      if (!datos || datos.tipo !== 'debbiom-respaldo' || !Array.isArray(datos.estudios))
        return toast('El archivo no es un export de Debbiom.', 'error');
      const actuales = Datos.imc.todos();
      const ids = new Set(actuales.map(r => r.id));
      const nuevos = datos.estudios.filter(r => r && r.id && !ids.has(r.id));
      modal.abrir('Importar registros',
        `<p>El archivo tiene <b>${datos.estudios.length}</b> estudio(s).<br>Se agregarán <b>${nuevos.length}</b> que no están en este equipo (no se borra nada).</p>`,
        `<button class="btn btn-fantasma" id="mNo">Cancelar</button><button class="btn btn-primario" id="mSi">Importar</button>`);
      $('#mNo').onclick = modal.cerrar;
      $('#mSi').onclick = () => {
        Datos.imc.guardarTodos([...nuevos, ...actuales]);
        Datos.bitacora.registrar('Importó registros', ses.usuario, ses.nivel, nuevos.length + ' estudio(s) agregados');
        modal.cerrar(); pintarTablaImc(); toast(`Importado: ${nuevos.length} estudio(s) agregados.`, 'ok');
      };
    };
    reader.readAsText(file);
  }

  function modalCambiarPassword() {
    modal.abrir('Cambiar mi contraseña', `
      <div class="campo password"><label for="pwActual">Contraseña actual</label>
        <div class="ctrl"><input id="pwActual" type="password" autocomplete="current-password"></div></div>
      <div class="campo password"><label for="pwNueva">Nueva contraseña</label>
        <div class="ctrl"><input id="pwNueva" type="password" autocomplete="new-password" placeholder="Mínimo 10 caracteres">
        <button type="button" class="ver-pwd" id="pwVer" aria-label="Mostrar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg></button></div>
        <div class="ayuda">Mayúscula, minúscula, número y símbolo.</div></div>
      <div class="campo password"><label for="pwNueva2">Repite la nueva</label>
        <div class="ctrl"><input id="pwNueva2" type="password" autocomplete="new-password"></div></div>
    `, `<button class="btn btn-fantasma" id="mNo">Cancelar</button><button class="btn btn-primario" id="mSi">Cambiar</button>`);
    $('#pwVer').onclick = () => { const p = $('#pwNueva'); p.type = p.type === 'password' ? 'text' : 'password'; };
    $('#mNo').onclick = modal.cerrar;
    $('#mSi').onclick = async () => {
      const cont = $('#modalCuerpo'); limpiarErrores(cont);
      const actual = $('#pwActual').value, nueva = $('#pwNueva').value, nueva2 = $('#pwNueva2').value;
      const yo = Datos.usuarios.todos().find(u => u.usuario === ses.usuario);
      const coincide = async (clave) => (typeof yo.password === 'string' && yo.password)
        ? Seguridad.comparaSegura(clave, yo.password)
        : Seguridad.comparaSegura(await Seguridad.hashPassword(yo.sal, clave, yo.iter), yo.hash || '');
      let ok = true;
      if (!(await coincide(actual))) { marcarError('pwActual', 'La contraseña actual no es correcta.'); ok = false; }
      const fza = Seguridad.fortalezaPassword(nueva);
      if (!fza.ok) { marcarError('pwNueva', 'Falta: ' + fza.faltan.join(', ') + '.'); ok = false; }
      if (nueva !== nueva2) { marcarError('pwNueva2', 'No coinciden.'); ok = false; }
      if (ok && await coincide(nueva)) { marcarError('pwNueva', 'La nueva debe ser distinta a la actual.'); ok = false; }
      if (!ok) return;

      const sal = Seguridad.generarSal();
      const iter = Seguridad.ITERACIONES;
      const hash = await Seguridad.hashPassword(sal, nueva, iter);
      const lista = Datos.usuarios.todos().map(u => {
        if (u.usuario !== ses.usuario) return u;
        const { password, ...resto } = u;
        return { ...resto, sal, hash, iter };
      });
      Datos.usuarios.guardar(lista);
      Datos.usuarios.guardarOverridePassword(ses.usuario, sal, hash, iter);
      Datos.bitacora.registrar('Cambió su contraseña', ses.usuario, ses.nivel);
      modal.cerrar();
      toast('Contraseña actualizada en este equipo.', 'ok');
    };
  }

  const filtroMol = { q: '' };
  const _molAbierto = {};
  const _normMol = s => String(s || '').trim().toLowerCase();
  const _molLabel = r => { const cod = String(r.codigo || '').trim(); return (String(r.molecula || '').trim() || '—') + (cod ? ' · ' + cod : ''); };
  function _claveArbol(r) {
    const t = String(r.tipo || '').trim() || '—';
    const m = _molLabel(r);
    return { kt: _normMol(t), kf: _normMol(t) + '¦' + _normMol(m), ruta: `${t} › ${m}` };
  }
  function _claveForma(r) { return _normMol(r.tipo) + '¦' + _normMol(r.molecula) + '¦' + _normMol(r.codigo); }
  function siguienteFolio(tipo, molecula, codigo) {
    const clave = _normMol(tipo) + '¦' + _normMol(molecula) + '¦' + _normMol(codigo);
    let max = 0;
    Datos.mol.todos().forEach(r => { if (_claveForma(r) === clave) max = Math.max(max, Number(r.folio) || 0); });
    return max + 1;
  }
  function agruparMol(lista) {
    const tipos = new Map();
    lista.forEach(r => {
      const t = String(r.tipo || '').trim() || '—';
      const m = _molLabel(r);
      if (!tipos.has(t)) tipos.set(t, new Map());
      const mm = tipos.get(t);
      if (!mm.has(m)) mm.set(m, []);
      mm.get(m).push(r);
    });
    return tipos;
  }
  function arbolMolHTML(tipos) {
    const esc = Seguridad.escapar;
    const icoEdit = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
    const icoDel = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>';
    let html = '';
    for (const [tipo, mols] of tipos) {
      const kt = _normMol(tipo);
      let nTipo = 0; mols.forEach(arr => nTipo += arr.length);
      let htmlMol = '';
      for (const [mol, regs] of mols) {
        const kf = kt + '¦' + _normMol(mol);
        const filas = regs.slice().sort((a, b) => (Number(a.folio) || 0) - (Number(b.folio) || 0)).map(r => `<tr>
          <td class="mono" style="width:54px"><b>#${esc(String(r.folio || '—'))}</b></td>
          <td>${fechaCorta(r.fechaEstudio || r.fecha)}</td>
          <td>${esc(r.detalle || '—')}</td>
          <td class="mono" style="font-size:.76rem;color:var(--tinta-45)">${esc(r.usuario || '')}</td>
          <td style="white-space:nowrap;text-align:right">
            <button class="icon-btn" data-moledit="${esc(r.id)}" title="Editar">${icoEdit}</button>
            <button class="icon-btn peligro" data-moldel="${esc(r.id)}" title="Eliminar">${icoDel}</button>
          </td></tr>`).join('');
        htmlMol += `<details class="carpeta carpeta-forma" data-k="${esc(kf)}"${_molAbierto[kf] ? ' open' : ''}>
          <summary><span class="carpeta-ico">▸</span> ${esc(mol)} <span class="chip chip-normal">${regs.length}</span></summary>
          <div class="tabla-wrap"><table class="tabla">
            <thead><tr><th>Folio</th><th>Fecha</th><th>Detalle</th><th>Capturó</th><th></th></tr></thead>
            <tbody>${filas}</tbody></table></div>
        </details>`;
      }
      html += `<details class="carpeta carpeta-tipo" data-k="${esc(kt)}"${_molAbierto[kt] ? ' open' : ''}>
        <summary><span class="carpeta-ico">▸</span> <b>${esc(tipo)}</b> <span class="chip chip-sobre">${nTipo}</span></summary>
        <div style="padding-left:14px">${htmlMol}</div>
      </details>`;
    }
    return html;
  }

  function arbolImcRO(lista) {
    const esc = Seguridad.escapar;
    const chip = { bajo: 'chip-bajo', normal: 'chip-normal', sobre: 'chip-sobre', obes: 'chip-obes' };
    const grupos = agruparImc(lista);
    let html = '';
    for (const [est, cods] of grupos) {
      const kt = _normMol(est);
      let nEst = 0; cods.forEach(arr => nEst += arr.length);
      let htmlCod = '';
      for (const [cod, regs] of cods) {
        const kf = kt + '¦' + _normMol(cod);
        const fil = regs.slice().sort((a, b) => String(b.fechaEstudio || b.fecha || '').localeCompare(String(a.fechaEstudio || a.fecha || ''))).map(r => `<tr>
          <td>${fechaCorta(r.fechaEstudio || r.fecha)}</td>
          <td>${esc(r.nombre || '—')}</td>
          <td>${esc(r.sexo || '—')}</td>
          <td class="num">${r.peso}</td>
          <td class="num">${r.talla}</td>
          <td class="num"><b>${Number(r.imc).toFixed(2)}</b></td>
          <td><span class="chip ${chip[r.clase]}">${esc(r.categoria || '')}</span></td>
          <td class="mono" style="font-size:.78rem;color:var(--tinta-45)">${esc(r.usuario || '—')}</td>
        </tr>`).join('');
        htmlCod += `<details class="carpeta carpeta-forma" data-k="${esc(kf)}"${_imcAbierto[kf] ? ' open' : ''}>
          <summary><span class="carpeta-ico">▸</span> ${esc(cod)} <span class="chip chip-normal">${regs.length}</span></summary>
          <div class="tabla-wrap"><table class="tabla">
            <thead><tr><th>Fecha</th><th>Nombre</th><th>Sexo</th><th class="num">Peso</th><th class="num">Talla</th><th class="num">IMC</th><th>Categoría</th><th>Registró</th></tr></thead>
            <tbody>${fil}</tbody></table></div>
        </details>`;
      }
      html += `<details class="carpeta carpeta-tipo" data-k="${esc(kt)}"${_imcAbierto[kt] ? ' open' : ''}>
        <summary><span class="carpeta-ico">▸</span> <b>${esc(est)}</b> <span class="chip chip-sobre">${nEst}</span></summary>
        <div style="padding-left:14px">${htmlCod}</div>
      </details>`;
    }
    return html;
  }

  function vistaEstudiosMol() {
    vista.innerHTML = `
      <style>
        #molArbol details { margin: 6px 0; }
        #molArbol summary { cursor:pointer; padding:9px 12px; border:1.5px solid var(--linea-fuerte); border-radius:var(--r-md); background:var(--acero-tenue); display:flex; align-items:center; gap:8px; list-style:none; font-size:.92rem; -webkit-user-select:none; user-select:none; }
        #molArbol summary::-webkit-details-marker { display:none; }
        #molArbol .carpeta-ico { display:inline-block; transition:transform .15s; color:var(--acero-hondo); font-size:.8rem; }
        #molArbol details[open] > summary .carpeta-ico { transform:rotate(90deg); }
        #molArbol .carpeta-forma > summary { background:#fff; }
      </style>
      <section class="panel" style="margin-bottom:20px">
        <div class="panel-cab"><div><h2>Por estudio</h2><div class="hint">Estudios hechos e IMC promedio de cada uno.</div></div></div>
        <div class="panel-cuerpo">${seccionPorEstudio(Datos.imc.todos())}</div>
      </section>
      <section class="panel">
        <div class="panel-cab" style="flex-wrap:wrap;gap:12px">
          <div><h2>Carpetas</h2><div class="hint" id="molConteo"></div></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <input id="molBuscar" type="search" placeholder="Buscar estudio, código o nombre…" style="padding:9px 12px;border:1.5px solid var(--linea-fuerte);border-radius:var(--r-md);font-family:var(--f-cuerpo);min-width:200px">
            <button class="btn btn-fantasma btn-sm" id="bExpandMol">Expandir</button>
            <button class="btn btn-fantasma btn-sm" id="bCollapseMol">Colapsar</button>
          </div>
        </div>
        <div class="panel-cuerpo"><div id="molArbol"></div></div>
      </section>`;
    const render = () => {
      const todos = Datos.imc.todos();
      const q = filtroMol.q.trim().toLowerCase();
      const lista = q ? todos.filter(r => (`${r.estudio || ''} ${r.codigo || ''} ${r.nombre || ''}`).toLowerCase().includes(q)) : todos;
      const nCarp = new Set(lista.map(r => _claveImc(r).kf)).size;
      $('#molConteo').textContent = `${lista.length} registro(s) de IMC · ${nCarp} carpeta(s)`;
      $('#molArbol').innerHTML = lista.length
        ? arbolImcRO(lista)
        : `<div class="tabla-vacia">${todos.length ? 'Ningún registro coincide con la búsqueda.' : 'Aún no hay registros de IMC. Captúralos en “Registro de IMC”.'}</div>`;
      $$('#molArbol details').forEach(d => d.addEventListener('toggle', () => { _imcAbierto[d.dataset.k] = d.open; }));
    };
    $('#molBuscar').addEventListener('input', e => { filtroMol.q = e.target.value; render(); });
    $('#molBuscar').value = filtroMol.q;
    $('#bExpandMol').addEventListener('click', () => { Datos.imc.todos().forEach(r => { const k = _claveImc(r); _imcAbierto[k.kt] = true; _imcAbierto[k.kf] = true; }); render(); });
    $('#bCollapseMol').addEventListener('click', () => { for (const k in _imcAbierto) delete _imcAbierto[k]; render(); });
    render();
    refrescarLista = render;
  }

  function vistaUsuarios() {
    if (!esAdmin) { irA('imc'); return; }
    vista.innerHTML = `
      <section class="panel">
        <div class="panel-cab">
          <div><h2>Usuarios del sistema</h2><div class="hint">Contraseñas cifradas con PBKDF2. Nunca en texto plano.</div></div>
          <div style="display:flex;gap:10px">
            <button class="btn btn-fantasma btn-sm" id="bExpUsr">Exportar usuarios.js</button>
            <button class="btn btn-primario btn-sm" id="bNuevoUsr">+ Usuario</button>
          </div>
        </div>
        <div class="panel-cuerpo" id="usrTabla"></div>
      </section>`;
    pintarUsuarios();
    $('#bNuevoUsr').addEventListener('click', modalNuevoUsuario);
    $('#bExpUsr').addEventListener('click', async () => {
      const b = $('#bExpUsr'); const t = b.textContent; b.disabled = true; b.textContent = 'Generando…';
      try {
        const lista = [];
        for (const u of Datos.usuarios.todos()) {
          const { _local, password, ...resto } = u;
          if (typeof password === 'string' && password) {
            const sal = resto.sal || Seguridad.generarSal();
            const iter = resto.iter || Seguridad.ITERACIONES;
            const hash = await Seguridad.hashPassword(sal, password, iter);
            lista.push({ ...resto, sal, hash, iter });
          } else {
            lista.push(resto);
          }
        }
        const datos = { esquema: 'hash = PBKDF2-HMAC-SHA256(contrasena, sal, iter)', usuarios: lista };
        const contenido = `window.DEBBIOM_USUARIOS = ${JSON.stringify(datos, null, 2)};\n`;
        Datos.exportarTexto('usuarios.js', contenido, 'text/javascript;charset=utf-8');
        toast('usuarios.js descargado (contraseñas cifradas).', 'ok');
      } finally { b.disabled = false; b.textContent = t; }
    });
  }

  function pintarUsuarios() {
    const us = Datos.usuarios.todos();
    const admins = us.filter(u => u.nivel === 'Administrador' && u.activo !== false).length;
    $('#usrTabla').innerHTML = `
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Usuario</th><th>Nivel</th><th>Estado</th><th style="text-align:right">Acciones</th></tr></thead>
        <tbody>${us.map(u => {
          const activo = u.activo !== false;
          const esYo = u.usuario === ses.usuario;
          return `<tr>
            <td><b>${Seguridad.escapar(u.usuario)}</b>${esYo ? ' <span class="chip chip-normal">tú</span>' : ''}</td>
            <td>${u.nivel === 'Administrador'
              ? '<span class="rol rol-admin" style="background:var(--ambar-suave);color:#855012">Administrador</span>'
              : '<span class="rol rol-empleado" style="background:var(--acero-suave);color:var(--acero-hondo)">Empleado</span>'}</td>
            <td><span class="pill-estado ${activo ? 'pill-on' : 'pill-off'}">${activo ? 'Activo' : 'Inactivo'}</span></td>
            <td style="text-align:right;white-space:nowrap">
              <button class="btn btn-fantasma btn-sm" data-toggle="${Seguridad.escapar(u.usuario)}" ${esYo ? 'disabled' : ''}>${activo ? 'Desactivar' : 'Activar'}</button>
              <button class="btn btn-peligro btn-sm" data-delu="${Seguridad.escapar(u.usuario)}" ${esYo ? 'disabled' : ''}>Eliminar</button>
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>`;

    $$('#usrTabla [data-toggle]').forEach(b => b.addEventListener('click', () => {
      const us2 = Datos.usuarios.todos();
      const u = us2.find(x => x.usuario === b.dataset.toggle);
      const activo = u.activo !== false;
      if (activo && u.nivel === 'Administrador' && admins <= 1) return toast('Debe quedar al menos un administrador activo.', 'error');
      u.activo = !activo;
      Datos.usuarios.guardar(us2);
      Datos.bitacora.registrar(u.activo ? 'Activó usuario' : 'Desactivó usuario', ses.usuario, ses.nivel, u.usuario);
      pintarUsuarios(); toast('Usuario actualizado.', 'ok');
    }));
    $$('#usrTabla [data-delu]').forEach(b => b.addEventListener('click', () => {
      const nombre = b.dataset.delu;
      const u = Datos.usuarios.todos().find(x => x.usuario === nombre);
      if (u.nivel === 'Administrador' && admins <= 1) return toast('No puedes eliminar al único administrador.', 'error');
      modal.abrir('Eliminar usuario', `<p>¿Eliminar al usuario <b>${Seguridad.escapar(nombre)}</b>? No podrá volver a iniciar sesión.</p>`,
        `<button class="btn btn-fantasma" id="mNo">Cancelar</button><button class="btn btn-peligro" id="mSi">Eliminar</button>`);
      $('#mNo').onclick = modal.cerrar;
      $('#mSi').onclick = () => {
        Datos.usuarios.guardar(Datos.usuarios.todos().filter(x => x.usuario !== nombre));
        Datos.bitacora.registrar('Eliminó usuario', ses.usuario, ses.nivel, nombre);
        modal.cerrar(); pintarUsuarios(); toast('Usuario eliminado. Recuerda exportar usuarios.js.', 'ok');
      };
    }));
  }

  function modalNuevoUsuario() {
    modal.abrir('Nuevo usuario', `
      <div class="campo"><label for="uNom">Usuario</label><input id="uNom" maxlength="30" autocomplete="off" placeholder="Ej. JPerez"></div>
      <div class="campo"><label for="uNivel">Nivel de acceso</label>
        <select id="uNivel"><option value="Empleado">Empleado</option><option value="Administrador">Administrador</option></select></div>
      <div class="campo password"><label for="uPwd">Contraseña</label>
        <div class="ctrl"><input id="uPwd" type="password" maxlength="64" autocomplete="new-password" placeholder="Mínimo 10 caracteres">
        <button type="button" class="ver-pwd" id="uVer" aria-label="Mostrar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg></button></div>
        <div class="ayuda">Debe incluir mayúscula, minúscula, número y símbolo.</div></div>
      <div id="credZone"></div>
    `, `<button class="btn btn-fantasma" id="mNo">Cancelar</button><button class="btn btn-primario" id="mSi">Crear usuario</button>`);
    $('#uVer').onclick = () => { const p = $('#uPwd'); p.type = p.type === 'password' ? 'text' : 'password'; };
    $('#mNo').onclick = modal.cerrar;
    $('#mSi').onclick = async () => {
      const cont = $('#modalCuerpo'); limpiarErrores(cont);
      const vNom = Seguridad.textoSeguro($('#uNom').value, { etiqueta: 'Usuario', min: 3, max: 30 });
      const pwd = $('#uPwd').value;
      const fza = Seguridad.fortalezaPassword(pwd);
      let ok = true;
      if (!vNom.ok) { marcarError('uNom', vNom.msg); ok = false; }
      else if (/\s/.test(vNom.valor)) { marcarError('uNom', 'El usuario no debe tener espacios.'); ok = false; }
      else if (Datos.usuarios.todos().some(u => u.usuario.toLowerCase() === vNom.valor.toLowerCase())) {
        marcarError('uNom', 'El usuario ya existe. Ingrese uno diferente.'); ok = false;
      }
      if (!fza.ok) { marcarError('uPwd', 'Falta: ' + fza.faltan.join(', ') + '.'); ok = false; }
      if (!ok) return;

      if (typeof Nube !== 'undefined' && Nube.autenticado()) {
        const btn = $('#mSi'); btn.disabled = true; btn.textContent = 'Creando…';
        const rc = await Nube.crearUsuario(vNom.valor, pwd, $('#uNivel').value);
        btn.disabled = false; btn.textContent = 'Crear usuario';
        if (!rc.ok) { marcarError('uNom', 'No se pudo crear en la nube: ' + rc.detalle); return; }
        Datos.bitacora.registrar('Alta de usuario', ses.usuario, ses.nivel, `${vNom.valor} (${$('#uNivel').value})`);
        $('#credZone').innerHTML = `<div class="credencial"><b>Usuario creado en la nube.</b><br>Ya puede iniciar sesión desde cualquier equipo con su usuario y contraseña.</div>`;
        $('#modalPie').innerHTML = `<button class="btn btn-primario" id="mListo">Listo</button>`;
        $('#mListo').onclick = () => { modal.cerrar(); toast('Usuario creado en la nube.', 'ok'); };
        return;
      }

      const sal = Seguridad.generarSal();
      const iter = Seguridad.ITERACIONES;
      const hash = await Seguridad.hashPassword(sal, pwd, iter);
      const nuevo = { usuario: vNom.valor, sal, hash, iter, nivel: $('#uNivel').value, activo: true, _local: true };
      const lista = Datos.usuarios.todos(); lista.push(nuevo); Datos.usuarios.guardar(lista);
      Datos.bitacora.registrar('Alta de usuario', ses.usuario, ses.nivel, `${nuevo.usuario} (${nuevo.nivel})`);
      $('#credZone').innerHTML = `<div class="credencial"><b>Usuario creado.</b><br>Para publicarlo usa <b>“Exportar usuarios.js”</b> y reemplaza <code>config/usuarios.js</code>.</div>`;
      $('#modalPie').innerHTML = `<button class="btn btn-primario" id="mListo">Listo</button>`;
      $('#mListo').onclick = () => { modal.cerrar(); pintarUsuarios(); toast('Usuario creado. Exporta usuarios.js para publicarlo.', 'ok'); };
    };
  }

  function vistaBitacora() {
    if (!esAdmin) { irA('imc'); return; }
    vista.innerHTML = `
      <section class="panel">
        <div class="panel-cab">
          <div><h2>Registro de eventos</h2><div class="hint" id="bitConteo"></div></div>
          <div style="display:flex;gap:10px;align-items:center">
            <select id="bitFiltro" style="padding:8px 12px;border:1.5px solid var(--linea-fuerte);border-radius:8px;font-family:var(--f-cuerpo)">
              <option value="">Todos los eventos</option>
              <option value="Ingreso">Ingresos</option>
              <option value="fallido">Ingresos fallidos</option>
              <option value="IMC">Estudios de IMC</option>
              <option value="contraseña">Contraseñas</option>
              <option value="usuario">Usuarios</option>
              <option value="respaldo">Respaldos</option>
            </select>
            <button class="btn btn-fantasma btn-sm" id="bExpBit">Exportar CSV</button>
          </div>
        </div>
        <div class="panel-cuerpo" id="bitTabla"></div>
      </section>`;
    const pintar = () => pintarBitacora($('#bitFiltro').value);
    $('#bitFiltro').addEventListener('change', pintar);
    $('#bExpBit').addEventListener('click', () => {
      const filas = Datos.bitacora.todos();
      if (!filas.length) return toast('No hay eventos para exportar.', 'error');
      Datos.exportarCSV('debbiom_bitacora.csv', [
        { titulo: 'Fecha y hora', valor: r => fechaHora(r.fecha) },
        { titulo: 'Evento', valor: r => r.evento },
        { titulo: 'Usuario', valor: r => r.usuario },
        { titulo: 'Nivel', valor: r => r.nivel },
        { titulo: 'Detalle', valor: r => r.detalle || '' },
      ], filas);
      toast('Bitácora exportada.', 'ok');
    });
    pintar();
  }

  function pintarBitacora(filtro) {
    let filas = Datos.bitacora.todos();
    if (filtro) filas = filas.filter(r => r.evento.toLowerCase().includes(filtro.toLowerCase()));
    $('#bitConteo').textContent = `${filas.length} evento(s)`;
    const color = ev => {
      if (ev.includes('fallido')) return 'chip-obes';
      if (ev.includes('Ingreso') || ev.includes('Alta') || ev.includes('Registro')) return 'chip-normal';
      if (ev.includes('Elimin') || ev.includes('Baja') || ev.includes('Desactiv')) return 'chip-sobre';
      return 'chip-bajo';
    };
    $('#bitTabla').innerHTML = filas.length ? `
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Fecha y hora</th><th>Evento</th><th>Usuario</th><th>Nivel</th><th>Detalle</th></tr></thead>
        <tbody>${filas.map(r => `<tr>
          <td class="mono" style="font-size:.8rem">${fechaHora(r.fecha)}</td>
          <td><span class="chip ${color(r.evento)}">${Seguridad.escapar(r.evento)}</span></td>
          <td>${Seguridad.escapar(r.usuario)}</td>
          <td>${Seguridad.escapar(r.nivel)}</td>
          <td>${Seguridad.escapar(r.detalle || '—')}</td>
        </tr>`).join('')}</tbody>
      </table></div>` : `<div class="tabla-vacia">Sin eventos que mostrar.</div>`;
  }

  function vistaPanel() {
    refrescarLista = vistaPanel;
    const estudios = Datos.imc.todos();
    const total = estudios.length;
    if (!total) {
      vista.innerHTML = `<section class="panel"><div class="panel-cuerpo"><div class="tabla-vacia">Aún no hay estudios. Registra el primero en “Registro de IMC”.</div></div></section>`;
      return;
    }
    const claves = new Set();
    estudios.forEach(r => { const k = String(r.expediente || r.nombre || '').trim().toLowerCase(); if (k) claves.add(k); });
    const pacientes = claves.size || '—';
    const prom = estudios.reduce((a, r) => a + r.imc, 0) / total;
    const porClase = { bajo: 0, normal: 0, sobre: 0, obes: 0 };
    estudios.forEach(r => { if (porClase[r.clase] !== undefined) porClase[r.clase]++; });
    const pctRiesgo = Math.round((porClase.sobre + porClase.obes) / total * 100);
    const porSexo = { Femenino: 0, Masculino: 0, 'Sin dato': 0 };
    estudios.forEach(r => { const s = (r.sexo === 'Femenino' || r.sexo === 'Masculino') ? r.sexo : 'Sin dato'; porSexo[s]++; });

    vista.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
        <button class="btn btn-primario btn-sm" id="bPanelPdf">Descargar reporte PDF</button>
      </div>
      <div class="rejilla" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin-bottom:20px">
        <div class="kpi"><div class="k-etq">Estudios</div><div class="k-val">${total}</div></div>
        <div class="kpi"><div class="k-etq">Pacientes</div><div class="k-val">${pacientes}</div></div>
        <div class="kpi"><div class="k-etq">IMC promedio</div><div class="k-val">${prom.toFixed(1)}</div></div>
        <div class="kpi ${pctRiesgo >= 50 ? 'alerta' : ''}"><div class="k-etq">Sobrepeso u obesidad</div><div class="k-val">${pctRiesgo}%</div></div>
      </div>
      <section class="panel" style="margin-bottom:20px">
        <div class="panel-cab"><div><h2>Por estudio</h2><div class="hint">Estudios hechos e IMC promedio de cada uno.</div></div></div>
        <div class="panel-cuerpo">${seccionPorEstudio(estudios)}</div>
      </section>
      <div class="rejilla dos" style="margin-bottom:20px">
        <section class="panel"><div class="panel-cab"><div><h2>Distribución por categoría</h2></div></div>
          <div class="panel-cuerpo">${donutCategorias(porClase, total)}</div></section>
        <section class="panel"><div class="panel-cab"><div><h2>Estudios por mes</h2></div></div>
          <div class="panel-cuerpo">${barrasMeses(estudios)}</div></section>
      </div>
      <div class="rejilla dos">
        <section class="panel"><div class="panel-cab"><div><h2>Por sexo</h2></div></div>
          <div class="panel-cuerpo">${barrasSexo(porSexo, total)}</div></section>
        <section class="panel"><div class="panel-cab"><div><h2>Estudios recientes</h2></div></div>
          <div class="panel-cuerpo">${tablaRecientes(estudios.slice(0, 6))}</div></section>
      </div>`;
    $('#bPanelPdf').addEventListener('click', reportePanelPDF);
  }

  const _paletaEst = ['var(--acero)', 'var(--imc-sobre)', 'var(--imc-normal)', 'var(--imc-obes)', 'var(--acero-hondo)', 'var(--imc-bajo)', '#8a6d3b', '#5b8a72', '#7d6b9e', '#b07d4b'];
  function pastelPorEstudio(estudios) {
    const esc = Seguridad.escapar;
    const total = estudios.length;
    if (!total) return `<div class="tabla-vacia">Sin estudios.</div>`;
    const mapa = new Map();
    estudios.forEach(r => { const e = String(r.estudio || '').trim() || '— sin estudio —'; mapa.set(e, (mapa.get(e) || 0) + 1); });
    const segs = [...mapa.entries()].sort((a, b) => b[1] - a[1]).map((e, i) => ({ etq: e[0], n: e[1], c: _paletaEst[i % _paletaEst.length] }));
    const cx = 90, cy = 90, r = 82;
    let ang = -Math.PI / 2;
    const wedges = segs.map(s => {
      const frac = s.n / total;
      if (segs.length === 1) return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${s.c}"/>`;
      const a2 = ang + frac * 2 * Math.PI;
      const x1 = cx + r * Math.cos(ang), y1 = cy + r * Math.sin(ang);
      const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
      const large = (a2 - ang) > Math.PI ? 1 : 0;
      const p = `<path d="M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${s.c}" stroke="#fff" stroke-width="1.5"/>`;
      ang = a2;
      return p;
    }).join('');
    const leyenda = segs.map(s => `<div style="display:flex;align-items:center;gap:8px;font-size:.86rem;margin:6px 0">
      <span style="width:12px;height:12px;border-radius:3px;background:${s.c};flex:none"></span>
      <span style="flex:1">${esc(s.etq)}</span>
      <b class="mono">${s.n}</b>
      <span style="color:var(--tinta-45);width:42px;text-align:right">${Math.round(s.n / total * 100)}%</span>
    </div>`).join('');
    return `<div style="display:flex;gap:24px;align-items:center;flex-wrap:wrap">
      <svg viewBox="0 0 180 180" style="width:180px;height:180px;flex:none" role="img" aria-label="Distribución de estudios por estudio">${wedges}</svg>
      <div style="flex:1;min-width:220px">${leyenda}</div>
    </div>`;
  }
  function pastelesPorCadaEstudio(estudios) {
    const esc = Seguridad.escapar;
    const mapa = new Map();
    estudios.forEach(r => {
      const e = String(r.estudio || '').trim() || '— sin estudio —';
      if (!mapa.has(e)) mapa.set(e, { n: 0, suma: 0, clase: { bajo: 0, normal: 0, sobre: 0, obes: 0 }, cod: new Set() });
      const g = mapa.get(e); g.n++; g.suma += Number(r.imc) || 0;
      if (g.clase[r.clase] !== undefined) g.clase[r.clase]++;
      if (r.codigo) g.cod.add(String(r.codigo).trim());
    });
    if (!mapa.size) return '';
    const cards = [...mapa.entries()].sort((a, b) => b[1].n - a[1].n).map(([est, g]) => `
      <div style="border:1px solid var(--linea-fuerte);border-radius:var(--r-md);padding:14px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:4px">
          <b>${esc(est)}</b>
          <span class="hint">${g.n} estudio(s) · IMC prom <b>${(g.suma / g.n).toFixed(1)}</b></span>
        </div>
        <div class="hint" style="margin-bottom:8px">${g.cod.size} molécula(s): ${[...g.cod].map(esc).join(', ') || '—'}</div>
        ${donutCategorias(g.clase, g.n)}
      </div>`).join('');
    return `<div style="margin-top:20px">
      <h3 style="margin:0 0 4px">Distribución por cada estudio</h3>
      <div class="hint" style="margin-bottom:12px">Categorías de IMC dentro de cada estudio.</div>
      <div class="rejilla" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px">${cards}</div>
    </div>`;
  }
  function seccionPorEstudio(estudios) {
    return `${pastelPorEstudio(estudios)}<div style="margin-top:18px">${tablaPorEstudio(estudios)}</div>${pastelesPorCadaEstudio(estudios)}`;
  }

  function tablaPorEstudio(estudios) {
    const esc = Seguridad.escapar;
    const mapa = new Map();
    estudios.forEach(r => {
      const e = String(r.estudio || '').trim() || '— sin estudio —';
      const c = String(r.codigo || '').trim() || 'sin código';
      if (!mapa.has(e)) mapa.set(e, { n: 0, suma: 0, cods: new Map() });
      const g = mapa.get(e); g.n++; g.suma += Number(r.imc) || 0;
      if (!g.cods.has(c)) g.cods.set(c, { n: 0, suma: 0 });
      const gc = g.cods.get(c); gc.n++; gc.suma += Number(r.imc) || 0;
    });
    if (!mapa.size) return `<div class="tabla-vacia">Sin estudios.</div>`;
    const ordenados = [...mapa.entries()].sort((a, b) => b[1].n - a[1].n);
    let filas = '';
    for (const [est, g] of ordenados) {
      filas += `<tr>
        <td><b>${esc(est)}</b></td>
        <td></td>
        <td class="num"><b>${g.n}</b></td>
        <td class="num"><b>${(g.suma / g.n).toFixed(1)}</b></td>
      </tr>`;
      const cods = [...g.cods.entries()].sort((a, b) => b[1].n - a[1].n);
      for (const [cod, gc] of cods) {
        filas += `<tr>
          <td style="padding-left:22px;color:var(--tinta-45)">↳</td>
          <td class="mono" style="font-size:.82rem">${esc(cod)}</td>
          <td class="num">${gc.n}</td>
          <td class="num">${(gc.suma / gc.n).toFixed(1)}</td>
        </tr>`;
      }
    }
    return `<div class="tabla-wrap"><table class="tabla">
      <thead><tr><th>Estudio</th><th>Código</th><th class="num">Estudios</th><th class="num">IMC promedio</th></tr></thead>
      <tbody>${filas}</tbody></table></div>`;
  }

  function donutCategorias(porClase, total) {
    const segs = [
      { c: 'var(--imc-bajo)', etq: 'Bajo peso', n: porClase.bajo },
      { c: 'var(--imc-normal)', etq: 'Peso normal', n: porClase.normal },
      { c: 'var(--imc-sobre)', etq: 'Sobrepeso', n: porClase.sobre },
      { c: 'var(--imc-obes)', etq: 'Obesidad', n: porClase.obes },
    ];
    const r = 54, cx = 70, cy = 70, circ = 2 * Math.PI * r;
    let off = 0;
    const arcos = segs.map(s => {
      if (!s.n) return '';
      const dash = (s.n / total) * circ;
      const el = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.c}" stroke-width="20" stroke-dasharray="${dash} ${circ - dash}" stroke-dashoffset="${-off}" transform="rotate(-90 ${cx} ${cy})"/>`;
      off += dash;
      return el;
    }).join('');
    const leyenda = segs.map(s => `<div style="display:flex;align-items:center;gap:8px;font-size:.86rem;margin:6px 0">
      <span style="width:12px;height:12px;border-radius:3px;background:${s.c};flex:none"></span>
      <span style="flex:1">${s.etq}</span>
      <b class="mono">${s.n}</b>
      <span style="color:var(--tinta-45);width:42px;text-align:right">${Math.round(s.n / total * 100)}%</span>
    </div>`).join('');
    return `<div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
      <svg viewBox="0 0 140 140" style="width:140px;height:140px;flex:none">${arcos}
        <text x="70" y="66" text-anchor="middle" font-size="26" font-family="monospace" font-weight="600" fill="var(--acero-hondo)">${total}</text>
        <text x="70" y="84" text-anchor="middle" font-size="10" fill="var(--tinta-45)">estudios</text>
      </svg>
      <div style="flex:1;min-width:180px">${leyenda}</div>
    </div>`;
  }

  function barrasMeses(estudios) {
    const meses = [];
    const hoy = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      meses.push({ clave: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), etq: d.toLocaleDateString('es-MX', { month: 'short' }), n: 0 });
    }
    const idx = Object.fromEntries(meses.map((m, i) => [m.clave, i]));
    estudios.forEach(r => {
      const f = (r.fechaEstudio || r.fecha || '').slice(0, 7);
      if (idx[f] !== undefined) meses[idx[f]].n++;
    });
    const max = Math.max(1, ...meses.map(m => m.n));
    const W = 460, H = 180, pad = 28, bw = (W - pad * 2) / meses.length;
    const barras = meses.map((m, i) => {
      const h = (m.n / max) * (H - pad - 24);
      const x = pad + i * bw + bw * 0.2, y = H - pad - h, w = bw * 0.6;
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="var(--acero)"/>
        <text x="${x + w / 2}" y="${y - 5}" text-anchor="middle" font-size="11" font-family="monospace" fill="var(--tinta-70)">${m.n || ''}</text>
        <text x="${x + w / 2}" y="${H - pad + 15}" text-anchor="middle" font-size="10" fill="var(--tinta-45)">${m.etq}</text>`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">
      <line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="var(--linea-fuerte)"/>${barras}</svg>`;
  }

  function barrasSexo(porSexo, total) {
    const filas = [
      { etq: 'Femenino', n: porSexo.Femenino, c: 'var(--acero)' },
      { etq: 'Masculino', n: porSexo.Masculino, c: 'var(--acero-hondo)' },
      { etq: 'Sin dato', n: porSexo['Sin dato'], c: 'var(--linea-fuerte)' },
    ];
    return filas.map(f => {
      const pct = Math.round(f.n / total * 100);
      return `<div style="margin:12px 0">
        <div style="display:flex;justify-content:space-between;font-size:.86rem;margin-bottom:4px"><span>${f.etq}</span><span class="mono">${f.n} · ${pct}%</span></div>
        <div style="height:12px;background:var(--acero-tenue);border-radius:6px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${f.c}"></div></div>
      </div>`;
    }).join('');
  }

  function tablaRecientes(filas) {
    const chip = { bajo: 'chip-bajo', normal: 'chip-normal', sobre: 'chip-sobre', obes: 'chip-obes' };
    return `<div class="tabla-wrap"><table class="tabla">
      <thead><tr><th>Fecha</th><th>Paciente</th><th class="num">IMC</th><th>Categoría</th><th>Registró</th></tr></thead>
      <tbody>${filas.map(r => `<tr>
        <td>${fechaCorta(r.fechaEstudio || r.fecha)}</td>
        <td>${Seguridad.escapar(r.nombre || r.expediente || '—')}</td>
        <td class="num"><b>${r.imc.toFixed(2)}</b></td>
        <td><span class="chip ${chip[r.clase]}">${Seguridad.escapar(r.categoria)}</span></td>
        <td class="mono" style="font-size:.78rem;color:var(--tinta-45)">${Seguridad.escapar(r.usuario || '—')}</td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  function sectorPDF(doc, cx, cy, r, a0, a1, col) {
    doc.setFillColor(col[0], col[1], col[2]);
    const paso = 0.09;
    for (let a = a0; a < a1 - 1e-9; a += paso) {
      const b = Math.min(a + paso, a1);
      doc.triangle(cx, cy, cx + r * Math.cos(a), cy + r * Math.sin(a), cx + r * Math.cos(b), cy + r * Math.sin(b), 'F');
    }
  }

  async function reportePanelPDF() {
    const estudios = Datos.imc.todos();
    if (!estudios.length) return toast('No hay estudios para el reporte.', 'error');
    const btn = $('#bPanelPdf'); const txt = btn.textContent; btn.disabled = true; btn.textContent = 'Generando…';
    try {
      await cargarPDF();
      const JsPDF = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : window.jsPDF;
      if (!JsPDF) throw new Error('librería no cargada');
      const doc = new JsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40;
      const C = {
        bajo: [59, 125, 184], normal: [46, 158, 107], sobre: [201, 154, 34], obes: [193, 90, 59],
        acero: [15, 110, 126], hondo: [10, 77, 87], tenue: [241, 247, 247],
        tinta: [11, 32, 39], gris: [107, 123, 128], linea: [189, 203, 203], peligro: [193, 73, 59]
      };

      const total = estudios.length;
      const claves = new Set();
      estudios.forEach(r => { const k = String(r.expediente || r.nombre || '').trim().toLowerCase(); if (k) claves.add(k); });
      const pacientes = claves.size || total;
      const prom = estudios.reduce((a, r) => a + r.imc, 0) / total;
      const porClase = { bajo: 0, normal: 0, sobre: 0, obes: 0 };
      estudios.forEach(r => { if (porClase[r.clase] !== undefined) porClase[r.clase]++; });
      const pctRiesgo = Math.round((porClase.sobre + porClase.obes) / total * 100);
      const porSexo = { Femenino: 0, Masculino: 0, 'Sin dato': 0 };
      estudios.forEach(r => { const s = (r.sexo === 'Femenino' || r.sexo === 'Masculino') ? r.sexo : 'Sin dato'; porSexo[s]++; });

      const empresaNom = (Auth.getEmpresa() && Auth.getEmpresa().nombre) || 'Debbiom';
      const ahora = new Date().toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

      doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(...C.hondo);
      doc.text(empresaNom + ' — Reporte de IMC', M, 46);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...C.gris);
      doc.text('Generado: ' + ahora + '   ·   Por: ' + ses.usuario, M, 63);
      doc.setDrawColor(...C.linea); doc.line(M, 72, W - M, 72);

      const kpis = [['ESTUDIOS', String(total), false], ['PACIENTES', String(pacientes), false],
        ['IMC PROMEDIO', prom.toFixed(1), false], ['SOBREPESO U OBESIDAD', pctRiesgo + '%', pctRiesgo >= 50]];
      const gap = 10, kw = (W - M * 2 - gap * 3) / 4, ky = 88, kh = 56;
      kpis.forEach((k, i) => {
        const x = M + i * (kw + gap);
        doc.setFillColor(...(k[2] ? [249, 235, 233] : C.tenue)); doc.roundedRect(x, ky, kw, kh, 4, 4, 'F');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...C.gris);
        doc.text(k[0], x + 10, ky + 17, { maxWidth: kw - 16 });
        doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...(k[2] ? C.peligro : C.hondo));
        doc.text(k[1], x + 10, ky + 44);
      });

      let y = ky + kh + 32;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...C.tinta);
      doc.text('Distribución por categoría', M, y);
      const cx = M + 78, cy = y + 92, r = 66;
      const segs = [
        { c: C.bajo, etq: 'Bajo peso', n: porClase.bajo },
        { c: C.normal, etq: 'Peso normal', n: porClase.normal },
        { c: C.sobre, etq: 'Sobrepeso', n: porClase.sobre },
        { c: C.obes, etq: 'Obesidad', n: porClase.obes },
      ];
      let ang = -Math.PI / 2;
      segs.forEach(s => { if (!s.n) return; const a1 = ang + (s.n / total) * 2 * Math.PI; sectorPDF(doc, cx, cy, r, ang, a1, s.c); ang = a1; });
      doc.setFillColor(255, 255, 255); doc.circle(cx, cy, r * 0.58, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(19); doc.setTextColor(...C.hondo);
      doc.text(String(total), cx, cy + 3, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...C.gris);
      doc.text('estudios', cx, cy + 16, { align: 'center' });
      let ly = cy - 34; const lx = cx + r + 34;
      segs.forEach(s => {
        doc.setFillColor(...s.c); doc.roundedRect(lx, ly - 8, 10, 10, 2, 2, 'F');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...C.tinta);
        doc.text(s.etq, lx + 18, ly);
        doc.setFont('helvetica', 'bold'); doc.text(String(s.n), lx + 168, ly, { align: 'right' });
        doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.gris);
        doc.text(Math.round(s.n / total * 100) + '%', lx + 205, ly, { align: 'right' });
        ly += 22;
      });

      y = cy + r + 40;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...C.tinta);
      doc.text('Estudios por mes', M, y);
      const meses = [];
      const hoy = new Date();
      for (let i = 5; i >= 0; i--) { const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1); meses.push({ clave: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), etq: d.toLocaleDateString('es-MX', { month: 'short' }), n: 0 }); }
      const idx = Object.fromEntries(meses.map((m, i) => [m.clave, i]));
      estudios.forEach(r => { const f = (r.fechaEstudio || r.fecha || '').slice(0, 7); if (idx[f] !== undefined) meses[idx[f]].n++; });
      const maxN = Math.max(1, ...meses.map(m => m.n));
      const chX = M, chY = y + 12, chW = W - M * 2, chH = 116, baseY = chY + chH;
      doc.setDrawColor(...C.linea); doc.line(chX, baseY, chX + chW, baseY);
      const bw = chW / meses.length;
      meses.forEach((m, i) => {
        const h = (m.n / maxN) * (chH - 18);
        const x = chX + i * bw + bw * 0.25, w = bw * 0.5, by = baseY - h;
        doc.setFillColor(...C.acero); doc.roundedRect(x, by, w, Math.max(h, 0.5), 2, 2, 'F');
        if (m.n) { doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...C.tinta); doc.text(String(m.n), x + w / 2, by - 4, { align: 'center' }); }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...C.gris); doc.text(m.etq, x + w / 2, baseY + 13, { align: 'center' });
      });

      y = baseY + 36;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...C.tinta);
      doc.text('Por sexo', M, y);
      y += 16;
      const sx = [['Femenino', porSexo.Femenino, C.acero], ['Masculino', porSexo.Masculino, C.hondo], ['Sin dato', porSexo['Sin dato'], C.linea]];
      const trackW = W - M * 2;
      sx.forEach(f => {
        const pct = f[1] / total;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...C.tinta);
        doc.text(f[0], M, y);
        doc.setTextColor(...C.gris); doc.text(f[1] + '  ·  ' + Math.round(pct * 100) + '%', W - M, y, { align: 'right' });
        y += 5;
        doc.setFillColor(...C.tenue); doc.roundedRect(M, y, trackW, 8, 4, 4, 'F');
        if (pct > 0) { doc.setFillColor(...f[2]); doc.roundedRect(M, y, Math.max(4, trackW * pct), 8, 4, 4, 'F'); }
        y += 22;
      });

      y += 10;
      if (y > H - 130) { doc.addPage(); y = 50; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...C.tinta);
      doc.text('Estudios recientes', M, y);
      const body = estudios.slice(0, 12).map(r => [fechaCorta(r.fechaEstudio || r.fecha), r.nombre || r.expediente || '—', r.imc.toFixed(2), r.categoria]);
      const auto = (typeof doc.autoTable === 'function') ? (o) => doc.autoTable(o)
        : (window.jspdf && typeof window.jspdf.autoTable === 'function') ? (o) => window.jspdf.autoTable(doc, o) : null;
      if (auto) auto({
        head: [['Fecha', 'Paciente', 'IMC', 'Categoría']], body, startY: y + 8, margin: { left: M, right: M },
        styles: { fontSize: 9, cellPadding: 5, lineColor: C.linea, lineWidth: 0.5 },
        headStyles: { fillColor: C.acero, textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: C.tenue }, columnStyles: { 2: { halign: 'right', fontStyle: 'bold' } }
      });

      const pags = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pags; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(...C.gris); doc.text('Debbiom · Documento interno', M, H - 18); doc.text('Página ' + i + ' de ' + pags, W - M, H - 18, { align: 'right' }); }

      doc.save('debbiom_reporte_' + new Date().toISOString().slice(0, 10) + '.pdf');
      Datos.bitacora.registrar('Exportó reporte PDF', ses.usuario, ses.nivel, total + ' estudio(s)');
      toast('Reporte PDF descargado.', 'ok');
    } catch (e) {
      toast('No se pudo generar el reporte (' + (e.message || e) + ').', 'error');
    } finally { btn.disabled = false; btn.textContent = txt; }
  }

  irA('panel');
}
window.arrancarApp = arrancarApp;
