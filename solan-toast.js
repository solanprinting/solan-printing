/* ═══════════════════════════════════════════════════════════════════════════
   solan-toast.js — הודעות למשתמש (חילוץ 4).

   ⚠️ הוצא מ-krtis-avoda.html ב**העברה מילולית**: אותם שמות, אותן
   התנהגות, אותם טיימרים ואותו עיצוב. לא נוסף wrapper · module · IIFE ·
   exports או alias, ו-onclick="_doUndo()" ו-window._doUndo נשארו כפי שהיו.

   ⚠️ אין למקבץ תלות בקוד העסקי של האפליקציה — אבל יש לו תלויות
   דפדפן: document · window · setTimeout · clearTimeout. וכן שני אלמנטים
   ב-DOM: #undo-toast שמוגדר ב-HTML, ו-#solanToast שנבנה כאן בעצמו על-פי הצורך.
   ═══════════════════════════════════════════════════════════════════════════ */
// ========== TOAST ==========
// ── Undo Toast System ──
let _undoTimer = null;
function showUndoToast(label, undoFn) {
  const el = document.getElementById('undo-toast');
  if (!el) return;
  clearTimeout(_undoTimer);
  el.innerHTML = '<span>🗑️ ' + label + '</span><button onclick="_doUndo()">↩️ בטל</button><div class="undo-progress"></div>';
  el.classList.add('show');
  window._doUndo = function() {
    clearTimeout(_undoTimer);
    el.classList.remove('show');
    undoFn();
    showToast('↩️ הפעולה בוטלה');
  };
  _undoTimer = setTimeout(function() {
    el.classList.remove('show');
    window._doUndo = null;
  }, 5000);
}

function showToast(msg, duration) {
  duration = duration || 3000;
  var t = document.getElementById("solanToast");
  if (!t) {
    t = document.createElement("div");
    t.id = "solanToast";
    t.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:10px 22px;border-radius:8px;font-size:15px;z-index:9999;opacity:0;transition:opacity .3s;pointer-events:none;";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = "1";
  clearTimeout(t._tid);
  t._tid = setTimeout(function(){ t.style.opacity = "0"; }, duration);
}
