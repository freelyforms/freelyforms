/**
 * Embed script served from the forms domain (`/embed.js`). It sizes every
 * `<iframe data-freelyforms>` to the height its form reports, accepting messages only from the
 * origin the script itself was loaded from.
 */
export const EMBED_JS = `(function(){
  var script = document.currentScript;
  if (!script) return;
  var origin = new URL(script.src).origin;
  window.addEventListener("message", function (event) {
    var data = event.data;
    if (event.origin !== origin || !data || data.type !== "freelyforms:height") return;
    var frames = document.querySelectorAll("iframe[data-freelyforms]");
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === event.source) {
        var height = Math.min(Math.max(Number(data.height) || 0, 120), 20000);
        frames[i].style.height = height + "px";
      }
    }
  });
  // The form may have reported its height before this script loaded: ask again, now and on load.
  var frames = document.querySelectorAll("iframe[data-freelyforms]");
  for (var i = 0; i < frames.length; i++) {
    var ask = (function (frame) {
      return function () {
        if (frame.contentWindow) frame.contentWindow.postMessage({ type: "freelyforms:ping" }, origin);
      };
    })(frames[i]);
    frames[i].addEventListener("load", ask);
    ask();
  }
})();
`;

/** The snippet owners paste into their site. */
export function embedSnippet(formUrl: string, title: string, scriptUrl: string): string {
  const attr = (v: string) =>
    v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<iframe data-freelyforms src="${attr(formUrl)}" title="${attr(title)}" width="100%" height="600" style="border:0;width:100%" loading="lazy"></iframe>
<script src="${attr(scriptUrl)}" async></script>`;
}
