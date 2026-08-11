/* ═══════════════════════════════════════════════════════════════════════════
   page-replace.js — החלפת עמוד **לפי דרישת בית-הדפוס**, מהעלאה ועד להסרת
   הגרסה הקודמת.

   ⚠️ **מה נדרש (בקשת-בעלים, 10/08/2026).** אחרי שהלקוח מעלה את העמוד
   שבית-הדפוס ביקש, הוא נדרש **לדפדף שוב** בריצה או בעיתון המלא, לאשר
   במפורש שהסדר נכון, ואז: בית-הדפוס מוריד את המתוקן, והגרסה הקודמת
   מסומנת "עבר תיקון" ונעלמת מהפורטל וממסך-הדפוס — "שלא יודפס בטעות".

   ⚠️ **ההחלטה המרכזית: גרסה חדשה נכנסת _במקום_ הקודמת, לא לידה.** לו
   נוצרה רשומה שנייה, היו רגעים שבהם שתי גרסאות של אותו גיליון חיות
   במקביל במסך-הדפוס — וזה מסוכן יותר מהמצב לפני התיקון. לכן הגרסה
   הקודמת עוברת לארכיון תחת ‎<יחידה>/versions/v<n>‎, והיחידה עצמה
   מצביעה תמיד על הקובץ העדכני בלבד. "הסרה מהפורטל וממסך-הדפוס" מתקיימת
   מעצם המבנה, ולא כפעולת-מחיקה שיכולה להיכשל בשקט.

   ⚠️ **שני מנגנוני-הבטיחות בצד בית-הדפוס.** תיקון שמגיע בשקט הוא בדיוק
   איך שמודפסת גרסה שגויה:
     1. ‎shopSeenAt‎ מתאפס → הגיליון נספר שוב כ"קובץ חדש שטרם נצפה"
        (מנגנון קיים ש-shop-view כבר מנטר), ותג "🔁 עבר תיקון" מוצג.
     2. ‎isStale‎ — רשימת-הפרופרים במסך-הדפוס מתרעננת רק כל כמה מנות,
        ולכן הורדה מתוך המטמון עלולה למשוך את הקובץ שהוחלף. ההורדה
        מאמתת מול הרשומה החיה לפני שהיא מגישה קובץ.

   תלוי ב-page-swap.js (גרסאות · נתיב-מגורסן · תיאור-שינויים) — מקור-אמת
   אחד, ולא העתק שיסטה ממנו.

   הרצת הבדיקות: node page-replace-tests.js
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./page-swap.js'));
  else root.PageReplace = factory(root.PageSwap);
})(typeof self !== 'undefined' ? self : this, function (PS) {
  'use strict';

  var MODE = 'addpages';

  var str = function (v) { return String(v == null ? '' : v).trim(); };
  var num = function (v) { var n = Number(v); return isFinite(n) ? n : 0; };

  /* ── קריאת היעד מהכתובת ─────────────────────────────────────────────────
     ⚠️ שער ‎mode‎ ראשון ומחייב: בלעדיו כל העלאה רגילה הייתה נכנסת למסלול
     התיקון — כלומר דורסת גרסה קיימת במקום ליצור ריצה חדשה. */
  function param(search, key) {
    var m = new RegExp('[?&]' + key + '=([^&#]*)').exec(str(search));
    if (!m) return '';
    try { return decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) { return m[1]; }
  }
  function fromUrl(search) {
    var s = str(search);
    if (s && s.charAt(0) !== '?' && s.charAt(0) !== '&') s = '?' + s;
    if (param(s, 'mode') !== MODE) return null;
    var id = param(s, 'id');
    if (!id) return null;
    return { proofId: id, partId: param(s, 'part') || null, noticeId: param(s, 'nid') || null };
  }

  /* ── איזו יחידה מתקנים ──────────────────────────────────────────────────
     ⚠️ ריצה נספרת רק אם יש לה קובץ מאושר: ריצה בלי קובץ אינה "יעד לתיקון",
     והצגתה בבורר הייתה מזמינה את הלקוח לתקן משהו שלא קיים. */
  function runsOf(rec) {
    var r = rec || {}, parts = (r.parts && typeof r.parts === 'object') ? r.parts : {};
    return Object.keys(parts).map(function (k) {
      var p = parts[k] || {};
      return { id: k, name: str(p.name) || 'ריצה', pages: num(p.pageCount),
               approvedAt: num(p.approvedAt), fileUrl: str(p.fileUrl) };
    }).filter(function (x) { return !!x.fileUrl; })
      .sort(function (a, b) { return a.approvedAt - b.approvedAt; });
  }

  function unitOf(rec, target) {
    var r = rec || {};
    if (!target) return null;
    return target === 'full' ? r : (((r.parts && r.parts[target]) || null));
  }

  function _full(r, runs) {
    return str(r.fileUrl) ? { target: 'full', need: 'ok', runs: runs }
                          : { target: null, need: 'none', runs: runs };
  }
  /* need: 'ok' = יש יעד · 'ask' = כמה ריצות, הלקוח בוחר · 'none' = אין
     קובץ מאושר בכלל, ולכן אין מה לתקן.
     ⚠️ **'ask' אינו השאלות שהתלוננו עליהן.** אין כאן שם-עיתון ואין מספר-
     גיליון — רק בחירה מבין הריצות שכבר קיימות בגיליון הזה. */
  function pickTarget(rec, partId) {
    var r = rec || {}, runs = runsOf(r), ids = runs.map(function (x) { return x.id; });
    var pid = str(partId);
    if (pid) {
      if (ids.indexOf(pid) >= 0) return { target: pid, need: 'ok', runs: runs };
      /* ⚠️ ‏partId שאינו קיים אינו נבחר בשקט. שגיאה בכתובת (או ריצה
         שנמחקה) הייתה מתקנת את הריצה הלא-נכונה — נזק שקט וקשה לגילוי. */
      if (ids.length) return { target: null, need: 'ask', runs: runs };
      return _full(r, runs);
    }
    if (r.mode === 'full' && str(r.fileUrl)) return { target: 'full', need: 'ok', runs: runs };
    if (ids.length === 1) return { target: ids[0], need: 'ok', runs: runs };
    if (ids.length > 1) return { target: null, need: 'ask', runs: runs };
    return _full(r, runs);
  }

  /* ── שער-הכניסה ─────────────────────────────────────────────────────────
     ⚠️ גיליון שנסגר או הושלם אינו מקבל עמודים: הקובץ יכול להיות כבר על
     המכונה, וכתיבת גרסה חדשה עליו היא בדיוק "הודפס בטעות" מהכיוון ההפוך. */
  function canReplace(rec, target) {
    var r = rec || {};
    if (r._deleted) return { ok: false, message: 'העבודה הוסרה מהמערכת.' };
    if (num(r.completedAt) || num(r.closedAt))
      return { ok: false, message: 'הגיליון כבר נסגר בבית-הדפוס — אי אפשר להחליף עמודים. צרו קשר ונפתח גיליון חדש.' };
    var u = unitOf(r, target);
    if (!u) return { ok: false, message: 'לא נמצאה הריצה לתיקון.' };
    if (!str(u.fileUrl)) return { ok: false, message: 'אין קובץ מאושר לתיקון ביחידה הזו — יש להעלות אותה כרגיל.' };
    return { ok: true, message: '' };
  }

  /* ── שער-הדפדוף ─────────────────────────────────────────────────────────
     ⚠️ **הדרישה המפורשת: "ידרש לדפדף שוב … כדי לאשר שוב את סדר העמודים
     הנכון".** ולכן האישור נעול עד שכל התצוגות נראו. וכל שינוי נוסף מאפס
     את השער — אחרת האישור מתייחס לסדר שכבר לא קיים על המסך, וזו הצהרה
     שקרית בשם הלקוח.
     ⚠️ אינדקס מחוץ-לתחום אינו נספר: אחרי מחיקת עמוד נשארות רשומות-דפדוף
     של תצוגות שאינן קיימות, וספירתן הייתה פותחת את השער בלי שדופדף. */
  function browseGate(seen, total) {
    var t = Math.max(0, Math.floor(num(total)));
    var uniq = {}, n = 0;
    (seen || []).forEach(function (v) {
      var i = Math.floor(num(v));
      if (i >= 0 && i < t && !uniq[i]) { uniq[i] = 1; n++; }
    });
    var remaining = Math.max(0, t - n);
    var label = t === 0 ? 'אין עמודים לדפדוף'
      : remaining === 0 ? '✓ דופדפו כל העמודים — אפשר לאשר'
      : ('דפדוף-אימות: נותרו ' + remaining + ' מתוך ' + t + ' — יש לעבור על כל העמודים לפני האישור');
    return { ok: t > 0 && remaining === 0, seen: n, total: t, remaining: remaining, label: label };
  }

  /* נוסח האישור. ⚠️ הוא אומר במפורש מה יקרה לגרסה הקודמת: אישור שאינו
     מסביר את ההסרה הוא אישור שהלקוח לא באמת נתן. */
  function confirmText(o) {
    o = o || {};
    var v = Math.max(2, num(o.version) || 2);
    var L = ['לשלוח את הגרסה המתוקנת לבית-הדפוס?', ''];
    L.push('· ' + (str(o.unitName) || 'העיתון') + (str(o.issue) ? (' · גיליון ' + str(o.issue)) : ''));
    L.push('· ' + (str(o.changesLabel) || 'ללא שינוי'));
    L.push('· נשמר כגרסה ' + v + ' — גרסה ' + (v - 1) + ' תסומן "עבר תיקון" ותוסר מהפורטל וממסך-הדפוס');
    if (str(o.warn)) L.push('', '⚠️ ' + str(o.warn));
    L.push('', 'באישור אתם מצהירים שדפדפתם בעיתון לאחר ההחלפה ושסדר העמודים נכון.');
    return L.join('\n');
  }

  /* ── ארכיון הגרסה הקודמת ────────────────────────────────────────────────
     ⚠️ הנתיב יורד **תחת** היחידה ולא לצד ‎parts‎: מפתח חדש תחת parts היה
     נספר כריצה בכל מסך שמונה ריצות — כלומר הגרסה שהוחלפה הייתה חוזרת
     להיראות כעבודה להדפסה. זה בדיוק מה שהתיקון בא למנוע. */
  function archivePath(proofId, target, version) {
    var base = 'customerProofs/' + str(proofId);
    if (target && target !== 'full') base += '/parts/' + str(target);
    return base + '/versions/v' + num(version);
  }

  /* ⚠️ הצילום לוקח את הקובץ ה**קודם**. לקיחת החדש הייתה משאירה את הגרסה
     שהוחלפה בלי מצביע כלל — בלתי-שחזירה, וגם בלי ראיה למה הוחלף. */
  function archiveOf(unit, o) {
    var u = unit || {}; o = o || {};
    return {
      version: PS.currentVersion(u),
      fileUrl: str(u.fileUrl), filePath: str(u.filePath),
      pageCount: num(u.pageCount), fileSize: num(u.fileSize), approvedAt: num(u.approvedAt),
      corrected: true, supersededAt: num(o.at), supersededBy: num(o.version),
      reason: str(o.reason) || 'pageReplace',
      noticeId: str(o.noticeId) || null,
      changes: o.changes || null
    };
  }

  /* ── השדות שנכתבים על היחידה עצמה ───────────────────────────────────────
     ⚠️ ‎shopSeenAt: null‎ הוא לב הבטיחות. זה המנגנון הקיים שבו בית-הדפוס
     רואה "קובץ חדש שטרם נצפה" (‏shop-view.newFiles), והוא גם מה שמחזיר
     את פס-הסטטוס צעד אחורה — כלומר סימן גלוי שמשהו השתנה. בלעדיו התיקון
     מגיע בשקט, וגרסה שגויה מודפסת.
     ⚠️ ‎prepressRemoved: null‎ — ריצה שקדם-הדפוס הסיר מרשימת-האימפוזיציה
     חייבת לחזור כשהיא מתוקנת; אחרת התיקון קיים ברשומה ואינו על המסך. */
  function newFields(unit, o) {
    var u = unit || {}; o = o || {};
    var v = num(o.version) || PS.nextVersion(u);
    return {
      fileUrl: str(o.fileUrl), filePath: str(o.filePath),
      pageCount: num(o.pageCount), fileSize: num(o.fileSize),
      version: v, status: 'approved', approvedAt: num(o.at),
      correctedAt: num(o.at), correctedFrom: v - 1,
      correctedNote: str(o.note) || null,
      shopSeenAt: null, prepressRemoved: null
    };
  }

  /* ── צד בית-הדפוס ───────────────────────────────────────────────────────
     ⚠️ התג נשאר עד שהתיקון נצפה/הורד בפועל. תג שנעלם מעצמו אחרי רענון
     הוא תג שלא נקרא. ‏correctionSeenAt הוא שדה נפרד ולא shopSeenAt, כדי
     שלא להתנגש בסימון-הצפייה הקיים של קדם-הדפוס. */
  function correctedTag(unit) {
    var u = unit || {};
    var at = num(u.correctedAt);
    if (!at) return '';
    var v = PS.currentVersion(u);
    if (num(u.correctionSeenAt) >= at) return '✓ תיקון נצפה · גרסה ' + v;
    return '🔁 עבר תיקון · גרסה ' + v + ' — יש להוריד מחדש';
  }
  function needsRedownload(unit) {
    var u = unit || {};
    return !!num(u.correctedAt) && num(u.correctionSeenAt) < num(u.correctedAt);
  }

  /* ⚠️ הקובץ שבמטמון-המסך אינו בהכרח העדכני: רשימת-הפרופרים מתרעננת רק
     כל כמה מנות-poll. הורדה מהמטמון היא בדיוק הדרך שבה מודפסת גרסה
     שהוחלפה, ולכן ההורדה מאמתת מול הרשומה החיה. */
  function isStale(cached, fresh) {
    var c = cached || {}, f = fresh || {};
    if (!str(f.fileUrl)) return false;                       /* אין מול מה להשוות */
    if (PS.currentVersion(f) > PS.currentVersion(c)) return true;
    return !!(str(c.fileUrl) && str(c.fileUrl) !== str(f.fileUrl));
  }

  /* היסטוריית-הגרסאות של יחידה, חדשה→ישנה.
     ⚠️ אלה אינן ריצות. כל מסך שמונה ריצות חייב להתעלם מהן. */
  function versionsOf(unit) {
    var u = unit || {}, vs = (u.versions && typeof u.versions === 'object') ? u.versions : {};
    return Object.keys(vs).map(function (k) {
      var r = vs[k] || {}, out = { _key: k };
      for (var f in r) if (Object.prototype.hasOwnProperty.call(r, f)) out[f] = r[f];
      return out;
    }).filter(function (x) { return num(x.version) > 0; })
      .sort(function (a, b) { return num(b.version) - num(a.version); });
  }

  return {
    MODE: MODE, fromUrl: fromUrl,
    runsOf: runsOf, unitOf: unitOf, pickTarget: pickTarget, canReplace: canReplace,
    browseGate: browseGate, confirmText: confirmText,
    archivePath: archivePath, archiveOf: archiveOf, newFields: newFields,
    correctedTag: correctedTag, needsRedownload: needsRedownload,
    isStale: isStale, versionsOf: versionsOf
  };
});
