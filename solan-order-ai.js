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
    + 'פריט: מק"ט=<מספר קטלוגי/מק"ט של הפריט אם מופיע בטבלה, אחרת ריק> | תיאור=<תיאור המוצר/העבודה> | כמות=<המספר בעמודת הכמות בלבד> | יחידה=<יחידת המידה: קרטון / חבילות / יחידות — כפי שמופיע>\n'
    + '(שורת "פריט:" נפרדת לכל שורת-פריט בטבלה. אל תכלול שורות של כותרת, סיכום, מע"מ, סה"כ, כתובת, טלפון או מספרי-מסמך — רק פריטים אמיתיים שהוזמנו.)\n'
    + 'מספר הזמנה: <מספר הזמנת הרכש/PO של הלקוח כפי שמופיע במסמך; אחרת ריק>\n'
    + 'תאריך: <YYYY-MM-DD אם מופיע תאריך אספקה או הזמנה>\n'
    + 'כתובת: <כתובת אספקה אם קיימת>\n'
    + 'מספר אתר: <לעידית — מספר האתר/הסניף אם מופיע, מספר בלבד (למשל 61); אחרת ריק>\n'
    + 'אזור: <אחד מ: מרכז / צפון / דרום / ירושלים / שפלה לפי הכתובת>\n'
    + 'הערות: <פרטים חשובים נוספים — מידות, סוג נייר, צבעים, גימור>\n'
    + 'אם שדה אינו ידוע השאר אותו ריק אחרי הנקודתיים. אל תמציא נתונים שאינם במסמך.';

  // ── ניתוח התשובה המתויגת → אובייקט הזמנה ──────────────────────────────────
  function parseOrderTags(text) {
    var map = { 'לקוח': 'customer', 'תיאור': 'desc', 'כמות': 'qty', 'תאריך': 'date',
                'כתובת': 'address', 'מספר אתר': 'siteNum', 'אזור': 'area', 'הערות': 'notes',
                'מספר הזמנה': 'poNumber', 'הזמנת רכש': 'poNumber', 'מספר הזמנת רכש': 'poNumber' };
    var out = { customer: '', desc: '', qty: '', date: '', address: '', siteNum: '', area: '', notes: '', poNumber: '', items: [] };
    var found = false, items = [];
    String(text == null ? '' : text).split(/\r?\n/).forEach(function (line) {
      var m = line.match(/^\s*[*\-•\s]*([֐-׿ ]+?)\s*[:：]\s*(.*)$/);
      if (!m) return;
      var tag = m[1].trim(), val = (m[2] || '').trim();
      if (val === '-' || val === '—' || /^(ריק|לא\s*(ידוע|צוין|נמצא|רלוונטי))$/.test(val)) val = '';
      if (tag === 'פריט') {                                  // פריט חוזר. פורמט מתויג:
        // "מק"ט=<sku> | תיאור=<desc> | כמות=<n> | יחידה=<unit>" · תמיכה לאחור: "<desc> | <qty>"
        if (val) {
          var sku = '', d = '', q = '', unit = '';
          var subs = val.split('|').map(function (s) { return s.trim(); }).filter(Boolean);
          var labeled = subs.some(function (s) { return /=/.test(s); });
          if (labeled) {
            subs.forEach(function (s) {
              var mm = s.match(/^([^=]+)=\s*(.*)$/); if (!mm) return;
              var lbl = mm[1].trim(), v = (mm[2] || '').trim();
              if (v === '-' || v === '—' || /^ריק$/.test(v)) v = '';
              if (/מק.?ט|קטלוג/.test(lbl)) sku = v.replace(/[^\d]/g, '');
              else if (/תיאור|שם|פריט/.test(lbl)) d = v;
              else if (/כמות/.test(lbl)) q = (v.match(/\d[\d,]*/) || [''])[0].replace(/,/g, '');
              else if (/יחיד|אריז|קרטון/.test(lbl)) unit = v;
            });
          } else {                                            // פורמט ישן: תיאור | כמות
            d = (subs[0] || '').trim();
            q = ((subs.slice(1).join('|').match(/\d[\d,]*/) || [''])[0]).replace(/,/g, '');
          }
          if (sku || d || q) { items.push({ sku: sku, desc: d, qty: q, unit: unit }); found = true; }
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
        ['customer', 'desc', 'qty', 'date', 'address', 'area', 'notes', 'poNumber'].forEach(function (k) {
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
      var n = parseInt(it.qty, 10) || 0;
      // יחידת "קרטון"/"אריזה" → המספר הוא מספר-אריזות (packs); היחידות מחושבות לפי גודל-האריזה בהתאמה ללקוח.
      var isPack = /קרטון|אריז|חביל/.test(String(it.unit || ''));
      return { sku: String(it.sku || '').trim(), name: String(it.desc || '').trim(),
               qty: isPack ? 0 : n, packs: isPack ? n : 0, unit: String(it.unit || '').trim() };
    }).filter(function (r) { return r.name || r.qty || r.packs; });
  }

  return { SYS: SYS, parseOrderTags: parseOrderTags, buildPayload: buildPayload, replyText: replyText, toRows: toRows };
});
