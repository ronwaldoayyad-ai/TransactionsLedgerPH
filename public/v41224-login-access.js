// Authentication feedback consumes server counters; browser state is presentation only.
let loginAccessLock=null,loginAccessEmail='',loginAccessStatusBusy=false,loginAccessDialog=null,loginAutoCode='';
function loginAccessBlocked(){return !!loginAccessLock?.locked;}
function syncLoginAccessControls(){
 if(page!=='login')return;
 const blocked=loginAccessBlocked();
 if(blocked){$('#loginSignIn')?.setAttribute('disabled','');$('#loginCodeContinue')?.setAttribute('disabled','');}
 for(const id of ['email','password','loginPasswordToggle']){const control=$('#'+id);if(control)control.disabled=blocked;}
 document.querySelectorAll('.modern-login-field .login-field-control').forEach(control=>control.classList.toggle('is-access-locked',blocked));
 const code=$('#loginToken');if(code)code.disabled=blocked||loginCodeSubmitting;
 document.querySelectorAll('.login-code-cell').forEach(cell=>{cell.classList.toggle('is-access-locked',blocked);if(blocked)cell.classList.remove('is-current','is-entering');});
 document.querySelectorAll('.login-code-key').forEach(button=>{button.disabled=blocked||loginCodeSubmitting;});
 let notice=$('#loginAccessNotice');
 const tabs=$('.login-methods'),host=tabs?.parentElement||$('#loginEmailFields')?.parentElement;
 if(!notice&&host){notice=document.createElement('div');notice.id='loginAccessNotice';notice.className='login-access-notice';host.append(notice);}
 // Keep feedback outside the two-column tab grid so it spans both methods.
 if(notice&&tabs&&tabs.nextElementSibling!==notice)tabs.after(notice);
 if(notice){notice.hidden=!blocked;notice.innerHTML=blocked?'<span>Sign-in is locked. Your lender must unlock access.</span><button type="button" onclick="checkLoginAccess(true)">Check access</button>':'';}
}
function queueLoginCodeSubmit(){
 const value=$('#loginToken')?.value||'';
 if(value.length<6){loginAutoCode='';return;}
 if(!/^\d{6}$/.test(value)||loginCodeSubmitting||stagingBusy||loginAccessBlocked()||loginAutoCode===value)return;
 loginAutoCode=value;
 requestAnimationFrame(()=>{if(page==='login'&&loginMode==='token'&&$('#loginToken')?.value===value&&!loginAccessBlocked())signinWithToken();});
}
function closeLoginAccessDialog(retry=false){
 const dialog=loginAccessDialog;if(!dialog)return;dialog.close();dialog.remove();loginAccessDialog=null;
 if(retry&&!loginAccessBlocked()){
  if(loginMode==='token'){$('#loginToken').value='';loginAutoCode='';syncLoginCode();$('#loginToken')?.focus({preventScroll:true});}
  else{$('#password')?.focus({preventScroll:true});$('#password')?.select();}
 }
 syncLoginAccessControls();
}
function loginAccessSupport(){closeLoginAccessDialog();go('support');}
function showLoginAccessError(detail={},method=loginMode==='token'?'code':'password'){
 if(page!=='login')return;
 const state=detail.login,locked=!!state?.locked,remaining=Number.isInteger(state?.remaining)?Math.max(0,Math.min(5,state.remaining)):null;
 if(locked){loginAccessLock=state;loginAccessEmail=$('#email')?.value.trim().toLowerCase()||'';}
 closeLoginAccessDialog();stagingBusy=false;loginCodeSubmitting=false;
 updateLoginFeedback(true);syncLoginCode();syncLoginAccessControls();
 const dialog=document.createElement('dialog');loginAccessDialog=dialog;dialog.className='login-access-dialog';dialog.setAttribute('aria-labelledby','loginAccessTitle');dialog.setAttribute('aria-describedby','loginAccessDescription');
 const invalid=remaining!==null;
 const title=locked?'Sign-in Locked':!invalid?'Unable to Sign In':method==='code'?'Invalid Login Code':'Invalid Email or Password';
 const message=locked?'You have reached the maximum of 5 failed attempts.':!invalid?(detail.message||'We could not complete sign-in. Please retry.'):method==='code'?'This Login Code is not valid. Check it with your lender.':'The email or password you entered is incorrect.';
 const description=locked?(state.scope==='device'?'Sign-in on this device is disabled. Contact your lender and share the unlock reference below.':'Both sign-in methods for this account are disabled. Contact your lender or administrator to unlock access.'):!invalid?'Connection or service errors do not use a sign-in attempt.':method==='code'?'Verify all six digits. Login Codes stay valid until your lender replaces or revokes them.':'Please double-check your credentials and try again. Make sure Caps Lock is off.';
 dialog.innerHTML='<button type="button" class="login-access-close" aria-label="Close" onclick="closeLoginAccessDialog()">×</button><div class="login-access-symbol" aria-hidden="true">'+(locked?'<svg viewBox="0 0 24 24"><rect x="6" y="10" width="12" height="11" rx="2"/><path d="M9 10V6a3 3 0 0 1 6 0v4m-3 5v2"/></svg>':'<svg viewBox="0 0 24 24"><path d="m10.2 4-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.8-3l-8-14a2 2 0 0 0-3.6 0Z"/><path d="M12 9v4m0 4h.01"/></svg>')+'</div><h2 id="loginAccessTitle">'+htmlSafe(title)+'</h2><p class="login-access-message">'+htmlSafe(message)+'</p><p id="loginAccessDescription">'+htmlSafe(description)+'</p>'+
 (remaining!==null?'<section class="login-access-attempts"><div><span>'+(locked?'Access locked':'Attempts remaining')+'</span><strong>'+remaining+' of 5 remaining</strong></div><div class="login-access-meter" aria-hidden="true">'+Array.from({length:5},(_,i)=>'<span class="'+(i<5-remaining?'is-used':'')+'"></span>').join('')+'</div><p>'+(locked?'Your lender must unlock access. It will not reset automatically.':state.scope==='device'?'Incorrect Login Codes count on this device.':'Five consecutive failed attempts lock this account.')+'</p></section>':'')+
 (locked&&state.reference?'<p class="login-access-reference">Unlock reference<br><strong data-no-translate>'+htmlSafe(state.reference)+'</strong></p>':'')+
 '<button type="button" class="primary" onclick="'+(locked?'loginAccessSupport()':'closeLoginAccessDialog(true)')+'">'+(locked?'Contact Lender Support':'Try Again ↻')+'</button><button type="button" class="login-access-secondary" onclick="'+(locked?'checkLoginAccess(true)':'loginAccessSupport()')+'">'+(locked?'Check access':'Contact Lender Support')+'</button>'+
 (locked&&state.scope!=='device'?'<button type="button" class="login-access-other" onclick="useAnotherLoginAccount()">Use another account</button>':'');
 document.body.append(dialog);dialog.addEventListener('cancel',event=>{event.preventDefault();closeLoginAccessDialog();});dialog.addEventListener('click',event=>{if(event.target===dialog)closeLoginAccessDialog();});dialog.showModal();dialog.querySelector('.primary').focus({preventScroll:true});applyBorrowerLanguage();
}
async function checkLoginAccess(showFeedback=false){
 if(loginAccessStatusBusy)return;loginAccessStatusBusy=true;
 try{
  const result=await mobileCall('login-status',{email:loginAccessEmail,reference:loginAccessLock?.reference});
  loginAccessLock=result.login?.locked?result.login:null;
  if(showFeedback){if(loginAccessLock)showLoginAccessError({login:loginAccessLock});else{closeLoginAccessDialog(true);toast('Sign-in is available. You can try again.');}}
 }catch(error){if(showFeedback)showLoginAccessError({message:error.message});}
 finally{loginAccessStatusBusy=false;updateLoginFeedback();syncLoginCode();syncLoginAccessControls();}
}
function useAnotherLoginAccount(){if(loginAccessLock?.scope==='device')return;loginAccessLock=null;loginAccessEmail='';closeLoginAccessDialog();$('#email').value='';$('#password').value='';$('#loginToken').value='';loginAutoCode='';setLoginMode('email');updateLoginFeedback();syncLoginAccessControls();$('#email')?.focus();}
const accessBeforeSignin=signin;
signin=()=>{if(loginAccessBlocked()){showLoginAccessError({login:loginAccessLock},'password');return;}accessBeforeSignin();};
const accessBeforeFeedback=updateLoginFeedback;
updateLoginFeedback=(...args)=>{accessBeforeFeedback(...args);syncLoginAccessControls();};
const accessBeforeSyncCode=syncLoginCode;
syncLoginCode=(...args)=>{accessBeforeSyncCode(...args);syncLoginAccessControls();};
const accessBeforeInputCode=updateLoginCodeEntry;
updateLoginCodeEntry=event=>{accessBeforeInputCode(event);queueLoginCodeSubmit();};
const accessBeforePressCode=pressLoginCodeKey;
pressLoginCodeKey=(...args)=>{accessBeforePressCode(...args);queueLoginCodeSubmit();};
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==parent||event.data?.channel!=='loanledger-v41224')return;
 const message=event.data;
 if(message.type==='error'&&message.authFailure)showLoginAccessError({message:message.message,login:message.login},'password');
 if(message.type==='session'&&message.state==='signed-out')syncLoginAccessControls();
});
if(page==='login')checkLoginAccess();
