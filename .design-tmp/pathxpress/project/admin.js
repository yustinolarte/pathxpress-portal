/* PATHXPRESS Admin — tab switching + section interactions */
(function () {
  var titles = {
    overview: 'Resumen', clients: 'Clientes', orders: 'Todos los pedidos',
    drivers: 'Conductores', billing: 'Facturación', cod: 'Cobros COD',
    rates: 'Tarifas y precios', international: 'Internacional', reports: 'Reportes',
    requests: 'Solicitudes', messages: 'Mensajes', guide: 'Guía'
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

  items.forEach(function (it) {
    it.addEventListener('click', function () { show(it.dataset.tab, it); });
  });
  document.querySelectorAll('[data-tab-link]').forEach(function (b) {
    b.addEventListener('click', function () {
      var tab = b.dataset.tabLink;
      var target = items.filter(function (it) { return it.dataset.tab === tab; })[0];
      show(tab, target);
    });
  });

  // FAQ accordions (portal style)
  document.querySelectorAll('.pfaq .q').forEach(function (q) {
    q.addEventListener('click', function () {
      var it = q.parentElement;
      var a = it.querySelector('.a');
      var open = it.classList.contains('open');
      it.parentElement.querySelectorAll('.it.open').forEach(function (o) {
        o.classList.remove('open'); o.querySelector('.a').style.maxHeight = null;
      });
      if (!open) { it.classList.add('open'); a.style.maxHeight = a.scrollHeight + 'px'; }
    });
  });
  // init open faq
  document.querySelectorAll('.pfaq .it.open .a').forEach(function (a) { a.style.maxHeight = a.scrollHeight + 'px'; });

  // segmented controls (visual toggle)
  document.querySelectorAll('.seg').forEach(function (seg) {
    seg.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        seg.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
      });
    });
  });

  // guide nav active + smooth scroll within article
  document.querySelectorAll('.guide-nav a').forEach(function (a) {
    a.addEventListener('click', function () {
      document.querySelectorAll('.guide-nav a').forEach(function (x) { x.classList.remove('on'); });
      a.classList.add('on');
    });
  });

  // message list selection
  document.querySelectorAll('.msg-li').forEach(function (m) {
    m.addEventListener('click', function () {
      document.querySelectorAll('.msg-li').forEach(function (x) { x.classList.remove('on'); });
      m.classList.add('on');
      var u = m.querySelector('.unread'); if (u) u.remove();
    });
  });
})();
