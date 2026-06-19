/* PATHXPRESS redesign — interactions */
(function () {
  // Header solidify on scroll
  var hdr = document.getElementById('hdr');
  function onScroll() {
    if (window.scrollY > 16) hdr.classList.add('is-stuck');
    else hdr.classList.remove('is-stuck');
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Scroll reveal
  var reveals = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  function revealAll() { reveals.forEach(function (el) { el.classList.add('in'); }); }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
    reveals.forEach(function (el, i) {
      el.style.transitionDelay = (Math.min(i % 6, 5) * 50) + 'ms';
      io.observe(el);
    });
    // Reveal above-the-fold immediately so nothing flashes empty on load.
    requestAnimationFrame(function () {
      reveals.forEach(function (el) {
        if (el.getBoundingClientRect().top < window.innerHeight * 0.95) el.classList.add('in');
      });
    });
    // Safety net: never leave content hidden.
    setTimeout(revealAll, 1800);
  } else {
    revealAll();
  }

  // FAQ accordion
  document.querySelectorAll('.faq-q').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var item = btn.parentElement;
      var ans = item.querySelector('.faq-a');
      var isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(function (o) {
        o.classList.remove('open');
        o.querySelector('.faq-a').style.maxHeight = null;
      });
      if (!isOpen) {
        item.classList.add('open');
        ans.style.maxHeight = ans.scrollHeight + 'px';
      }
    });
  });

  // Tracking demo
  var track = document.getElementById('track');
  if (track) {
    track.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = track.querySelector('input');
      if (!input.value.trim()) {
        track.style.transition = 'transform .08s';
        track.style.transform = 'translateX(-5px)';
        setTimeout(function () { track.style.transform = 'translateX(5px)'; }, 80);
        setTimeout(function () { track.style.transform = 'none'; }, 160);
        input.focus();
      }
    });
  }

  // Smooth anchor focus (close mobile noop)
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function () {});
  });
})();
