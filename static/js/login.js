/* login.js – Logica de la pantalla de inicio de sesion */

async function api(path, opts) {
  opts = opts || {};
  var headers = opts.headers || {};
  try{
    var meta = document.querySelector('meta[name=csrf-token]');
    var token = meta ? meta.getAttribute('content') : '';
    if (token) headers['X-CSRF-Token'] = token;
  }catch(e){}
  headers['Content-Type'] = 'application/json';
  var res = await fetch(path, Object.assign({ credentials: 'include' }, opts, { headers: headers }));
  var data = await res.json().catch(function(){ return {}; });
  if (!res.ok) throw new Error(data.error || 'http_'+res.status);
  return data;
}

var err = document.getElementById('err');
var btn = document.getElementById('btn');
var form = document.getElementById('loginForm');
var togglePw = document.getElementById('togglePw');
var inputPw = document.getElementById('p');

togglePw.addEventListener('click', function() {
  var isPw = inputPw.type === 'password';
  inputPw.type = isPw ? 'text' : 'password';
  togglePw.textContent = isPw ? 'Ocultar' : 'Mostrar';
});

async function doLogin(){
  err.classList.remove('show');
  err.textContent = '';
  btn.disabled = true;
  var originalHtml = btn.innerHTML;
  btn.innerHTML = '<span>Verificando...</span>';
  try{
    await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: document.getElementById('u').value, password: document.getElementById('p').value }) });
    var meResp = await api('/api/me');
    var me = meResp.me || meResp;

    var rawBrands = ((me.allowed_brands || 'consulting') + '').split(',').map(function(b){ return b.trim(); }).filter(Boolean);
    var validBrands = ['consulting','petroleum'];
    var allowed = rawBrands.filter(function(b){ return validBrands.indexOf(b) >= 0; });

    if (me.role === 'admin' || allowed.length > 1) {
      location.href = '/select-system';
    } else {
      var brand = allowed[0] || 'consulting';
      try{
        var brandRes = await api('/api/set-brand', { method: 'POST', body: JSON.stringify({ brand: brand }) });
        location.href = brandRes.redirect || '/hub';
      }catch(e2){
        location.href = '/hub';
      }
    }
  }catch(e){
    err.textContent = 'No se pudo iniciar sesion: ' + e.message;
    err.classList.add('show');
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

form.addEventListener('submit', function(ev){
  ev.preventDefault();
  doLogin();
});
