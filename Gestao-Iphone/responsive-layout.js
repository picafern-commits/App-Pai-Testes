(function(){
  function applyTitles(){
    document.querySelectorAll('.nav-btn, .bottom-btn').forEach(btn => {
      const text = btn.textContent.trim();
      if(text) btn.title = text;
    });
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', applyTitles);
  }else{
    applyTitles();
  }
})();
