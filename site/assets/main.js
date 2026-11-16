/* 2punt0 — progressive enhancement. Zonder JS blijven alle pagina's en formulieren bruikbaar. */
(function () {
  'use strict';
  var d = document, root = d.documentElement;
  var $ = function (s, c) { return (c || d).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); };

  /* Skip link */
  var main = $('#main'), skip = $('.skip');
  if (skip && main) skip.addEventListener('click', function (e) { e.preventDefault(); main.focus(); main.scrollIntoView(); });

  /* Thema licht/donker */
  function syncTheme() {
    var dark = root.getAttribute('data-theme') === 'dark';
    $$('.theme-btn').forEach(function (b) { b.setAttribute('aria-pressed', dark ? 'true' : 'false'); });
    var m = $('meta[name="theme-color"]'); if (m) m.setAttribute('content', dark ? '#15132A' : '#FBF9F6');
  }
  $$('.theme-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      syncTheme();
    });
  });
  syncTheme();

  /* Mobiel menu */
  var toggle = $('.nav-toggle'), nav = $('#site-nav');
  function setMenu(open) {
    if (!toggle || !nav) return;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    $('.sr', toggle).textContent = open ? 'Sluit menu' : 'Open menu';
    nav.classList.toggle('open', open);
    d.body.classList.toggle('lock', open);
  }
  if (toggle && nav) {
    toggle.addEventListener('click', function () { setMenu(toggle.getAttribute('aria-expanded') !== 'true'); });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && nav.classList.contains('open')) { setMenu(false); toggle.focus(); } });
    window.matchMedia('(min-width:1280px)').addEventListener('change', function (m) { if (m.matches) setMenu(false); });
  }

  /* Submenu's */
  var subs = $$('.has-sub');
  subs.forEach(function (li) {
    var b = $('.sub-toggle', li); if (!b) return;
    function set(o) { b.setAttribute('aria-expanded', o ? 'true' : 'false'); li.classList.toggle('open', o); }
    b.addEventListener('click', function () { set(b.getAttribute('aria-expanded') !== 'true'); });
    li.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && (li.classList.contains('open') || li.matches(':hover,:focus-within'))) {
        set(false); li.setAttribute('data-dismissed', ''); b.focus(); e.stopPropagation();
      }
    });
    li.addEventListener('mouseleave', function () { li.removeAttribute('data-dismissed'); });
    li.addEventListener('focusout', function (e) { if (!li.contains(e.relatedTarget)) { set(false); li.removeAttribute('data-dismissed'); } });
  });
  d.addEventListener('click', function (e) { subs.forEach(function (li) { if (li.classList.contains('open') && !li.contains(e.target)) { li.classList.remove('open'); var b = $('.sub-toggle', li); if (b) b.setAttribute('aria-expanded', 'false'); } }); });

  /* Tekstteller */
  $$('textarea[maxlength]').forEach(function (t) {
    var out = d.getElementById(t.id + '-count'); if (!out) return;
    var upd = function () { out.textContent = t.value.length + ' van ' + t.getAttribute('maxlength') + ' tekens'; };
    t.addEventListener('input', upd); upd();
  });

  /* ---------- Validatie ---------- */
  function msgFor(c) {
    var v = c.validity;
    if (v.valueMissing) return c.type === 'checkbox' ? 'Dit vakje is verplicht.' : 'Vul dit veld in.';
    if (v.typeMismatch) return c.type === 'email' ? 'Vul een geldig e-mailadres in, bijvoorbeeld naam@voorbeeld.nl.' : 'Vul een geldige waarde in.';
    if (v.rangeUnderflow || v.rangeOverflow) return 'Vul een getal in tussen ' + c.min + ' en ' + c.max + '.';
    if (v.customError) return c.validationMessage;
    if (v.patternMismatch) return c.getAttribute('data-pattern-msg') || 'Controleer dit veld.';
    return 'Controleer dit veld.';
  }
  function setErr(box, msg) {
    var err = $('.err', box); if (!err) return;
    var ctl = $('input,select,textarea', box);
    if (msg) {
      box.classList.add('invalid'); err.textContent = msg;
      if (ctl && !box.classList.contains('fieldset')) { ctl.setAttribute('aria-invalid', 'true'); }
    } else {
      box.classList.remove('invalid'); err.textContent = '';
      if (ctl) ctl.removeAttribute('aria-invalid');
    }
  }
  function visible(el) { return !el.closest('[hidden]') && !el.disabled; }
  function validate(scope) {
    var first = null;
    $$('.field', scope).forEach(function (f) {
      var c = $('input,select,textarea', f);
      if (!c || !visible(c)) { setErr(f, ''); return; }
      if (c.type === 'hidden') return;
      if (c.checkValidity()) setErr(f, ''); else { setErr(f, msgFor(c)); if (!first) first = c; }
    });
    $$('.fieldset[data-group]', scope).forEach(function (g) {
      if (!visible(g)) { setErr(g, ''); return; }
      var kind = g.getAttribute('data-group'); var inputs = $$('input', g); var ok;
      if (kind === 'radio') ok = inputs.some(function (i) { return i.checked; });
      else ok = inputs.some(function (i) { return i.checked; });
      if (ok) setErr(g, ''); else { setErr(g, kind === 'radio' ? 'Kies een van de opties.' : 'Kies minstens één optie.'); if (!first) first = inputs[0]; }
    });
    return first;
  }
  d.addEventListener('input', function (e) {
    var b = e.target.closest && e.target.closest('.field.invalid, .fieldset.invalid'); if (b && !b.contains(e.target)) return;
    if (b && b.classList.contains('field')) { var c = $('input,select,textarea', b); if (c && c.checkValidity()) setErr(b, ''); }
    if (b && b.classList.contains('fieldset') && $$('input', b).some(function (i) { return i.checked; })) setErr(b, '');
  });

  /* ---------- Voorwaardelijke velden ---------- */
  function applyConditions(form) {
    $$('[data-show-if]', form).forEach(function (el) {
      var parts = el.getAttribute('data-show-if').split('=');
      var checked = form.querySelector('input[name="' + parts[0] + '"]:checked');
      var show = !!checked && checked.value === parts[1];
      el.hidden = !show;
      $$('input,select,textarea', el).forEach(function (c) { c.disabled = !show; });
    });
  }

  /* ---------- Handtekening ---------- */
  function sigSetup(form) {
    var canvas = $('.sig-pad', form); if (!canvas) return null;
    var ctx = canvas.getContext('2d'); var ink = false, drawing = false, last = null;
    function size() {
      var r = canvas.getBoundingClientRect(); if (!r.width) return;
      var ratio = window.devicePixelRatio || 1, w = Math.round(r.width * ratio), h = Math.round(r.height * ratio);
      if (canvas.width === w && canvas.height === h) return;
      canvas.width = w; canvas.height = h; ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111'; ink = false;
    }
    function pos(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    canvas.addEventListener('pointerdown', function (e) { size(); drawing = true; last = pos(e); canvas.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.arc(last.x, last.y, 1.2, 0, 6.3); ctx.fill(); ink = true; e.preventDefault(); });
    canvas.addEventListener('pointermove', function (e) { if (!drawing) return; var p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; ink = true; });
    ['pointerup', 'pointercancel'].forEach(function (n) { canvas.addEventListener(n, function () { drawing = false; }); });
    var clear = $('.sig-clear', form);
    if (clear) clear.addEventListener('click', function () { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.restore(); ink = false; });
    return { size: size, hasInk: function () { return ink; }, canvas: canvas };
  }

  /* ---------- Bestanden ---------- */
  $$('.field[data-files]').forEach(function (box) {
    var inp = $('input[type=file]', box), list = $('.file-list', box);
    var max = +box.getAttribute('data-max-files'), mb = +box.getAttribute('data-max-mb');
    function fmt(n) { return n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' kB'; }
    inp.addEventListener('change', function () {
      var fs = Array.prototype.slice.call(inp.files), tot = fs.reduce(function (a, f) { return a + f.size; }, 0), msg = '';
      if (fs.length > max) msg = 'Kies maximaal ' + max + ' bestanden.';
      else if (tot > mb * 1048576) msg = 'De bestanden zijn samen te groot. Maximaal ' + mb + ' MB.';
      inp.setCustomValidity(msg);
      list.innerHTML = '';
      fs.forEach(function (f) { var li = d.createElement('li'); li.textContent = f.name + ' (' + fmt(f.size) + ')'; list.appendChild(li); });
      setErr(box, msg);
    });
  });

  /* ---------- Formulieren ---------- */
  function initForm(form) {
    form.setAttribute('novalidate', '');
    var steps = $$('.step', form), idx = 0;
    var progress = $('.progress', form), pText = progress && $('p', progress), pBar = progress && $('.bar span', progress);
    var prev = $('[data-prev]', form), next = $('[data-next]', form), submit = $('[type=submit]', form);
    var sig = sigSetup(form);
    var done = form.parentNode.querySelector('[data-done]'), failed = form.parentNode.querySelector('[data-failed]');

    $$('input[type=radio]', form).forEach(function (r) { r.addEventListener('change', function () { applyConditions(form); updateSigMode(); }); });
    applyConditions(form);

    function updateSigMode() {
      var m = form.querySelector('input[name="handtekening_methode"]:checked'); if (!m) return;
      var typed = $('[data-sig-typed]', form), drawn = $('[data-sig-drawn]', form);
      var isDraw = m.value === 'tekenen';
      if (typed) { typed.hidden = isDraw; $$('input', typed).forEach(function (c) { c.disabled = isDraw; }); }
      if (drawn) { drawn.hidden = !isDraw; if (isDraw && sig) setTimeout(sig.size, 0); }
    }
    updateSigMode();

    function show(i, focus) {
      if (!steps.length) return;
      idx = Math.max(0, Math.min(steps.length - 1, i));
      steps.forEach(function (s, n) { s.hidden = n !== idx; });
      if (progress) {
        pText.textContent = 'Stap ' + (idx + 1) + ' van ' + steps.length + ': ' + $('legend', steps[idx]).textContent;
        pBar.style.width = ((idx + 1) / steps.length * 100) + '%';
      }
      if (prev) prev.hidden = idx === 0;
      if (next) next.hidden = idx === steps.length - 1;
      if (submit) submit.hidden = idx !== steps.length - 1;
      if (focus) { var lg = $('legend', steps[idx]); lg.setAttribute('tabindex', '-1'); lg.focus(); var top = form.getBoundingClientRect().top + window.scrollY - 100; if (form.closest('dialog')) lg.scrollIntoView({ block: 'start' }); else window.scrollTo({ top: top }); }
      if (sig && steps[idx].querySelector('.sig-pad')) setTimeout(sig.size, 0);
    }
    if (steps.length) {
      steps.forEach(function (s, n) { s.hidden = n !== 0; });
      show(0, false);
      if (prev) prev.addEventListener('click', function () { show(idx - 1, true); });
      if (next) next.addEventListener('click', function () { var bad = validate(steps[idx]); if (bad) { bad.focus(); return; } show(idx + 1, true); });
    }

    function sigCheck() {
      var m = form.querySelector('input[name="handtekening_methode"]:checked');
      if (m && m.value === 'tekenen' && sig && !sig.hasInk()) {
        var box = $('[data-sig-drawn]', form); setErr(box, 'Zet je handtekening in het vak, of kies voor typen.'); return sig.canvas;
      }
      return null;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (steps.length && idx < steps.length - 1) { next.click(); return; }
      var bad = validate(form), badSig = sigCheck();
      if (bad || badSig) {
        if (steps.length) { for (var n = 0; n < steps.length; n++) { if (steps[n].querySelector('.invalid')) { show(n, false); break; } } }
        (bad || badSig).focus(); return;
      }
      var fd = new FormData(form); fd.delete('bot-field');
      var isDraw = (form.querySelector('input[name="handtekening_methode"]:checked') || {}).value === 'tekenen';
      var go = function (body, headers) {
        var btn = submit; if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
        fetch('/', { method: 'POST', headers: headers, body: body }).then(function (r) { if (!r.ok) throw new Error(r.status); finish(true); }).catch(function () { finish(false); }).then(function () { if (btn) { btn.disabled = false; btn.removeAttribute('aria-busy'); } });
      };
      if (isDraw && sig) {
        sig.canvas.toBlob(function (blob) { fd.set('handtekening', blob, 'handtekening.png'); fd.set('handtekening_getypt', ''); go(fd, undefined); }, 'image/png');
      } else if ($$('input[type=file]', form).some(function (i) { return !i.hidden && i.files && i.files.length; })) {
        fd.delete('handtekening'); go(fd, undefined);
      } else {
        $$('input[type=file]', form).forEach(function (i) { fd.delete(i.name); });
        go(new URLSearchParams(fd).toString(), { 'Content-Type': 'application/x-www-form-urlencoded' });
      }
    });
    function finish(ok) {
      var target = ok ? done : failed; if (!target) return;
      if (ok) { form.hidden = true; if (progress) progress.hidden = true; if (failed) failed.hidden = true; }
      target.hidden = false; target.setAttribute('tabindex', '-1'); target.focus(); target.scrollIntoView({ block: 'center' });
      if (ok) { var ev = new CustomEvent('form-sent', { bubbles: true }); form.dispatchEvent(ev); }
    }
  }
  $$('form[data-form]').forEach(function (f, i, all) {
    // dezelfde formuliernaam in de ASH-dialoog: eerste instantie krijgt gedrag
    initForm(f);
  });

  /* ---------- Keuze op aanmeldpagina ---------- */
  var tabs = $$('[data-tab]');
  if (tabs.length) {
    var panels = $$('[data-panel]');
    var pick = function (id, scroll) {
      var ok = false;
      tabs.forEach(function (t) { var on = t.getAttribute('data-tab') === id; if (on) ok = true; t.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      if (!ok) return;
      panels.forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== id; });
      if (scroll) { var p = $('[data-panel="' + id + '"]'); var h = $('h2', p); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } p.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    };
    panels.forEach(function (p) { p.hidden = true; });
    tabs.forEach(function (t) { t.addEventListener('click', function () { pick(t.getAttribute('data-tab'), true); }); });
    var h0 = (location.hash || '').replace('#', ''); if (h0) pick(h0, false);
    window.addEventListener('hashchange', function () { pick((location.hash || '').replace('#', ''), true); });
  }

  /* ---------- ASH dialoog ---------- */
  var dlg = $('#ash-dialog'), lastOpener = null;
  if (dlg && typeof dlg.showModal === 'function') {
    var s1 = $('[data-ash-step="1"]', dlg), s2 = $('[data-ash-step="2"]', dlg);
    function setAshStep(n, focus) {
      s1.hidden = n !== 1; s2.hidden = n !== 2;
      if (focus) { var h = $(n === 1 ? '#ash-title' : '#ash-form-title', dlg); h.setAttribute('tabindex', '-1'); h.focus(); dlg.scrollTop = 0; }
    }
    function openAsh(opener) {
      lastOpener = opener || d.activeElement; setMenu(false);
      if (!dlg.open) dlg.showModal(); d.body.classList.add('lock');
      var h = $('#ash-title', dlg); h.setAttribute('tabindex', '-1'); h.focus();
    }
    $$('[data-ash-open]').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); openAsh(a); }); });
    $$('[data-ash-close]', dlg).forEach(function (b) { b.addEventListener('click', function () { dlg.close(); }); });
    var go2 = $('[data-ash-yes]', dlg); if (go2) go2.addEventListener('click', function () { setAshStep(2, true); });
    var back = $('[data-ash-back]', dlg); if (back) back.addEventListener('click', function () { setAshStep(1, true); });
    dlg.addEventListener('close', function () { d.body.classList.remove('lock'); if (lastOpener && lastOpener.focus) lastOpener.focus(); });
    if (location.hash === '#ash-aanvragen') openAsh(null);
  }
})();
