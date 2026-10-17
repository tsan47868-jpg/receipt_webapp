(function () {
  "use strict";
  var $ = function (id) {
    return document.getElementById(id);
  };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pad(n, w) {
    n = String(n);
    while (n.length < w) n = "0" + n;
    return n;
  }

  /* ---------- Storage ---------- */
  var storageOk = true;
  function lsGet(k, d) {
    try {
      var v = localStorage.getItem("rp2_" + k);
      return v ? JSON.parse(v) : d;
    } catch (e) {
      storageOk = false;
      return d;
    }
  }
  function lsSet(k, v) {
    try {
      localStorage.setItem("rp2_" + k, JSON.stringify(v));
    } catch (e) {
      storageOk = false;
    }
  }
  var S = {
    shop: lsGet("shop", null),
    history: lsGet("history", []),
    products: lsGet("products", {}),
    counters: lsGet("counters", {}),
    prefs: lsGet("prefs", { paper: "80" }),
  };
  function save() {
    lsSet("shop", S.shop);
    lsSet("history", S.history);
    lsSet("products", S.products);
    lsSet("counters", S.counters);
    lsSet("prefs", S.prefs);
    $("storageWarn").hidden = storageOk;
  }

  /* ---------- Config ---------- */
  var CUR = {
    KES: 2,
    UGX: 0,
    TZS: 0,
    RWF: 0,
    SSP: 2,
    ETB: 2,
    NGN: 2,
    GHS: 2,
    ZAR: 2,
    USD: 2,
  };
  var TYPES = {
    sale: {
      label: "Sales receipt",
      title: "SALES RECEIPT",
      prefix: "S",
      party: "Customer",
      items: true,
      priceKey: "sell",
      stock: -1,
      pay: true,
      payAmt: true,
      vat: true,
      legend: "Products sold",
      nameLabel: "Product",
      priceLabel: "Unit price",
      payLegend: "Payment",
      payAmtLabel: "Amount received",
      hint: "Sell products to a customer. Stock goes down.",
    },
    restock: {
      label: "Restock purchase",
      title: "PURCHASE RECEIPT",
      prefix: "P",
      party: "Supplier",
      items: true,
      priceKey: "buy",
      stock: 1,
      pay: true,
      payAmt: true,
      vat: true,
      legend: "Products bought",
      nameLabel: "Product",
      priceLabel: "Buying price each",
      payLegend: "Payment to supplier",
      payAmtLabel: "Amount paid to supplier",
      hint: "Record goods you bought from a supplier. Stock goes up, and it shows what you still owe.",
    },
    balance: {
      label: "Balance payment",
      title: "BALANCE PAYMENT",
      prefix: "B",
      party: "Customer",
      partyReq: true,
      items: false,
      fields: "balance",
      pay: true,
      payAmt: false,
      payLegend: "Payment",
      hint: "A customer pays part of what they owe. The receipt shows the remaining balance.",
    },
    deposit: {
      label: "Deposit receipt",
      title: "DEPOSIT RECEIPT",
      prefix: "D",
      party: "Customer",
      partyReq: true,
      items: false,
      fields: "deposit",
      pay: true,
      payAmt: false,
      payLegend: "Payment",
      hint: "A customer pays in advance. The receipt shows the balance still to pay.",
    },
    refund: {
      label: "Refund or return",
      title: "REFUND RECEIPT",
      prefix: "R",
      party: "Customer",
      items: true,
      priceKey: "sell",
      stock: 1,
      fields: "refund",
      pay: true,
      payAmt: false,
      vat: true,
      legend: "Products returned",
      nameLabel: "Product",
      priceLabel: "Unit price",
      payLegend: "Refund method",
      hint: "A customer returns goods and gets money back. Stock goes up.",
    },
    quote: {
      label: "Quotation",
      title: "QUOTATION",
      prefix: "Q",
      party: "Customer",
      items: true,
      priceKey: "sell",
      stock: 0,
      fields: "quote",
      pay: false,
      vat: true,
      legend: "Products quoted",
      nameLabel: "Product",
      priceLabel: "Unit price",
      hint: "A price offer for a customer. It is not a receipt and no payment is taken.",
    },
    expense: {
      label: "Expense voucher",
      title: "EXPENSE VOUCHER",
      prefix: "E",
      party: "Paid to",
      items: true,
      priceKey: null,
      stock: 0,
      pay: true,
      payAmt: false,
      legend: "Expense items",
      nameLabel: "Description",
      priceLabel: "Amount",
      payLegend: "Paid by",
      hint: "Record money the shop spent, such as transport, rent or airtime.",
    },
  };
  var ORDER = ["sale", "restock", "balance", "deposit", "refund", "quote", "expense"];
  var SAMPLE = [
    ["Maize flour 2kg", 190, 165, 24],
    ["Sugar 1kg", 160, 140, 18],
    ["Cooking oil 1L", 320, 285, 12],
    ["Milk 500ml", 60, 50, 30],
    ["Bar soap", 50, 38, 40],
  ];

  /* ---------- State ---------- */
  var view = "new",
    type = "sale",
    items = [],
    stageRec = null,
    selId = null,
    busy = false,
    draftCode = "",
    priceAuto = true;
  var shopForm = { src: null, thr: 150, bw: null };

  /* ---------- Helpers ---------- */
  function cur() {
    return (S.shop && S.shop.currency) || "KES";
  }
  function fmt(n, c) {
    var d = CUR[c || cur()];
    if (d == null) d = 2;
    return Number(n || 0).toLocaleString("en-KE", {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    });
  }
  function num(id) {
    var v = parseFloat($(id).value);
    return isNaN(v) ? null : v;
  }
  function key(s) {
    return String(s).trim().toLowerCase();
  }
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast.t);
    toast.t = setTimeout(function () {
      t.classList.remove("show");
    }, 3200);
  }
  function arm(btn, label, action) {
    var orig = btn.textContent;
    btn.addEventListener("click", function () {
      if (btn.dataset.armed === "1") {
        btn.dataset.armed = "0";
        btn.textContent = orig;
        clearTimeout(btn._t);
        action();
        return;
      }
      btn.dataset.armed = "1";
      btn.textContent = label;
      clearTimeout(btn._t);
      btn._t = setTimeout(function () {
        btn.dataset.armed = "0";
        btn.textContent = orig;
      }, 4000);
    });
    btn._reset = function () {
      btn.dataset.armed = "0";
      btn.textContent = orig;
    };
  }
  function dt(ts) {
    var d = new Date(ts);
    return {
      date: d.toLocaleDateString("en-KE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      time: d.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" }),
    };
  }

  /* ---------- Code 39 barcode, different for every receipt ---------- */
  var C39 = {
    0: "nnnwwnwnn",
    1: "wnnwnnnnw",
    2: "nnwwnnnnw",
    3: "wnwwnnnnn",
    4: "nnnwwnnnw",
    5: "wnnwwnnnn",
    6: "nnwwwnnnn",
    7: "nnnwnnwnw",
    8: "wnnwnnwnn",
    9: "nnwwnnwnn",
    A: "wnnnnwnnw",
    B: "nnwnnwnnw",
    C: "wnwnnwnnn",
    D: "nnnnwwnnw",
    E: "wnnnwwnnn",
    F: "nnwnwwnnn",
    G: "nnnnnwwnw",
    H: "wnnnnwwnn",
    I: "nnwnnwwnn",
    J: "nnnnwwwnn",
    K: "wnnnnnnww",
    L: "nnwnnnnww",
    M: "wnwnnnnwn",
    N: "nnnnwnnww",
    O: "wnnnwnnwn",
    P: "nnwnwnnwn",
    Q: "nnnnnnwww",
    R: "wnnnnnwwn",
    S: "nnwnnnwwn",
    T: "nnnnwnwwn",
    U: "wwnnnnnnw",
    V: "nwwnnnnnw",
    W: "wwwnnnnnn",
    X: "nwnnwnnnw",
    Y: "wwnnwnnnn",
    Z: "nwwnwnnnn",
    "*": "nwnnwnwnn",
  };
  function makeCode(t, no) {
    var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
      r = "",
      buf = null;
    try {
      buf = new Uint8Array(4);
      crypto.getRandomValues(buf);
    } catch (e) {
      buf = null;
    }
    for (var i = 0; i < 4; i++) {
      var v = buf ? buf[i] : Math.floor(Math.random() * 256);
      r += chars.charAt(v % chars.length);
    }
    return TYPES[t].prefix + pad(no, 4) + r;
  }
  function barcode(text) {
    var full = "*" + text + "*",
      x = 0,
      bars = "";
    for (var i = 0; i < full.length; i++) {
      var pat = C39[full.charAt(i)];
      if (!pat) continue;
      for (var j = 0; j < 9; j++) {
        var w = pat.charAt(j) === "w" ? 3 : 1;
        if (j % 2 === 0)
          bars += '<rect x="' + x + '" y="0" width="' + w + '" height="40" fill="#000"/>';
        x += w;
      }
      x += 1;
    }
    return (
      '<svg class="barcode" viewBox="0 0 ' +
      x +
      ' 40" preserveAspectRatio="none" aria-hidden="true">' +
      bars +
      "</svg>"
    );
  }

  /* ---------- Logo to black and white ---------- */
  function makeBW(src, thr, cb) {
    var im = new Image();
    im.onload = function () {
      var c = document.createElement("canvas");
      c.width = im.width;
      c.height = im.height;
      var x = c.getContext("2d");
      x.fillStyle = "#fff";
      x.fillRect(0, 0, c.width, c.height);
      x.drawImage(im, 0, 0);
      var d = x.getImageData(0, 0, c.width, c.height),
        p = d.data;
      for (var i = 0; i < p.length; i += 4) {
        var l = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2],
          v = l < thr ? 0 : 255;
        p[i] = v;
        p[i + 1] = v;
        p[i + 2] = v;
        p[i + 3] = 255;
      }
      x.putImageData(d, 0, 0);
      cb(c.toDataURL("image/png"));
    };
    im.onerror = function () {
      cb(null);
    };
    im.src = src;
  }
  function loadLogoFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      showShopMsg("Choose an image file (PNG or JPG).");
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      showShopMsg("That image is too large. Choose one under 6 MB.");
      return;
    }
    var fr = new FileReader();
    fr.onload = function () {
      var im = new Image();
      im.onload = function () {
        var maxW = 420,
          maxH = 240,
          s = Math.min(1, maxW / im.width, maxH / im.height);
        var c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(im.width * s));
        c.height = Math.max(1, Math.round(im.height * s));
        var x = c.getContext("2d");
        x.fillStyle = "#fff";
        x.fillRect(0, 0, c.width, c.height);
        x.drawImage(im, 0, 0, c.width, c.height);
        shopForm.src = c.toDataURL("image/jpeg", 0.9);
        shopMsgHide();
        refreshLogoPreview();
      };
      im.onerror = function () {
        showShopMsg("That image could not be read. Try another file.");
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  }
  function refreshLogoPreview() {
    var box = $("logoPrev");
    if (!shopForm.src) {
      shopForm.bw = null;
      box.innerHTML = "<span>No logo yet</span>";
      $("thrWrap").hidden = true;
      $("logoRemove").hidden = true;
      return;
    }
    $("thrWrap").hidden = false;
    $("logoRemove").hidden = false;
    makeBW(shopForm.src, shopForm.thr, function (url) {
      shopForm.bw = url;
      box.innerHTML = url
        ? '<img alt="Logo preview" src="' + url + '">'
        : "<span>Could not read image</span>";
    });
  }

  /* ---------- Totals ---------- */
  function compute(r) {
    var T = TYPES[r.type],
      f = r.f;
    r.total = 0;
    r.count = 0;
    r.vatAmt = 0;
    r.remaining = 0;
    if (T.items) {
      r.items.forEach(function (it) {
        r.total += it.price * it.qty;
        r.count += it.qty;
      });
      var rate = (r.shop && r.shop.vatRate) || 0;
      if (r.vatOn && rate > 0) r.vatAmt = r.total - r.total / (1 + rate / 100);
    }
    if (r.type === "balance") {
      r.total = f.pay || 0;
      r.remaining = Math.max(0, (f.prev || 0) - (f.pay || 0));
    }
    if (r.type === "deposit") {
      r.total = f.dep || 0;
      r.remaining = Math.max(0, (f.agreed || 0) - (f.dep || 0));
    }
    return r;
  }
  function shopSnap() {
    var s = S.shop || {};
    return {
      name: s.name || "",
      phone: s.phone || "",
      place: s.place || "",
      email: s.email || "",
      pin: s.pin || "",
      currency: s.currency || "KES",
      vatRate: s.vatRate || 0,
      footer: s.footer || "",
      terms: s.terms || "",
    };
  }
  function collect() {
    var T = TYPES[type];
    var r = {
      type: type,
      items: items.map(function (i) {
        return { name: i.name, price: i.price, qty: i.qty };
      }),
      party: $("party").value.trim(),
      partyPhone: $("partyPhone").value.trim(),
      method: $("method").value,
      ref: $("ref").value.trim(),
      note: $("note").value.trim(),
      servedBy: $("servedBy").value.trim(),
      paid: num("paid"),
      vatOn: !!(T.vat && $("vat").checked && S.shop && S.shop.vatRate > 0),
      shop: shopSnap(),
      f: {},
    };
    if (type === "balance") {
      r.f.prev = num("bPrev");
      r.f.pay = num("bPay");
      r.f.orig = $("bOrig").value.trim();
    }
    if (type === "deposit") {
      r.f.what = $("dWhat").value.trim();
      r.f.agreed = num("dAgreed");
      r.f.dep = num("dPaid");
    }
    if (type === "refund") {
      r.f.orig = $("rOrig").value.trim();
      r.f.reason = $("rReason").value.trim();
    }
    if (type === "quote") {
      r.f.days = parseInt($("qDays").value, 10) || 14;
    }
    if (!T.pay) r.method = "";
    return compute(r);
  }
  function liveRec() {
    var r = collect();
    r.no = (S.counters[type] || 0) + 1;
    r.code = draftCode;
    r.ts = Date.now();
    return r;
  }

  /* ---------- Receipt HTML ---------- */
  function receiptHTML(r, o) {
    o = o || {};
    var T = TYPES[r.type],
      s = r.shop,
      c = s.currency,
      f = function (n) {
        return fmt(n, c);
      };
    function kv(a, b, cls) {
      return (
        '<div class="kv' +
        (cls ? " " + cls : "") +
        '"><span>' +
        esc(a) +
        "</span><span>" +
        esc(b) +
        "</span></div>"
      );
    }
    function big(a, b) {
      return '<div class="ln big"><span>' + esc(a) + "</span><span>" + esc(b) + "</span></div>";
    }
    var rule = '<hr class="rule">',
      h = "";
    if (S.shop && S.shop.logoBW) h += '<img class="logo" alt="" src="' + S.shop.logoBW + '">';
    h += '<div class="c shop">' + esc(s.name || "Your shop") + "</div>";
    if (s.place) h += '<div class="c small">' + esc(s.place) + "</div>";
    if (s.phone) h += '<div class="c small">Tel: ' + esc(s.phone) + "</div>";
    if (s.email) h += '<div class="c small">' + esc(s.email) + "</div>";
    if (s.pin) h += '<div class="c small">PIN: ' + esc(s.pin) + "</div>";
    h += '<hr class="rule dbl">';
    h += '<div class="c title">' + esc(T.title) + "</div>";
    if (o.dup) h += '<div class="c small">** DUPLICATE COPY **</div>';
    h += rule;
    var d = dt(r.ts);
    h += kv("No.", T.prefix + "-" + pad(r.no, 5));
    h += kv("Date", d.date + " " + d.time);
    if (r.servedBy) h += kv("Served by", r.servedBy);
    if (r.party) h += kv(T.party, r.party);
    if (r.partyPhone) h += kv("Phone", r.partyPhone);
    h += rule;

    if (T.items) {
      if (!r.items.length) h += '<div class="c">No items yet</div>';
      r.items.forEach(function (it) {
        h +=
          '<div class="ln"><span class="nm">' +
          esc(it.name) +
          "</span><span>" +
          f(it.price * it.qty) +
          "</span></div>";
        if (r.type !== "expense" || it.qty !== 1)
          h += '<div class="sub small">' + it.qty + " x " + f(it.price) + "</div>";
      });
      h += rule;
      if (r.type !== "expense") h += kv("Items", r.count);
      if (r.vatAmt > 0) h += kv("VAT " + s.vatRate + "% incl.", f(r.vatAmt));
      var tl = {
        sale: "TOTAL",
        restock: "TOTAL COST",
        refund: "TOTAL REFUND",
        quote: "TOTAL",
        expense: "TOTAL SPENT",
      }[r.type];
      h += big(tl + " " + c, f(r.total));
      h += rule;
    }

    if (r.type === "sale") {
      h += kv("Paid by", r.method);
      if (r.ref) h += kv("Code", r.ref.toUpperCase());
      if (r.paid != null && r.paid > 0) {
        h += kv("Received", f(r.paid));
        if (r.paid >= r.total) h += kv("Change", f(r.paid - r.total));
        else h += big("BALANCE DUE", f(r.total - r.paid));
      }
    }
    if (r.type === "restock") {
      var paid = r.paid == null ? r.total : r.paid;
      h += kv("Paid by", r.method);
      if (r.ref) h += kv("Code", r.ref.toUpperCase());
      h += kv("Paid to supplier", f(paid));
      if (paid < r.total) h += big("BALANCE OWED", f(r.total - paid));
      else h += '<div class="stamp">PAID IN FULL</div>';
    }
    if (r.type === "refund") {
      h += kv("Refunded by", r.method);
      if (r.ref) h += kv("Code", r.ref.toUpperCase());
      if (r.f.orig) h += kv("Original receipt", r.f.orig);
      if (r.f.reason) h += kv("Reason", r.f.reason);
    }
    if (r.type === "quote") {
      var until = new Date(r.ts + r.f.days * 86400000).toLocaleDateString("en-KE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      h += kv("Valid until", until);
      h +=
        '<div class="c small" style="margin-top:6px">This is a quotation. It is not a receipt.</div>';
    }
    if (r.type === "expense") {
      h += kv("Paid by", r.method);
      if (r.ref) h += kv("Code", r.ref.toUpperCase());
    }
    if (r.type === "balance") {
      h += kv("Balance before", f(r.f.prev || 0));
      h += big("PAID NOW " + c, f(r.f.pay || 0));
      h += rule;
      h += big("REMAINING " + c, f(r.remaining));
      if (r.remaining === 0) h += '<div class="stamp">FULLY PAID</div>';
      h += rule;
      h += kv("Paid by", r.method);
      if (r.ref) h += kv("Code", r.ref.toUpperCase());
      if (r.f.orig) h += kv("For receipt", r.f.orig);
    }
    if (r.type === "deposit") {
      if (r.f.what) h += '<div class="nm">For: ' + esc(r.f.what) + "</div>";
      h += rule;
      h += kv("Agreed price", f(r.f.agreed || 0));
      h += big("DEPOSIT PAID " + c, f(r.f.dep || 0));
      h += big("BALANCE " + c, f(r.remaining));
      h += rule;
      h += kv("Paid by", r.method);
      if (r.ref) h += kv("Code", r.ref.toUpperCase());
    }
    if (r.note) {
      h += rule;
      h += '<div class="nm">Note: ' + esc(r.note) + "</div>";
    }
    h += rule;
    if (r.type === "restock") {
      h += '<div class="sign">Supplier signature</div><div class="sign">Received by</div>';
    } else if (r.type === "expense") {
      h += '<div class="sign">Approved by</div><div class="sign">Received by</div>';
    } else if (r.type === "deposit") {
      h += '<div class="sign">Customer signature</div>';
    } else {
      if (s.footer) h += '<div class="c">' + esc(s.footer) + "</div>";
      if (r.type === "sale" && s.terms) h += '<div class="c small">' + esc(s.terms) + "</div>";
    }
    h += barcode(r.code || "X");
    h += '<div class="c small">' + esc(r.code || "") + "</div>";
    return h;
  }

  /* ---------- Stage (printer + receipt) ---------- */
  function selectedRec() {
    for (var i = 0; i < S.history.length; i++) if (S.history[i].id === selId) return S.history[i];
    return null;
  }
  function renderStage() {
    var rec = null,
      live = false;
    if (view === "new") {
      if (stageRec) {
        rec = stageRec;
      } else {
        rec = liveRec();
        live = true;
      }
    } else if (view === "history") {
      rec = selectedRec();
    }
    var rc = $("receipt");
    rc.classList.toggle("w58", S.prefs.paper === "58");
    if (!rec) {
      rc.hidden = true;
      $("stageEmpty").hidden = false;
      $("stageNote").textContent = "";
    } else {
      rc.hidden = false;
      $("stageEmpty").hidden = true;
      rc.innerHTML = receiptHTML(rec, { dup: !live && rec.printedOnce });
      $("stageNote").textContent = live
        ? "Live preview. The receipt number is fixed when you print."
        : "Saved in history.";
    }
    $("reprintBtn").hidden = !rec || live;
    var showDel = view === "history" && !!rec;
    $("delBtn").hidden = !showDel;
    if ($("delBtn")._reset) $("delBtn")._reset();
    $("paper").value = S.prefs.paper || "80";
  }

  /* ---------- Printing ---------- */
  function animatePrint(done) {
    var rc = $("receipt"),
      pr = $("printer"),
      reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    busy = true;
    $("printBtn").disabled = true;
    $("reprintBtn").disabled = true;
    var ended = false;
    function finish() {
      if (ended) return;
      ended = true;
      pr.classList.remove("busy");
      busy = false;
      $("printBtn").disabled = false;
      $("reprintBtn").disabled = false;
      done();
    }
    if (reduce || !rc.animate) {
      finish();
      return;
    }
    pr.classList.add("busy");
    var h = rc.offsetHeight,
      dur = Math.min(6500, 1400 + h * 5);
    var a = rc.animate([{ transform: "translateY(-100%)" }, { transform: "translateY(0)" }], {
      duration: dur,
      easing: "steps(" + Math.max(8, Math.round(h / 5)) + ", end)",
    });
    a.onfinish = finish;
    a.oncancel = finish;
  }
  function printOut(rec, dup) {
    var root = $("printRoot"),
      paper = S.prefs.paper || "80";
    root.innerHTML =
      '<article class="receipt' +
      (paper === "58" ? " w58" : "") +
      '">' +
      receiptHTML(rec, { dup: dup }) +
      "</article>";
    var css;
    if (paper === "a4") {
      css = "@page{size:A4;margin:10mm}";
      document.documentElement.style.setProperty("--print-w", "80mm");
    } else {
      var w = paper === "58" ? 58 : 80;
      document.documentElement.style.setProperty("--print-w", w + "mm");
      root.classList.add("measure");
      var mm = Math.ceil((root.firstChild.offsetHeight * 25.4) / 96) + 8;
      root.classList.remove("measure");
      css = "@page{size:" + w + "mm " + mm + "mm;margin:0}";
    }
    $("pageStyle").textContent = css;
    setTimeout(function () {
      window.print();
    }, 150);
  }

  /* ---------- Stock and commit ---------- */
  function updateStock(r) {
    var T = TYPES[r.type];
    if (!T.items || !T.stock) return;
    r.items.forEach(function (it) {
      var k = key(it.name),
        p = S.products[k];
      if (!p) {
        p = S.products[k] = { name: it.name, sell: 0, buy: 0, stock: 0 };
        if (r.type === "restock") p.buy = it.price;
        else p.sell = it.price;
      }
      if (r.type === "sale") p.stock = Math.max(0, (p.stock || 0) - it.qty);
      else p.stock = (p.stock || 0) + it.qty;
      if (r.type === "restock") p.buy = it.price;
    });
  }
  function commit(rec) {
    S.counters[rec.type] = rec.no;
    S.history.unshift(rec);
    updateStock(rec);
    save();
    updateBadge();
    refreshCatalogue();
  }
  function validate(r) {
    var T = TYPES[r.type];
    if (T.items && !r.items.length) return "Add at least one item before printing.";
    if (T.partyReq && !r.party) return "Enter the customer name.";
    if (r.type === "balance") {
      if (!(r.f.prev > 0)) return "Enter the balance owed before this payment.";
      if (!(r.f.pay > 0)) return "Enter the amount paid now.";
      if (r.f.pay > r.f.prev) return "The payment is more than the balance owed.";
    }
    if (r.type === "deposit") {
      if (!r.f.what) return "Say what the deposit is for.";
      if (!(r.f.agreed > 0)) return "Enter the agreed total price.";
      if (!(r.f.dep > 0)) return "Enter the deposit paid now.";
      if (r.f.dep > r.f.agreed) return "The deposit is more than the agreed price.";
    }
    return "";
  }
  function showMsg(m) {
    var e = $("formMsg");
    e.textContent = m;
    e.hidden = !m;
  }

  function printNew() {
    if (busy) return;
    var rec = collect(),
      err = validate(rec);
    if (err) {
      showMsg(err);
      return;
    }
    showMsg("");
    rec.no = (S.counters[rec.type] || 0) + 1;
    rec.code = makeCode(rec.type, rec.no);
    rec.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    rec.ts = Date.now();
    stageRec = rec;
    renderStage();
    animatePrint(function () {
      commit(rec);
      resetForm();
      toast("Saved to history as " + TYPES[rec.type].prefix + "-" + pad(rec.no, 5));
      printOut(rec, false);
    });
  }
  function reprint() {
    if (busy) return;
    var rec = view === "history" ? selectedRec() : stageRec;
    if (!rec) return;
    rec.printedOnce = true;
    renderStage();
    animatePrint(function () {
      printOut(rec, true);
    });
  }

  /* ---------- New receipt form ---------- */
  function buildTypePicker() {
    var box = $("typePicker");
    box.innerHTML = "";
    ORDER.forEach(function (k) {
      var b = document.createElement("button");
      b.type = "button";
      b.dataset.type = k;
      b.innerHTML = "<i>" + TYPES[k].prefix + "</i><span>" + esc(TYPES[k].label) + "</span>";
      b.addEventListener("click", function () {
        if (busy) return;
        setType(k);
      });
      box.appendChild(b);
    });
  }
  function setType(k) {
    type = k;
    items = [];
    stageRec = null;
    showMsg("");
    draftCode = makeCode(type, (S.counters[type] || 0) + 1);
    [
      "pname",
      "pprice",
      "party",
      "partyPhone",
      "ref",
      "paid",
      "note",
      "bPrev",
      "bPay",
      "bOrig",
      "dWhat",
      "dAgreed",
      "dPaid",
      "rOrig",
      "rReason",
    ].forEach(function (id) {
      $(id).value = "";
    });
    $("pqty").value = "1";
    $("qDays").value = "14";
    $("servedBy").value = (S.shop && S.shop.cashier) || "";
    $("vat").checked = !!(S.shop && S.shop.vatRate > 0);
    priceAuto = true;
    applyType();
    renderItems();
    renderStage();
  }
  function applyType() {
    var T = TYPES[type];
    [].forEach.call($("typePicker").children, function (b) {
      b.setAttribute("aria-pressed", b.dataset.type === type ? "true" : "false");
    });
    $("typeHint").textContent = T.hint;
    $("partyLegend").textContent = T.party;
    $("partyLabel").textContent = T.party + (T.partyReq ? " name" : " name (optional)");
    $("fsItems").hidden = !T.items;
    if (T.items) {
      $("itemsLegend").textContent = T.legend;
      $("nameLabel").textContent = T.nameLabel;
      $("priceLabel").textContent = T.priceLabel;
      $("totalLabel").textContent = {
        sale: "Total",
        restock: "Total cost",
        refund: "Total refund",
        quote: "Quote total",
        expense: "Total spent",
      }[type];
      $("pname").placeholder = type === "expense" ? "e.g. Transport to market" : "e.g. Sugar 1kg";
    }
    ["balance", "deposit", "refund", "quote"].forEach(function (k) {
      $("fs" + k.charAt(0).toUpperCase() + k.slice(1)).hidden = T.fields !== k;
    });
    $("fsPay").hidden = !T.pay;
    if (T.pay) {
      $("payLegend").textContent = T.payLegend;
      $("payAmtWrap").hidden = !T.payAmt;
      if (T.payAmt) $("payAmtLabel").textContent = T.payAmtLabel;
      $("paid").placeholder =
        type === "restock" ? "Leave empty if paid in full" : "Leave empty if paid in full";
    }
    var vatOn = !!(T.vat && S.shop && S.shop.vatRate > 0);
    $("vatWrap").hidden = !vatOn;
    if (vatOn) $("vatLabel").textContent = "Prices include VAT (" + S.shop.vatRate + "%)";
    $("refWrap").hidden = !(T.pay && $("method").value !== "Cash");
    refreshCatalogue();
    renderCalc();
  }
  function refreshCatalogue() {
    var dl = $("catalogue");
    dl.innerHTML = "";
    if (!TYPES[type].priceKey) return;
    Object.keys(S.products).forEach(function (k) {
      var o = document.createElement("option");
      o.value = S.products[k].name;
      dl.appendChild(o);
    });
  }
  function renderItems() {
    var ul = $("itemList");
    ul.innerHTML = "";
    items.forEach(function (it, idx) {
      var li = document.createElement("li");
      var nm = document.createElement("span");
      nm.className = "nm";
      nm.textContent = it.name;
      var am = document.createElement("span");
      am.className = "amt";
      am.textContent = it.qty + " x " + fmt(it.price);
      var rm = document.createElement("button");
      rm.type = "button";
      rm.className = "btn small";
      rm.textContent = "Remove";
      rm.setAttribute("aria-label", "Remove " + it.name);
      rm.addEventListener("click", function () {
        if (busy) return;
        items.splice(idx, 1);
        stageRec = null;
        renderItems();
        renderStage();
      });
      li.appendChild(nm);
      li.appendChild(am);
      li.appendChild(rm);
      ul.appendChild(li);
    });
    $("emptyMsg").hidden = items.length > 0;
    var t = 0;
    items.forEach(function (i) {
      t += i.price * i.qty;
    });
    $("panelTotal").textContent = cur() + " " + fmt(t);
  }
  function renderCalc() {
    if (type === "balance") {
      var p = num("bPrev") || 0,
        q = num("bPay") || 0;
      $("bCalc").textContent =
        "Remaining after this payment: " + cur() + " " + fmt(Math.max(0, p - q));
    }
    if (type === "deposit") {
      var a = num("dAgreed") || 0,
        d = num("dPaid") || 0;
      $("dCalc").textContent = "Balance still to pay: " + cur() + " " + fmt(Math.max(0, a - d));
    }
  }
  function stockHint() {
    var el = $("stockHint"),
      T = TYPES[type];
    if (type !== "sale") {
      el.hidden = true;
      return;
    }
    var p = S.products[key($("pname").value)];
    if (!p) {
      el.hidden = true;
      return;
    }
    var q = parseInt($("pqty").value, 10) || 1,
      st = p.stock || 0;
    el.hidden = false;
    el.textContent =
      q > st ? "Only " + st + " in stock. You can still sell it." : "In stock: " + st;
    el.style.color = q > st ? "var(--danger)" : "";
  }
  function resetForm() {
    items = [];
    priceAuto = true;
    [
      "pname",
      "pprice",
      "party",
      "partyPhone",
      "ref",
      "paid",
      "note",
      "bPrev",
      "bPay",
      "bOrig",
      "dWhat",
      "dAgreed",
      "dPaid",
      "rOrig",
      "rReason",
    ].forEach(function (id) {
      $(id).value = "";
    });
    $("pqty").value = "1";
    draftCode = makeCode(type, (S.counters[type] || 0) + 1);
    renderItems();
    renderCalc();
    $("stockHint").hidden = true;
  }
  function onFormInput() {
    if (busy) return;
    stageRec = null;
    renderCalc();
    renderStage();
  }
  function addItem() {
    var name = $("pname").value.trim(),
      price = num("pprice"),
      qty = parseInt($("pqty").value, 10);
    if (!name) {
      showMsg("Enter a name for the item.");
      $("pname").focus();
      return;
    }
    if (price == null || price < 0) {
      showMsg("Enter a price.");
      $("pprice").focus();
      return;
    }
    if (isNaN(qty) || qty < 1) {
      showMsg("Quantity must be 1 or more.");
      $("pqty").focus();
      return;
    }
    showMsg("");
    items.push({ name: name, price: price, qty: qty });
    $("pname").value = "";
    $("pprice").value = "";
    $("pqty").value = "1";
    priceAuto = true;
    $("stockHint").hidden = true;
    $("pname").focus();
    stageRec = null;
    renderItems();
    renderStage();
  }

  /* ---------- History ---------- */
  function normalizeReceiptSearch(v) {
    return String(v == null ? "" : v)
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  }
  function matchReceiptSearch(r, term) {
    if (!term) return true;
    var hay = [];
    var prefix = (TYPES[r.type] && TYPES[r.type].prefix) || "";
    hay.push(prefix + pad(r.no, 5));
    hay.push(prefix + String(r.no));
    hay.push(String(r.no));
    if (r.code) hay.push(String(r.code));
    if (r.f && r.f.orig) hay.push(String(r.f.orig));
    return hay.some(function (v) {
      return normalizeReceiptSearch(v).indexOf(term) > -1;
    });
  }
  function updateBadge() {
    $("histBadge").textContent = S.history.length;
  }
  function buildHistFilter() {
    var sel = $("hType");
    sel.innerHTML = '<option value="">All receipts</option>';
    ORDER.forEach(function (k) {
      var o = document.createElement("option");
      o.value = k;
      o.textContent = TYPES[k].label;
      sel.appendChild(o);
    });
  }
  function renderTiles(target) {
    var today = new Date().toDateString(),
      st = 0,
      sa = 0,
      rs = 0,
      ex = 0;
    S.history.forEach(function (r) {
      var isToday = new Date(r.ts).toDateString() === today;
      if (r.type === "sale") {
        sa += r.total;
        if (isToday) st += r.total;
      }
      if (r.type === "refund") {
        sa -= r.total;
        if (isToday) st -= r.total;
      }
      if (r.type === "restock") rs += r.total;
      if (r.type === "expense") ex += r.total;
    });
    var c = cur();
    var data =
      target === "homeTiles"
        ? [["Sales today", st]]
        : [
            ["Sales today", st],
            ["All sales", sa],
            ["Restock spend", rs],
            ["Expenses", ex],
          ];
    $(target).innerHTML = data
      .map(function (d) {
        return (
          '<div class="tile"><span>' +
          d[0] +
          "</span><strong>" +
          c +
          " " +
          fmt(d[1]) +
          "</strong></div>"
        );
      })
      .join("");
  }
  function filteredHistory() {
    var t = $("hType").value,
      q = key($("hQuery").value),
      receiptTerm = normalizeReceiptSearch($("hReceipt").value);
    return S.history.filter(function (r) {
      if (t && r.type !== t) return false;
      if (receiptTerm && !matchReceiptSearch(r, receiptTerm)) return false;
      if (!q) return true;
      var hay = (
        TYPES[r.type].prefix +
        "-" +
        pad(r.no, 5) +
        " " +
        (r.party || "") +
        " " +
        (r.code || "") +
        " " +
        (r.items || [])
          .map(function (i) {
            return i.name;
          })
          .join(" ")
      ).toLowerCase();
      return hay.indexOf(q) > -1;
    });
  }
  function histRow(r, onClick) {
    var li = document.createElement("li"),
      b = document.createElement("button");
    b.type = "button";
    b.className = "hrow";
    b.dataset.id = r.id;
    b.setAttribute("aria-current", r.id === selId && view === "history" ? "true" : "false");
    var d = dt(r.ts),
      T = TYPES[r.type];
    b.innerHTML =
      "<i>" +
      T.prefix +
      '</i><span><span class="t1">' +
      esc(T.prefix + "-" + pad(r.no, 5)) +
      (r.party ? " \u00b7 " + esc(r.party) : "") +
      '</span><span class="t2">' +
      esc(T.label) +
      " \u00b7 " +
      esc(d.date) +
      " " +
      esc(d.time) +
      '</span></span><span class="t3">' +
      esc(r.shop.currency) +
      " " +
      fmt(r.total, r.shop.currency) +
      "</span>";
    b.addEventListener("click", onClick);
    li.appendChild(b);
    return li;
  }
  function renderHome() {
    var s = S.shop || {};
    $("homeTitle").textContent = "Welcome, " + (s.name || "");
    $("homeSub").textContent = [s.place, s.phone].filter(Boolean).join(" \u00b7 ");
    renderTiles("homeTiles");
    var q = $("quick");
    q.innerHTML = "";
    ORDER.forEach(function (k) {
      var b = document.createElement("button");
      b.type = "button";
      b.innerHTML =
        "<i>" +
        TYPES[k].prefix +
        "</i>" +
        esc(TYPES[k].label) +
        "<span>" +
        esc(TYPES[k].hint) +
        "</span>";
      b.addEventListener("click", function () {
        showView("new");
        setType(k);
      });
      q.appendChild(b);
    });
    var ul = $("homeRecent");
    ul.innerHTML = "";
    S.history.slice(0, 5).forEach(function (r) {
      ul.appendChild(
        histRow(r, function () {
          selId = r.id;
          showView("history");
        }),
      );
    });
    $("homeEmpty").hidden = S.history.length > 0;
    $("homeAll").hidden = !S.history.length;
    var low = Object.keys(S.products).filter(function (k) {
      return (S.products[k].stock || 0) <= 5;
    }).length;
    var el = $("homeLow");
    el.hidden = !low;
    if (low)
      el.textContent =
        low +
        " product" +
        (low > 1 ? "s are" : " is") +
        " low on stock (5 or fewer). Open Products to check.";
  }
  function renderHistory() {
    renderTiles("tiles");
    var list = filteredHistory(),
      ul = $("hList");
    ul.innerHTML = "";
    list.forEach(function (r) {
      ul.appendChild(
        histRow(r, function () {
          selId = r.id;
          renderHistory();
          renderStage();
          if (window.innerWidth < 1060) {
            $("stage").scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }),
      );
    });
    var e = $("hEmpty");
    if (!S.history.length) {
      e.hidden = false;
      e.textContent = "No receipts yet. Print your first receipt and it will appear here.";
    } else if (!list.length) {
      e.hidden = false;
      e.textContent = "No receipts match. Clear the search or choose another type.";
    } else e.hidden = true;
  }
  function csvCell(v) {
    v = String(v == null ? "" : v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function downloadCSV() {
    var rows = [
      ["Date", "Time", "Type", "Number", "Name", "Items", "Total", "Currency", "Paid by", "Code"],
    ];
    S.history
      .slice()
      .reverse()
      .forEach(function (r) {
        var d = dt(r.ts);
        rows.push([
          d.date,
          d.time,
          TYPES[r.type].label,
          TYPES[r.type].prefix + "-" + pad(r.no, 5),
          r.party,
          r.items
            .map(function (i) {
              return i.qty + " x " + i.name;
            })
            .join("; "),
          r.total,
          r.shop.currency,
          r.method,
          r.ref,
        ]);
      });
    var csv = rows
      .map(function (r) {
        return r.map(csvCell).join(",");
      })
      .join("\r\n");
    var blob = new Blob(["﻿" + csv], { type: "text/csv" }),
      a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "receipts.csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
  }
  function deleteSelected() {
    var r = selectedRec();
    if (!r) return;
    S.history = S.history.filter(function (x) {
      return x.id !== r.id;
    });
    selId = null;
    save();
    updateBadge();
    renderHistory();
    renderStage();
    toast("Receipt deleted");
  }

  /* ---------- Receipt lookup scan ---------- */
  var receiptScan = { stream: null, timer: null, overlay: null, video: null };
  function stopReceiptScan() {
    if (receiptScan.timer) clearTimeout(receiptScan.timer);
    if (receiptScan.stream) {
      receiptScan.stream.getTracks().forEach(function (track) {
        track.stop();
      });
      receiptScan.stream = null;
    }
    if (receiptScan.overlay) {
      receiptScan.overlay.remove();
      receiptScan.overlay = null;
    }
    receiptScan.video = null;
    $("scanReceiptBtn").textContent = "Scan";
    $("scanReceiptBtn").classList.remove("primary");
  }
  function applyReceiptScanValue(raw) {
    var v = normalizeReceiptSearch(raw);
    if (!v) {
      return;
    }
    $("hReceipt").value = v;
    renderHistory();
  }
  function handleReceiptScanResult(result) {
    if (!result || !result.rawValue) {
      return;
    }
    applyReceiptScanValue(result.rawValue);
    toast("Receipt found");
    stopReceiptScan();
  }
  function startReceiptScan() {
    if (
      !window.BarcodeDetector ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      toast("Camera scanning is not available in this browser. Type the receipt number instead.");
      return;
    }
    if (receiptScan.overlay) {
      stopReceiptScan();
      return;
    }
    var overlay = document.createElement("div");
    overlay.className = "scan-overlay";
    overlay.innerHTML =
      '<div class="scan-panel"><video id="scanVideo" autoplay playsinline muted></video><div class="scan-actions"><button type="button" class="btn small" id="scanCloseBtn">Close</button><button type="button" class="btn small primary" id="scanManualBtn">Use typed number</button></div></div>';
    document.body.appendChild(overlay);
    receiptScan.overlay = overlay;
    receiptScan.video = $("scanVideo");
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then(function (stream) {
        receiptScan.stream = stream;
        receiptScan.video.srcObject = stream;
        $("scanReceiptBtn").textContent = "Stop";
        $("scanReceiptBtn").classList.add("primary");
        var detector = new window.BarcodeDetector({
          formats: ["code_39", "codabar", "ean_13", "ean_8", "upc_a", "upc_e", "qr_code"],
        });
        function tick() {
          if (!receiptScan.overlay || !receiptScan.video) {
            return;
          }
          detector
            .detect(receiptScan.video)
            .then(function (results) {
              if (results && results.length) {
                handleReceiptScanResult(results[0]);
                return;
              }
              receiptScan.timer = setTimeout(tick, 300);
            })
            .catch(function () {
              receiptScan.timer = setTimeout(tick, 500);
            });
        }
        tick();
      })
      .catch(function () {
        toast("Camera access was blocked. Type the receipt number instead.");
        stopReceiptScan();
      });
    $("scanCloseBtn").addEventListener("click", stopReceiptScan);
    $("scanManualBtn").addEventListener("click", function () {
      stopReceiptScan();
      $("hReceipt").focus();
    });
  }

  /* ---------- Products ---------- */
  function renderProducts() {
    var body = $("prodBody");
    body.innerHTML = "";
    var keys = Object.keys(S.products).sort();
    keys.forEach(function (k) {
      var p = S.products[k],
        tr = document.createElement("tr"),
        low = (p.stock || 0) <= 5;
      tr.dataset.key = k;
      tr.innerHTML =
        "<td>" +
        esc(p.name) +
        "</td>" +
        '<td><input data-f="sell" type="number" min="0" step="0.01" value="' +
        esc(p.sell) +
        '" aria-label="Selling price of ' +
        esc(p.name) +
        '"></td>' +
        '<td><input data-f="buy" type="number" min="0" step="0.01" value="' +
        esc(p.buy) +
        '" aria-label="Buying price of ' +
        esc(p.name) +
        '"></td>' +
        '<td class="' +
        (low ? "low" : "") +
        '"><input data-f="stock" type="number" min="0" step="1" value="' +
        esc(p.stock || 0) +
        '" aria-label="Stock of ' +
        esc(p.name) +
        '">' +
        (low ? '<span class="low-note">Low stock</span>' : "") +
        "</td>" +
        '<td><button type="button" class="btn small danger" data-del="1" aria-label="Remove ' +
        esc(p.name) +
        '">Remove</button></td>';
      body.appendChild(tr);
    });
    $("prodEmpty").hidden = keys.length > 0;
  }

  /* ---------- Shop form ---------- */
  function showShopMsg(m) {
    var e = $("shopMsg");
    e.textContent = m;
    e.hidden = false;
  }
  function shopMsgHide() {
    $("shopMsg").hidden = true;
  }
  function fillShopForm() {
    var s = S.shop || {};
    $("s-name").value = s.name || "";
    $("s-cashier").value = s.cashier || "";
    $("s-phone").value = s.phone || "";
    $("s-place").value = s.place || "";
    $("s-email").value = s.email || "";
    $("s-pin").value = s.pin || "";
    $("s-cur").value = s.currency || "KES";
    $("s-vat").value = s.vatRate == null ? 16 : s.vatRate;
    $("s-footer").value = s.footer == null ? "Asante! Thank you." : s.footer;
    $("s-terms").value = s.terms == null ? "Goods once sold are not returnable." : s.terms;
    $("s-thr").value = s.logoThr || 150;
    shopForm = { src: s.logoSrc || null, thr: s.logoThr || 150, bw: s.logoBW || null };
    $("s-logo").value = "";
    shopMsgHide();
    refreshLogoPreview();
  }
  function saveShop(e) {
    e.preventDefault();
    var first = !S.shop;
    var v = {
      name: $("s-name").value.trim(),
      cashier: $("s-cashier").value.trim(),
      phone: $("s-phone").value.trim(),
      place: $("s-place").value.trim(),
      email: $("s-email").value.trim(),
      pin: $("s-pin").value.trim(),
      currency: $("s-cur").value,
      vatRate: Math.max(0, parseFloat($("s-vat").value) || 0),
      footer: $("s-footer").value.trim(),
      terms: $("s-terms").value.trim(),
    };
    if (!v.name) return showShopMsg("Enter the shop name.");
    if (!v.cashier) return showShopMsg("Enter the owner or main cashier name.");
    if (!v.phone) return showShopMsg("Enter the shop phone number.");
    if (!v.place) return showShopMsg("Enter the shop location.");
    function finish() {
      S.shop = v;
      if (first && $("s-sample").checked && !Object.keys(S.products).length) {
        SAMPLE.forEach(function (p) {
          S.products[key(p[0])] = { name: p[0], sell: p[1], buy: p[2], stock: p[3] };
        });
      }
      save();
      applyMode();
      updateBrand();
      if (first) {
        toast("Shop registered. You can print your first receipt.");
        showView("home");
      } else {
        toast("Shop details saved");
      }
    }
    v.logoSrc = shopForm.src;
    v.logoThr = shopForm.thr;
    v.logoBW = null;
    if (shopForm.src) {
      makeBW(shopForm.src, shopForm.thr, function (url) {
        v.logoBW = url;
        finish();
      });
    } else finish();
  }
  function wipe() {
    S.shop = null;
    S.history = [];
    S.products = {};
    S.counters = {};
    selId = null;
    save();
    applyMode();
    updateBrand();
    updateBadge();
    showView("shop");
  }
  function updateBrand() {
    $("brandName").textContent = (S.shop && S.shop.name) || "Receipt Printer";
    var img = $("brandLogo");
    if (S.shop && S.shop.logoBW) {
      img.src = S.shop.logoBW;
      img.hidden = false;
    } else img.hidden = true;
    document.title = S.shop && S.shop.name ? S.shop.name + " Receipts" : "Receipt Printer";
  }

  /* ---------- Views ---------- */
  function applyTheme() {
    var theme = ["system", "light", "dark"].indexOf(S.prefs.theme) > -1 ? S.prefs.theme : "system";
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
    [].forEach.call($("themeOptions").children, function (button) {
      button.setAttribute("aria-pressed", button.dataset.theme === theme ? "true" : "false");
    });
  }
  function applyMode() {
    var first = !S.shop;
    $("shell").classList.toggle("first-run", first);
    $("shopTitle").textContent = first ? "Welcome. Register your business" : "Shop settings";
    $("shopLede").textContent = first
      ? "Fill in your business details first. They print at the top of every receipt, and you cannot print until this is done."
      : "These details are printed at the top of every receipt.";
    $("shopSave").textContent = first ? "Register and continue" : "Save changes";
    $("sampleWrap").hidden = !first;
    $("dangerBox").hidden = first;
  }
  function showView(v) {
    if (!S.shop) v = "shop";
    view = v;
    $("stage").hidden = !(v === "new" || v === "history");
    ["home", "new", "history", "products", "shop"].forEach(function (n) {
      $("view-" + n).hidden = n !== v;
    });
    [].forEach.call($("menu").children, function (b) {
      var on = b.dataset.view === v;
      b.classList.toggle("active", on);
      if (on) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    if (v === "home") renderHome();
    if (v === "new") {
      $("slotNew").appendChild($("stage"));
      $("servedBy").value = $("servedBy").value || (S.shop && S.shop.cashier) || "";
      applyType();
      renderItems();
      renderStage();
    }
    if (v === "history") {
      $("slotHist").appendChild($("stage"));
      if (!selId && S.history.length) selId = S.history[0].id;
      renderHistory();
      renderStage();
    }
    if (v === "products") renderProducts();
    if (v === "shop") fillShopForm();
    window.scrollTo(0, 0);
  }

  /* ---------- Wiring ---------- */
  Object.keys(CUR).forEach(function (c) {
    var o = document.createElement("option");
    o.value = c;
    o.textContent = c;
    $("s-cur").appendChild(o);
  });
  buildTypePicker();
  buildHistFilter();

  $("menu").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b || busy) return;
    showView(b.dataset.view);
  });
  $("themeOptions").addEventListener("click", function (e) {
    var button = e.target.closest("button[data-theme]");
    if (!button) return;
    S.prefs.theme = button.dataset.theme;
    applyTheme();
    save();
  });
  $("newPanel").addEventListener("input", function (e) {
    if (e.target.id === "pprice") priceAuto = false;
    if (e.target.id === "pname") {
      var hit = S.products[key(e.target.value)],
        pk = TYPES[type].priceKey;
      if (hit && pk && (priceAuto || $("pprice").value === "")) {
        $("pprice").value = hit[pk] || "";
        priceAuto = true;
      }
      stockHint();
    }
    if (e.target.id === "pqty") stockHint();
    onFormInput();
  });
  $("newPanel").addEventListener("change", function (e) {
    if (e.target.id === "method")
      $("refWrap").hidden = !(TYPES[type].pay && $("method").value !== "Cash");
    onFormInput();
  });
  $("pname").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      $("pprice").focus();
    }
  });
  $("pprice").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      addItem();
    }
  });
  $("pqty").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      addItem();
    }
  });
  $("addItem").addEventListener("click", function () {
    if (!busy) addItem();
  });
  $("printBtn").addEventListener("click", printNew);
  $("resetBtn").addEventListener("click", function () {
    if (busy) return;
    stageRec = null;
    resetForm();
    showMsg("");
    renderStage();
  });
  $("reprintBtn").addEventListener("click", reprint);
  arm($("delBtn"), "Tap again to delete", deleteSelected);
  $("paper").addEventListener("change", function () {
    S.prefs.paper = $("paper").value;
    save();
    renderStage();
  });

  $("hType").addEventListener("change", renderHistory);
  $("hReceipt").addEventListener("input", renderHistory);
  $("hQuery").addEventListener("input", renderHistory);
  $("scanReceiptBtn").addEventListener("click", startReceiptScan);
  $("homeAll").addEventListener("click", function () {
    showView("history");
  });
  $("csvBtn").addEventListener("click", function () {
    if (!S.history.length) {
      toast("No receipts to download yet");
      return;
    }
    downloadCSV();
  });

  $("prodForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = $("np-name").value.trim();
    if (!name) return;
    var k = key(name),
      old = S.products[k] || {};
    S.products[k] = {
      name: name,
      sell: parseFloat($("np-sell").value) || 0,
      buy: parseFloat($("np-buy").value) || 0,
      stock: parseInt($("np-stock").value, 10) || 0,
    };
    save();
    $("prodForm").reset();
    $("np-stock").value = "0";
    renderProducts();
    $("np-name").focus();
    toast(old.name ? "Product updated" : "Product added");
  });
  $("prodBody").addEventListener("change", function (e) {
    var inp = e.target;
    if (!inp.dataset.f) return;
    var k = inp.closest("tr").dataset.key,
      p = S.products[k];
    if (!p) return;
    var v = parseFloat(inp.value);
    if (isNaN(v) || v < 0) v = 0;
    p[inp.dataset.f] = inp.dataset.f === "stock" ? Math.round(v) : v;
    save();
    renderProducts();
  });
  $("prodBody").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-del]");
    if (!b) return;
    if (b.dataset.armed !== "1") {
      b.dataset.armed = "1";
      b.textContent = "Tap again";
      setTimeout(function () {
        if (b.isConnected) {
          b.dataset.armed = "0";
          b.textContent = "Remove";
        }
      }, 3500);
      return;
    }
    delete S.products[b.closest("tr").dataset.key];
    save();
    renderProducts();
  });

  $("shopForm").addEventListener("submit", saveShop);
  $("s-logo").addEventListener("change", function (e) {
    loadLogoFile(e.target.files[0]);
  });
  $("s-thr").addEventListener("input", function (e) {
    shopForm.thr = parseInt(e.target.value, 10);
    refreshLogoPreview();
  });
  $("logoRemove").addEventListener("click", function () {
    shopForm.src = null;
    shopForm.bw = null;
    $("s-logo").value = "";
    refreshLogoPreview();
  });
  arm($("wipeBtn"), "Tap again to delete everything", wipe);

  window.addEventListener("beforeunload", function () {});

  /* ---------- Start ---------- */
  draftCode = makeCode(type, (S.counters[type] || 0) + 1);
  applyMode();
  updateBrand();
  updateBadge();
  $("storageWarn").hidden = storageOk;
  applyTheme();
  showView(S.shop ? "home" : "shop");
  if (S.shop) setType("sale");
})();
