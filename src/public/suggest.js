(function(){
  var btn = document.querySelector('[data-action="open-settings"]');
  if (!btn) return;
  btn.addEventListener('click', function() {
    try {
      if (chrome && chrome.runtime && chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
        return;
      }
    } catch (e) {}
    window.open('sidepanel.html', '_blank');
  });
})();
