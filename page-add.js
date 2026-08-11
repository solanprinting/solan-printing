/* ═══════════════════════════════════════════════════════════════════════════
   page-add.js — "הוספת עמוד/ים" לעיתון קיים, מתוך דרישה של בית-הדפוס.

   ⚠️ **הבעיה שזה פותר (10/08/2026, בקשת-בעלים).** כשבית-הדפוס דורש
   מהלקוח לשלוח עמוד מתוקן, לחיצה על הדרישה פתחה את מסלול **העיתון
   החדש**: שדה שם-עיתון, שדה מספר-גיליון, ובחירה בין "ריצה" ל"עיתון
   מלא". הלקוח נשאל שאלות שכבר ענה עליהן, ובמקרה הרע יצר עיתון שני
   במקום לתקן את הקיים.

   ⚠️ **הדרישה לא נשאה אליה מזהה-עיתון.** היא ‎{text,type,at,done}‎ בלבד,
   ולכן המערכת לא ידעה לאיזה עיתון היא מתייחסת — וזו הסיבה האמיתית
   שהמסלול נפל ל"עיתון חדש". בלי היעד אי אפשר לא לפתוח את השאלות.

   ⚠️ **דרישה ישנה בלי יעד חייבת להמשיך לעבוד.** יש כאלה בייצור כרגע,
   ומעבר שמשבית אותן היה משאיר לקוחות בלי דרך לענות. בלי יעד נופלים
   למסלול הישן — מוצהר, לא בשקט.

   הרצת הבדיקות: node page-add-tests.js
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PageAdd = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var clean = function (v) { return String(v == null ? '' : v).trim(); };

  /* ── מה הדרישה מבקשת ───────────────────────────────────────────────────
     ‏'replace' = שלח עמוד/ים מתוקנים לעיתון קיים.
     ‏'approve' = אשר את הפרופר.
     כל השאר = הודעה כללית, בלי פעולה מיוחדת. */
  function kindOf(notice) {
    var n = notice || {};
    if (n.type === 'replace') return 'replace';
    if (n.type === 'approve') return 'approve';
    return 'note';
  }

  /* היעד שהדרישה מצביעה עליו. ⚠️ ריצה היא **חלק** מעיתון: בלי proofId
     ה-partId חסר-משמעות, ולכן הוא נבלע יחד איתו ולא נשמר לבדו. */
  /* ⚠️ מזהה-הדרישה נוסע יחד עם היעד (10/08/2026): בלעדיו העורך אינו יכול
     לסגור את הדרישה אחרי שהעמוד הוחלף, והלקוח רואה את אותה בקשה שוב
     ושוב אחרי שכבר ענה עליה. הפורטל מסמן את המפתח כ-_id. */
  function noticeIdOf(notice) {
    var n = notice || {};
    return clean(n._id) || clean(n.id) || null;
  }
  function targetOf(notice) {
    var n = notice || {};
    var proofId = clean(n.proofId);
    if (!proofId) return null;
    return { proofId: proofId, partId: clean(n.partId) || null, noticeId: noticeIdOf(n) };
  }

  /* ── הגיליון הפתוח כרגע ────────────────────────────────────────────────
     ⚠️ **הבהרת-בעלים (10/08/2026): "דרישת החלפת עמוד תמיד מתייחסת
     לגיליון שכרגע פתוח לעבודה — אין דרך שהלקוח ירשום שם וגיליון, זה
     כבר ידוע."** ולכן היעד אינו חייב להיבחר ידנית: הוא **נגזר**.

     ⚠️ וזה גם פותר את הדרישות הישנות בלי יעד. במקום ליפול למסלול
     "עיתון חדש" — שהוא בדיוק מה שהתלוננו עליו — נופלים לגיליון הפתוח.
     נפילה-לאחור שמובילה לאותה תוצאה כמו המסלול התקין עדיפה על נפילה
     שמחזירה את התקלה.

     ⚠️ "פתוח" = לא הושלם, לא נסגר ולא אושר-סופית. עבודה שכבר בדפוס
     אינה מקבלת עמודים חדשים דרך הדלת הזו; לכך יש מסלול נפרד.
     ⚠️ וכשיש יותר מאחד — האחרון. שניים פתוחים במקביל הם מצב חריג,
     והאחרון הוא כמעט תמיד זה שעובדים עליו. */
  function isOpenIssue(p) {
    var r = p || {};
    if (r._deleted || r.completedAt || r.closedAt) return false;
    if (r.supersededBy) return false;              /* הוחלף בגרסה חדשה */
    if (r.status === 'approved' || r.apogeeApprovedAt) return false;
    if (r.foldApprovalStatus === 'approved') return false;
    return true;
  }

  function activeProof(rows) {
    var open = (rows || []).filter(isOpenIssue);
    if (!open.length) return null;
    open.sort(function (a, b) {
      return (Number(b.createdAt || b.approvedAt || 0) - Number(a.createdAt || a.approvedAt || 0));
    });
    return open[0];
  }

  /* ── מה הכפתור עושה ────────────────────────────────────────────────────
     ⚠️ הפעולה נגזרת מהדרישה ולא מניחוש. שלוש אפשרויות בלבד:
       addPages  — יש יעד ובקשת-החלפה → פותחים הוספת-עמודים לעיתון ההוא.
       approve   — בקשת-אישור.
       newJob    — נפילה-לאחור לדרישה ישנה בלי יעד. */
  function actionFor(notice, openProof) {
    var k = kindOf(notice), t = targetOf(notice);
    if (k === 'replace' && t) {
      return { action: 'addPages', target: t,
               label: '➕ הוספת עמוד/ים',
               title: 'מעלים רק את העמודים שבית-הדפוס ביקש — שם העיתון והגיליון כבר ידועים' };
    }
    if (k === 'replace') {
      /* ⚠️ דרישה בלי יעד (נוצרה לפני שהיעד נשמר) → הגיליון הפתוח.
         זו אותה תוצאה כמו במסלול התקין, ולכן הלקוח אינו נשאל דבר. */
      /* ⚠️ ‎id‎ או ‎_id‎: הפורטל מסמן את המזהה כ-_id והדפוס כ-id.
         קריאת אחד בלבד הייתה עובדת במסך אחד ונכשלת בשני. */
      var oid = openProof && (openProof.id || openProof._id);
      var act = oid ? { proofId: String(oid), partId: null, noticeId: noticeIdOf(notice) } : null;
      if (act) {
        return { action: 'addPages', target: act, fromOpen: true,
                 label: '➕ הוספת עמוד/ים',
                 title: 'מתווסף לגיליון שפתוח כרגע לעבודה' };
      }
      /* ⚠️ אין גיליון פתוח = באמת אין לאן לצרף. רק כאן המסלול הידני. */
      return { action: 'newJob', target: null, legacy: true,
               label: '📎 צרף קבצים / שלח עמוד חדש',
               title: 'אין כרגע גיליון פתוח לעבודה — נא לפתוח עיתון חדש' };
    }
    if (k === 'approve') {
      return { action: 'approve', target: t,
               label: '✓ אשר את הפרופר לדפוס', title: '' };
    }
    return { action: 'newJob', target: null,
             label: '📎 צרף קבצים / שלח עמוד חדש', title: '' };
  }

  /* ── כתובת העורך ───────────────────────────────────────────────────────
     ⚠️ ‎mode=addpages‎ הוא מה שמורה לעורך לא לשאול שם וגיליון. בלעדיו
     הוא פותח את אותן שאלות גם על עיתון קיים. */
  function editorUrl(target, backUrl) {
    var t = target || {};
    if (!clean(t.proofId)) return '';
    var u = 'proof-client.html?id=' + encodeURIComponent(t.proofId) + '&mode=addpages';
    if (t.partId) u += '&part=' + encodeURIComponent(t.partId);
    /* ⚠️ ‎nid‎ הוא מה שמאפשר לעורך לסגור את הדרישה בסוף. בלעדיו התיקון
       מגיע לבית-הדפוס והדרישה נשארת פתוחה — הלקוח מתבקש שוב על אותו עמוד. */
    if (t.noticeId) u += '&nid=' + encodeURIComponent(t.noticeId);
    if (clean(backUrl)) u += '&back=' + encodeURIComponent(backUrl);
    return u;
  }

  /* ── מה מוצג ללקוח בעורך ───────────────────────────────────────────────
     ⚠️ כשיודעים לאיזה עיתון וריצה — אומרים זאת. "העלה קובץ" בלי הקשר
     הוא בדיוק מה שגורם ללקוח להעלות למקום הלא-נכון. */
  function editorHeading(rec, target) {
    var r = rec || {}, t = target || {};
    var name = clean(r.title) || 'העיתון';
    var issue = clean(r.issue);
    var head = 'הוספת עמוד/ים · ' + name + (issue ? (' · גיליון ' + issue) : '');
    var part = t.partId && r.parts && r.parts[t.partId];
    if (part) head += ' · ' + (clean(part.name) || 'ריצה');
    return head;
  }

  /* ⚠️ מצב-העורך נקרא מהכתובת פעם אחת ובמקום אחד: שני מקומות שקוראים
     אותו בנפרד מתפצלים בהתנהגות ברגע שאחד מהם משתנה. */
  function modeFromUrl(search) {
    var s = clean(search);
    return /(^|[?&])mode=addpages(&|$)/.test(s) ? 'addpages' : 'full';
  }

  return { kindOf: kindOf, targetOf: targetOf, noticeIdOf: noticeIdOf, actionFor: actionFor,
           isOpenIssue: isOpenIssue, activeProof: activeProof,
           editorUrl: editorUrl, editorHeading: editorHeading, modeFromUrl: modeFromUrl };
});
