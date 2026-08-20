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
  /* ── כרטיס-לקוח (בקשת-בעלים 18/08/2026) ─────────────────────────────────
     "פרטי-קשר מלאים לכל לקוח". ⚠️ הנתונים **כבר קיימים** — 2,850 רשומות
     ב-`customers` (name/phone/email/address) ו-43 ב-`newspapers`
     (day/size/paper/color/copies/notes). לא נוצר כאן שדה חדש ולא מסד שני;
     זו הרכבה בלבד. השמות אינם זהים בין המקורות, ולכן ההתאמה עוברת
     בנרמול-שם הקיים (normName) ולא בהשוואת-מחרוזות.
     ⚠️ שדה חסר מוצג כחסר. לא ממציאים "לא ידוע" ולא מסתירים את השורה —
     דפוס שמתקשר למספר שהומצא מתקשר למישהו אחר. */
  function _norm(v) {
    return str(v).replace(/["'׳״]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  }
  /* האם המספר המנורמל הוא נייד ישראלי (05x → 9725x).
     ⚠️ 19/08/2026: בלי הבדיקה הזו כל מספר-משרד קיבל כפתור-וואטסאפ
     שמוביל לשום-מקום. כפתור שלא עובד גרוע מהיעדרו. */
  function isMobileIL(wa) {
    var s = str(wa);
    return /^9725\d{8}$/.test(s);
  }
  /* ⚠️ נרמול-טלפון לוואטסאפ — אותו כלל שכבר רץ ב-customer-fold-preview
     (0→972). הועבר לכאן כדי שלא יהיו שני מנגנונים שיסתרו זה את זה. */
  function waNumber(phone) {
    var ph = str(phone).replace(/\D/g, '');
    if (!ph) return '';
    if (ph.indexOf('972') === 0) return ph;
    if (ph.charAt(0) === '0') return '972' + ph.slice(1);
    return ph.length <= 10 ? ('972' + ph) : ph;
  }
  /* מייל אחד לשליחה — בשדה יש לפעמים כמה מופרדים בפסיק. */
  function firstEmail(email) {
    var e = str(email).split(/[,;]/)[0].trim();
    return /.+@.+\..+/.test(e) ? e : '';
  }
  function customerCard(name, customers, newspapers, contacts) {
    var key = _norm(name), rec = null, np = null;
    var cs = customers || {}, ns = newspapers || {};
    Object.keys(cs).forEach(function (k) {
      if (!rec && cs[k] && _norm(cs[k].name) === key) rec = cs[k];
    });
    Object.keys(ns).forEach(function (k) {
      if (!np && ns[k] && _norm(ns[k].name) === key) np = ns[k];
    });
    /* ⚠️ **עקיפות ידניות בצומת נפרד (בקשת-בעלים 19/08/2026).**
       הבקשה: "נוסיף ידנית את המייל והוואטסאפ של הלקוחות".
       ⚠️ **ולמה לא לכתוב ל-‎customers‎ עצמו:** הוא נדחף כ**מערך שלם**
       מ-krtis-avoda (solan-persist ‎_paths‎), ולכן עריכה נקודתית ממסך אחר
       הייתה נדרסת בסבב-הסנכרון הבא — בדיוק תקרית "ניכויי-המלאי שנדרסו".
       ‏customerContacts הוא צומת-עקיפות שאיש אינו דוחף בשלמותו, והוא
       **גובר** על רשומת-הלקוח: הוא נכתב ביד ע"י מי שבדק. */
    var ov = null, cts = contacts || {};
    Object.keys(cts).forEach(function (k) {
      if (!ov && _norm(k) === key) ov = cts[k];
      if (!ov && cts[k] && _norm(cts[k].name) === key) ov = cts[k];
    });
    var pick = function (f) { return str(ov && ov[f]) || str(rec && rec[f]); };
    var phone = pick('phone'), email = firstEmail(str(ov && ov.email) || (rec && rec.email));
    /* ⚠️ בקשת-בעלים 19/08/2026: **פלאפון בשדה נפרד.** וואטסאפ על מספר
       קווי אינו עובד, ועד היום היה שדה-טלפון אחד בלבד — כך שהכפתור הוביל
       לשום-מקום אצל כל לקוח שהמספר שלו במשרד.
       ⚠️ וואטסאפ מעדיף פלאפון; אין פלאפון → נופל לטלפון (ייתכן שהוא נייד).
       ⚠️ החיוג נשאר על הטלפון הראשי — למשרד עונים, לנייד לא תמיד. */
    var mobile = str(ov && ov.mobile) || str(rec && (rec.mobile || rec.cell || rec.phone2));
    /* ⚠️ **וואטסאפ רק על מספר נייד.** ‏waNumber מנרמל כל מספר ל-972…,
       וכך „03-5555555" הפך לקישור-וואטסאפ שמוביל לשום-מקום. נייד ישראלי
       הוא 05x, כלומר 9725x אחרי נרמול. כפתור שלא עובד גרוע מהיעדרו. */
    var waM = isMobileIL(waNumber(mobile)) ? waNumber(mobile) : '';
    var waP = isMobileIL(waNumber(phone))  ? waNumber(phone)  : '';
    return {
      name: str(name),
      found: !!(rec || np),
      phone: phone, mobile: mobile,
      wa: waM || waP,
      waFrom: waM ? 'mobile' : (waP ? 'phone' : ''),
      email: email, address: pick('address'),
      /* המפתח שאליו נכתבת עקיפה — כדי שהמסך ידע לאן לשמור */
      contactKey: str(name),
      hasOverride: !!ov,
      day: str(np && np.day), size: str(np && np.size), paper: str(np && np.paper),
      color: str(np && np.color), copies: str(np && np.copies),
      notes: str(np && np.notes),
      /* מה חסר — כדי שהמסך יאמר זאת ולא ישתוק */
      missing: ['phone', 'email', 'address'].filter(function (f) {
        return !str(f === 'email' ? email : (rec && rec[f]));
      })
    };
  }

  /* ── כמה עמודים בגיליון-מלא ─────────────────────────────────────────────
     ⚠️ בקשת-בעלים 17/08/2026: "כשהעיתון 16.5×24 הגיליון 70×100, וכשהעיתון
     A4 הגיליון 64×90" — כלומר הגודל **נגזר מהעיתון** ואינו נבחר בכל הורדה.
     ⚠️ אבל **לא מנחשים**: גודל שאינו מזוהה מחזיר 0, והמסך שואל במקום
     להניח. זה הכלל מ-30/07 (‏96 עמ' חולקו ל-6×16 במקום 3×32 בגלל ניחוש
     שקט) — ‏`sheetPages` שנשמר על הגיליון גובר על הגזירה. */
  function sheetPagesFromMM(w, h) {
    var mx = Math.max(num(w) || 0, num(h) || 0), mn = Math.min(num(w) || 0, num(h) || 0);
    if (!mx || !mn) return 0;
    if (Math.abs(mx - 240) < 12 && Math.abs(mn - 165) < 12) return 32;   // 16.5×24 → 70×100
    if (Math.abs(mx - 297) < 14 && Math.abs(mn - 210) < 14) return 16;   // A4 → 64×90
    if (Math.abs(mx - 330) < 14 && Math.abs(mn - 240) < 14) return 16;   // 24×33 → 64×90
    return 0;                                                            // לא מזוהה — לא מנחשים
  }
  /* מחזיר { sheet, src } · src: 'saved' (נשמר על הגיליון) · 'size' (נגזר
     מגודל-העמוד) · 'unknown' (צריך לשאול). sheet=0 רק ב-unknown. */
  function sheetPagesOf(p) {
    var r = p || {};
    var saved = num(r.sheetPages) || 0;
    if (saved >= 2) return { sheet: saved, src: 'saved' };
    var d = sheetPagesFromMM(r.reqW, r.reqH);
    return d ? { sheet: d, src: 'size' } : { sheet: 0, src: 'unknown' };
  }
  function sheetLabel(n) { return n === 32 ? '70×100' : (n === 16 ? '64×90' : ''); }

  /* ── סדר-הריצות ומיספור-העמודים — מקור-אמת אחד לכל המסכים ──────────────
     ⚠️ 17/08/2026: הלוגיקה ישבה **בתוך** proof-admin.html בלבד, ולכן הפורטל
     הציג לריצה "עמוד 1..n" מקומיים בזמן שהדפוס הציג מספרים בגיליון. שני
     מסכים שמדברים על אותו עמוד בשני מספרים — זה מה שמייצר טלפון לדפוס.
     כאן זה טהור, ושני המסכים מושכים מכאן. */
  function runsOrdered(p) {
    var parts = (p || {}).parts || {};
    return Object.keys(parts).map(function (pid) {
      var o = {};
      Object.keys(parts[pid] || {}).forEach(function (k) { o[k] = parts[pid][k]; });
      o.pid = pid;
      o._no = runNoOfName(parts[pid] && (parts[pid].name || parts[pid].fileName));
      return o;
    }).sort(function (a, b) {
      if (a._no != null && b._no != null && a._no !== b._no) return a._no - b._no;
      if (a._no != null && b._no == null) return -1;      // ממוספרות קודם
      if (a._no == null && b._no != null) return 1;
      return (num(a.approvedAt) || 0) - (num(b.approvedAt) || 0)
          || String(a.pid).localeCompare(String(b.pid));
    });
  }
  /* ── פריסת-העמודים לריצות (קונטרסים) ─────────────────────────────────────
     ⚠️ 19/08/2026, תיקון-בעלים: **ריצה אינה טווח-עמודים רציף.** קונטרס
     חיצוני נושא את העמודים הראשונים **ואת האחרונים** יחד — 72 עמודים על
     גיליון 32 הם שלוש ריצות: 8 (עמ׳ 1–4 + 69–72) · 32 (5–20 + 53–68) ·
     32 (21–52). הנחת-הרציפות שהייתה כאן ציירה תשע ריצות של 8 ברצף, וזה
     פשוט לא הגיליון שיוצא לדפוס.

     הלוגיקה עצמה אינה חדשה — היא ‎_pcRunLayout‎ ב-‎proof-client.html‎,
     המסך שבו הלקוח בוחר ריצה בהעלאה. ⚠️ ‏proof-client אינו טוען את
     המודול הזה, ולכן זו **הכפלה מודעת** ולא איחוד: הפורט כאן נאמן מילה
     במילה, ובדיקת-אנטי-סחיפה (‎shop-issue-tests‎, סעיף 7ב-4) מריצה את
     שתי המימושים זה מול זה. ברגע ש-proof-client יטען את shop-issue —
     למחוק שם ולהשאיר כאן אחד.

     ⚠️ עמודים אי-זוגיים אינם נפרסים (חצי-קונטרס אינו קיים) — מחזירים
     רשימה ריקה במקום לחשב חצי-עמוד. */
  function runLayout(total, sheet) {
    var t = num(total) | 0, fs = num(sheet) | 0;
    if (!(t > 0) || !(fs > 1) || (t % 2)) return [];
    var layers = [];
    if (fs === 32 && (t === 20 || t === 24)) { layers.push(t - 16); layers.push(16); }
    else {
      var rem = t % fs; if (rem) layers.push(rem);
      var inner = t - rem;
      while (inner > 0) { layers.push(fs); inner -= fs; }
    }
    for (var q = 0; q < layers.length; q++) if (layers[q] % 2) return [];
    var front = 1, back = t, out = [];
    layers.forEach(function (lp, i) {
      var isLast = (i === layers.length - 1), half = lp / 2, seq = [], label, pg;
      if (isLast && lp === fs) {
        for (pg = front; pg <= front + lp - 1; pg++) seq.push(pg);
        label = 'עמ׳ ' + front + '–' + (front + lp - 1);
        front += lp;
      } else {
        var fe = front + half - 1, bs = back - half + 1;
        for (pg = front; pg <= fe; pg++) seq.push(pg);
        for (pg = bs; pg <= back; pg++) seq.push(pg);
        label = (fe + 1 === bs) ? ('עמ׳ ' + front + '–' + back)
                                : ('עמ׳ ' + front + '–' + fe + ' + ' + bs + '–' + back);
        front += half; back -= half;
      }
      out.push({ num: i + 1, pages: lp, seq: seq, label: label });
    });
    return out;
  }
  /* הפריסה של גיליון נתון — סה"כ-העמודים מההצהרה, גודל-הגיליון מ-sheetPagesOf */
  function layoutOf(p) {
    var r = p || {};
    var total = Math.min(num(r.declaredPages) | 0 || num(r.totalPages) | 0, 400);
    return runLayout(total, sheetPagesOf(r).sheet);
  }
  /* מספר-העמוד-בגיליון שבו מתחילה הריצה. ⚠️ מסכום-העמודים של הריצות
     שלפניה, ולא (מספר-ריצה × 16) — לריצות יש אורכים שונים (16 + 32).
     ⚠️ 19/08/2026: הסכימה ספרה רק ריצות **שכבר הועלו**, ולכן כשריצה 1
     טרם הגיעה — מקרה שגרתי, הלקוח מעלה בסדר משלו (אירוע 17/08) — ריצה 2
     קיבלה "עמוד 1" ותפסה את משבצות 1..n. ריצה חסרה באמצע נאמדת לפי
     גודל-הגיליון (‎sheetPages‎, נשמר על הרשומה). אין גודל-גיליון → נשארת
     ההתנהגות הקודמת; לא ממציאים אורך לריצה שלא ראינו. */
  function runFirstPageNo(p, partId) {
    var list = runsOrdered(p), base = 0, prev = 0;
    var sheet = sheetPagesOf(p).sheet;
    for (var i = 0; i < list.length; i++) {
      var no = list[i]._no;
      if (no != null && no > prev + 1 && sheet) base += (no - prev - 1) * sheet;
      if (list[i].pid === partId) return base + 1;
      base += num(list[i].pageCount) | 0;
      if (no != null) prev = no;
    }
    return 1;   // לא נמצאה — לא ממציאים היסט
  }
  /* סדר-הריצות אינו סדר-ההעלאה — סימן שהלקוח התבלבל, ושווה בדיקה. */
  function runOrderReversed(p) {
    var ord = runsOrdered(p).filter(function (pt) { return pt._no != null && num(pt.approvedAt); });
    for (var i = 1; i < ord.length; i++) if (num(ord[i].approvedAt) < num(ord[i-1].approvedAt)) return true;
    return false;
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

  /* ── שם-קובץ → אילו עמודים (דיווח-בעלים 19/08/2026) ──────────────────────
     ⚠️ **התקרית:** לקוח העלה עיתון בעמודים בודדים בכמה מנות, ובאחד
     הקבצים היה כתוב "עמודים 8 9" — כפולה. ‏pageNoOf תופס את **המספר
     הראשון** במחרוזת, ולכן הקובץ תפס משבצת אחת (8), עמוד 9 נשאר "חסר",
     וכל מה שסביבו נראה מוזז.
     ⚠️ ובדיקה של שמות אמיתיים חשפה עוד שניים מאותה משפחה:
       "עיתון 2026 עמוד 8"  → 2026   (שנה כמספר-עמוד!)
       "ידיעון 5 עמוד 6"    → 5      (מספר-הגיליון, לא העמוד)

     הכללים, לפי סדר:
       1. שער/עטיפה/cover → עמוד 1.
       2. **שני מספרים עוקבים שביניהם רק מפריד** (8 9 · 8-9 · 8,9) →
          כפולה. ⚠️ מילה ביניהם פוסלת — "ידיעון 5 עמוד 6" אינו כפולה.
       3. מספר שבא **אחרי** עמוד/עמ׳/page — הוא הכוונה המפורשת.
       4. בדיוק מספר-סביר אחד (1..400) → הוא.
       5. אחרת: ‎sure:false‎ — **שואלים ולא מנחשים.** ניחוש שקט כאן הוא
          עמוד שיודפס במקום הלא-נכון. */
  var _PAGE_WORD = 'עמודים|עמודי|עמוד|עמ׳|עמ\'|עמ|pages|page|pg|p';
  function pagesOfName(name) {
    var s = str(name).replace(/\.[a-z0-9]{1,5}$/i, '');
    if (!s) return null;
    if (/שער|עטיפה|cover/i.test(s)) return { nos: [1], spread: false, sure: true };
    /* כפולה: שני מספרים עוקבים עם מפריד בלבד ביניהם */
    var sp = s.match(/(\d{1,3})\s*[-–—_,\/ ]\s*(\d{1,3})(?!\d)/);
    if (sp) {
      var a = parseInt(sp[1], 10), b = parseInt(sp[2], 10);
      if (b === a + 1 && a >= 1 && b <= 400) return { nos: [a, b], spread: true, sure: true };
    }
    /* מספר שאחרי מילת-עמוד */
    var mw = s.match(new RegExp('(?:' + _PAGE_WORD + ')\\s*[-_:.]?\\s*(\\d{1,3})(?!\\d)', 'i'));
    if (mw) {
      var n1 = parseInt(mw[1], 10);
      if (n1 >= 1 && n1 <= 400) return { nos: [n1], spread: false, sure: true };
    }
    /* ⚠️ מספר שאחרי "גיליון"/"מהדורה" הוא **מספר-הגיליון**, לא עמוד.
       "ידיעון 2026 גיליון 145" אינו עמוד 145. נפסל לפני הספירה. */
    var s2 = s.replace(/(?:גיליון|גליון|מהדורה|issue|no\.?)\s*[-_:.]?\s*\d{1,4}/gi, ' ');
    var all = (s2.match(/\d+/g) || []).map(function (x) { return parseInt(x, 10); });
    var ok = all.filter(function (n) { return n >= 1 && n <= 400; });
    if (ok.length === 1) return { nos: [ok[0]], spread: false, sure: true };
    if (!ok.length) return null;
    /* ⚠️ ריבוי-מועמדים: מחזירים את הראשון **ומסמנים שאיננו בטוחים**.
       המסך שואל; הוא לא מציג מספר שהומצא כאילו הוא ודאי. */
    return { nos: [ok[0]], spread: false, sure: false, candidates: ok };
  }

  /* ── גרירת כמה קבצים לגיליון הפרוס (בקשת-בעלים 19/08/2026) ───────────────
     „שיוכל לגרור עמודים בודדים למקום שלהם, או כמה עמודים במקביל, ושהם
     יסתדרו במקום שלהם; ובמקרה של כפולה שיישאל איזה עמודים אלה."

     ⚠️ עד היום הגרירה קיבלה קובץ **אחד**: "נגררו כמה קבצים — הראשון
     ישובץ" והשאר נזרקו בשקט-למחצה. זה מה שמתקן כאן.

     ⚠️ **שם-הקובץ גובר על מיקום-הנפילה.** קובץ בשם "עמוד 7" הולך לעמוד 7
     גם אם נגרר על משבצת 3 — הלקוח כתב את הכוונה, והגרירה היא רק אמצעי.
     ⚠️ **מה שאי-אפשר להכריע — נשאל, לא מנוחש.** קובץ בלי מספר, או עם
     כמה מועמדים ("12 34 56"), מקבל ‎ask:true‎ והמסך שואל. ניחוש שקט כאן
     הוא עמוד שיודפס במקום הלא-נכון.
     ⚠️ **כפולה מאושרת ולא מונחת.** "עמודים 8 9" מזוהה, אבל נשאלת —
     בדיוק התקרית של היום.
     ⚠️ סדר-השיבוץ הרציף הוא **סדר-הגרירה**, ומדלג על משבצות שכבר נתפסו
     ע"י שם-קובץ מפורש או ע"י עמוד שכבר קיים בגיליון. */
  function dropPlan(names, startSlot, takenSlots) {
    var list = (names || []).map(function (n) { return str(n); });
    var start = Math.max(1, num(startSlot) | 0 || 1);
    var taken = {};
    (takenSlots || []).forEach(function (s) { var v = num(s) | 0; if (v >= 1) taken[v] = true; });
    var items = [];
    /* מעבר ראשון: מי שהשם שלו מכריע — משבץ ותופס */
    list.forEach(function (nm, i) {
      var pn = pagesOfName(nm);
      if (pn && pn.sure) {
        items[i] = { name: nm, nos: pn.nos.slice(), spread: !!pn.spread,
                     from: 'name', ask: !!pn.spread };
        pn.nos.forEach(function (v) { taken[v] = true; });
      } else {
        items[i] = { name: nm, nos: [], spread: false, from: 'sequence', ask: true,
                     candidates: (pn && pn.candidates) || [] };
      }
    });
    /* מעבר שני: השאר ברצף מנקודת-הנפילה, מדלגים על תפוס */
    var next = start;
    items.forEach(function (it) {
      if (it.from !== 'sequence') return;
      while (taken[next]) next++;
      it.nos = [next]; taken[next] = true; next++;
    });
    return {
      items: items,
      /* כמה מהם דורשים שאלה — המסך מציג דיאלוג אחד ולא N טוסטים */
      askCount: items.filter(function (x) { return x.ask; }).length,
      /* ⚠️ התנגשות: שני קבצים שנפלו על אותו עמוד. נאמר, לא נבלע. */
      conflicts: (function () {
        var seen = {}, bad = [];
        items.forEach(function (it) {
          it.nos.forEach(function (v) {
            if (seen[v]) { if (bad.indexOf(v) < 0) bad.push(v); }
            seen[v] = true;
          });
        });
        return bad;
      })()
    };
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
       · ריצה רבת-עמודים → אריח **אחד** התופס טווח (pages), ולא עמוד בודד.
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
    var lay = layoutOf(r);                             // פריסת-הקונטרסים, אם ידועה
    Object.keys(parts).forEach(function (k) {
      var t = parts[k] || {};
      if (!str(t.fileUrl)) return;                     // ריצה בלי קובץ אינה אריח
      /* ⚠️ אירוע-ייצור 19/08/2026, ערדניקים גיליון 283: הלקוח הצהיר 72
         עמודים והעלה ריצה אחת בת 8 — והרשת הציגה 71 אריחי-"חסר", כולל
         העמודים שנמצאים **בתוך** אותו קובץ. שני שורשים, שניהם כאן:
         ‏(א) ‎pageNoOf('ריצה 1')‎ תופס את הספרה הראשונה במחרוזת — כלומר
             מספר-הריצה נקרא כמספר-עמוד, וריצה 2 נחתה על משבצת עמוד 2.
         ‏(ב) הריצה נספרה כעמוד אחד, ולכן שאר עמודיה נראו ריקים.
         ⚠️ תיקון-בעלים באותו יום: גם "טווח רציף" היה שגוי. **הריצה היא
         קונטרס** — ריצה 1 של גיליון 72 עמ׳ על גיליון-32 היא עמ׳ 1–4 **וגם**
         69–72. לכן מקור-האמת הוא ‎runLayout‎ (אותה פריסה של מסך-ההעלאה),
         והעמודים נשמרים ב-‎seq‎. אין פריסה (חסר גודל-גיליון או הצהרה) —
         נופלים להתנהגות הקודמת ולא ממציאים קונטרסים. */
      var span = num(t.pageCount) | 0;
      var nm = str(t.name) || 'ריצה';
      var lr = null;
      if (span > 1 && lay.length) {
        var rno = runNoOfName(nm);
        if (rno) for (var li = 0; li < lay.length; li++) if (lay[li].num === rno) lr = lay[li];
      }
      var no = lr ? lr.seq[0] : ((span > 1) ? runFirstPageNo(r, k) : pageNoOf(t.name));
      tiles.push({ kind: 'page', target: k, pageNo: no, page: 1, url: str(t.fileUrl),
                   label: lr ? (nm + ' · ' + lr.label)
                             : ((span > 1 && no >= 1) ? (nm + ' · עמ׳ ' + no + '–' + (no + span - 1)) : nm),
                   runName: nm, at: num(t.approvedAt), seq: lr ? lr.seq : null,
                   /* ⚠️ ריצה שהגיעה באורך שאינו אורך-הקונטרס שלה: או שגודל-
                      הגיליון שמור שגוי, או שהקובץ אינו הריצה שנאמר עליה.
                      נאמר במפורש — הרשת לא תסתיר את זה בחישוב. */
                   runPagesMismatch: (lr && lr.pages !== span) ? { got: span, want: lr.pages } : null,
                   partId: k, pages: num(t.pageCount) || 0, mark: markOf(r, k, 1) });
    });
    fileEntries(r).forEach(function (f, i) {
      /* ⚠️ 16/08/2026, בקשת-בעלים: שיבוץ-מחדש שומר את **שם-הקובץ המקורי**
         וכותב ‎slot‎ נפרד. כך המיקום בפועל ניתן להצלבה מול המספר שבשם,
         ואי-התאמה נאמרת ("שובץ לעמוד 3 אבל נקרא 'עמוד 5'") במקום להימחק
         בשקט ע"י שינוי-שם. רשומה ותיקה בלי slot — נופלת לשם, כמו קודם. */
      /* ⚠️ 19/08/2026: הפירוק עבר ל-‎pagesOfName‎ — הוא מבין כפולה
         ("עמודים 8 9"), מעדיף מספר שאחרי מילת-עמוד, ופוסל שנה ומספר-גיליון.
         ‏pageNoOf תפס את המספר הראשון, ולכן "עיתון 2026 עמוד 8" נחת על
         עמוד 2026 ו"עמודים 8 9" תפס משבצת אחת בלבד. */
      var pn = pagesOfName(f.fileName);
      var nameNo = pn ? pn.nos[0] : null;
      var sl = num(f.slot);
      var no = (sl >= 1) ? sl : nameNo;
      /* ⚠️ **קובץ-כפולה מכסה שתי משבצות.** שיבוץ-ידני (slot) גובר תמיד —
         הדפוס או הלקוח קבעו במפורש, וזה מנצח כל פירוק-שם.
         הכיסוי דרך ‎seq‎ ולא דרך ‎pages‎: ‎pages‎ הוא מספר-העמודים **בקובץ**
         (הלייטבוקס מדפדף בו), וכפולה היא עמוד-PDF אחד על שתי משבצות. */
      var fseq = (!(sl >= 1) && pn && pn.spread) ? pn.nos.slice() : null;
      var kk = str(f._k) || ('f' + i);
      /* התווית לפי המשבצת (שער/עמוד N) ולא לפי שם-הקובץ — הרשת נקראת
         אחיד; שם-הקובץ נשמר בשדה משלו לתצוגה ולהצלבה. */
      var lbl = fseq ? ('עמ׳ ' + fseq[0] + '–' + fseq[fseq.length - 1])
                     : ((no >= 1) ? (no === 1 ? 'שער' : 'עמוד ' + no) : (str(f.fileName) || 'קובץ'));
      tiles.push({ kind: 'page', target: 'file_' + kk.slice(1), pageNo: no, page: 1, url: str(f.fileUrl),
                   label: lbl, fileName: str(f.fileName), at: num(r.createdAt),
                   nameNo: nameNo, slotMismatch: !!(sl >= 1 && nameNo && nameNo !== sl),
                   seq: fseq, isSpread: !!fseq,
                   /* ⚠️ שם שאי-אפשר להכריע ממנו — נאמר, לא מוסתר. המסך
                      ישאל; מספר שהומצא הוא עמוד שיודפס במקום הלא-נכון. */
                   nameUnsure: !!(pn && pn.sure === false && !(sl >= 1)),
                   partId: '', mark: markOf(r, 'file_' + kk.slice(1), 1) });
    });
    /* עמודים חסרים — רק מספרים שאין להם אריח קיים.
       ⚠️ אריח-ריצה מכסה את **עמודי-הקונטרס שלו** (‎seq‎), ולא טווח רציף:
       ריצה 1 מכסה 1–4 ו-69–72, ולא 1–8. אין פריסה → נופלים לטווח רציף
       (התנהגות קודמת), עם תקרה 400 כמו במסלול עיתון-מלא. */
    var have = {};
    tiles.forEach(function (t) {
      if (t.seq && t.seq.length) { t.seq.forEach(function (q) { have[q] = true; }); return; }
      if (t.pageNo == null) return;
      var span = Math.min(Math.max(1, num(t.pages) | 0), 400);
      for (var j = 0; j < span; j++) have[t.pageNo + j] = true;
    });
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

  /* ── מפת-הגיליון לפי ריצות (בקשת-בעלים 19/08/2026) ──────────────────────
     ⚠️ גיליון בן 72 עמודים שהתקבלה בו ריצה אחת פרש 64 אריחי-"חסר" — קיר
     של משבצות זהות שאי-אפשר לקרוא, ולא אמר את הדבר היחיד שהלקוח צריך
     לדעת: **אילו ריצות טרם שלחתי**. כאן העמודים נאספים לריצות: ריצה
     שהתקבלה לפי אורכה האמיתי, והפערים ביניהן לריצות-שטרם-הגיעו בגודל
     גיליון (‎sheetPages‎). העמוד עצמו לא נעלם — הוא בתוך הריצה.

     ⚠️ הפריסה **אינה מחושבת כאן** — היא ‎runLayout‎, אותה פריסת-קונטרסים
     של מסך-ההעלאה. כאן רק מוצמד מה שהגיע למה שאמור להגיע. אין פריסה
     (חסר גודל-גיליון או מספר-עמודים) → ‎ok:false‎, והמסך נשאר ברשת
     השטוחה. לא ממציאים חלוקה. */
  function runGrid(p) {
    var r = p || {};
    var tiles = pageTiles(r);
    var lay = layoutOf(r);
    if (!lay.length) return { ok: false, why: 'אין פריסת-ריצות — חסר גודל-גיליון או מספר-עמודים' };
    /* איזה אריח מכסה כל עמוד — קונטרס לפי ‎seq‎, קובץ-בודד לפי מספרו */
    var at = {};
    tiles.forEach(function (t, i) {
      if (t.kind !== 'page') return;
      if (t.seq && t.seq.length) { t.seq.forEach(function (q) { at[q] = i; }); return; }
      if (t.pageNo == null) return;
      var span = Math.min(Math.max(1, num(t.pages) | 0), 400);
      for (var j = 0; j < span; j++) at[t.pageNo + j] = i;
    });
    /* ריצה שהועלתה מוצמדת לקונטרס **לפי מספר-הריצה שבשמה** — לא לפי
       עמוד-פתיחה. זה מה שהלקוח כתב על הקובץ, וזה מה שהדפוס קורא. */
    var byNo = {};
    tiles.forEach(function (t, i) {
      if (t.kind !== 'page' || !t.partId || num(t.pages) <= 1) return;
      var n = runNoOfName(t.runName || t.label);
      if (n && !byNo[n]) byNo[n] = { t: t, i: i };
    });
    var out = lay.map(function (L) {
      var hit = byNo[L.num] || null;
      var pages = L.seq.map(function (q) {
        var ti = (at[q] == null) ? -1 : at[q];
        return { no: q, got: ti >= 0, tileIndex: ti };
      });
      var missing = pages.filter(function (x) { return !x.got; }).map(function (x) { return x.no; });
      return { no: L.num, label: L.label, from: L.seq[0], to: L.seq[L.seq.length - 1],
               pageCount: L.pages, got: !!hit,
               /* ⚠️ דיווח-בעלים 20/08/2026: לקוח ששלח את כל עמודי-הריצה
                  כקבצים בודדים ראה "טרם הגיעה · 0 עמ'" — הריצה שלמה אבל
                  אין קובץ-ריצה. שלושה מצבים, לא שניים: קובץ-ריצה · מכוסה-
                  בקבצים · חסרה. */
               coveredByFiles: !hit && pages.length > 0 && missing.length === 0,
               partId: hit ? hit.t.partId : '',
               name: hit ? (hit.t.runName || ('ריצה ' + L.num)) : ('ריצה ' + L.num),
               tileIndex: hit ? hit.i : -1,
               pagesMismatch: hit ? hit.t.runPagesMismatch : null,
               pages: pages,
               missing: missing };
    });
    /* ריצה שהועלתה ואין לה קונטרס בפריסה (מספר גבוה מדי / שם חריג) —
       אינה נעלמת מהמסך. היא נאמרת, כי היא סימן שהפריסה או השם שגויים. */
    var orphan = [];
    tiles.forEach(function (t, i) {
      if (t.kind !== 'page' || !t.partId || num(t.pages) <= 1) return;
      var n = runNoOfName(t.runName || t.label);
      if (!n || n > lay.length) orphan.push({ name: t.runName || t.label, tileIndex: i, partId: t.partId });
    });
    return { ok: true, sheet: sheetPagesOf(r).sheet, total: lay.reduce(function (s, L) { return s + L.pages; }, 0),
             runs: out, orphans: orphan,
             gotRuns: out.filter(function (x) { return x.got || x.coveredByFiles; }).length };
  }

  /* ── מספור-עמודים עם זיהוי-כפולות (דיווח-בעלים 19/08/2026) ──────────────
     "בתצוגה של הגיליון הפרוס העמודים הכפולים מופיעים כעמוד אחד וזה מבלבל
     את הספירה". קובץ-ריצה יכול להכיל כפולה כעמוד-PDF **אחד** רחב — שהוא
     שני עמודי-עיתון. מספור לפי אינדקס-PDF מזייף את כל ההמשך.

     הזיהוי גיאומטרי: יחס-צלעות של כל עמוד מול חציון-הריצה — עמוד רחב
     פי-1.45 ומעלה מהחציון הוא כפולה (יחס מלא הוא פי-2; הרפיון סופג
     גלישות ושוליים). כשרוב-הריצה כפולות אין חציון "רגיל" — ואז לא
     מסמנים כלום, כי ניחוש שקט גרוע מספירה חסרה. dims חסר/פגום → עמוד
     בודד. הפלט: תווית לכל עמוד-PDF + סך עמודי-העיתון האמיתי. */
  /* baseNo: מספר-פתיחה (רצף רציף) **או מערך-seq** של קונטרס — ריצה 1 של
     56/32 היא עמ' 1-12+45-56, ומספור רציף מ-baseNo משקר אחרי עמ' 12.
     ‏pdfPage (מצטבר, 1-מבוסס): לאיזה עמוד בקובץ-ה-PDF מוביל כל פריט —
     כפולה תופסת 2. ⚠️ תקרית 19/08/2026: מטמון-התמונות הוא פריט-לקובץ
     (19) וה-PDF עמוד-לעמוד (24); לחיצה שמיפתה אינדקס-תמונה → עמוד-PDF
     פתחה עמוד אחר לגמרי. */
  function spreadNumbering(dims, baseNo) {
    var seq = Array.isArray(baseNo) ? baseNo.map(num).filter(function (x) { return x >= 1; }) : null;
    var base = seq ? (seq[0] || 1) : (num(baseNo) || 1);
    var list = Array.isArray(dims) ? dims : [];
    var ratios = list.map(function (d) {
      return (d && num(d.w) > 0 && num(d.h) > 0) ? num(d.w) / num(d.h) : 0;
    });
    var valid = ratios.filter(function (r) { return r > 0; }).sort(function (a, b) { return a - b; });
    var med = valid.length ? valid[Math.floor(valid.length / 2)] : 0;
    var items = [], cursor = 0, spreads = 0, pdf = 1;
    var numAt = function (k) { return seq ? (seq[k] != null ? seq[k] : base + k) : base + k; };
    ratios.forEach(function (r) {
      var isSp = med > 0 && r > med * 1.45;
      if (isSp) {
        var a = numAt(cursor), b = numAt(cursor + 1);
        items.push({ nos: [a, b], spread: true, pdfPage: pdf,
                     label: 'עמודים ' + a + '–' + b });
        cursor += 2; pdf += 2; spreads++;
      } else {
        var n1 = numAt(cursor);
        items.push({ nos: [n1], spread: false, pdfPage: pdf, label: 'עמוד ' + n1 });
        cursor += 1; pdf += 1;
      }
    });
    return { items: items, total: cursor, spreads: spreads,
             from: items.length ? items[0].nos[0] : base,
             to: items.length ? items[items.length - 1].nos.slice(-1)[0] : base - 1 };
  }

  return {
    spreadNumbering: spreadNumbering,
    idOf: idOf, timeOf: timeOf, isActive: isActive,
    sortIssues: sortIssues, openId: openId,
    statusOf: statusOf, printApproved: printApproved,
    seenAt: seenAt, hasArrived: hasArrived, isDraft: isDraft,
    unitsOf: unitsOf, summaryOf: summaryOf, titleOf: titleOf, cardActions: cardActions,
    pageNoOf: pageNoOf, pagesOfName: pagesOfName, dropPlan: dropPlan, pageTiles: pageTiles, runGrid: runGrid, runLayout: runLayout, layoutOf: layoutOf, markOf: markOf, markPatch: markPatch,
    MARK_KINDS: MARK_KINDS, MARK_LABELS: MARK_LABELS,
    printApprovePatch: printApprovePatch, printApproveLabel: printApproveLabel,
    runNoOfName: runNoOfName, renameRunNo: renameRunNo, runRenumberPatch: runRenumberPatch,
    runsOrdered: runsOrdered, runFirstPageNo: runFirstPageNo, runOrderReversed: runOrderReversed,
    sheetPagesFromMM: sheetPagesFromMM, sheetPagesOf: sheetPagesOf, sheetLabel: sheetLabel,
    customerCard: customerCard, waNumber: waNumber, isMobileIL: isMobileIL, firstEmail: firstEmail
  };
});
