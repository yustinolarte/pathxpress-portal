/* PATHXPRESS Customer Portal — tab switching + interactions */
(function () {
  var titles = {
    overview: 'Resumen', analytics: 'Analíticas', orders: 'Mis pedidos',
    returns: 'Devoluciones y cambios', tracking: 'Rastrear envío', calculator: 'Calculadora de tarifas',
    international: 'Internacional', invoices: 'Facturas', cod: 'COD', reports: 'Reportes', guide: 'Guía'
  };
  var items = Array.prototype.slice.call(document.querySelectorAll('.sb-item[data-tab]'));
  var panes = Array.prototype.slice.call(document.querySelectorAll('.tabpane'));
  var title = document.getElementById('page-title');

  function show(tab, clickedItem) {
    var has = document.getElementById('tab-' + tab);
    var realTab = has ? tab : 'overview';
    panes.forEach(function (p) { p.classList.toggle('show', p.id === 'tab-' + realTab); });
    items.forEach(function (x) { x.classList.remove('active'); });
    if (clickedItem) clickedItem.classList.add('active');
    title.textContent = titles[tab] || 'Resumen';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  items.forEach(function (it) { it.addEventListener('click', function () { show(it.dataset.tab, it); }); });
  document.querySelectorAll('[data-tab-link]').forEach(function (b) {
    b.addEventListener('click', function () {
      var tab = b.dataset.tabLink;
      var target = items.filter(function (it) { return it.dataset.tab === tab; })[0];
      show(tab, target);
    });
  });

  document.querySelectorAll('.pfaq .q').forEach(function (q) {
    q.addEventListener('click', function () {
      var it = q.parentElement, a = it.querySelector('.a'), open = it.classList.contains('open');
      it.parentElement.querySelectorAll('.it.open').forEach(function (o) { o.classList.remove('open'); o.querySelector('.a').style.maxHeight = null; });
      if (!open) { it.classList.add('open'); a.style.maxHeight = a.scrollHeight + 'px'; }
    });
  });
  document.querySelectorAll('.pfaq .it.open .a').forEach(function (a) { a.style.maxHeight = a.scrollHeight + 'px'; });

  document.querySelectorAll('.seg').forEach(function (seg) {
    seg.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () { seg.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); });
    });
  });
  document.querySelectorAll('.guide-nav a').forEach(function (a) {
    a.addEventListener('click', function () { document.querySelectorAll('.guide-nav a').forEach(function (x) { x.classList.remove('on'); }); a.classList.add('on'); });
  });

  // rate calculator demo
  var calcBtn = document.getElementById('calcBtn');
  if (calcBtn) {
    calcBtn.addEventListener('click', function () {
      document.getElementById('calcResult').style.display = 'grid';
    });
  }

  // tracking demo: reveal timeline on search
  var trackBtn = document.getElementById('trackBtn');
  if (trackBtn) {
    trackBtn.addEventListener('click', function () {
      var r = document.getElementById('trackResult');
      if (r) r.style.display = 'block';
    });
  }
})();
