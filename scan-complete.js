/* ═══════════ scan-complete.js — טופס "העבודה הושלמה" לפי סוג העבודה ═══════════
   בסריקת QR וסימון "הושלמה", השדות משתנים לפי סוג העבודה:

   • פלייסמנטים → כמה חבילות יצאו + כמה בחבילה  (סה״כ = חבילות × בחבילה)
   • עיתונים    → כמה יצא בפועל מול ההזמנה → תקין / חסרים N
   • פלאיירים   → כמה באריזה + כמה אריזות + כמה קרטונים  (סה״כ = באריזה × אריזות)
   • אחר        → כמות שהושלמה + אריזות (כללי)

   הקוד טהור (אין DOM) כדי שייבדק ב-Node; ה-UI ב-scan.html. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ScanComplete = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function _s(v){ return String(v == null ? '' : v); }
  function _n(v){ var n = parseInt(v, 10); return isFinite(n) && n > 0 ? n : 0; }

  /* זיהוי סוג העבודה מהכרטיס (סוג + שם) */
  function detectKind(card){
    var t = (_s(card && card.type) + ' ' + _s(card && card.name) + ' ' + _s(card && card.desc)).toLowerCase();
    if (/פלייסמנט|פלסמנט|פלייסמט|placemat|טישט|טיש\b/.test(t)) return 'placemats';
    if (/פלא?ייר|פליי?ר|flyer|leaflet|דפים|פלוס|עלון/.test(t)) return 'flyer';
    if (/עיתון|ידיעון|newspaper|חוברת|בוקלט|booklet|מגזין/.test(t)) return 'newspaper';
    // עבודה עם ריצות + עמודים = בדרך כלל עיתון/חוברת
    if (card && card.runs && card.runs.length && (_n(card.pages) >= 4)) return 'newspaper';
    return 'generic';
  }

  function kindLabel(kind){
    return kind === 'placemats' ? 'פלייסמנטים'
         : kind === 'newspaper' ? 'עיתון / חוברת'
         : kind === 'flyer'     ? 'פלאיירים'
         : 'כללי';
  }

  /* השדות שיוצגו לכל סוג — key/label/placeholder/hint. */
  function fields(kind, orderedQty){
    var ordered = _n(orderedQty);
    if (kind === 'placemats') return [
      { key: 'packages',   label: 'כמה חבילות יצאו',   placeholder: 'מס׳ חבילות' },
      { key: 'perPackage', label: 'כמה בכל חבילה',     placeholder: 'יח׳ בחבילה' }
    ];
    if (kind === 'newspaper') return [
      { key: 'produced', label: 'כמה יצא בפועל', placeholder: String(ordered || ''),
        hint: ordered ? ('הוזמנו ' + ordered.toLocaleString() + ' — כמה באמת יצאו?') : '' }
    ];
    if (kind === 'flyer') return [
      { key: 'perPack', label: 'כמה בכל אריזה',  placeholder: 'יח׳ באריזה' },
      { key: 'packs',   label: 'כמה אריזות',     placeholder: 'מס׳ אריזות' },
      { key: 'cartons', label: 'כמה קרטונים',    placeholder: 'מס׳ קרטונים (אופציונלי)', optional: true }
    ];
    return [
      { key: 'qty',   label: 'כמות שהושלמה (יח׳)', placeholder: String(ordered || '') },
      { key: 'packs', label: 'אריזות / חבילות (אופציונלי)', placeholder: '', optional: true }
    ];
  }

  /* חישוב הסיכום מהערכים שהוזנו. מחזיר total + שורות-סיכום + סטטוס-מול-הזמנה. */
  function compute(kind, vals, orderedQty){
    vals = vals || {};
    var ordered = _n(orderedQty), total = 0, lines = [], packs = 0, packSize = 0;

    if (kind === 'placemats'){
      var pk = _n(vals.packages), per = _n(vals.perPackage);
      total = pk * per; packs = pk; packSize = per;
      lines.push({ label: 'חבילות', value: pk });
      lines.push({ label: 'בכל חבילה', value: per });
    } else if (kind === 'flyer'){
      var pp = _n(vals.perPack), pc = _n(vals.packs), ct = _n(vals.cartons);
      total = pp * pc; packs = pc; packSize = pp;
      lines.push({ label: 'בכל אריזה', value: pp });
      lines.push({ label: 'אריזות', value: pc });
      if (ct) lines.push({ label: 'קרטונים', value: ct });
    } else if (kind === 'newspaper'){
      total = _n(vals.produced);
      lines.push({ label: 'יצא בפועל', value: total });
    } else {
      total = _n(vals.qty); packs = _n(vals.packs);
      if (packs) lines.push({ label: 'אריזות', value: packs });
    }

    var status = 'none', shortfall = 0, surplus = 0;
    if (ordered > 0 && (kind === 'newspaper' || total > 0)){
      if (total === ordered) status = 'ok';
      else if (total < ordered){ status = 'short'; shortfall = ordered - total; }
      else { status = 'over'; surplus = total - ordered; }
    }
    return { kind: kind, total: total, ordered: ordered, lines: lines,
             packs: packs, packSize: packSize, status: status,
             shortfall: shortfall, surplus: surplus };
  }

  /* משפט-סטטוס קריא מול ההזמנה (לעיתונים בעיקר) */
  function statusText(res){
    if (!res || res.status === 'none') return '';
    if (res.status === 'ok')    return '✓ יצא בדיוק כמו בהזמנה (' + res.ordered.toLocaleString() + ')';
    if (res.status === 'short') return '⚠️ חסרים ' + res.shortfall.toLocaleString() + ' (הוזמנו ' + res.ordered.toLocaleString() + ', יצאו ' + res.total.toLocaleString() + ')';
    return '➕ יצאו ' + res.surplus.toLocaleString() + ' מעל ההזמנה (הוזמנו ' + res.ordered.toLocaleString() + ')';
  }

  /* סיכום קצר לשמירה/תצוגה */
  function summaryText(res){
    if (!res) return '';
    var parts = [res.total.toLocaleString() + ' יח׳'];
    if (res.kind === 'placemats' && res.packs) parts.push(res.packs + ' חבילות × ' + res.packSize);
    else if (res.kind === 'flyer' && res.packs) parts.push(res.packs + ' אריזות × ' + res.packSize);
    else if (res.packs) parts.push(res.packs + ' אריזות');
    return parts.join(' · ');
  }

  return { detectKind: detectKind, kindLabel: kindLabel, fields: fields,
           compute: compute, statusText: statusText, summaryText: summaryText };
});
