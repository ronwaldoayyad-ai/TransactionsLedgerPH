// Login controls remain part of the approved v4.12.24 screen and Auth bridge.
const loginIcons={mail:'<path d="M3 5h18v14H3zM3 6l9 7 9-7"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3M12 14v3"/>',eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',shield:'<path d="M12 3l7 3v6c0 4-7 9-7 9s-7-5-7-9V6z"/>'};
const loginSvg=name=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+loginIcons[name]+'</svg>';
function loginArtworkMarkup(){
 const source='<image href="/assets/login-reference.png" width="415" height="703"/>';
 return `<svg viewBox="0 0 415 133" width="415" height="133" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
 <defs>
 <path id="loginArtPaper" d="M161 52L211 29L264 56L203 94L162 70Z"/>
 <path id="loginArtShield" d="M129 50L139 47L147 41L155 47L164 50L163 69L158 81L148 93L137 83L130 68Z"/>
 <path id="loginArtLock" fill-rule="evenodd" clip-rule="evenodd" d="M273 54H275V49Q275 39 284 39Q294 39 294 49V54H295Q298 54 298 58V74Q298 78 294 78H272Q269 78 269 74V58Q269 54 273 54Z M279 54H289V49Q289 43 284 43Q279 43 279 49Z"/>
 <ellipse id="loginArtCoin" cx="211" cy="33" rx="12" ry="10"/>
 <circle id="loginArtCheck" cx="302" cy="95" r="14"/>
 <mask id="loginArtPaperMask" maskUnits="userSpaceOnUse" x="150" y="20" width="125" height="85"><use href="#loginArtPaper" fill="white"/><use href="#loginArtCoin" fill="black"/><use href="#loginArtShield" fill="black"/></mask>
 <clipPath id="loginArtShieldClip"><use href="#loginArtShield"/></clipPath><clipPath id="loginArtLockClip"><use href="#loginArtLock"/></clipPath><clipPath id="loginArtCoinClip"><use href="#loginArtCoin"/></clipPath><clipPath id="loginArtCheckClip"><use href="#loginArtCheck"/></clipPath>
 </defs>
 <path d="M40 78Q115 38 211 64T382 76" fill="none" stroke="#1769f5" stroke-opacity=".25" stroke-dasharray="3 4"/>
 <path d="M40 102Q119 69 207 101T382 101" fill="none" stroke="#1769f5" stroke-opacity=".3"/>
 <path d="M83 100L219 79L339 103L201 124Z" fill="#e2e8f0"/><path d="M83 100L201 124L339 103V109L201 132L83 107Z" fill="#94a3b8"/>
 <g class="login-art-paper" mask="url(#loginArtPaperMask)">${source}</g>
 <g class="login-art-shield" clip-path="url(#loginArtShieldClip)">${source}</g>
 <g class="login-art-lock" clip-path="url(#loginArtLockClip)">${source}</g>
 <g class="login-art-coin" clip-path="url(#loginArtCoinClip)">${source}</g>
 <g class="login-art-check" clip-path="url(#loginArtCheckClip)">${source}</g>
 </svg>`;
}
let loginRemember=true,loginPasswordVisible=false,loginCapsLock=false,loginTouched=new Set(),modernLoginWasActive=false,loginProtectionTimer=null;
const loginBeforeFields=login;
login=()=>{
 const host=document.createElement('div');host.innerHTML=loginBeforeFields();host.querySelector('.glass.pad')?.classList.add('modern-login-panel');
 const hero=host.querySelector('.loginhero'),logo=hero.querySelector('.loginlogo'),artwork=document.createElement('div');
 hero.classList.add('login-illustrated');artwork.className='login-reference-artwork';artwork.setAttribute('aria-hidden','true');
 artwork.innerHTML=loginArtworkMarkup()+'<iframe class="login-artwork-player" src="/login-illustration.html" title="Animated loan illustration" tabindex="-1" loading="eager"></iframe>';hero.prepend(artwork);logo.setAttribute('aria-hidden','true');hero.querySelector('h1').prepend(logo);
 hero.querySelector('.muted br')?.replaceWith(document.createTextNode(' '));
 for(const [id,label,icon,autocomplete] of [['email','Email address','mail','username'],['password','Password','lock','current-password']]){
  const input=host.querySelector('#'+id),field=input.closest('label'),labelText=field.querySelector('span');field.classList.add('modern-login-field');labelText.className='login-floating-label';labelText.id=id+'Label';
  const control=document.createElement('div');control.className='login-field-control';control.innerHTML='<span class="login-input-icon">'+loginSvg(icon)+'</span>';input.before(control);control.append(labelText,input);input.placeholder=' ';input.autocomplete=autocomplete;input.setAttribute('aria-labelledby',labelText.id);input.setAttribute('aria-describedby',id==='email'?'loginEmailFeedback':'loginPasswordFeedback');input.setAttribute('oninput',"loginTouched.add('"+id+"');updateLoginFeedback(true)");input.setAttribute('onblur',"loginTouched.add('"+id+"');updateLoginFeedback()");input.setAttribute('onkeydown',"loginFieldKey(event,'"+id+"')");
  if(id==='email')input.maxLength=254;
  else{input.type=loginPasswordVisible?'text':'password';control.insertAdjacentHTML('beforeend','<button type="button" id="loginPasswordToggle" class="login-password-toggle" aria-label="'+(loginPasswordVisible?'Hide password':'Show password')+'" aria-pressed="'+loginPasswordVisible+'" onclick="toggleLoginPassword()">'+loginSvg('eye')+'</button>');field.insertAdjacentHTML('beforeend','<small class="login-protected">'+loginSvg('shield').replace('</svg>','<path class="login-protected-check" d="m8.5 11.5 2.5 2.5 4.5-5"/></svg>')+'<span>Protected</span><span class="login-protected-feedback" role="status" aria-live="polite"></span></small>');}
  input.setAttribute('onchange',"updateLoginFeedback(true)");
  field.insertAdjacentHTML('beforeend','<small id="'+(id==='email'?'loginEmailFeedback':'loginPasswordFeedback')+'" class="login-field-feedback" aria-live="polite"></small>');
  if(id==='email')field.prepend(field.querySelector('.login-field-feedback'));
  if(id==='password'){const row=document.createElement('div');row.className='login-feedback-row';field.append(row);row.append(field.querySelector('.login-field-feedback'),field.querySelector('.login-protected'));}
 }
 const check=host.querySelector('.checkrow');check.classList.add('login-options');const remember=check.querySelector('#remember');remember.checked=loginRemember;remember.setAttribute('onchange','loginRemember=this.checked;updateLoginFeedback()');check.insertAdjacentHTML('beforeend','<button type="button" class="login-forgot" onclick="loginPasswordHelp()">Forgot password?</button>');check.insertAdjacentHTML('afterend','<small id="loginRememberHint" class="login-remember-hint"></small>');
 const button=host.querySelector('#loginEmailFields > .primary');button.id='loginSignIn';button.classList.add('modern-login-submit');button.innerHTML='<span>Sign In</span>'+loginSvg('arrow');button.disabled=true;
 return host.innerHTML;
};
function syncLoginProtection(){
 if(page!=='login')return;const badge=$('.login-protected'),email=$('#email'),password=$('#password');if(!badge||!email||!password)return;
 const ready=!!email.value.trim()&&email.checkValidity()&&!!password.value,state=ready?'ready':'idle';
 if(badge.dataset.state===state)return;
 const wasReady=badge.dataset.state==='ready';badge.dataset.state=state;badge.classList.toggle('is-active',ready);
 badge.title=ready?'Email format and password entry are ready. Sign in to authenticate.':'Enter a valid email address and your password to prepare sign-in.';
 badge.querySelector('.login-protected-feedback').textContent=ready?'Sign-in fields are ready.':wasReady?'Sign-in fields are incomplete.':'';
}
function watchLoginProtection(){
 if(loginProtectionTimer!==null)clearInterval(loginProtectionTimer);loginProtectionTimer=null;
 if(page!=='login')return;syncLoginProtection();
 // Password managers can fill fields without input/change events. Observe only
 // readiness in the current DOM; never retain or persist credential values.
 loginProtectionTimer=setInterval(()=>{if(page!=='login'){clearInterval(loginProtectionTimer);loginProtectionTimer=null;return;}if(document.hidden)return;const email=$('#email'),password=$('#password'),badge=$('.login-protected');if(!email||!password||!badge)return;const valid=!!email.value.trim()&&email.checkValidity(),ready=valid&&!!password.value;
  if(badge.dataset.state!==(ready?'ready':'idle')||email.closest('.login-field-control').classList.contains('valid')!==valid||[email,password].some(input=>input.closest('.login-field-control').classList.contains('has-value')!==(input.value.length>0)))updateLoginFeedback();
 },250);
}
function updateLoginFeedback(clearError=false){
 if(page!=='login')return;const email=$('#email'),password=$('#password');if(!email||!password)return;
 const emailValid=!!email.value.trim()&&email.checkValidity(),passwordValid=!!password.value;
 syncLoginProtection();
 for(const [id,valid,message] of [['email',emailValid,!email.value.trim()?'Enter your email address.':'Enter a valid email address.'],['password',passwordValid,'Enter your password.']]){
  const input=$('#'+id),touched=loginTouched.has(id),feedback=$(id==='email'?'#loginEmailFeedback':'#loginPasswordFeedback');input.setAttribute('aria-invalid',String(touched&&!valid));input.closest('.login-field-control').classList.toggle('invalid',touched&&!valid);input.closest('.login-field-control').classList.toggle('valid',id==='email'&&valid);input.closest('.login-field-control').classList.toggle('has-value',input.value.length>0);
  feedback.classList.toggle('is-error',touched&&!valid);feedback.classList.toggle('is-valid',id==='email'&&valid);feedback.textContent=id==='password'&&loginCapsLock?'Caps Lock is on.':touched&&!valid?message:id==='email'&&valid?'Email format looks valid.':'';
 }
 const hint=$('#loginRememberHint');if(hint)hint.textContent=loginRemember?'Stay signed in on this device.':'Stay signed in only in this tab.';
 if(clearError){$('#stagingLoginError')?.replaceChildren();$('#loginError')?.replaceChildren();}
 const button=$('#loginSignIn');if(button)button.disabled=stagingBusy||!emailValid||!passwordValid;
}
function loginFieldKey(event,id){if(id==='password'){loginCapsLock=event.getModifierState?.('CapsLock')===true;updateLoginFeedback();}if(event.key==='Enter'){event.preventDefault();signin();}}
function toggleLoginPassword(){const input=$('#password'),button=$('#loginPasswordToggle');if(!input||!button)return;const start=input.selectionStart,end=input.selectionEnd;loginPasswordVisible=!loginPasswordVisible;input.type=loginPasswordVisible?'text':'password';button.setAttribute('aria-label',loginPasswordVisible?'Hide password':'Show password');button.setAttribute('aria-pressed',String(loginPasswordVisible));input.focus({preventScroll:true});try{input.setSelectionRange(start,end)}catch{}}
function loginPasswordHelp(){const email=$('#email')?.value.trim()||'';supportDraft={email,topic:'Unable to log in',description:''};supportNotice='Need a password reset? Describe your access issue so your lender can help.';loginPasswordVisible=false;go('support');}
signin=()=>{
 if(stagingBusy)return;loginTouched.add('email');loginTouched.add('password');updateLoginFeedback(true);const email=$('#email')?.value.trim()||'',password=$('#password')?.value||'';
 if(!email||!$('#email').checkValidity()){$('#email')?.focus();return;}if(!password){$('#password')?.focus();return;}
 stagingBusy=true;const button=$('#loginSignIn');button.disabled=true;button.setAttribute('aria-busy','true');button.innerHTML='<span class="login-spinner" aria-hidden="true"></span><span>Signing in…</span>';stagingSend({type:'login',email,password,remember:$('#remember').checked});
};
const errorBeforeLoginFields=stagingLoginError;
stagingLoginError=message=>{errorBeforeLoginFields(message);const button=$('#loginSignIn');if(button){button.removeAttribute('aria-busy');button.innerHTML='<span>Sign In</span>'+loginSvg('arrow');updateLoginFeedback();}};
const renderBeforeLoginFields=render;
render=()=>{if(page==='login'&&!modernLoginWasActive){loginTouched.clear();loginCapsLock=false;loginPasswordVisible=false;}modernLoginWasActive=page==='login';renderBeforeLoginFields();watchLoginProtection();if(page==='login'){updateLoginFeedback();if(stagingBusy){const button=$('#loginSignIn');button.disabled=true;button.setAttribute('aria-busy','true');button.innerHTML='<span class="login-spinner" aria-hidden="true"></span><span>Signing in…</span>';}}};
render();
// Touch devices have no hover event, so start the companion's safe header stroll.
function startTouchLoginBuddy(){
 if(page!=='login'||document.hidden||document.body.inert||!matchMedia('(pointer: coarse)').matches||matchMedia('(prefers-reduced-motion: reduce)').matches||document.activeElement?.matches('input,textarea')||buddyRoamTimer)return;
 const button=buddyCompanionElement||$('.login-buddy'),screen=$('.phone-screen'),hero=$('.loginhero');if(!button||!screen||!hero)return;
 buddyRoamButton=button;buddyRoamScreen=screen;buddyCompanionElement=button;if(button.parentElement!==screen)screen.append(button);button.classList.remove('is-docked');button.classList.add('is-roaming');button.dataset.touchStroll='true';button.style.zIndex='20';
 const hop=()=>{if(page!=='login'||document.hidden||!button.isConnected){stopBuddyChase();return;}const scale=screen.getBoundingClientRect().width/Math.max(1,screen.clientWidth),heroBottom=(hero.querySelector('h1').getBoundingClientRect().top-screen.getBoundingClientRect().top)/scale;const maxX=Math.max(8,screen.clientWidth-button.offsetWidth-10),maxY=Math.max(24,Math.min(heroBottom-button.offsetHeight-8,screen.clientHeight-button.offsetHeight-116));button.style.left=(8+Math.random()*Math.max(0,maxX-8))+'px';button.style.top=(24+Math.random()*Math.max(0,maxY-24))+'px';};hop();buddyRoamTimer=setInterval(hop,1800);
}
const touchLoginRender=render;render=()=>{touchLoginRender();startTouchLoginBuddy()};
document.addEventListener('focusin',event=>{if(page==='login'&&matchMedia('(pointer: coarse)').matches&&event.target.matches('input,textarea'))stopBuddyChase()});
document.addEventListener('focusout',()=>{if(page==='login')setTimeout(startTouchLoginBuddy,0)});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopBuddyChase();else startTouchLoginBuddy()});
startTouchLoginBuddy();
window.addEventListener('message',event=>{const player=document.querySelector('.login-artwork-player');if(event.origin!==location.origin||event.source!==player?.contentWindow||event.data?.channel!=='loanledger-login-artwork')return;if(event.data.type==='ready')player.parentElement.classList.add('has-remotion');if(event.data.type==='failed')player.parentElement.classList.remove('has-remotion')});
