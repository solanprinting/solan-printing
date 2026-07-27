/* ═══════════════════════════════════════════════════════════════════════════
 * framework-file-reader.js — קריאת קובץ-הזמנה → { text, rows }
 * משותף למסך המנהל (framework-orders.html) ולמסך המשרד (framework-clerk.html).
 * rows = שורות מובנות (תא לכל עמודה) שנכנסות ל-FrameworkOrders.parseSheetRows.
 *
 * ⚠️ אקסל ווורד נקראים לפי *עמודות* ולא ע"י המרה-לטקסט — המרה איבדה מידע ונכשלה.
 * דורש בדפדפן: XLSX (אקסל) · pdfjsLib (PDF) · JSZip + FrameworkOrders (DOCX).
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  async function read(f) {
    var nm = (f && f.name || '').toLowerCase();

    if (/\.(xlsx|xls|xlsm)$/.test(nm)) {
      if (!root.XLSX) throw new Error('ספריית האקסל לא נטענה — בדקו חיבור לאינטרנט ורעננו');
      var wb;
      try { wb = root.XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: 'array' }); }
      catch (e) { throw new Error('קובץ האקסל לא נקרא (ייתכן שהוא פגום או מוגן בסיסמה)'); }
      if (!wb || !wb.SheetNames || !wb.SheetNames.length) throw new Error('הקובץ ריק — אין גיליונות');
      var rows = [];
      wb.SheetNames.forEach(function (sn) {
        root.XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, blankrows: false, defval: '' })
          .forEach(function (r) { rows.push((r || []).map(function (c) { return String(c == null ? '' : c).trim(); })); });
      });
      if (!rows.length) throw new Error('לא נמצאו שורות בגיליון');
      return { rows: rows, text: rows.map(function (r) { return r.filter(Boolean).join(', '); }).join('\n') };
    }

    // וורד: DOCX = ZIP שבתוכו word/document.xml. הטבלה במסמך נקראת כשורות-גיליון.
    if (/\.docx$/.test(nm)) {
      if (!root.JSZip) throw new Error('ספריית קריאת וורד לא נטענה — בדקו חיבור לאינטרנט ורעננו');
      var zip;
      try { zip = await root.JSZip.loadAsync(await f.arrayBuffer()); }
      catch (e) { throw new Error('קובץ הוורד לא נקרא (ייתכן שהוא פגום או מוגן בסיסמה)'); }
      var ent = zip.file('word/document.xml');
      if (!ent) throw new Error('לא נמצא תוכן מסמך בקובץ');
      var parsed = root.FrameworkOrders.parseDocxXml(await ent.async('string'));
      if (!parsed.rows.length) throw new Error('המסמך ריק — לא נמצא טקסט');
      return parsed;
    }
    if (/\.docx?$/.test(nm)) throw new Error('קובץ .doc ישן אינו נתמך — פתחו בוורד ושמרו כ-DOCX');

    if (/\.pdf$/.test(nm)) {
      if (!root.pdfjsLib) throw new Error('ספריית ה-PDF לא נטענה');
      var pdf = await root.pdfjsLib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
      var out = [];
      for (var i = 1; i <= pdf.numPages; i++) {
        var tc = await (await pdf.getPage(i)).getTextContent();
        var byY = {};
        tc.items.forEach(function (it) {
          var y = Math.round((it.transform && it.transform[5]) || 0);
          (byY[y] = byY[y] || []).push({ x: (it.transform && it.transform[4]) || 0, s: it.str });
        });
        Object.keys(byY).sort(function (a, b) { return b - a; }).forEach(function (y) {
          var line = byY[y].sort(function (p, q) { return q.x - p.x; })
            .map(function (p) { return p.s; }).join(' ').replace(/\s+/g, ' ').trim();
          if (line) out.push(line);
        });
      }
      try { pdf.destroy(); } catch (e) {}
      if (!out.length) throw new Error('לא נמצא טקסט ב-PDF (ייתכן שהוא סרוק כתמונה) — הדביקו את השורות ידנית');
      return { rows: out.map(function (l) { return l.split(/\s{2,}|\t/).map(function (x) { return x.trim(); }).filter(Boolean); }),
               text: out.join('\n') };
    }

    var txt = await f.text();                                  // CSV / TXT
    return { rows: txt.split(/\r?\n/).map(function (l) { return l.split(/[,\t;|]/).map(function (x) { return x.trim(); }); }),
             text: txt };
  }

  root.FWFile = { read: read };
})(typeof window !== 'undefined' ? window : this);
