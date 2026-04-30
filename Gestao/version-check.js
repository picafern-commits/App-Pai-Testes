// ===== APP VERSION CHECK =====
(function(){
  const CURRENT_APP_VERSION = "2.0.0";
  const VERSION_URL = "./version.json";

  async function checkAppVersion(){
    try{
      const res = await fetch(VERSION_URL + "?v=" + Date.now(), { cache: "no-store" });
      if(!res.ok) return;

      const data = await res.json();
      const remoteVersion = String(data.version || "").trim();

      if(remoteVersion && remoteVersion !== CURRENT_APP_VERSION){
        showUpdateNotice(data.message || "Nova versão disponível. Atualiza a app.", remoteVersion);
      }
    }catch(err){
      console.warn("Não foi possível verificar atualização:", err);
    }
  }

  function showUpdateNotice(message, version){
    if(document.getElementById("appUpdateNotice")) return;

    const box = document.createElement("div");
    box.id = "appUpdateNotice";
    box.innerHTML = `
      <div class="app-update-card">
        <div>
          <strong>Atualização disponível</strong>
          <p>${escapeHtml(message)}</p>
          <small>Versão nova: ${escapeHtml(version)}</small>
        </div>
        <div class="app-update-actions">
          <button type="button" id="appUpdateLater">Depois</button>
          <button type="button" id="appUpdateNow">Atualizar agora</button>
        </div>
      </div>
    `;

    const style = document.createElement("style");
    style.textContent = `
      #appUpdateNotice{
        position:fixed;
        left:16px;
        right:16px;
        bottom:16px;
        z-index:999999;
        display:flex;
        justify-content:center;
        pointer-events:none;
      }
      #appUpdateNotice .app-update-card{
        width:min(560px,100%);
        pointer-events:auto;
        display:flex;
        justify-content:space-between;
        gap:14px;
        align-items:center;
        padding:16px;
        border-radius:20px;
        background:linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98));
        color:#fff;
        border:1px solid rgba(255,255,255,.12);
        box-shadow:0 22px 60px rgba(0,0,0,.38);
        backdrop-filter:blur(12px);
        font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      }
      #appUpdateNotice strong{
        display:block;
        font-size:15px;
        margin-bottom:4px;
      }
      #appUpdateNotice p{
        margin:0 0 4px;
        color:#cbd5e1;
        font-size:13px;
        line-height:1.35;
      }
      #appUpdateNotice small{
        color:#94a3b8;
        font-size:11px;
      }
      #appUpdateNotice .app-update-actions{
        display:flex;
        gap:8px;
        flex-shrink:0;
      }
      #appUpdateNotice button{
        border:0;
        border-radius:12px;
        padding:10px 12px;
        font-weight:800;
        cursor:pointer;
        color:#fff;
      }
      #appUpdateLater{
        background:rgba(255,255,255,.08);
      }
      #appUpdateNow{
        background:linear-gradient(135deg,#22c55e,#0ea5e9);
      }
      @media(max-width:640px){
        #appUpdateNotice .app-update-card{
          align-items:stretch;
          flex-direction:column;
        }
        #appUpdateNotice .app-update-actions{
          justify-content:flex-end;
        }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(box);

    document.getElementById("appUpdateLater")?.addEventListener("click", () => {
      box.remove();
    });

    document.getElementById("appUpdateNow")?.addEventListener("click", () => {
      try{
        if("caches" in window){
          caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).finally(() => {
            window.location.reload(true);
          });
        }else{
          window.location.reload(true);
        }
      }catch(e){
        window.location.reload(true);
      }
    });
  }

  function escapeHtml(value){
    return String(value || "").replace(/[&<>"']/g, function(ch){
      return ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" })[ch];
    });
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", checkAppVersion);
  }else{
    checkAppVersion();
  }
})();
