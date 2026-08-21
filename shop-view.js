/* ═══════════ נתוני מסך-הדפוס ═══════════
   כל הלוגיקה של מסך "לקוחות ועבודות" במקום אחד, טהור ונבדק — לפני שנוגעים
   ב-HTML. ככה אפשר לשכתב את המסך בלי לשכתב את החשיבה, ובלי לגלות רגרסיות
   רק כשהמסך כבר באוויר.

   ארבעה דברים שהמסך צריך ולא היו בו (בקשת-בעלים 2026-07-31):
     1. מי אמור לשלוח היום — ולא שלח. (עד היום ראו רק מי כן שלח.)
     2. פס-סטטוס אחד לכל גיליון: התקבל → נצפה → אושר → בדפוס → הושלם.
     3. עמודים חסרים, בולט ברמת הלקוח ולא קבור בשורת-ריצה.
     4. ספירת קבצים-חדשים שקדם-הדפוס טרם סימן שראה.

   מקורות-אמת (אותם שדות שכבר קיימים — בלי להמציא חדשים):
     customerProofs[].approvedAt · .shopSeenAt · .completedAt · .closedAt
     customerProofs[].pendingPages · .parts[<id>].{approvedAt,shopSeenAt,pendingPages}
     newspapers[].day + customerDayOverride  → יום-השליחה של הלקוח
     cards[]                                  → האם יש כרטיס פעיל ("בדפוס")   */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ShopView = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DAYS = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
  var DAY_MS = 24 * 60 * 60 * 1000;

  function _s(v){ return String(v == null ? '' : v); }
  function _i(v){ var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }
  // נרמול שם: מתעלם מסימני-פיסוק ורווחים כפולים (שמות נכתבים בכמה וריאציות)
  function normName(s){ return _s(s).replace(/["'.,\-()]/g, '').replace(/\s+/g, ' ').trim().toLowerCase(); }

  /* התאמת-שם כמילה שלמה בלבד. ⚠️ באג שהיה: חיפוש-מחרוזת דו-כיווני שייך
     כרטיס "שבועון" ללקוח "שבועון אלעד". כאן רק כיוון אחד ועם גבולות. */
  function isSep(ch){ return ch === '' || /[\s\-–—·,:;()\[\]"'\/|]/.test(ch); }
  function nameInside(hay, needle){
    hay = _s(hay); needle = _s(needle);
    if (!hay || !needle || needle.length < 3) return false;
    if (hay === needle) return true;
    for (var i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)){
      var before = i === 0 ? '' : hay[i - 1];
      var after = (i + needle.length >= hay.length) ? '' : hay[i + needle.length];
      if (isSep(before) && isSep(after)) return true;
    }
    return false;
  }

  /* ── 1. יום-השליחה של לקוח ─────────────────────────────────────────────
     דריסה ידנית קודמת ליומן; אחרת התאמה כמילה שלמה מול שמות-העיתונים. */
  function customerDay(name, dayByCustomer, overrides){
    var n = normName(name); if (!n) return '';
    overrides = overrides || {}; dayByCustomer = dayByCustomer || {};
    if (overrides[n]) return overrides[n];
    if (dayByCustomer[n]) return dayByCustomer[n];
    for (var k in dayByCustomer){ if (nameInside(k, n)) return dayByCustomer[k]; }
    return '';
  }

  /* ── 2. פס-הסטטוס של גיליון ────────────────────────────────────────────
     סדר קבוע, וכל שלב נגזר משדה קיים. "בדפוס" מגיע מכרטיס-עבודה פעיל,
     כי ל-customerProofs אין שדה כזה — ולכן הוא אופציונלי. */
  var STAGES = [
    { key: 'received', label: 'התקבל',  icon: '📥' },
    { key: 'seen',     label: 'נצפה',   icon: '👁' },
    { key: 'approved', label: 'אושר',   icon: '✅' },
    { key: 'printing', label: 'בדפוס',  icon: '🖨' },
    { key: 'done',     label: 'הושלם',  icon: '🏁' }
  ];
  function stageOf(p, opts){
    opts = opts || {};
    if (!p) return 'received';
    /* ⚠️ 21/08/2026 (ביקורת): ‏closedAt לבדו אינו "הושלם" — אישור-להדפסה
       כותב אותו אוטומטית, והעיתון עוד על המכונה. סגור-להעלאה + מאושר =
       'בדפוס'; "הושלם" רק על completedAt אמיתי. */
    if (p.completedAt) return 'done';
    if (p.closedAt && p.printApprovedAt) return 'printing';
    if (p.closedAt) return 'done';
    if (opts.hasActiveCard) return 'printing';
    if (p.apogeeApprovedAt || p.status === 'approved' || p.approvedAt) {
      // "נצפה" הוא שלב-ביניים: התקבל אך קדם-הדפוס עדיין לא סימן
      return anySeen(p) ? 'approved' : 'seen';
    }
    return 'received';
  }
  function stageIndex(key){
    for (var i = 0; i < STAGES.length; i++) if (STAGES[i].key === key) return i;
    return 0;
  }
  // האם מישהו בבית-הדפוס כבר סימן שראה (בעיתון המלא או באחת הריצות)
  function anySeen(p){
    if (!p) return false;
    if (p.shopSeenAt) return true;
    var parts = p.parts || {};
    for (var k in parts) if (parts[k] && parts[k].shopSeenAt) return true;
    return false;
  }

  /* ── 3. קבצים חדשים שטרם נצפו ──────────────────────────────────────────
     נספרים העיתון המלא וכל ריצה בנפרד — כך שהמספר אומר כמה פריטים ממתינים. */
  function newFiles(p){
    if (!p) return 0;
    var n = 0;
    if (p.approvedAt && !p.shopSeenAt && p.mode !== 'parts') n++;
    var parts = p.parts || {};
    for (var k in parts){ var pt = parts[k]; if (pt && pt.approvedAt && !pt.shopSeenAt) n++; }
    /* ⚠️ 21/08/2026 (ביקורת, "שווה פרסום — לא הופיע"): מסלול-ההעלאה של
       הפורטל אינו כותב approvedAt כלל — עיתון שלם הגיע ולא הדליק שום 🆕
       ולא דחיפות, והלקוח נשאר "שקט" ומוסתר מאחורי סינון-היום. קבצים
       אמיתיים שאיש לא סימן שנצפו = פריט חדש. */
    if (!n && !p.approvedAt && !anySeen(p) && hasRealFiles(p)
        && !p.completedAt && !p.closedAt) n++;
    return n;
  }

  /* ── 4. עמודים חסרים ───────────────────────────────────────────────────
     הלקוח יכול לשלוח עיתון עם עמודים ריקים "להשלמה". הנתון נשמר, אבל היה
     קבור בשורת-ריצה — כאן מרכזים אותו לרמת-הגיליון ולרמת-הלקוח. */
  function pendingPages(p){
    if (!p) return [];
    var out = [];
    (p.pendingPages || []).forEach(function(x){ if (out.indexOf(x) < 0) out.push(x); });
    var parts = p.parts || {};
    for (var k in parts){
      var pt = parts[k]; if (!pt) continue;
      (pt.pendingPages || []).forEach(function(x){ if (out.indexOf(x) < 0) out.push(x); });
    }
    return out.sort(function(a,b){ return _i(a) - _i(b); });
  }

  /* ── סיכום לקוח אחד ────────────────────────────────────────────────────
     זו הרשומה שהמסך מצייר ממנה: מה חדש, מה חסר, ומה מצב הגיליון האחרון. */
  function customerSummary(name, proofs, opts){
    opts = opts || {};
    var list = (proofs || []).filter(Boolean);
    var nNew = 0, pend = [], active = 0, last = 0;
    list.forEach(function(p){
      nNew += newFiles(p);
      pendingPages(p).forEach(function(x){ if (pend.indexOf(x) < 0) pend.push(x); });
      if (!p.completedAt && !p.closedAt) active++;
      var t = _i(p.createdAt) || _i(p.approvedAt) || 0;
      if (t > last) last = t;
    });
    // הגיליון "הפעיל" — האחרון שלא הושלם; אחרת האחרון בכלל
    var live = null;
    list.forEach(function(p){
      if (p.completedAt || p.closedAt) return;
      var t = _i(p.createdAt) || _i(p.approvedAt) || 0;
      if (!live || t > (_i(live.createdAt) || _i(live.approvedAt) || 0)) live = p;
    });
    var stage = live ? stageOf(live, { hasActiveCard: !!opts.hasActiveCard })
                     : (list.length ? 'done' : 'received');
    /* ⚠️ דיווח-בעלים 19/08/2026: "יש עבודות שהסתיימו מזמן ועדיין מופיע
       חיווי ירוק הושלם, כאילו הם הושלמו לאחרונה". נכון — ‎stage='done'‎
       נדבק לנצח, כי הוא נגזר מ"אין גיליון פעיל" ולא מזמן.
       ‏"הושלם" הוא **חדשה**, ואחרי יממה הוא כבר לא חדשה אלא רעש שמסתיר
       את מי שבאמת זקוק לתשומת-לב. אחרי 24 שעות מאז ששלח — החיווי יורד.
       ⚠️ **המצב עצמו לא משתנה** (‎stage‎ נשאר 'done'): רק התצוגה מתיישנת.
       שינוי ה-stage היה משפיע על מיון-הדחיפות ועל צרכנים אחרים.
       ⚠️ ‏now מפורש ולא ‎Date.now()‎ פנימי — אחרת אי-אפשר לבדוק. */
    var now = _i(opts.now) || 0;
    var FRESH_MS = 24 * 3600 * 1000;
    return {
      customer: _s(name),
      day: opts.day || '',
      total: list.length,
      active: active,
      newFiles: nNew,
      pendingPages: pend.sort(function(a,b){ return _i(a) - _i(b); }),
      lastAt: last,
      stage: stage,
      staleDone: !!(stage === 'done' && now > 0 && last > 0 && (now - last) > FRESH_MS),
      hasActiveCard: !!opts.hasActiveCard
    };
  }

  /* ── 5. מי אמור לשלוח היום ולא שלח ─────────────────────────────────────
     "שלח היום" = יש גיליון עם approvedAt/createdAt מהיום. הפער הזה הוא מה
     שגורם לרדוף אחרי לקוחות בסוף היום, ולכן הוא צריך להיות בולט. */
  function sentOn(p, dayStartMs){
    var t = _i(p && (p.approvedAt || p.createdAt));
    return t >= dayStartMs && t < dayStartMs + DAY_MS;
  }
  function startOfDay(ms){ var d = new Date(_i(ms)); d.setHours(0,0,0,0); return d.getTime(); }
  function dayNameOf(ms){ return DAYS[new Date(_i(ms)).getDay()]; }

  /* מחזיר { due, sent, missing } לפי היום הנוכחי.
     customers = [{ name, day, proofs:[...] }] */
  function todayBoard(customers, now){
    var start = startOfDay(now), today = dayNameOf(now);
    var due = [], sent = [], missing = [];
    (customers || []).forEach(function(c){
      if (!c || !c.name) return;
      var isDue = (_s(c.day) === today);
      var didSend = (c.proofs || []).some(function(p){ return sentOn(p, start); });
      if (isDue) due.push(c.name);
      if (didSend) sent.push(c.name);
      if (isDue && !didSend) missing.push(c.name);
    });
    return { today: today, due: due, sent: sent, missing: missing };
  }

  /* ── 6. תיבת-"חדש מהלקוחות" (עיצוב-מחדש 2026-08-06, אישור-בעלים) ────────
     סיווג עסקי טהור של כל גיליון, בקריאה בלבד — אפס שדות חדשים ב-schema.

     ⚠️ העיקרון המרכזי: **"הועלה" נקבע רק לפי הפניית-קובץ אמיתית** —
     fileUrl/filePath/apogeeUrl על הרשומה, או רשומת-files/parts עם
     fileUrl/filePath. רשומת-stub (למשל status='awaiting' שהפורטל יוצר
     כשהלקוח פותח עורך ועוד לא העלה כלום — תקרית 05/08/2026) לעולם אינה
     "עיתון שהגיע"; היא מוצגת במפורש כ"הלקוח לא סיים את ההעלאה". */
  function hasRealFiles(p){
    if (!p) return false;
    if (p.fileUrl || p.filePath || p.apogeeUrl) return true;
    var files = p.files || {};
    for (var k in files){ var f = files[k]; if (f && (f.fileUrl || f.filePath)) return true; }
    var parts = p.parts || {};
    for (var j in parts){ var pt = parts[j]; if (pt && (pt.fileUrl || pt.filePath)) return true; }
    return false;
  }
  // כמה קבצים בפועל (לא סומכים על fileCount המוצהר — סופרים הפניות אמיתיות)
  function realFileCount(p){
    if (!p) return 0;
    var n = 0;
    if (p.fileUrl || p.filePath || p.apogeeUrl) n++;
    var files = p.files || {};
    for (var k in files){ var f = files[k]; if (f && (f.fileUrl || f.filePath)) n++; }
    var parts = p.parts || {};
    for (var j in parts){ var pt = parts[j]; if (pt && (pt.fileUrl || pt.filePath)) n++; }
    return n;
  }
  /* סוג-ההעלאה, לתצוגת-הכרטיס:
       'full'      — עיתון מלא (fileUrl/apogeeUrl יחיד, או כמה קבצים מהפורטל)
       'file'      — קובץ בודד חדש
       'parts-add' — קבצים/קונטרסים נוספים לעבודה קיימת (parts)
       'stub'      — הלקוח התחיל תהליך ולא הגיע קובץ */
  function uploadKind(p){
    if (!hasRealFiles(p)) return 'stub';
    var parts = p.parts || {}, hasParts = false;
    for (var j in parts){ if (parts[j] && (parts[j].fileUrl || parts[j].filePath)) { hasParts = true; break; } }
    if (hasParts && !(p.fileUrl || p.apogeeUrl)) return 'parts-add';
    var files = p.files || {}, nf = 0;
    for (var k in files){ if (files[k] && (files[k].fileUrl || files[k].filePath)) nf++; }
    if (nf === 1 && !(p.fileUrl || p.apogeeUrl)) return 'file';
    return 'full';
  }
  /* ⚠️ ניסוח שנקבע (08/08/2026): מקור **וגם** סוג באותה מחרוזת, כדי שהצוות
     ידע מאיפה הגיעה העבודה בלי לפתוח אותה. שלושת הערכים שסוכמו:
       full       → "עיתון מלא מהפורטל"
       parts-add  → "ריצות מהפורטל"
       stub       → "העלאה שלא הושלמה"
     ⚠️ ‏'file' → "קובץ בודד מהפורטל" (הוכרע 08/08/2026). הוא סוג רביעי
     אמיתי: קובץ יחיד ב-files{} בלי fileUrl/apogeeUrl ברמת-הרשומה — כלומר
     לא עיתון מלא ולא ריצות (ראה uploadKind). הניסוח מציין **מקור וסוג**
     כמו שלושת האחרים, ואינו מקפל אותו לתוכם. */
  var KIND_LABELS = { full: 'עיתון מלא מהפורטל', file: 'קובץ בודד מהפורטל', 'parts-add': 'ריצות מהפורטל', stub: 'העלאה שלא הושלמה' };

  /* הסטטוס-העסקי של גיליון בודד. ⚠️ 'failed' רק בהוכחה אמיתית (רשומת-קובץ
     עם fileSize===0) — לעולם לא מהיעדר-רשומה. סדר-הקדימויות: טופל →
     כשל-מוכח → לא-הושלם → נצפה → חדש. 'inwork' נקבע ברמת-הלוח (כרטיס פעיל). */
  function bizStatus(p){
    if (!p) return 'stub';
    if (p.completedAt || p.closedAt) return 'done';
    var files = p.files || {};
    for (var k in files){ var f = files[k]; if (f && (f.fileUrl || f.filePath) && f.fileSize === 0) return 'failed'; }
    /* ⚠️ 21/08/2026 (ביקורת, R2 "בין השכנים"): ‏awaiting-shop בלי קבצים =
       הלקוח לחץ "שלח" וההעלאה אבדה. זה כשל שדורש טיפול — לא stub רגיל
       שנעלם בשקט מהתיבה אחרי סימון-נצפה. */
    if (!hasRealFiles(p)) return (p.status === 'awaiting-shop') ? 'failed' : 'stub';
    return anySeen(p) ? 'seen' : 'new';
  }
  var BIZ_LABELS = {
    'new':    { icon: '🔴', label: 'חדש — טרם נפתח' },
    seen:     { icon: '🟡', label: 'נצפה — ממתין לטיפול' },
    inwork:   { icon: '🔵', label: 'בטיפול' },
    done:     { icon: '🟢', label: 'טופל' },
    stub:     { icon: '⚪', label: 'הלקוח לא סיים את ההעלאה' },
    failed:   { icon: '🔴', label: 'העלאה נכשלה' }
  };

  /* הלוח העליון: customers=[{name, proofs, hasActiveCard}] →
       inbox   — חדש/כשל/לא-הושלם (מה שדורש עין מיד), חדש-קודם ואז לפי זמן יורד
       waiting — נצפה וטרם טופל
       inwork  — יש כרטיס-עבודה פעיל (ברמת-לקוח)
     ⚠️ כל גיליון מסווג פעם אחת בדיוק → אין מונים כפולים (נבדק). */
  /* "הלקוח מעלה קבצים כרגע" — משדה `uploading` שמסך-הלקוח כותב בתחילת ההעלאה
     ומוחק בסיומה. ⚠️ תוקף-זמן: אם הדפדפן של הלקוח נסגר באמצע, השדה נשאר
     תקוע; לכן מתייחסים אליו כ"חי" רק בחלון קצר. אין כאן שדה חדש — רק תצוגה
     של נתון שכבר נכתב. */
  var UPLOADING_FRESH_MS = 15 * 60 * 1000;
  function uploadingNow(p, now){
    if (!p || !p.uploading) return null;
    var at = _i(p.uploading.at);
    if (!at) return null;
    if ((_i(now) || 0) - at > UPLOADING_FRESH_MS) return null;   // ישן → לא מציגים "כרגע"
    return { at: at, name: String(p.uploading.name || ''), pages: _i(p.uploading.pages) || 0 };
  }

  /* האם הצוות כבר "סילק" את הפריט מהתיבה.
     ⚠️ 21/08/2026 (אישור-בעלים): ‏inboxDismissedAt נפרד מ-shopSeenAt —
     סילוק מהתיבה אינו "קיבלנו את הקבצים" שהלקוח רואה בפורטל. ‏anySeen
     נשאר נספר: מה שסומן-נצפה ממילא ירד מהתיבה, כמו עד היום. */
  function dismissedFromInbox(p){ return anySeen(p) || !!(p && p.inboxDismissedAt); }

  function inboxBoard(customers, now){
    var inbox = [], waiting = [], inwork = [];
    (customers || []).forEach(function(c){
      if (!c || !c.name) return;
      (c.proofs || []).forEach(function(p){
        if (!p) return;
        var st = bizStatus(p);
        if (st === 'done') return;                       // היסטוריה — לא בלוח העליון
        var up = uploadingNow(p, now);
        /* פריט שהצוות סילק מהתיבה יורד ממנה. ⚠️ אם הלקוח מעלה **כרגע**, הוא
           חוזר להופיע — זו פעילות חדשה, לא "מה שכבר טיפלנו בו". */
        if (st === 'stub' && dismissedFromInbox(p) && !up) return;
        /* ⚠️ 21/08/2026: סילוק מפורש (inboxDismissedAt) — בלי לכתוב ללקוח
           "קיבלנו". חדש שהוסר עובר ל"ממתין לטיפול"; כשל/לא-הושלם יורד. */
        if (!up && p.inboxDismissedAt) {
          if (st === 'stub' || st === 'failed') return;
          if (st === 'new') st = 'seen';
        }
        if (c.hasActiveCard && st !== 'stub' && st !== 'failed') st = 'inwork';
        var item = { customer: c.name, p: p, kind: uploadKind(p), status: st,
                     at: _i(p.createdAt) || _i(p.approvedAt) || 0, files: realFileCount(p),
                     uploading: up };
        if (up) { inbox.push(item); return; }            // מעלה כרגע → תמיד בראש התיבה
        if (st === 'new' || st === 'stub' || st === 'failed') inbox.push(item);
        else if (st === 'seen') waiting.push(item);
        else inwork.push(item);
      });
    });
    var rank = { 'new': 0, failed: 1, stub: 2 };
    // "מעלה כרגע" קודם לכל השאר
    inbox.sort(function(a,b){
      if (!!a.uploading !== !!b.uploading) return a.uploading ? -1 : 1;
      return (rank[a.status]-rank[b.status]) || (b.at-a.at); });
    waiting.sort(function(a,b){ return b.at-a.at; });
    inwork.sort(function(a,b){ return b.at-a.at; });
    /* מונה-"חדש": העלאות-אמיתיות שטרם נפתחו בלבד — stubs אינם נספרים בו */
    var newCount = 0;
    inbox.forEach(function(x){ if (x.status === 'new') newCount++; });
    return { inbox: inbox, waiting: waiting, inwork: inwork,
             counts: { newReal: newCount, inboxAll: inbox.length, waiting: waiting.length, inwork: inwork.length } };
  }

  /* ── 7. מיון-לפי-דחיפות (עיצוב-מחדש 13/08/2026, שרטוט-בעלים) ───────────
     "אתמול היה יום עמוס והיה קשה להתנהל עם כמה לקוחות במקביל" — הרשימה
     מסתדרת לפי מי-צריך-אותי-עכשיו, עם **הסיבה** כתובה, ולא לפי א"ב.
     טהור: מקבל את הסיכום (customerSummary) + אותות שהמסך אוסף, ומחזיר
     החלטה. המסך רק מצייר. */
  function custTriage(sum, extra) {
    var s = sum || {}, e = extra || {};
    var why = [];
    var nNew = _i(s.newFiles), chat = _i(e.unreadChat);
    if (e.uploadingNow) why.push('מעלה קבצים כרגע…');
    if (nNew) why.push(nNew === 1 ? 'קובץ חדש' : nNew + ' קבצים חדשים');
    if (chat) why.push(chat === 1 ? 'הודעה שלא נקראה' : chat + ' הודעות שלא נקראו');
    if (e.swapPending) why.push('ביקש החלפת עמוד — ממתין לאישורכם');
    var pend = s.pendingPages || [];
    if (pend.length) why.push('חסרים עמ׳ ' + pend.join(', '));
    /* ⚠️ בקשת-בעלים 18/08/2026: "אמור לשלוח היום — טרם שלח" **לבדו** אינו
       מושך את הלקוח לראש סרגל-הצד. מאז 17/08 הרשימה הזו יושבת ברצועה
       העליונה (todayBoard), ושכפולה בצד ימין הפך את "דורשים טיפול" לרשימת
       כל-מי-שמשלוח-היום — כלומר לרעש שמסתיר את מי שבאמת צריך טיפול.
       הסיבה נשארת ב-why (היא מידע נכון על הלקוח), אך אינה מדליקה דחיפות. */
    /* ⚠️ 18/08/2026: "הלקוח סיים ואישר" הוא הסיבה **הכי** דחופה — מרגע זה
       הגיליון סופי מבחינתו והכדור אצל הדפוס. לכן ראשון ברשימת-הסיבות. */
    if (e.customerDone) why.unshift('✅ הלקוח סיים ואישר — ממתין לכם');
    var urgentWhy = why.length;
    if (e.dueTodayNotSent) why.push('אמור לשלוח היום — טרם שלח');
    return { urgent: urgentWhy > 0, why: why, at: _i(s.lastAt) };
  }
  /* סדר מלא של הרשימה: דחופים (לפי אחרון-פעילות יורד) ואז שקטים (א"ב).
     ⚠️ מקבל [{name, sum, extra}] ומחזיר {urgent:[...], quiet:[...]} עם
     ה-why מוכן — כדי שהמסך לא יפעיל את הכלל פעמיים ויסתור את עצמו. */
  function triageOrder(items) {
    var urgent = [], quiet = [];
    (items || []).forEach(function (it) {
      if (!it || !it.name) return;
      var t = custTriage(it.sum, it.extra);
      var row = { name: it.name, why: t.why, at: t.at, sum: it.sum || {}, extra: it.extra || {} };
      (t.urgent ? urgent : quiet).push(row);
    });
    urgent.sort(function (a, b) { return _i(b.at) - _i(a.at); });
    quiet.sort(function (a, b) { return _s(a.name).localeCompare(_s(b.name), 'he'); });
    return { urgent: urgent, quiet: quiet };
  }

  return { DAYS: DAYS, STAGES: STAGES,
           custTriage: custTriage, triageOrder: triageOrder,
           normName: normName, nameInside: nameInside, customerDay: customerDay,
           stageOf: stageOf, stageIndex: stageIndex, anySeen: anySeen,
           newFiles: newFiles, pendingPages: pendingPages,
           customerSummary: customerSummary,
           sentOn: sentOn, startOfDay: startOfDay, dayNameOf: dayNameOf, todayBoard: todayBoard,
           hasRealFiles: hasRealFiles, realFileCount: realFileCount, uploadKind: uploadKind,
           bizStatus: bizStatus, inboxBoard: inboxBoard,
           uploadingNow: uploadingNow, dismissedFromInbox: dismissedFromInbox,
           KIND_LABELS: KIND_LABELS, BIZ_LABELS: BIZ_LABELS };
});
