// One real input preserves keyboard, paste and assistive-technology support.
let loginCodeSubmitting=false,loginCodeEntryTimer=null;
function loginCodeMarkup(){
 return '<section class="login-code-intro"><h2>Sign in with Login Code</h2><p>Enter the 6-digit numeric access code provided by your lender or administrator. Sign-in starts automatically after the sixth digit.</p></section>'+
 '<div id="loginTokenField" class="login-code-field"><div class="login-code-label"><label for="loginToken">Login Code (6 digits) <span aria-hidden="true">*</span></label><span id="loginCodeCount" aria-live="polite">0 of 6 entered</span></div><div class="login-code-input-wrap">'+
 '<div class="login-code-cells" aria-hidden="true">'+Array.from({length:6},(_,i)=>'<span class="login-code-cell animated-access-ring'+(i===0?' is-current':'')+'"><span class="login-code-number"></span></span>').join('')+'</div>'+
 '<input id="loginToken" type="text" inputmode="none" pattern="[0-9]{6}" maxlength="6" autocomplete="off" aria-describedby="loginCodePolicy loginError" oninput="updateLoginCodeEntry(event)" onfocus="syncLoginCode()" onkeydown="if(event.key===\'Enter\'){event.preventDefault();signinWithToken()}"></div></div>'+
 '<p class="login-code-policy" id="loginCodePolicy"><span aria-hidden="true">ⓘ</span><span>Login Codes stay valid until your lender replaces or revokes them. Keep your code private. Contact your lender if you need one.</span></p>'+
 '<div id="loginError" class="login-inline-error" role="alert" aria-live="polite"></div><div class="login-code-keypad" aria-label="Login Code keypad">'+
 ['1','2','3','4','5','6','7','8','9','clear','0','backspace'].map(key=>'<button type="button" class="login-code-key'+(/\d/.test(key)?'':' is-action')+'" aria-label="'+(key==='clear'?'Clear Login Code':key==='backspace'?'Delete last digit':'Enter '+key)+'" onclick="pressLoginCodeKey(\''+key+'\',this)">'+(key==='clear'?'CLEAR':key==='backspace'?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M9 5h12v14H9l-7-7 7-7Z"/><path d="m12 9 6 6m0-6-6 6"/></svg>':key)+'</button>').join('')+'</div>'+
 '<button type="button" id="loginCodeContinue" class="primary login-code-continue" disabled onclick="signinWithToken()"><span>Continue with Login Code</span>'+loginSvg('arrow')+'</button>';
}
const loginBeforeCode=login;
login=()=>{const host=document.createElement('div');host.innerHTML=loginBeforeCode();host.querySelector('#loginMethodToken').textContent='Login Code';host.querySelector('#loginTokenFields').innerHTML=loginCodeMarkup();return host.innerHTML;};
function syncLoginCode(entered=-1){
 const input=$('#loginToken');if(!input)return;
 input.value=input.value.replace(/[^0-9]/g,'').slice(0,6);
 const value=input.value,cells=[...document.querySelectorAll('.login-code-cell')];
 clearTimeout(loginCodeEntryTimer);
 cells.forEach((cell,index)=>{cell.classList.toggle('is-filled',index<value.length);cell.classList.toggle('is-current',index===value.length&&value.length<6);cell.classList.remove('is-entering');cell.querySelector('.login-code-number').textContent=value[index]||'';});
 if(entered>=0&&entered<value.length){const cell=cells[entered];void cell.offsetWidth;cell.classList.add('is-entering');loginCodeEntryTimer=setTimeout(()=>cell.classList.remove('is-entering'),900);}
 $('#loginCodeCount').textContent=value.length+' of 6 entered';
 const submit=$('#loginCodeContinue');submit.disabled=loginCodeSubmitting||value.length!==6;submit.setAttribute('aria-busy',String(loginCodeSubmitting));
 submit.innerHTML=loginCodeSubmitting?'<span class="login-spinner" aria-hidden="true"></span><span>Signing in…</span>':'<span>Continue with Login Code</span>'+loginSvg('arrow');
 input.disabled=loginCodeSubmitting;
 document.querySelectorAll('.login-code-key').forEach(button=>{button.disabled=loginCodeSubmitting;});
}
function updateLoginCodeEntry(event){clearLoginError();const input=event.target;syncLoginCode(event.inputType?.startsWith('delete')?-1:Math.max(0,(input.selectionStart||input.value.length)-1));}
function pressLoginCodeKey(key,button){
 if(loginCodeSubmitting)return;const input=$('#loginToken');if(!input)return;
 const before=input.value;
 input.value=key==='clear'?'':key==='backspace'?before.slice(0,-1):(before+key).slice(0,6);
 button.classList.remove('is-pressed');void button.offsetWidth;button.classList.add('is-pressed');setTimeout(()=>button.classList.remove('is-pressed'),180);
 clearLoginError();syncLoginCode(/^\d$/.test(key)&&input.value.length>before.length?input.value.length-1:-1);
}
const modeBeforeCode=setLoginMode;
setLoginMode=method=>{if(loginCodeSubmitting||stagingBusy)return;modeBeforeCode(method);document.querySelector('.modern-login-panel')?.classList.toggle('is-code-mode',method==='token');syncLoginCode();};
signinWithToken=async()=>{
 if(loginCodeSubmitting||stagingBusy)return;if(typeof loginAccessBlocked==='function'&&loginAccessBlocked()){showLoginAccessError({login:loginAccessLock},'code');return;}const input=$('#loginToken'),code=input?.value||'';
 if(!/^\d{6}$/.test(code)){stagingLoginError('Enter the six-digit Login Code from your lender.');input?.focus({preventScroll:true});return;}
 loginCodeSubmitting=true;clearLoginError();syncLoginCode();
 try{await mobileCall('token-login',{code});if(input)input.value='';}
 catch(error){stagingLoginError(error.message||'Unable to sign in. Please retry.');if(typeof showLoginAccessError==='function')showLoginAccessError({message:error.message,login:error.login},'code');}
 finally{loginCodeSubmitting=false;if(page==='login')syncLoginCode();}
};
const renderBeforeCode=render;
render=()=>{renderBeforeCode();if(page==='login'){document.querySelector('.modern-login-panel')?.classList.toggle('is-code-mode',loginMode==='token');syncLoginCode();}else{clearTimeout(loginCodeEntryTimer);loginCodeSubmitting=false;}};
render();
