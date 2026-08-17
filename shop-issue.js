/* ═══════════════════════════════════════════════════════════════════════════
   shop-issue.js — כרטיס-גיליון במסך "לקוחות ועבודות".

   ⚠️ **הבקשה (בעלים 11/08/2026):** "החלק האמצעי יהיה יותר מרווח עם לחצנים
   ברורים… וכל גיליון יהיה בנפרד ולא יראו את הגיליון הקודם בצורה פתוחה —
   בלחיצה ייפתח הגיליון הקודם. לחצן אושר להדפסה, לחצן דרוש תיקון."

   ⚠️ **גיליון אחד פתוח בכל רגע.** הרשימה של לקוח ותיק היא עשרות גיליונות;
   כשכולם פתוחים, זה שעובדים עליו נבלע בהיסטוריה. הפתוח כברירת-מחדל הוא
   **החדש-הפעיל**, כי הוא זה שעובדים עליו — לא פשוט "האחרון שנוצר".

   ⚠️ **"אושר להדפסה" הוא שדה חדש (‎printApprovedAt/By‎), ולא שימוש-מחדש.**
   ‏approvedAt = הלקוח שלח · apogeeApprovedAt = הלקוח אישר פרופר ·
   completedAt = העבודה נגמרה. אף אחד מהם אינו "בית-הדפוס אישר להדפסה",
   ודחיסה לתוך אחד מהם הייתה שוברת את מי שקורא אותו היום.

   הרצת הבדיקות: node shop-issue-tests.js
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ShopIssue = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var num = function (v) { var n = Number(v); return isFinite(n) ? n : 0; };
  var str = function (v) { return String(v == null ? '' : v).trim(); };

  function idOf(p) { return str((p || {}).id || (p || {})._id); }
  function timeOf(p) {
    var r = p || {};
    return num(r.createdAt) || num(r.approvedAt) || 0;
  }
  function isActive(p) {
    var r = p || {};
    return !num(r.completedAt) && !num(r.closedAt);
  }

  /* חדש→ישן. ⚠️ מיון יציב לפי מזהה כשהזמנים שווים: שתי עבודות שנוצרו
     באותה שנייה היו מתחלפות בכל רינדור, והמסך "קופץ". */
  function sortIssues(list) {
    return (list || []).slice().sort(function (a, b) {
      var d = timeOf(b) - timeOf(a);
      return d !== 0 ? d : (idOf(a) < idOf(b) ? 1 : -1);
    });
  }

  /* איזה גיליון פתוח. ⚠️ בחירה מפורשת גוברת — אבל **רק אם היא עדיין
     קיימת ברשימה**: מזהה של עבודה שנמחקה או שעברה ללקוח אחר היה משאיר
     את המסך בלי שום גיליון פתוח, כלומר נראה ריק. */
  function openId(list, explicit) {
    var rows = sortIssues(list), ex = str(explicit);
    if (ex && rows.some(function (p) { return idOf(p) === ex; })) return ex;
    for (var i = 0; i < rows.length; i++) if (isActive(rows[i])) return idOf(rows[i]);
    return rows.length ? idOf(rows[0]) : '';
  }

  /* ── מצב הגיליון ─────────────────────────────────────────────────────────
     סדר הבדיקות הוא סדר-הגמר: מה שקרה אחרון גובר. */
  function statusOf(p) {
    var r = p || {};
    if (num(r.completedAt)) return { key: 'done', label: '🏁 הושלם', cls: 'b-done' };
    if (num(r.printApprovedAt)) return { key: 'print', label: '✅ אושר להדפסה', cls: 'b-approved' };
    if (num(r.closedAt)) return { key: 'closed', label: '🔒 סגור להעלאה', cls: 'b-wait' };
    if (num(r.apogeeApprovedAt) || r.foldApprovalStatus === 'approved')
      return { key: 'customer-ok', label: '✓ הלקוח אישר', cls: 'b-approved' };
    if (r.status === 'approved' || r.status === 'parts' || num(r.approvedAt) || r.parts)
      return { key: 'received', label: '📥 התקבל', cls: 'b-new' };
    return { key: 'waiting', label: '⏳ ממתין לקבצים', cls: 'b-wait' };
  }

  function printApproved(p) { return num((p || {}).printApprovedAt) > 0; }

  /* ⚠️ "אשר קבלה ללקוח" הוא ‎shopSeenAt‎ הקיים — אותו שדה שהפורטל כבר
     מציג כ"בית-הדפוס קיבל את הקבצים". שדה חדש כאן היה יוצר שני מקורות
     לאותה אמירה, ואחד מהם היה מפגר אחרי השני. */
  function seenAt(p) {
    var r = p || {}, m = num(r.shopSeenAt);
    var parts = (r.parts && typeof r.parts === 'object') ? r.parts : {};
    Object.keys(parts).forEach(function (k) {
      var t = num((parts[k] || {}).shopSeenAt); if (t > m) m = t;
    });
    return m;
  }
  /* עוזר: יש בעבודה קבצים מהעלאה-מקובצת של הפורטל (‎files:{f0:{fileUrl}}‎).
     ⚠️ 13/08/2026: המבנה הזה נכתב ע"י customer-portal.html **בלי**
     approvedAt/fileUrl/parts/apogeeUrl (רק source:'portal' + files + createdAt).
     הוא נשמט מ-hasArrived ומ-unitsOf, ולכן עיתון שהלקוח **כן** העלה נראה
     ל-hasArrived כ"ריק" — והגידור החדש (cardActions) הסתיר עליו את הכפתורים
     והציג "טרם התקבלו קבצים", בזמן שהטבלה הקלאסית מציגה אותם להורדה.
     נתפס בביקורת אדוורסרית לפני פריסה. */
  function fileEntries(p) {
    var r = p || {}, files = (r.files && typeof r.files === 'object') ? r.files : {};
    /* ⚠️ ‏_k = מפתח-ה-RTDB האמיתי (14/08/2026). עד היום האריח מוען לפי
       אינדקס-מיקום, ו-Firebase ממיין מפתחות לקסיקוגרפית — ‏f10 לפני f2 —
       כך שמעל 10 קבצים שיבוץ-מחדש פגע בקובץ הלא-נכון. המפתח נוסע עם
       הרשומה במקום להיגזר מהמקום. */
    return Object.keys(files).map(function (k) {
      var f = files[k] || {};
      var o = { _k: k }; Object.keys(f).forEach(function (x) { o[x] = f[x]; });
      return o;
    }).filter(function (f) { return str(f.fileUrl); });
  }

  /* יש מה לאשר רק כשבאמת הגיע משהו. ⚠️ כפתור "אשר קבלה" על גיליון ריק
     מאשר ללקוח קבלה של כלום. */
  function hasArrived(p) {
    var r = p || {};
    if (num(r.approvedAt) || str(r.fileUrl) || str(r.apogeeUrl)) return true;
    if (fileEntries(r).length) return true;
    var parts = (r.parts && typeof r.parts === 'object') ? r.parts : {};
    return Object.keys(parts).some(function (k) { return str((parts[k] || {}).fileUrl); });
  }

  /* ── אילו פעולות מוצגות על הכרטיס הפתוח ─────────────────────────────────
     ⚠️ 13/08/2026, דיווח-בעלים: גיליון שממתין לקבצים הציג "אושר להדפסה",
     "דרוש תיקון" ו"הורד" — נראה כאילו אפשר להוריד ולאשר בשם הלקוח, כשאין
     על מה. אותו עיקרון בדיוק כמו "אשר קבלה" (hasArrived, למעלה): פעולה
     בלי מושא אינה מוצגת. ההחלטה כאן — טהורה ונבדקת; הכרטיס רק מצייר. */
  /* ⚠️ 16/08/2026, בקשת-בעלים: העלאה שטרם אושרה ע"י הלקוח היא **טיוטה**
     — הדפוס לא מוריד ולא מאשר ממנה, כדי שלא יודפס גיליון שהלקוח עוד
     מסדר. ‏customerApprovedAt נכתב רק אחרי דפדוף+אישור בפורטל.
     ⚠️ **רק** על העלאות-פורטל חדשות (source==='portal' עם files):
     שאר המסלולים (parts מאושרות, apogee, עיתון-מלא ותיק) נשארים כשהיו,
     אחרת עבודות שכבר בייצור היו ננעלות בבת-אחת. */
  function isDraft(p) {
    var r = p || {};
    if (r.customerApprovedAt || r.approvedAt || r.apogeeUrl) return false;
    if (r.parts && Object.keys(r.parts).length) return false;
    return str(r.source) === 'portal' && !!(r.files && Object.keys(r.files).length);
  }
  function cardActions(p) {
    var arrived = hasArrived(p);
    var draft = isDraft(p);
    return { canPrintApprove: arrived && !draft, canRequestFix: arrived,
             canDownload: arrived && !draft, showUploadHint: !arrived,
             draft: draft };
  }

  /* ── היחידות שאפשר לצפות/להוריד ─────────────────────────────────────────
     ריצה בלי קובץ אינה יחידה: כפתור שמוביל לכלום גרוע מהיעדרו. */
  function unitsOf(p) {
    var r = p || {}, out = [];
    if (str(r.fileUrl)) out.push({ kind: 'full', partId: '', label: 'העיתון המלא',
                                   url: str(r.fileUrl), pages: num(r.pageCount) });
    var parts = (r.parts && typeof r.parts === 'object') ? r.parts : {};
    Object.keys(parts).map(function (k) {
      var t = parts[k] || {};
      return { kind: 'part', partId: k, label: str(t.name) || 'ריצה',
               url: str(t.fileUrl), pages: num(t.pageCount), at: num(t.approvedAt) };
    }).filter(function (u) { return !!u.url; })
      .sort(function (a, b) { return a.at - b.at; })
      .forEach(function (u) { out.push(u); });
    /* ⚠️ קבצי העלאה-מקובצת של הפורטל (‎files:{}‎) — קובץ גולמי לכל אחד,
       בלי דפדוף (אין assemble כמו ל-parts). מוצג כ-kind:'file', ולכן
       הכרטיס נותן לו הורדה ישירה ולא קישור-דפדוף. ראה fileEntries. */
    fileEntries(r).forEach(function (f) {
      out.push({ kind: 'file', partId: '', label: str(f.fileName) || 'קובץ',
                 url: str(f.fileUrl), pages: 0 });
    });
    if (!out.length && str(r.apogeeUrl))
      out.push({ kind: 'apogee', partId: '', label: 'פרופר לאישור', url: str(r.apogeeUrl), pages: num(r.pageCount) });
    return out;
  }

  /* ── מה מוצג על הכרטיס המכווץ ───────────────────────────────────────────
     ⚠️ מספיק כדי להחליט אם לפתוח, בלי לפתוח. */
  function summaryOf(p) {
    var r = p || {}, u = unitsOf(r);
    var pages = u.length ? u.reduce(function (s, x) { return s + x.pages; }, 0) : num(r.pageCount);
    var pend = [];
    (r.pendingPages || []).forEach(function (x) { if (pend.indexOf(x) < 0) pend.push(x); });
    var parts = (r.parts && typeof r.parts === 'object') ? r.parts : {};
    Object.keys(parts).forEach(function (k) {
      ((parts[k] || {}).pendingPages || []).forEach(function (x) { if (pend.indexOf(x) < 0) pend.push(x); });
    });
    return {
      id: idOf(r), title: str(r.title) || 'עיתון', issue: str(r.issue),
      at: timeOf(r), units: u.length, pages: pages,
      status: statusOf(r), seen: seenAt(r) > 0, arrived: hasArrived(r),
      pendingPages: pend.sort(function (a, b) { return num(a) - num(b); }),
      version: num(r.version) || 1, corrected: num(r.correctedAt) > 0
    };
  }

  /* כותרת קריאה לגיליון. ⚠️ מספר-הגיליון הוא מה שמבדיל בין שורות באותו
     שם, ולכן הוא חלק מהכותרת ולא פרט-משנה. */
  function titleOf(p) {
    var r = p || {}, t = str(r.title) || 'עיתון';
    return r.issue ? (t + ' · גיליון ' + str(r.issue)) : t;
  }

  /* ── הפעולה "אושר להדפסה" ────────────────────────────────────────────────
     ⚠️ מתג דו-כיווני: אישור בטעות חייב להיות הפיך, אחרת מתקנים אותו
     במסד-הנתונים. ‎null‎ מוחק את השדה במסלול REST. */
  /* ⚠️ בקשת-בעלים 17/08/2026: "אושר להדפסה" סוגר את הגיליון להעלאה. עד עכשיו
     היו אלה שתי פעולות נפרדות, ובפועל אושר גיליון שנשאר פתוח — הלקוח המשיך
     להעלות **אחרי** שהלוחות יצאו. אישור = סגירה.
     ⚠️ הסגירה מסומנת ב-`closedBy:'print-approval'` כדי שביטול-האישור יחזיר
     **רק** סגירה שנולדה מהאישור. גיליון שנסגר ידנית קודם נשאר סגור — אחרת
     ביטול-אישור היה פותח בשקט גיליון שמישהו סגר בכוונה. */
  function printApprovePatch(p, opts) {
    var o = opts || {}, r = p || {};
    if (printApproved(r)) {
      var patch = { printApprovedAt: null, printApprovedBy: null };
      if (r.closedBy === 'print-approval') { patch.closedAt = null; patch.closedBy = null; }
      return patch;
    }
    var at = num(o.at) || 0;
    var out = { printApprovedAt: at, printApprovedBy: str(o.by) || 'בית-הדפוס' };
    if (!num(r.closedAt)) { out.closedAt = at; out.closedBy = 'print-approval'; }
    return out;
  }
  /* ── העברת ריצה למקומה (מיספור-מחדש) ────────────────────────────────────
     ⚠️ אירוע-ייצור 17/08/2026: לקוח העלה את הריצות בסדר הפוך — השער היה
     ב"ריצה 2". שם-הריצה הוא מה שקובע את הסדר (ראה `_partsOrdered`), ולכן
     "להעביר ריצה למקום הנכון" = לשנות את **מספר-הריצה שבשם**.
     שני כללים שנלמדו בדרך:
       1. **לא מוחקים את השם** — מחליפים בו את המספר בלבד. השם נושא גם
          מספר-גיליון ומספר-צבעים ("… 719 R-2 4color"), והם ראיה.
       2. אם המספר תפוס — **מחליפים** בין השתיים ולא דורסים. שתי ריצות
          באותו מספר משמעותן סדר לא-מוגדר, כלומר בדיוק הבאג מחדש. */
  function runNoOfName(nm) {
    var s = str(nm);
    var m = s.match(/(?:^|[^A-Za-z0-9])(?:r|ריצה)\s*[-_ ]?\s*(\d{1,2})(?![0-9])/i);
    return m ? (parseInt(m[1], 10) || null) : null;
  }
  function renameRunNo(nm, n) {
    var s = str(nm);
    var re = /((?:^|[^A-Za-z0-9])(?:r|ריצה)\s*[-_ ]?\s*)(\d{1,2})(?![0-9])/i;
    return re.test(s) ? s.replace(re, function(_, pre){ return pre + n; }) : ('ריצה ' + n);
  }
  /* מחזיר { updates: {'<pid>': {name}}, swappedWith } או { error } */
  function runRenumberPatch(p, partId, newNo) {
    var parts = (p || {}).parts || {};
    var n = num(newNo);
    if (!parts[partId]) return { error: 'הריצה לא נמצאה בגיליון הזה' };
    if (!(n >= 1 && n <= 99)) return { error: 'מספר-ריצה בין 1 ל-99' };
    var cur = runNoOfName(parts[partId].name);
    if (cur === n) return { error: 'הריצה כבר במקום ' + n };
    var updates = {}, swappedWith = null;
    Object.keys(parts).forEach(function (k) {
      if (k !== partId && runNoOfName(parts[k].name) === n) swappedWith = k;
    });
    updates[partId] = { name: renameRunNo(parts[partId].name, n) };
    // ההחלפה הדדית: מי שישב ב-n מקבל את המקום שהתפנה
    if (swappedWith && cur != null) updates[swappedWith] = { name: renameRunNo(parts[swappedWith].name, cur) };
    return { updates: updates, swappedWith: swappedWith, from: cur, to: n };
  }

  function printApproveLabel(p) {
    return printApproved(p) ? '↩ בטל אישור-הדפסה' : '✅ אושר להדפסה';
  }

  /* ═══ רשת-העמודים + סימוני-עמודים (עיצוב-מחדש 13/08/2026, שרטוט-בעלים) ═══
     הלוגיקה טהורה וכאן; המסך רק מצייר. שלושה חלקים:
       1. pageNoOf — "שער"=עמוד 1, "עמוד 12"→12; מה שלא מספר → null.
       2. pageTiles — אריחי-העמודים של גיליון: מסודרים שער→2→3, עמודים
          חסרים (pendingPages) כאריחים מקווקווים, וסימוני-עמודים מוצמדים.
       3. markPatch/markOf — סימון עמוד מתוך הדפדוף: 'replace' (דרוש
          החלפה, עם הערה מה-הבעיה + מיקום מסומן) או 'print-asis' (הלקוח
          אישר להדפסה בלי תיקון).

     ⚠️ **מבנה-האחסון**: ‏customerProofs/<id>/pageMarks/<target>/<n>‎ =
     ‏{kind, note, spot, by, at}‎. ‏target הוא 'full' (העיתון המלא) או מזהה-
     ריצה — כי מספרי-עמודים של ריצה נספרים בתוכה, ומפתח שטוח היה מערבב
     "עמוד 3 של ריצה ב" עם "עמוד 3 של העיתון". ‏spot = מלבן באחוזי-עמוד
     {x,y,w,h} — כדי שהלקוח יראה איפה הבעיה, בכל גודל-תצוגה. */
  var MARK_KINDS = ['replace', 'print-asis'];
  var MARK_LABELS = {
    replace: { icon: '🔁', label: 'דרוש החלפה' },
    'print-asis': { icon: '✔', label: 'הלקוח אישר להדפסה כך' }
  };

  function pageNoOf(label) {
    var s = str(label);
    if (!s) return null;
    if (/שער|עטיפה|cover/i.test(s)) return 1;
    var m = s.match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
  }

  function marksFor(p, target) {
    var r = p || {}, all = (r.pageMarks && typeof r.pageMarks === 'object') ? r.pageMarks : {};
    var t = all[str(target) || 'full'];
    return (t && typeof t === 'object') ? t : {};
  }
  function markOf(p, target, n) {
    var m = marksFor(p, target)[String(n)];
    return (m && typeof m === 'object' && MARK_KINDS.indexOf(m.kind) >= 0) ? m : null;
  }

  /* ה-patch שכותב/מנקה סימון. ⚠️ kind=null מוחק (null ב-PATCH = מחיקה ב-RTDB).
     ‏spot מנורמל-וממוסגר ל-0..100 — ערך מחוץ-לטווח הוא באג-קורא, לא נתון. */
  function markPatch(target, n, kind, opts) {
    var o = opts || {};
    var t = str(target) || 'full';
    var pn = parseInt(n, 10);
    if (!(pn >= 1 && pn <= 2000)) return null;
    var path = 'pageMarks/' + t.replace(/[.#$\[\]\/]/g, '_') + '/' + pn;
    var out = {};
    if (kind === null) { out[path] = null; return out; }
    if (MARK_KINDS.indexOf(kind) < 0) return null;
    var m = { kind: kind, note: str(o.note).slice(0, 300) || null,
              by: str(o.by).slice(0, 60) || null, at: num(o.at) || null, spot: null };
    var s = o.spot;
    if (s && typeof s === 'object') {
      var clamp = function (v) { v = Number(v); return isFinite(v) ? Math.max(0, Math.min(100, Math.round(v * 100) / 100)) : 0; };
      var x = clamp(s.x), y = clamp(s.y), w = clamp(s.w), h = clamp(s.h);
      if (w >= 0.5 && h >= 0.5) m.spot = { x: x, y: y, w: Math.min(w, 100 - x), h: Math.min(h, 100 - y) };
    }
    out[path] = m;
    return out;
  }

  /* ── אריחי-העמודים של הגיליון הפתוח ─────────────────────────────────────
     ⚠️ שני מסלולי-תוכן, שתי צורות-אריח:
       · עיתון-מלא (fileUrl + pageCount) → אריח לכל עמוד **בתוך** הקובץ
         (page בתוך אותו PDF) — target='full'.
       · ריצות/קבצים בודדים → אריח ליחידה; אם שם-היחידה הוא עמוד
         ("עמוד 4") האריח ממוין לפי המספר — target=partId.
     עמודים חסרים (pendingPages) נשזרים כאריחי-'missing' במקומם המספרי.
     סדר: שער (1) → 2 → 3 → …; חסרי-מספר בסוף, לפי זמן-העלאה. */
  function pageTiles(p) {
    var r = p || {}, tiles = [];
    var fullUrl = str(r.fileUrl);
    var pc = num(r.pageCount);
    if (fullUrl && pc > 1) {
      for (var i = 1; i <= Math.min(pc, 400); i++) {
        tiles.push({ kind: 'page', target: 'full', pageNo: i, page: i, url: fullUrl,
                     label: i === 1 ? 'שער' : 'עמוד ' + i, at: num(r.approvedAt) || num(r.createdAt),
                     partId: '', mark: markOf(r, 'full', i) });
      }
    } else if (fullUrl) {
      tiles.push({ kind: 'page', target: 'full', pageNo: 1, page: 1, url: fullUrl,
                   label: str(r.title) || 'העיתון', at: num(r.approvedAt) || num(r.createdAt),
                   partId: '', mark: markOf(r, 'full', 1) });
    }
    var parts = (r.parts && typeof r.parts === 'object') ? r.parts : {};
    Object.keys(parts).forEach(function (k) {
      var t = parts[k] || {};
      if (!str(t.fileUrl)) return;                     // ריצה בלי קובץ אינה אריח
      var no = pageNoOf(t.name);
      tiles.push({ kind: 'page', target: k, pageNo: no, page: 1, url: str(t.fileUrl),
                   label: str(t.name) || 'ריצה', at: num(t.approvedAt),
                   partId: k, pages: num(t.pageCount) || 0, mark: markOf(r, k, 1) });
    });
    fileEntries(r).forEach(function (f, i) {
      /* ⚠️ 16/08/2026, בקשת-בעלים: שיבוץ-מחדש שומר את **שם-הקובץ המקורי**
         וכותב ‎slot‎ נפרד. כך המיקום בפועל ניתן להצלבה מול המספר שבשם,
         ואי-התאמה נאמרת ("שובץ לעמוד 3 אבל נקרא 'עמוד 5'") במקום להימחק
         בשקט ע"י שינוי-שם. רשומה ותיקה בלי slot — נופלת לשם, כמו קודם. */
      var nameNo = pageNoOf(f.fileName);
      var sl = num(f.slot);
      var no = (sl >= 1) ? sl : nameNo;
      var kk = str(f._k) || ('f' + i);
      /* התווית לפי המשבצת (שער/עמוד N) ולא לפי שם-הקובץ — הרשת נקראת
         אחיד; שם-הקובץ נשמר בשדה משלו לתצוגה ולהצלבה. */
      var lbl = (no >= 1) ? (no === 1 ? 'שער' : 'עמוד ' + no) : (str(f.fileName) || 'קובץ');
      tiles.push({ kind: 'page', target: 'file_' + kk.slice(1), pageNo: no, page: 1, url: str(f.fileUrl),
                   label: lbl, fileName: str(f.fileName), at: num(r.createdAt),
                   nameNo: nameNo, slotMismatch: !!(sl >= 1 && nameNo && nameNo !== sl),
                   partId: '', mark: markOf(r, 'file_' + kk.slice(1), 1) });
    });
    /* עמודים חסרים — רק מספרים שאין להם אריח קיים */
    var have = {};
    tiles.forEach(function (t) { if (t.pageNo != null) have[t.pageNo] = true; });
    var pend = [];
    (r.pendingPages || []).forEach(function (x) { if (pend.indexOf(x) < 0) pend.push(x); });
    Object.keys(parts).forEach(function (k) {
      ((parts[k] || {}).pendingPages || []).forEach(function (x) { if (pend.indexOf(x) < 0) pend.push(x); });
    });
    /* ⚠️ הצהרת-ספירה (14/08/2026, סידור-עמודים בפורטל): הלקוח מצהיר
       "הגיליון הזה N עמודים" (declaredPages) — וכל משבצת 1..N שאין לה
       עמוד הופכת לאריח-חסר, בלי שהדפוס יגדיר דבר. משלים את pendingPages
       (שהדפוס קובע), לא מחליף אותו. תקרה 200 — הצהרה פרועה אינה מציפה
       את הרשת באלפי משבצות. */
    var declared = num(r.declaredPages);
    if (declared >= 1) {
      for (var dp = 1; dp <= Math.min(declared, 200); dp++) {
        if (!have[dp] && pend.indexOf(dp) < 0 && pend.indexOf(String(dp)) < 0) pend.push(dp);
      }
    }
    pend.forEach(function (x) {
      var no = parseInt(x, 10);
      if (isFinite(no) && !have[no]) tiles.push({ kind: 'missing', pageNo: no, label: 'חסר עמ׳ ' + no });
    });
    tiles.sort(function (a, b) {
      var an = a.pageNo == null ? Infinity : a.pageNo;
      var bn = b.pageNo == null ? Infinity : b.pageNo;
      if (an !== bn) return an - bn;
      return num(a.at) - num(b.at);
    });
    return tiles;
  }

  return {
    idOf: idOf, timeOf: timeOf, isActive: isActive,
    sortIssues: sortIssues, openId: openId,
    statusOf: statusOf, printApproved: printApproved,
    seenAt: seenAt, hasArrived: hasArrived, isDraft: isDraft,
    unitsOf: unitsOf, summaryOf: summaryOf, titleOf: titleOf, cardActions: cardActions,
    pageNoOf: pageNoOf, pageTiles: pageTiles, markOf: markOf, markPatch: markPatch,
    MARK_KINDS: MARK_KINDS, MARK_LABELS: MARK_LABELS,
    printApprovePatch: printApprovePatch, printApproveLabel: printApproveLabel,
    runNoOfName: runNoOfName, renameRunNo: renameRunNo, runRenumberPatch: runRenumberPatch
  };
});
