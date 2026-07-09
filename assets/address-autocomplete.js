/* Delt adresse-autocomplete mot Kartverket/Geonorge. Tilstands-agnostisk.
   Bruk: initAddressAutocomplete(inputEl, { onSelect(structured), onInput(text) }) */
(function () {
  var ENDPOINT = 'https://ws.geonorge.no/adresser/v1/sok';

  function mapItem(a) {
    var p = a.representasjonspunkt || {};
    return {
      adressetekst: a.adressetekst || '',
      postnummer: a.postnummer || '',
      poststed: a.poststed || '',
      kommunenummer: a.kommunenummer || '',
      kommunenavn: a.kommunenavn || '',
      lat: typeof p.lat === 'number' ? p.lat : null,
      lon: typeof p.lon === 'number' ? p.lon : null
    };
  }

  window.initAddressAutocomplete = function (input, opts) {
    opts = opts || {};
    if (!input || input.__aaInit) return;   // idempotent per element
    input.__aaInit = true;
    input.setAttribute('autocomplete', 'off');

    // Nedtrekksliste i normal flyt rett etter inputen (unngår overflow-klipping i modal).
    var box = document.createElement('div');
    box.style.cssText = 'display:none;margin-top:4px;border:1px solid #ddd;border-radius:10px;overflow:hidden;background:#fff;box-shadow:0 8px 24px rgba(0,0,0,.12)';
    input.insertAdjacentElement('afterend', box);

    var items = [], active = -1, timer = null, lastQuery = '';

    function close() { box.style.display = 'none'; box.innerHTML = ''; items = []; active = -1; }

    function render() {
      if (!items.length) { close(); return; }
      box.innerHTML = '';
      items.forEach(function (it, i) {
        var row = document.createElement('div');
        row.textContent = it.adressetekst + (it.poststed ? '  ·  ' + it.postnummer + ' ' + it.poststed : '');
        row.style.cssText = 'padding:10px 12px;cursor:pointer;font-size:14px;' + (i === active ? 'background:#f0f0f0' : '');
        row.addEventListener('mousedown', function (e) { e.preventDefault(); choose(i); });
        box.appendChild(row);
      });
      box.style.display = 'block';
    }

    function choose(i) {
      var it = items[i]; if (!it) return;
      input.value = it.adressetekst;
      close();
      if (opts.onSelect) opts.onSelect(it);
    }

    function search(q) {
      var url = ENDPOINT + '?sok=' + encodeURIComponent(q) + '&treffPerSide=8&asciiKompatibel=true';
      fetch(url).then(function (r) { return r.ok ? r.json() : { adresser: [] }; })
        .then(function (data) {
          if (input.value.trim() !== q) return;         // ignorer utdaterte svar
          items = (data.adresser || []).map(mapItem);
          active = -1; render();
        })
        .catch(function () { /* stille: fritekst-fallback dekker */ });
    }

    input.addEventListener('input', function () {
      var q = input.value.trim();
      if (opts.onInput) opts.onInput(input.value);
      if (timer) clearTimeout(timer);
      if (q.length < 3) { close(); return; }
      if (q === lastQuery) return;
      lastQuery = q;
      timer = setTimeout(function () { search(q); }, 250);
    });

    input.addEventListener('keydown', function (e) {
      if (box.style.display === 'none') return;
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, items.length - 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); render(); }
      else if (e.key === 'Enter') { if (active >= 0) { e.preventDefault(); choose(active); } }
      else if (e.key === 'Escape') { close(); }
    });

    input.addEventListener('blur', function () { setTimeout(close, 150); });
  };
})();
