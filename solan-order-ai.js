/* ═══════════════════════════════════════════════════════════════════════════
 * solan-order-ai.js — מנוע ניתוח הזמנות-לקוח (UMD · Node + דפדפן)
 * ───────────────────────────────────────────────────────────────────────────
 * זהו אותו מנוע שעובד באפליקציה הראשית במסך ההזמנות:
 *   • שולחים ל-Claude את **הקובץ עצמו** (PDF/תמונה) — ולא טקסט שחולץ בדפדפן.
 *     ⚠️ ל-PDF בעברית יש שכבת-טקסט משובשת, ולכן חילוץ-טקסט מקומי נותן ג'יבריש.
 *   • התשובה חוזרת ב**שורות מתויגות** ולא ב-JSON — JSON עם עברית נשבר בפועל.
 *   • הבקשה עוברת דרך ממסר-ענן (aiRelay ב-Firebase): הדפדפן חסום מול localhost
 *     במדיניות ארגונית, והפרוקסי המקומי מושך את הבקשה, מנתח, וכותב תשובה.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SolanOrderAI = factory();
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';

  // ⚠️ זהה למסך ההזמנות באפליקציה — כל שינוי כאן משנה את שני המסכים.
  var SYS = 'אתה עוזר של בית דפוס בישראל. חלץ את פרטי ההזמנה מהמסמך. החזר אך ורק שורות בפורמט הבא — שדה אחד בכל שורה, בלי טקסט נוסף ובלי הסברים:\n'
    + 'לקוח: <שם הלקוח או החברה שמזמינים בשבילו>\n'
    + 'פריט: <תיאור המוצר/העבודה> | <כמות במספר>\n'
    + '(אם יש כמה פריטים שונים באותה הזמנה — כתוב שורת "פריט:" נפרדת לכל פריט)\n'
    + 'תאריך: <YYYY-MM-DD אם מופיע תאריך אספקה או הזמנה>\n'
    + 'כתובת: <כתובת אספקה אם קיימת>\n'
    + 'מספר אתר: <לעידית — מספר האתר/הסניף אם מופיע, מספר בלבד (למשל 61); אחרת ריק>\n'
    + 'אזור: <אחד מ: מרכז / צפון / דרום / ירושלים / שפלה לפי הכתובת>\n'
    + 'הערות: <פרטים חשובים נוספים — מידות, סוג נייר, צבעים, גימור>\n'
    + 'אם שדה אינו ידוע השאר אותו ריק אחרי הנקודתיים. אל תמציא נתונים שאינם במסמך.';

  // ── ניתוח התשובה המתויגת → אובייקט הזמנה ──────────────────────────────────
  function parseOrderTags(text) {
    var map = { 'לקוח': 'customer', 'תיאור': 'desc', 'כמות': 'qty', 'תאריך': 'date',
                'כתובת': 'address', 'מספר אתר': 'siteNum', 'אזור': 'area', 'הערות': 'notes' };
    var out = { customer: '', desc: '', qty: '', date: '', address: '', siteNum: '', area: '', notes: '', items: [] };
    var found = false, items = [];
    String(text == null ? '' : text).split(/\r?\n/).forEach(function (line) {
      var m = line.match(/^\s*[*\-•\s]*([֐-׿ ]+?)\s*[:：]\s*(.*)$/);
      if (!m) return;
      var tag = m[1].trim(), val = (m[2] || '').trim();
      if (val === '-' || val === '—' || /^(ריק|לא\s*(ידוע|צוין|נמצא|רלוונטי))$/.test(val)) val = '';
      if (tag === 'פריט') {                                  // פריט חוזר: "<תיאור> | <כמות>"
        if (val) {
          var parts = val.split('|');
          var d = (parts[0] || '').trim();
          var q = ((parts.slice(1).join('|').match(/\d[\d,]*/) || [''])[0]).replace(/,/g, '');
          if (d || q) { items.push({ desc: d, qty: q }); found = true; }
        }
        return;
      }
      var key = map[tag];
      if (!key) return;
      if (key === 'qty') out.qty = ((val.match(/\d[\d,]*/) || [''])[0]).replace(/,/g, '');
      else out[key] = val;
      if (val) found = true;
    });
    out.items = items;
    if (items.length === 1) {
      if (!out.desc) out.desc = items[0].desc;
      if (!out.qty) out.qty = items[0].qty;
    } else if (items.length > 1) {
      out.desc = items.map(function (it) { return '• ' + it.desc + (it.qty ? (' — ' + it.qty + ' יח\'') : ''); }).join('\n');
      out.qty = '';                                          // כמה פריטים — הכמות מופיעה בכל שורה
    }
    // גיבוי: אם המודל בכל זאת החזיר JSON
    if (!found) {
      var jm = String(text == null ? '' : text).match(/\{[\s\S]*\}/);
      if (jm) { try {
        var j = JSON.parse(jm[0]);
        ['customer', 'desc', 'qty', 'date', 'address', 'area', 'notes'].forEach(function (k) {
          if (j[k] != null) out[k] = String(j[k]);
        });
        if (out.desc || out.qty) out.items = [{ desc: out.desc, qty: out.qty }];
      } catch (e) {} }
    }
    return out;
  }

  // ── בניית הבקשה ל-Claude (הקובץ עצמו, לא טקסט מחולץ) ──────────────────────
  function buildPayload(opts) {
    opts = opts || {};
    var content = [];
    if (opts.pdfB64) content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: opts.pdfB64 } });
    if (opts.imgB64) content.push({ type: 'image', source: { type: 'base64', media_type: opts.mime, data: opts.imgB64 } });
    var ask = 'חלץ את פרטי ההזמנה והחזר בפורמט השדות בלבד.';
    if (opts.text) ask += '\n\nטקסט ההזמנה:\n' + opts.text;
    content.push({ type: 'text', text: ask });
    // ⚠️ אין לשלוח 'betas' בגוף הבקשה הגולמי — מחזיר 400.
    return { model: 'claude-opus-4-8', max_tokens: 1024, system: SYS, messages: [{ role: 'user', content: content }] };
  }

  // הטקסט מתוך תשובת Claude
  function replyText(data) {
    var text = '';
    ((data && data.content) || []).forEach(function (b) { if (b && b.type === 'text') text += b.text; });
    return text;
  }

  // שורות ההזמנה → שורות לטבלת-הקליטה של המשרד
  function toRows(ex) {
    var src = (ex && ex.items && ex.items.length) ? ex.items
      : (ex && (ex.desc || ex.qty)) ? [{ desc: ex.desc, qty: ex.qty }] : [];
    return src.map(function (it) {
      return { sku: '', name: String(it.desc || '').trim(), qty: parseInt(it.qty, 10) || 0, packs: 0 };
    }).filter(function (r) { return r.name || r.qty; });
  }

  return { SYS: SYS, parseOrderTags: parseOrderTags, buildPayload: buildPayload, replyText: replyText, toRows: toRows };
});
