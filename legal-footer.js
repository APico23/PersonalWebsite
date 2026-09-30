(function () {
  "use strict";

  var script = document.currentScript;
  var privacyHref = script && script.dataset.privacy ? script.dataset.privacy : "privacy.html";
  var footer = document.querySelector("footer");

  if (!footer) {
    footer = document.createElement("footer");
    document.body.appendChild(footer);
  }

  if (footer.querySelector(".site-legal")) return;

  var year = new Date().getFullYear();
  var legal = document.createElement("div");
  legal.className = "site-legal";
  legal.innerHTML =
    '<p><a href="' + privacyHref + '">Privacy Policy</a> <span aria-hidden="true">|</span> &copy; ' +
    year +
    ' Austin Pico. All rights reserved.</p>' +
    '<p>Content disclaimer: This personal site provides opinions, reviews, rankings, and tools for general information and entertainment only. Information may change or contain errors; no warranty is made. Third-party names, marks, images, and content belong to their respective owners and do not imply affiliation or endorsement.</p>';
  footer.appendChild(legal);

  var style = document.createElement("style");
  style.textContent =
    ".site-legal{max-width:80rem;margin:1rem auto 0;padding:1rem 0 0;border-top:1px solid currentColor;font:0.75rem/1.55 system-ui,sans-serif;opacity:.82}.site-legal p{margin:.35rem 0}.site-legal a{color:inherit;font-weight:700}.site-legal span{padding:0 .35rem}";
  document.head.appendChild(style);
})();