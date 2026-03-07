/**
 * MathJax Configuration
 * Enables LaTeX math rendering with chemistry and extended arrow support
 */
window.MathJax = {
  loader: {
    load: ["[tex]/mhchem", "[tex]/extpfeil"],
  },
  tex: {
    packages: { "[+]": ["mhchem", "extpfeil"] },
    inlineMath: [
      ["$", "$"],
      ["\\(", "\\)"],
    ],
    displayMath: [
      ["$$", "$$"],
      ["\\[", "\\]"],
    ],
    processEscapes: true,
    processEnvironments: true,
  },
  options: {
    skipHtmlTags: ["script", "noscript", "style", "textarea", "pre", "code"],
  },
  startup: {
    ready: () => {
      MathJax.startup.defaultReady();
      MathJax.startup.promise.catch((err) => {
        console.error("MathJax initialization error:", err);
      });
    },
  },
};

document$.subscribe(() => {
  if (typeof MathJax !== "undefined" && MathJax.typesetPromise) {
    MathJax.startup.output.clearCache();
    MathJax.typesetClear();
    MathJax.texReset();
    MathJax.typesetPromise().catch((err) => console.log("MathJax error:", err));
  }
});
