/* ═══════════════════════════════════════════════════════════════════════════
   pdf-objects.js — עריכת-אובייקטים אמיתית בעמוד-PDF. **טהור, נבדק ב-Node.**

   נבנה 14/08/2026 (בקשת-בעלים: "עריכת-אובייקטים אמיתית"). מפרק את זרם-
   התוכן (content stream) של עמוד לאובייקטים הנראים בו:
     · image  — ‏XObject/תמונה-בזרם (מודעות, גרפיקות)
     · form   — ‏Form XObject (מודעה/רכיב שהוכן מראש)
     · text   — בלוק-טקסט BT..ET (מלבן **משוער** — בלי מדדי-גופן אמיתיים)
     · path   — קבוצת-קווים/מילויים וקטורית

   ולכל אחד: מלבן במרחב-העמוד (bbox), טווח-בייטים בזרם, ומטריצת-CTM
   בנקודת-הציור. העריכה: הזזה (עטיפת הטווח ב-q <M> cm .. Q, כאשר M מחושבת
   כך שההזזה תהיה בדיוק במרחב-העמוד גם תחת CTM מסובב/מוקטן) או מחיקה
   (החלפת הטווח ברווחים — האורך נשמר, שאר הטווחים לא זזים).

   ⚠️ **מה זה לא**: אין כאן פענוח-גופנים — רוחב-טקסט מוערך (approx:true);
   ‏Form בלי BBox מהמשאבים מסומן משוער; עמוד "שטוח" (תמונה אחת על כל
   העמוד) יוחזר כאובייקט יחיד — והמסך אומר זאת במקום להעמיד פנים.

   הרצת הבדיקות: node pdf-objects-tests.js
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PdfObjects = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ── אלגברת-מטריצות PDF‏ [a b c d e f] · וקטור-שורה: p' = p·M ─────────── */
  var IDENT = [1, 0, 0, 1, 0, 0];
  function mmul(M, N) {          // החל M ואז N
    return [
      M[0] * N[0] + M[1] * N[2],           M[0] * N[1] + M[1] * N[3],
      M[2] * N[0] + M[3] * N[2],           M[2] * N[1] + M[3] * N[3],
      M[4] * N[0] + M[5] * N[2] + N[4],    M[4] * N[1] + M[5] * N[3] + N[5],
    ];
  }
  function mapply(x, y, M) { return { x: M[0] * x + M[2] * y + M[4], y: M[1] * x + M[3] * y + M[5] }; }
  function minv(M) {
    var det = M[0] * M[3] - M[1] * M[2];
    if (!det || !isFinite(det)) return null;
    var ia = M[3] / det, ib = -M[1] / det, ic = -M[2] / det, id = M[0] / det;
    return [ia, ib, ic, id, -(M[4] * ia + M[5] * ic), -(M[4] * ib + M[5] * id)];
  }
  /* המטריצה שמזיזה את האובייקט ב-(dx,dy) במרחב-העמוד, כשהיא מוכנסת
     **בתוך** ה-CTM הקיים: ‏W = CTM · T · CTM⁻¹ (סדר-וקטור-שורה). */
  function wrapMatrixFor(dx, dy, ctm) {
    var inv = minv(ctm);
    if (!inv) return null;
    return mmul(mmul(ctm, [1, 0, 0, 1, dx, dy]), inv);
  }

  /* ── טוקנייזר לזרם-תוכן ──────────────────────────────────────────────────
     מזהה: מספרים · שמות /X · מחרוזות (..) ו-<..> · מערכים/מילונים ·
     אופרטורים · הערות. ‏BI..EI (תמונה-בזרם) נבלע כטוקן יחיד — התוכן
     בינארי ואסור לפרש אותו. */
  var WS = /[\s\0]/;
  var DELIM = /[()<>\[\]{}\/%]/;
  function tokenize(s) {
    var out = [], i = 0, n = s.length;
    function err(msg, at) { var e = new Error(msg + ' @' + at); e.code = 'pdf_stream_parse'; e.at = at; throw e; }
    while (i < n) {
      var c = s[i];
      if (WS.test(c)) { i++; continue; }
      var start = i;
      if (c === '%') { while (i < n && s[i] !== '\n' && s[i] !== '\r') i++; continue; }
      if (c === '(') {                                   // מחרוזת עם קינון ו-escape
        var depth = 1; i++;
        while (i < n && depth > 0) {
          if (s[i] === '\\') i += 2;
          else { if (s[i] === '(') depth++; else if (s[i] === ')') depth--; i++; }
        }
        if (depth !== 0) err('מחרוזת לא סגורה', start);
        out.push({ t: 'str', v: s.slice(start, i), s: start, e: i });
        continue;
      }
      if (c === '<' && s[i + 1] === '<') { out.push({ t: 'dictO', s: i, e: i + 2 }); i += 2; continue; }
      if (c === '>' && s[i + 1] === '>') { out.push({ t: 'dictC', s: i, e: i + 2 }); i += 2; continue; }
      if (c === '<') { while (i < n && s[i] !== '>') i++; i++; out.push({ t: 'str', v: s.slice(start, i), s: start, e: i }); continue; }
      if (c === '[') { out.push({ t: 'arrO', s: i, e: i + 1 }); i++; continue; }
      if (c === ']') { out.push({ t: 'arrC', s: i, e: i + 1 }); i++; continue; }
      if (c === '/') { i++; while (i < n && !WS.test(s[i]) && !DELIM.test(s[i])) i++;
        out.push({ t: 'name', v: s.slice(start + 1, i), s: start, e: i }); continue; }
      if (/[-+.\d]/.test(c)) { i++; while (i < n && /[.\d\-+eE]/.test(s[i])) i++;
        out.push({ t: 'num', v: parseFloat(s.slice(start, i)), s: start, e: i }); continue; }
      /* אופרטור (אותיות/כוכבית/גרש) */
      i++; while (i < n && !WS.test(s[i]) && !DELIM.test(s[i])) i++;
      var op = s.slice(start, i);
      if (op === 'BI') {                                 // תמונה-בזרם: עד EI שאחרי רווח
        var j = s.indexOf('EI', i);
        while (j > 0 && !(WS.test(s[j - 1]) && (j + 2 >= n || WS.test(s[j + 2]) || DELIM.test(s[j + 2])))) j = s.indexOf('EI', j + 1);
        if (j < 0) err('BI בלי EI', start);
        out.push({ t: 'op', v: 'BI_EI', s: start, e: j + 2 });
        i = j + 2;
        continue;
      }
      out.push({ t: 'op', v: op, s: start, e: i });
    }
    return out;
  }

  /* ── הפרסור: מעקב-מצב + חילוץ-אובייקטים ────────────────────────────────
     resources (רשות): { forms: { <שם>: { bbox:[x1,y1,x2,y2], matrix:[..] } } }
     — ‏BBox אמיתי ל-Form XObjects (הקורא בדפדפן מספק מ-pdf-lib). */
  function parseObjects(stream, resources) {
    var toks = tokenize(stream);
    var res = resources || {};
    var objects = [];
    var ctm = IDENT.slice(), stack = [];
    var operands = [];
    /* מצב-טקסט */
    var inText = false, textStart = -1, tm = IDENT.slice(), tlm = IDENT.slice(),
        fontSize = 10, leading = 0, textPts = [], textChars = 0, textCtm = null;
    /* מצב-נתיב */
    var pathPts = [], pathStart = -1, pathCtm = null;

    function bboxOfPts(pts) {
      if (!pts.length) return null;
      var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      pts.forEach(function (p) { if (p.x < x1) x1 = p.x; if (p.x > x2) x2 = p.x;
                                 if (p.y < y1) y1 = p.y; if (p.y > y2) y2 = p.y; });
      return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    }
    function pushObj(kind, s, e, bbox, extra) {
      if (!bbox || !(bbox.w > 0.01 || bbox.h > 0.01)) return;
      objects.push(Object.assign({ kind: kind, start: s, end: e, bbox: bbox, ctm: (extra && extra.ctm) || ctm.slice() }, extra || {}));
    }
    function num(k) { var t = operands[operands.length - k]; return t && t.t === 'num' ? t.v : 0; }

    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t.t !== 'op') { operands.push(t); continue; }
      var op = t.v;
      switch (op) {
        case 'q': stack.push(ctm.slice()); break;
        case 'Q': ctm = stack.pop() || IDENT.slice(); break;
        case 'cm': ctm = mmul([num(6), num(5), num(4), num(3), num(2), num(1)], ctm); break;

        case 'BT':
          inText = true; textStart = t.s; tm = IDENT.slice(); tlm = IDENT.slice();
          textPts = []; textChars = 0; textCtm = ctm.slice();
          break;
        case 'ET':
          if (inText && textChars > 0) {
            pushObj('text', textStart, t.e, bboxOfPts(textPts), { approx: true, chars: textChars, ctm: textCtm });
          }
          inText = false;
          break;
        case 'Tf': fontSize = num(1) || fontSize; break;
        case 'TL': leading = num(1); break;
        case 'Tm': tlm = [num(6), num(5), num(4), num(3), num(2), num(1)]; tm = tlm.slice(); break;
        case 'Td': tlm = mmul([1, 0, 0, 1, num(2), num(1)], tlm); tm = tlm.slice(); break;
        case 'TD': leading = -num(1); tlm = mmul([1, 0, 0, 1, num(2), num(1)], tlm); tm = tlm.slice(); break;
        case 'T*': tlm = mmul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm.slice(); break;
        case 'Tj': case "'": case '"': case 'TJ':
          if (inText) {
            /* אומדן-רוחב: 0.5em לתו (בלי מדדי-גופן — משוער ומוצהר) */
            var chars = 0;
            if (op === 'TJ') {
              for (var b = operands.length - 1; b >= 0 && operands[b].t !== 'arrO'; b--) {
                if (operands[b].t === 'str') chars += Math.max(0, operands[b].v.length - 2);
              }
            } else {
              var st = operands[operands.length - 1];
              if (st && st.t === 'str') chars = Math.max(0, st.v.length - 2);
            }
            var wEm = chars * 0.5 * fontSize, hEm = fontSize * 1.15;
            var M = mmul(tm, ctm);
            [{ x: 0, y: -0.25 * fontSize }, { x: wEm, y: -0.25 * fontSize },
             { x: 0, y: hEm }, { x: wEm, y: hEm }].forEach(function (p) {
              textPts.push(mapply(p.x, p.y, M));
            });
            textChars += chars;
            tm = mmul([1, 0, 0, 1, wEm, 0], tm);         // קידום-משוער של נקודת-הטקסט
          }
          break;

        case 'm': case 'l':
          if (pathStart < 0) { pathStart = (operands[0] ? operands[0].s : t.s); pathCtm = ctm.slice(); }
          pathPts.push(mapply(num(2), num(1), ctm));
          break;
        case 'c':
          if (pathStart < 0) { pathStart = (operands[0] ? operands[0].s : t.s); pathCtm = ctm.slice(); }
          [[6, 5], [4, 3], [2, 1]].forEach(function (pr) { pathPts.push(mapply(num(pr[0]), num(pr[1]), ctm)); });
          break;
        case 'v': case 'y':
          if (pathStart < 0) { pathStart = (operands[0] ? operands[0].s : t.s); pathCtm = ctm.slice(); }
          [[4, 3], [2, 1]].forEach(function (pr) { pathPts.push(mapply(num(pr[0]), num(pr[1]), ctm)); });
          break;
        case 're':
          if (pathStart < 0) { pathStart = (operands[0] ? operands[0].s : t.s); pathCtm = ctm.slice(); }
          (function () {
            var x = num(4), y = num(3), w = num(2), h = num(1);
            [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(function (p) {
              pathPts.push(mapply(p[0], p[1], ctm));
            });
          })();
          break;
        case 'f': case 'F': case 'f*': case 'B': case 'B*': case 'b': case 'b*': case 'S': case 's':
          if (pathStart >= 0) pushObj('path', pathStart, t.e, bboxOfPts(pathPts), { ctm: pathCtm });
          pathPts = []; pathStart = -1; pathCtm = null;
          break;
        case 'n': case 'W': case 'W*':                    // חיתוך/אי-ציור — אינו אובייקט נראה
          if (op === 'n') { pathPts = []; pathStart = -1; pathCtm = null; }
          break;

        case 'Do':
          (function () {
            var nameTok = operands[operands.length - 1];
            var name = nameTok && nameTok.t === 'name' ? nameTok.v : '';
            var form = res.forms && res.forms[name];
            var s0 = nameTok ? nameTok.s : t.s;
            var pts;
            if (form && form.bbox) {
              var fm = form.matrix || IDENT;
              var bb = form.bbox;
              pts = [[bb[0], bb[1]], [bb[2], bb[1]], [bb[0], bb[3]], [bb[2], bb[3]]].map(function (p) {
                var q1 = mapply(p[0], p[1], fm); return mapply(q1.x, q1.y, ctm);
              });
              pushObj('form', s0, t.e, bboxOfPts(pts), { name: name });
            } else {
              /* תמונה: ריבוע-יחידה × CTM. ‏Form בלי BBox — אותו דבר, משוער. */
              pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(function (p) { return mapply(p[0], p[1], ctm); });
              pushObj(form ? 'form' : 'image', s0, t.e, bboxOfPts(pts), form ? { name: name, approx: true } : { name: name });
            }
          })();
          break;
        case 'BI_EI':
          (function () {
            var pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(function (p) { return mapply(p[0], p[1], ctm); });
            pushObj('image', t.s, t.e, bboxOfPts(pts), { inline: true });
          })();
          break;
      }
      operands = [];
    }
    if (stack.length) { var e2 = new Error('q בלי Q — זרם לא-מאוזן'); e2.code = 'pdf_stream_parse'; throw e2; }
    return objects;
  }
  /* טווח-אובייקט שכולל את האופרנדים: מתחילים מהטוקן-האופרנד הראשון.
     ‏parseObjects שומר start מהאופרנד/הטוקן הרלוונטי; לנתיבים start הוא
     האופרטור הראשון — מספיק לעטיפה (העטיפה חוקית סביב כל רצף מאוזן). */

  /* ── החלת-עריכות ─────────────────────────────────────────────────────────
     edits: [{ index, dx, dy } | { index, del:true }] — index לתוך objects
     שהוחזרו מ-parseObjects על **אותו** זרם. מחיקה = רווחים (האורך נשמר);
     הזזה = הוספת עטיפה, מוזגת מהסוף-להתחלה כדי שההיסטים לא יזוזו. */
  function applyEdits(stream, objects, edits) {
    var dels = [], wraps = [];
    (edits || []).forEach(function (ed) {
      var o = objects[ed.index];
      if (!o) return;
      if (ed.del) { dels.push(o); return; }
      var dx = Number(ed.dx) || 0, dy = Number(ed.dy) || 0;
      if (!dx && !dy) return;
      var W = wrapMatrixFor(dx, dy, o.ctm);
      if (!W) return;
      wraps.push({ o: o, W: W });
    });
    var out = stream;
    dels.forEach(function (o) {
      out = out.slice(0, o.start) + new Array(o.end - o.start + 1).join(' ') + out.slice(o.end);
    });
    wraps.sort(function (a, b) { return b.o.start - a.o.start; });
    wraps.forEach(function (w) {
      var m = w.W.map(function (v) { return (Math.round(v * 10000) / 10000); }).join(' ');
      out = out.slice(0, w.o.start) + '\nq ' + m + ' cm\n' + out.slice(w.o.start, w.o.end) + '\nQ\n' + out.slice(w.o.end);
    });
    return out;
  }

  /* עמוד "שטוח": אובייקט-תמונה יחיד שמכסה כמעט-הכול — אין מה להזיז בו. */
  function isFlat(objects, pageW, pageH) {
    var big = (objects || []).filter(function (o) {
      return o.kind === 'image' && o.bbox.w > pageW * 0.9 && o.bbox.h > pageH * 0.9;
    });
    return (objects || []).length <= 2 && big.length >= 1;
  }

  return { tokenize: tokenize, parseObjects: parseObjects, applyEdits: applyEdits,
           wrapMatrixFor: wrapMatrixFor, mmul: mmul, minv: minv, mapply: mapply, isFlat: isFlat };
});
