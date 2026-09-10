(() => {
  'use strict';

  // Session identity comes from the server. Credentials and tokens never enter web storage.
  const translations = {
    '游客模式':['訪客模式','Explore as guest'],'浏览公开项目，体验教学灵感。':['瀏覽公開專案，體驗教學靈感。','Browse public projects and explore teaching ideas.'],
    '复制账号信息':['複製帳戶資訊','Copy sign-in details'],'账号信息已复制。':['帳戶資訊已複製。','Sign-in details copied.'],'初始密码仅在此显示，离开账户管理后清除。':['初始密碼僅在此顯示，離開帳戶管理後清除。','Initial details are cleared when you leave account management.'],'收起账号信息':['收起帳戶資訊','Dismiss sign-in details'],'请手动复制用户名和初始密码。':['請手動複製使用者名稱和初始密碼。','Copy the username and initial password manually.'],
    '登录，凿开新知':['登入，鑿開新知','Sign in & reveal the jade'],'生成初始密码':['產生初始密碼','Generate password'],
    '已生成，可点眼睛查看并交给对方。':['已產生，可點眼睛查看並交給對方。','Generated. Use the eye button to view and share it.'],
    '显示名称可用中文；留空时使用用户名。':['顯示名稱可用中文；留空時使用使用者名稱。','Names can use any language; leave blank to use the username.'],
    '用户名以字母或数字开头，3–32 位；可含下划线和连字符。':['使用者名稱以字母或數字開頭，3–32 位；可含底線和連字號。','3–32 English letters, digits, underscores or hyphens; start with a letter or digit.'],
    '请填写用户名。':['請填寫使用者名稱。','Enter your username.'],'请填写密码。':['請填寫密碼。','Enter your password.'],
    '密码最长为 72 个 UTF-8 字节，中文字符通常占 3 字节。':['密碼最長為 72 個 UTF-8 位元組，中文字元通常佔 3 位元組。','Passwords can use up to 72 UTF-8 bytes; some characters use more than one byte.'],
    '登录':['登入','Sign in'],'账户':['帳戶','Account'],'账户管理':['帳戶管理','Manage accounts'],
    '返回项目库':['返回專案庫','Back to projects'],'欢迎回到他山':['歡迎回到他山','Welcome to Tashan'],
    '使用管理员为你创建的账户登录。':['使用管理員為你建立的帳戶登入。','Sign in with the account created by your administrator.'],
    '用户名':['使用者名稱','Username'],'密码':['密碼','Password'],'显示密码':['顯示密碼','Show password'],'隐藏密码':['隱藏密碼','Hide password'],
    '没有账户？请联系平台管理员。':['沒有帳戶？請聯絡平台管理員。','Need an account? Contact your platform administrator.'],
    '正在确认账户…':['正在確認帳戶…','Checking your session…'],'正在处理…':['正在處理…','Working…'],
    '账户服务暂不可用':['帳戶服務暫不可用','Account service unavailable'],
    '当前页面尚未连接账户服务，请联系平台管理员或稍后重试。':['目前頁面尚未連接帳戶服務，請聯絡平台管理員或稍後重試。','This page is not connected to the account service. Contact your administrator or try again later.'],
    '重试连接':['重試連接','Try again'],'打开工作台':['開啟工作台','Open workspace'],
    '我的账户':['我的帳戶','My account'],'成员':['成員','Member'],'管理员':['管理員','Administrator'],
    '本机账户服务':['本機帳戶服務','Local account service'],'在线账户服务':['線上帳戶服務','Online account service'],
    '草稿、收藏和任务按账户保存在此浏览器；项目版本可另行上传与发布。':['草稿、收藏和任務按帳戶儲存在此瀏覽器；專案版本可另行上傳與發布。','Drafts, bookmarks and tasks are stored for this account in this browser. Project versions can be uploaded and published separately.'],
    '访客本地工作台':['訪客本機工作台','Guest workspace'],
    '访客资料单独保存在此浏览器，不会自动转入登录账户。':['訪客資料獨立儲存在此瀏覽器，不會自動轉入登入帳戶。','Guest projects stay separate on this browser and are not automatically assigned to a signed-in account.'],
    '账户工作台':['帳戶工作台','Account workspace'],'退出登录':['登出','Sign out'],
    '修改密码':['修改密碼','Change password'],'请先设置你的新密码':['請先設定你的新密碼','Set your new password first'],
    '管理员重置密码后，需要设置新密码才能继续。':['管理員重設密碼後，需要設定新密碼才能繼續。','After an administrator resets your password, set a new password before continuing.'],
    '当前密码':['目前密碼','Current password'],'新密码':['新密碼','New password'],'再次输入新密码':['再次輸入新密碼','Confirm new password'],
    '12–72 个字符，至少包含字母和数字。':['12–72 個字元，至少包含字母和數字。','Use 12–72 characters, including letters and numbers.'],
    '保存新密码':['儲存新密碼','Save new password'],'密码已更新。':['密碼已更新。','Your password has been updated.'],
    '用户名需为 3–32 位英文字母、数字、下划线或连字符。':['使用者名稱需為 3–32 位英文字母、數字、底線或連字號。','Use a username of 3–32 letters, digits, underscores or hyphens.'],'显示名称需为 1–60 个字符。':['顯示名稱需為 1–60 個字元。','Display names must contain 1–60 characters.'],'新密码不能与当前密码相同。':['新密碼不能與目前密碼相同。','Your new password must differ from the current password.'],'请填写当前密码。':['請填寫目前密碼。','Enter your current password.'],'请检查用户名和密码。':['請檢查使用者名稱和密碼。','Check your username and password.'],
    '两次输入的新密码不一致。':['兩次輸入的新密碼不一致。','The new passwords do not match.'],
    '密码需为 12–72 个字符，并包含字母和数字。':['密碼需為 12–72 個字元，並包含字母和數字。','Passwords must have 12–72 characters, including letters and numbers.'],
    '登录已过期，请重新登录。':['登入已過期，請重新登入。','Your session expired. Please sign in again.'],
    '请先修改密码。':['請先修改密碼。','Please change your password first.'],
    '操作未完成，请稍后重试。':['操作未完成，請稍後重試。','The action could not be completed. Please try again.'],
    '正在保存工作台，请稍后再试。':['正在儲存工作台，請稍後再試。','Your workspace is being saved. Please try again shortly.'],
    '账户已停用，请联系管理员。':['帳戶已停用，請聯絡管理員。','This account is disabled. Contact your administrator.'],
    '你没有执行此操作的权限。':['你沒有執行此操作的權限。','You do not have permission to perform this action.'],
    '该用户名已被使用。':['此使用者名稱已被使用。','That username is already in use.'],
    '尝试次数过多，请稍后再试。':['嘗試次數過多，請稍後再試。','Too many attempts. Please try again later.'],
    '不能停用或降级最后一位管理员。':['不能停用或降級最後一位管理員。','The last active administrator cannot be disabled or demoted.'],
    '当前密码不正确。':['目前密碼不正確。','The current password is incorrect.'],
    '此页面仅供管理员使用。':['此頁面僅供管理員使用。','This page is for administrators only.'],
    '由管理员直接创建和维护账户。':['由管理員直接建立及維護帳戶。','Create and maintain accounts directly as an administrator.'],
    '用户账户':['使用者帳戶','User accounts'],'操作记录':['操作記錄','Audit log'],'搜索用户名或名称':['搜尋使用者名稱或名稱','Search username or name'],
    '搜索':['搜尋','Search'],'新建账户':['建立帳戶','Create account'],'编辑账户':['編輯帳戶','Edit account'],
    '显示名称':['顯示名稱','Display name'],'角色':['角色','Role'],'状态':['狀態','Status'],'操作':['操作','Actions'],
    '已启用':['已啟用','Active'],'已停用':['已停用','Disabled'],'编辑':['編輯','Edit'],'启用':['啟用','Enable'],'停用':['停用','Disable'],
    '初始密码':['初始密碼','Initial password'],'创建账户':['建立帳戶','Create account'],'保存修改':['儲存修改','Save changes'],
    '账户已创建。请通过可信渠道告知对方用户名和初始密码。':['帳戶已建立。請透過可信管道告知對方使用者名稱和初始密碼。','Account created. Share the username and initial password through a trusted channel.'],
    '账户已更新。':['帳戶已更新。','Account updated.'],'账户状态已更新。':['帳戶狀態已更新。','Account status updated.'],
    '重置密码':['重設密碼','Reset password'],'重置后，对方需要重新登录并修改密码。':['重設後，對方需要重新登入並修改密碼。','After a reset, the user must sign in again and change their password.'],
    '设置重置密码':['設定重設密碼','Set reset password'],'密码已重置。':['密碼已重設。','Password reset.'],
    '用户名创建后不可修改。':['使用者名稱建立後不可修改。','Usernames cannot be changed after creation.'],
    '新账户可直接登录，之后可在“我的账户”中修改密码。':['新帳戶可直接登入，之後可在「我的帳戶」中修改密碼。','New accounts can sign in directly and change their password later in My account.'],
    '按需修改，下次登录使用新密码。':['按需修改，下次登入使用新密碼。','Change it whenever you need; use your new password next time you sign in.'],
    '已取消首次改密要求':['已取消首次改密要求','Initial password change is now optional'],
    '取消编辑':['取消編輯','Cancel editing'],'上一页':['上一頁','Previous'],'下一页':['下一頁','Next'],
    '没有找到匹配的账户。':['沒有找到符合的帳戶。','No matching accounts found.'],'暂无操作记录。':['暫無操作記錄。','No audit events yet.'],
    '重新加载':['重新載入','Reload'],'时间':['時間','Time'],'执行人':['執行人','Actor'],'对象':['對象','Target'],
    '这是你当前登录的账户。':['這是你目前登入的帳戶。','This is your signed-in account.'],
    '账户列表读取失败。':['帳戶列表讀取失敗。','Could not load accounts.'],'记录读取失败。':['記錄讀取失敗。','Could not load the audit log.'],
    '账户已创建':['帳戶已建立','Account created'],'账户已修改':['帳戶已修改','Account updated'],'密码已修改':['密碼已修改','Password changed'],
    '管理员已初始化':['管理員已初始化','Administrator initialized'],'开始重置密码':['開始重設密碼','Password reset started'],'开始修改密码':['開始修改密碼','Password change started'],'密码操作未完成':['密碼操作未完成','Password operation incomplete'],'登录成功':['登入成功','Signed in'],'已退出':['已登出','Signed out'],'待修改密码':['待修改密碼','Password change required'],
    '确认停用账户':['確認停用帳戶','Disable this account'],'停用后，该用户的会话会失效。':['停用後，該使用者的工作階段會失效。','Disabling this account will revoke the user’s sessions.'],
    '导出旧版浏览器资料':['匯出舊版瀏覽器資料','Export previous browser projects'],'导出登录功能上线前的访客项目、草稿、收藏、任务与版本记录。':['匯出登入功能上線前的訪客專案、草稿、收藏、任務與版本記錄。','Exports guest projects, drafts, bookmarks, tasks and versions saved before accounts were added.'],'取消':['取消','Cancel'],'确认停用':['確認停用','Disable account']
  };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const language = () => document.documentElement.lang || 'zh-CN';
  const t = key => translations[key]?.[language() === 'en' ? 1 : language() === 'zh-Hant' ? 0 : -1] || key;
  const text = key => escape(t(key));
  const symbol = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${({user:'<circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',arrow:'<path d="M19 12H5m6-6-6 6 6 6"/>'})[name]}</svg>`;
  let pendingEntry=false;
  let createdCredentials=null;
  const state = {user:null,configured:false,mode:'unavailable',initialized:false,busy:false,checking:false,error:'',notice:'',username:'',adminTab:'users',users:[],total:0,page:1,pageSize:20,q:'',loaded:false,loading:false,adminError:'',selected:null,createDraft:{},events:[],auditLoaded:false,auditLoading:false};
  let hooks = {}, started = false, sessionVersion = 0, channel, lastCheck = 0;
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });

  function errorMessage(error) {
    const byCode = {UNAUTHENTICATED:'登录已过期，请重新登录。',INVALID_USERNAME:'用户名需为 3–32 位英文字母、数字、下划线或连字符。',INVALID_DISPLAY_NAME:'显示名称需为 1–60 个字符。',PASSWORD_UNCHANGED:'新密码不能与当前密码相同。',CURRENT_PASSWORD_REQUIRED:'请填写当前密码。',ACCOUNT_SERVICE_UNAVAILABLE:'账户服务暂不可用',INVALID_CURRENT_PASSWORD:'当前密码不正确。',LAST_ACTIVE_ADMIN:'不能停用或降级最后一位管理员。',INVALID_CREDENTIALS:'请检查用户名和密码。',AUTH_REQUIRED:'登录已过期，请重新登录。',UNAUTHORIZED:'登录已过期，请重新登录。',SESSION_EXPIRED:'登录已过期，请重新登录。',PASSWORD_CHANGE_REQUIRED:'请先修改密码。',ACCOUNT_DISABLED:'账户已停用，请联系管理员。',USER_DISABLED:'账户已停用，请联系管理员。',FORBIDDEN:'你没有执行此操作的权限。',USERNAME_EXISTS:'该用户名已被使用。',USERNAME_TAKEN:'该用户名已被使用。',RATE_LIMITED:'尝试次数过多，请稍后再试。',LAST_ADMIN:'不能停用或降级最后一位管理员。',INVALID_PASSWORD:'密码需为 12–72 个字符，并包含字母和数字。',WEAK_PASSWORD:'密码需为 12–72 个字符，并包含字母和数字。',CURRENT_PASSWORD_INVALID:'当前密码不正确。',INCORRECT_PASSWORD:'当前密码不正确。'};
    return t(byCode[error?.code] || error?.message || '操作未完成，请稍后重试。');
  }
  function redraw(focusError = false, preserveForms = false) {
    // A background list refresh must not erase text while an administrator types.
    // This short-lived snapshot stays in memory and is never persisted.
    const snapshots=preserveForms&&!state.busy?[...document.querySelectorAll('[data-account-form]')].map(form=>({kind:form.dataset.accountForm,id:form.dataset.userId||'',fields:[...form.elements].filter(field=>field.name&&field.type!=='submit').map(field=>({name:field.name,value:field.value,focused:field===document.activeElement,start:field.selectionStart,end:field.selectionEnd}))})):[];
    hooks.onRender?.();
    for(const snapshot of snapshots){const form=[...document.querySelectorAll('[data-account-form]')].find(node=>node.dataset.accountForm===snapshot.kind&&(node.dataset.userId||'')===snapshot.id);if(!form)continue;for(const saved of snapshot.fields){const field=form.elements[saved.name];if(!field)continue;field.value=saved.value;if(saved.focused){field.focus({preventScroll:true});if(typeof saved.start==='number'&&typeof field.setSelectionRange==='function')try{field.setSelectionRange(saved.start,saved.end);}catch{}}}}
    if (focusError) document.querySelector('.account-message[role="alert"]')?.focus({preventScroll:true});
  }
  async function rawRequest(path, {method='GET',body} = {}) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch('/api/v1' + path, {method,credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...(body === undefined ? {} : {'Content-Type':'application/json'})},...(body === undefined ? {} : {body:JSON.stringify(body)}),signal:controller.signal});
      let result;
      try { result = await response.json(); } catch { result = {}; }
      if (!response.ok) { const error = new Error(result.error?.message || '操作未完成，请稍后重试。'); error.code=result.error?.code;error.status=response.status;throw error; }
      return result;
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError) { const failure=new Error('账户服务暂不可用');failure.code='SERVICE_UNAVAILABLE';throw failure; }
      throw error;
    } finally { clearTimeout(timer); }
  }
  async function request(path, options) {
    try { return await rawRequest(path, options); }
    catch (error) {
      if (error.status === 401 && !path.startsWith('/auth/login') && error.code !== 'INCORRECT_PASSWORD') {
        await changeIdentity(null, {reason:'expired',forced:true});
        state.error=t('登录已过期，请重新登录。');location.hash='login';redraw();
      } else if (error.code === 'PASSWORD_CHANGE_REQUIRED' && state.user) {
        state.user={...state.user,mustChangePassword:true};location.hash='account';redraw();
      }
      throw error;
    }
  }
  async function changeIdentity(user, context) {
    createdCredentials=null;
    const oldId=state.user?.id || null, nextId=user?.id || null;
    // Clear administrative records before publishing any new identity.
    state.users=[];state.events=[];state.selected=null;state.createDraft={};state.loaded=false;state.auditLoaded=false;state.adminError='';
    state.user=user || null;
    if (oldId !== nextId || context.reason === 'initial') await hooks.onChange?.(state.user,context);
    if (state.user?.mustChangePassword) location.hash='account';
  }
  async function refreshSession({initial=false} = {}) {
    if (state.checking || (state.busy && !initial)) return;
    state.checking=true;lastCheck=Date.now();const version=++sessionVersion;
    try {
      const status=await rawRequest('/status');
      if(version!==sessionVersion)return;
      state.configured=status.configured===true;state.mode=status.mode || 'unavailable';
      let user=null;
      if (state.configured) {
        try { user=(await rawRequest('/auth/session')).user || null; }
        catch(error) { if(error.status!==401)throw error; }
      }
      if(version!==sessionVersion)return;
      if(initial || (user?.id || null)!==(state.user?.id || null)) {
        state.busy=true;
        await hooks.onBeforeChange?.({reason:initial?'initial':'external',forced:true});
        await changeIdentity(user,{reason:initial?'initial':'external',forced:true});
      } else state.user=user;
      if(user?.mustChangePassword)location.hash='account';else if(initial&&user&&(!location.hash||location.hash==='#login')){location.hash='discover';window.scrollTo({top:0,left:0,behavior:'instant'});}
    } catch(error) {
      if(initial) { state.configured=false;state.mode='unavailable';await changeIdentity(null,{reason:'initial',forced:true}); }
      else state.error=errorMessage(error);
    } finally {
      state.initialized=true;state.checking=false;state.busy=false;
      if(initial)resolveReady(state.user);
      redraw();
    }
  }
  async function enterPlatform() {
    redraw();
    try { await window.TashanEntrance?.playAfterLogin?.(); } finally { location.hash='discover';redraw();window.scrollTo({top:0,left:0,behavior:'instant'}); }
  }
  function notifyTabs() { try {channel?.postMessage('session-changed');} catch {} }
  function init(options={}) {
    hooks=options;
    if(started)return ready;
    started=true;
    window.addEventListener('pagehide',()=>{createdCredentials=null;document.querySelector('.account-created')?.remove();});
    if(typeof BroadcastChannel==='function') {channel=new BroadcastChannel('tashan-account-sync');channel.onmessage=event=>{if(event.data==='session-changed')refreshSession();};}
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&Date.now()-lastCheck>10000)refreshSession();});
    refreshSession({initial:true});
    return ready;
  }
  const passwordField=(name,label,{newPassword=false,confirm=false}={})=>`<label class="account-field"><span>${text(label)}</span><span class="account-password"><input name="${name}" id="account-${name}" type="password" autocomplete="${newPassword?'new-password':'current-password'}" required ${newPassword?'minlength="12" maxlength="72"':''} ${newPassword&&!confirm?'aria-describedby="account-password-help"':''}><button type="button" class="account-password-toggle" data-account-action="toggle-password" data-field="account-${name}" aria-label="${text('显示密码')}" aria-pressed="false">${symbol('eye')}</button></span></label>`;
  const passwordHelp=()=>`<p class="account-help" id="account-password-help">${text('12–72 个字符，至少包含字母和数字。')}</p>`;
  const translateMessage=value=>{const key=Object.keys(translations).find(key=>key===value||translations[key].includes(value));return t(key||value);};
  const messages=(includeError=true)=>`${state.error&&includeError?`<p class="account-message account-message--error" role="alert" tabindex="-1">${escape(translateMessage(state.error))}</p>`:''}${state.notice?`<p class="account-message" role="status">${escape(translateMessage(state.notice))}</p>`:''}`;
  const submitButton=label=>`<button type="submit" class="primary account-submit" ${state.busy?'disabled':''}>${text(state.busy?'正在处理…':label)}</button>`;
  const back=()=>`<a class="account-back" href="#discover">${symbol('arrow')}${text('返回项目库')}</a>`;
  function header() {
    const label=state.user ? (state.user.displayName || state.user.username) : t('登录');
    return `<a class="account-header" href="#${state.user?'account':'login'}" aria-label="${escape(state.user?t('账户')+' · '+label:t('登录'))}" title="${escape(label)}">${symbol('user')}<span>${escape(label)}</span></a>`;
  }
  function unavailable() {return `<section class="entry-account" data-entry-account><h2>${text('账户服务暂不可用')}</h2><p class="entry-account-lead">${text('当前页面尚未连接账户服务，请联系平台管理员或稍后重试。')}</p><button type="button" class="account-submit" data-account-action="retry" ${state.checking?'disabled':''}>${text(state.checking?'正在确认账户…':'重试连接')}</button><button class="entry-guest" type="button" data-account-action="guest">${text('游客模式')} <span aria-hidden="true">↗</span></button><p class="entry-guest-hint">${text('浏览公开项目，体验教学灵感。')}</p></section>`;}
  function login() {
    if(state.user)return account();
    return `<section class="entry-account" data-entry-account><h2>${text('欢迎回到他山')}</h2><p class="entry-account-lead">${text('使用管理员为你创建的账户登录。')}</p><form data-account-form="login" class="account-form" aria-busy="${state.busy}" novalidate>${messages()}<label class="account-field"><span>${text('用户名')}</span><input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required maxlength="32" value="${escape(state.username)}"></label>${passwordField('password','密码')}${submitButton('登录，凿开新知')}</form><button class="entry-guest" type="button" data-account-action="guest">${text('游客模式')} <span aria-hidden="true">↗</span></button><p class="entry-guest-hint">${text('浏览公开项目，体验教学灵感。')}</p><p class="entry-account-footnote">${text('没有账户？请联系平台管理员。')}</p></section>`;
  }
  function passwordForm() {return `<form data-account-form="password" class="account-form" novalidate aria-busy="${state.busy}">${messages()}${passwordField('currentPassword','当前密码')}${passwordField('newPassword','新密码',{newPassword:true})}${passwordHelp()}${passwordField('confirmPassword','再次输入新密码',{newPassword:true,confirm:true})}${submitButton('保存新密码')}</form>`;}
  function account() {
    if(!state.user)return login();
    const user=state.user,forced=user.mustChangePassword;
    if(forced)return `<section class="entry-account" data-entry-account><h2>${text('请先设置你的新密码')}</h2><p class="entry-account-lead">${text('管理员重置密码后，需要设置新密码才能继续。')}</p>${passwordForm()}<button class="entry-guest" type="button" data-account-action="logout">${text('退出登录')}</button></section>`;
    return `<section class="account-surface account-page">${back()}<div class="account-page-heading"><div><span class="account-eyebrow">TASHAN / ACCOUNT</span><h1>${text('我的账户')}</h1><p class="account-lead">${text('草稿、收藏和任务按账户保存在此浏览器；项目版本可另行上传与发布。')}</p></div><button class="subtle" data-account-action="logout" ${state.busy?'disabled':''}>${text('退出登录')}</button></div><div class="account-profile-grid"><aside class="account-card account-profile"><span class="account-emblem">${symbol(user.role==='admin'?'shield':'user')}</span><h2>${escape(user.displayName||user.username)}</h2><p class="account-username">@${escape(user.username)}</p><span class="account-pill">${text(user.role==='admin'?'管理员':'成员')}</span><p class="account-help">${text(state.mode==='local'?'本机账户服务':'在线账户服务')}</p>${!forced?`<div class="account-profile-links"><a href="#desk">${text('打开工作台')} <span aria-hidden="true">↗</span></a>${user.role==='admin'?`<a href="#admin">${text('账户管理')} <span aria-hidden="true">↗</span></a>`:''}</div>`:''}</aside><div class="account-card"><h2>${text('修改密码')}</h2><p class="account-help">${text('按需修改，下次登录使用新密码。')}</p>${passwordForm()}</div></div></section>`;
  }
  function workspaceNotice() {return `<div class="account-workspace-note"><span>${symbol('user')}</span><div><strong>${text(state.user?'账户工作台':'访客本地工作台')}${state.user?' · '+escape(state.user.displayName||state.user.username):''}</strong><p>${text(state.user?'草稿、收藏和任务按账户保存在此浏览器；项目版本可另行上传与发布。':'访客资料单独保存在此浏览器，不会自动转入登录账户。')}</p></div><a href="#${state.user?'account':'login'}">${text(state.user?'账户':'登录')} <span aria-hidden="true">↗</span></a></div>`;}
  function guestExportMarkup() {return state.user?`<button class="subtle" data-action="export-guest-backup">${text('导出旧版浏览器资料')}</button><small>${text('导出登录功能上线前的访客项目、草稿、收藏、任务与版本记录。')}</small>`:'';}
  function userFields(user) {return `<label class="account-field"><span>${text('显示名称')}</span><input name="displayName" maxlength="60" autocomplete="off" value="${escape(user?.displayName||'')}"></label><p class="account-help">${text('显示名称可用中文；留空时使用用户名。')}</p><label class="account-field"><span>${text('角色')}</span><select name="role" ${user?.id===state.user.id?'disabled':''}><option value="member" ${user?.role==='member'?'selected':''}>${text('成员')}</option><option value="admin" ${user?.role==='admin'?'selected':''}>${text('管理员')}</option></select></label>`;}
  function userEditor() {
    const user=state.selected, draft=user||state.createDraft;
    return `<aside class="account-card account-editor"><div class="account-editor-heading"><h2>${text(user?'编辑账户':'新建账户')}</h2>${user?`<button class="subtle" data-account-action="new-user">${text('取消编辑')}</button>`:''}</div><form data-account-form="${user?'edit-user':'create-user'}" class="account-form" novalidate aria-busy="${state.busy}" ${user?`data-user-id="${escape(user.id)}"`:''}><label class="account-field"><span>${text('用户名')}</span><input name="username" required ${user?'readonly':''} maxlength="32"  autocomplete="off" autocapitalize="none" spellcheck="false" value="${escape(draft?.username||'')}"></label><p class="account-help">${text(user?'用户名创建后不可修改。':'用户名以字母或数字开头，3–32 位；可含下划线和连字符。')}</p>${userFields(draft)}${!user?passwordField('password','初始密码',{newPassword:true})+passwordHelp()+`<button type="button" class="subtle account-generate" data-account-action="generate-password">${text('生成初始密码')} ↗</button>`+`<p class="account-help">${text('新账户可直接登录，之后可在“我的账户”中修改密码。')}</p>`:''}${state.error?`<p class="account-message account-message--error" role="alert" tabindex="-1">${escape(translateMessage(state.error))}</p>`:''}${submitButton(user?'保存修改':'创建账户')}</form>${user&&user.id!==state.user.id?`<details class="account-reset"><summary>${text('重置密码')}</summary><p class="account-help">${text('重置后，对方需要重新登录并修改密码。')}</p><form data-account-form="reset-password" data-user-id="${escape(user.id)}" class="account-form" novalidate>${passwordField('password','设置重置密码',{newPassword:true})}${passwordHelp()}${submitButton('重置密码')}</form></details>`:''}${user?.id===state.user.id?`<p class="account-help">${text('这是你当前登录的账户。')}</p>`:''}</aside>`;
  }
  function userList() {
    const count=language()==='en'?`${state.total} accounts · Page ${state.page}`:`${state.total} ${language()==='zh-Hant'?'個帳戶':'个账户'} · ${state.page}`;
    return `<section class="account-card account-list"><div class="account-list-heading"><h2>${text('用户账户')}</h2><span>${escape(count)}</span></div><form class="account-search" data-account-form="search-users"><label class="sr-only" for="account-search">${text('搜索用户名或名称')}</label><input id="account-search" name="query" type="search" maxlength="60" value="${escape(state.q)}" placeholder="${text('搜索用户名或名称')}"><button type="submit">${text('搜索')}</button></form>${state.loading?`<p class="account-empty" role="status">${text('正在处理…')}</p>`:state.users.length?`<div class="account-table-scroll"><table class="account-table"><thead><tr><th>${text('用户账户')}</th><th>${text('角色')}</th><th>${text('状态')}</th><th>${text('操作')}</th></tr></thead><tbody>${state.users.map(user=>`<tr ${state.selected?.id===user.id?'class="is-selected"':''}><td><strong>${escape(user.displayName||user.username)}</strong><small>@${escape(user.username)}</small>${user.mustChangePassword?`<small>${text('待修改密码')}</small>`:''}</td><td>${text(user.role==='admin'?'管理员':'成员')}</td><td><span class="account-pill ${user.status==='disabled'?'is-disabled':''}">${text(user.status==='disabled'?'已停用':'已启用')}</span></td><td><div class="account-row-actions"><button class="subtle" data-account-action="edit-user" data-user-id="${escape(user.id)}">${text('编辑')}</button>${user.id!==state.user.id?`<button class="subtle" data-account-action="toggle-user" data-user-id="${escape(user.id)}" ${state.busy?'disabled':''}>${text(user.status==='disabled'?'启用':'停用')}</button>`:''}</div></td></tr>`).join('')}</tbody></table></div>`:`<p class="account-empty">${text('没有找到匹配的账户。')}</p>`}<div class="account-pagination"><button data-account-action="previous-page" ${state.page<=1||state.loading?'disabled':''}>${text('上一页')}</button><button data-account-action="next-page" ${state.page*state.pageSize>=state.total||state.loading?'disabled':''}>${text('下一页')}</button></div></section>`;
  }
  const actionName=action=>({ 'initial_password_requirement_removed':'已取消首次改密要求','account.initial_password_requirement_removed':'已取消首次改密要求','system.initial_password_optional':'已取消首次改密要求', 'account.created':'账户已创建','account.updated':'账户已修改','account.password_reset':'密码已重置','auth.password_changed':'密码已修改','user.created':'账户已创建','user.create':'账户已创建','user.updated':'账户已修改','user.update':'账户已修改','user.password_reset':'密码已重置','password.reset':'密码已重置','auth.password_change':'密码已修改','auth.login':'登录成功','auth.logout':'已退出','account_created':'账户已创建','account_updated':'账户已修改','password_reset':'密码已重置','password_changed':'密码已修改','admin_bootstrapped':'管理员已初始化','account.bootstrap':'管理员已初始化','password_reset_started':'开始重置密码','password_change_started':'开始修改密码','password_operation_failed':'密码操作未完成'})[action]||action||'—';
  function auditList() {return `<section class="account-card"><div class="account-list-heading"><h2>${text('操作记录')}</h2><button class="subtle" data-account-action="reload-audit">${text('重新加载')}</button></div>${state.auditLoading?`<p class="account-empty" role="status">${text('正在处理…')}</p>`:state.events.length?`<div class="account-table-scroll"><table class="account-table"><thead><tr><th>${text('时间')}</th><th>${text('执行人')}</th><th>${text('操作')}</th><th>${text('对象')}</th></tr></thead><tbody>${state.events.map(event=>`<tr><td>${escape(formatDate(event.createdAt||event.created_at))}</td><td>${escape(event.actorUsername||event.actor?.username||event.actorId||'—')}</td><td>${text(actionName(event.action))}</td><td>${escape(event.targetUsername||event.target?.username||event.targetId||'—')}</td></tr>`).join('')}</tbody></table></div>`:`<p class="account-empty">${text('暂无操作记录。')}</p>`}</section>`;}
  function formatDate(value) {const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat(language(),{dateStyle:'medium',timeStyle:'short'}).format(date):'—';}
  function admin() {
    if(!state.user)return login();
    if(state.user.mustChangePassword)return account();
    if(state.user.role!=='admin')return `<section class="account-surface account-narrow">${back()}<div class="account-card"><h1>${text('账户管理')}</h1><p>${text('此页面仅供管理员使用。')}</p><a class="btn" href="#account">${text('我的账户')}</a></div></section>`;
    return `<section class="account-surface account-admin">${back()}<div class="account-page-heading"><div><span class="account-eyebrow">TASHAN / ADMINISTRATION</span><h1>${text('账户管理')}</h1><p class="account-lead">${text('由管理员直接创建和维护账户。')}</p></div><button class="primary" data-account-action="new-user">${text('新建账户')} <span aria-hidden="true">+</span></button></div><div class="account-tabs" role="group" aria-label="${text('账户管理')}"><button data-account-action="users-tab" aria-pressed="${state.adminTab==='users'}">${text('用户账户')}</button><button data-account-action="audit-tab" aria-pressed="${state.adminTab==='audit'}">${text('操作记录')}</button></div>${messages(state.adminTab!=='users')}${state.adminError?`<p class="account-message account-message--error" role="alert" tabindex="-1">${escape(translateMessage(state.adminError))}</p>`:''}${createdAccountNotice()}${state.adminTab==='users'?`<div class="account-admin-grid">${userList()}${userEditor()}</div>`:auditList()}</section>`;
  }
  function createdAccountNotice(){
    if(!createdCredentials)return '';
    return `<aside class="account-created" aria-label="${text('账户已创建')}"><div><strong>${text('账户已创建')} · @${escape(createdCredentials.username)}</strong><p class="account-help">${text('初始密码仅在此显示，离开账户管理后清除。')}</p></div><label class="account-field"><span>${text('初始密码')}</span><span class="account-password"><input id="account-created-password" type="password" readonly autocomplete="off" value="${escape(createdCredentials.password)}"><button type="button" class="account-password-toggle" data-account-action="toggle-password" data-field="account-created-password" aria-label="${text('显示密码')}" aria-pressed="false">${symbol('eye')}</button></span></label><div class="account-actions"><button type="button" data-account-action="copy-created">${text('复制账号信息')}</button><button type="button" class="subtle" data-account-action="dismiss-created">${text('收起账号信息')}</button></div></aside>`;
  }
  function render(view) {
    if(!state.initialized || state.checking&&!state.initialized)return `<section class="entry-account" data-entry-account><p role="status">${text('正在确认账户…')}</p></section>`;
    if(!state.configured)return unavailable();
    return view==='admin'?admin():view==='account'?account():login();
  }
  async function loadUsers() {
    if(state.loading||state.user?.role!=='admin'||state.user.mustChangePassword)return;
    state.loading=true;state.adminError='';const id=state.user.id;
    redraw(false,true);
    try {const result=await request('/admin/users?query='+encodeURIComponent(state.q)+'&page='+state.page);if(state.user?.id!==id)return;state.users=result.users||[];state.total=result.total||0;state.page=result.page||state.page;state.pageSize=result.pageSize||20;state.loaded=true;}
    catch(error){state.adminError=errorMessage(error);}finally{state.loading=false;state.loaded=true;redraw(false,true);}
  }
  async function loadAudit() {
    if(state.auditLoading||state.user?.role!=='admin'||state.user.mustChangePassword)return;
    state.auditLoading=true;state.adminError='';const id=state.user.id;redraw();
    try{const result=await request('/admin/audit');if(state.user?.id!==id)return;state.events=result.events||[];state.auditLoaded=true;}catch(error){state.adminError=errorMessage(error);}finally{state.auditLoading=false;state.auditLoaded=true;redraw(false,true);}
  }
  function validatePassword(password) {if(password.length<12||password.length>72||!/[A-Za-z]/.test(password)||!/[0-9]/.test(password))throw new Error('密码需为 12–72 个字符，并包含字母和数字。');if(new TextEncoder().encode(password).length>72)throw new Error('密码最长为 72 个 UTF-8 字节，中文字符通常占 3 字节。');}
  async function transaction(work,{identity=false}={}) {
    if(state.busy)return;
    state.busy=true;state.error='';state.notice='';
    try {if(identity)await hooks.onBeforeChange?.({reason:'manual',forced:false});await work();}
    catch(error){state.error=errorMessage(error);}
    finally{state.busy=false;redraw(Boolean(state.error),Boolean(state.error));}
  }
  async function submit(event) {
    const form=event.target.closest('[data-account-form]');if(!form)return;
    event.preventDefault();event.stopImmediatePropagation();if(state.busy)return;
    const fields=new FormData(form),kind=form.dataset.accountForm;
    if(kind==='search-users'){state.q=String(fields.get('query')||'').trim();state.page=1;await loadUsers();return;}
    // Validate explicitly: native popovers can hide why creation was blocked.
    form.querySelector('[data-form-feedback]')?.remove();
    form.querySelectorAll('[aria-invalid]').forEach(input=>input.removeAttribute('aria-invalid'));
    let invalid;
    try {
      if(kind==='login'){
        invalid=form.elements.username;if(!String(fields.get('username')||'').trim())throw new Error('请填写用户名。');
        invalid=form.elements.password;if(!fields.get('password'))throw new Error('请填写密码。');
      }
      if(kind==='create-user'){
        invalid=form.elements.username;if(!/^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/.test(String(fields.get('username')||'').trim()))throw new Error('用户名需为 3–32 位英文字母、数字、下划线或连字符。');
      }
      if(kind==='create-user'||kind==='reset-password'){invalid=form.elements.password;validatePassword(String(fields.get('password')||''));}
      if(kind==='password'){
        invalid=form.elements.currentPassword;if(!fields.get('currentPassword'))throw new Error('请填写当前密码。');
        invalid=form.elements.newPassword;validatePassword(String(fields.get('newPassword')||''));
        invalid=form.elements.confirmPassword;if(fields.get('newPassword')!==fields.get('confirmPassword'))throw new Error('两次输入的新密码不一致。');
      }
    } catch(error) {
      const feedback=document.createElement('p');feedback.className='account-message account-message--error';feedback.dataset.formFeedback='true';feedback.setAttribute('role','alert');feedback.textContent=errorMessage(error);
      form.querySelector('[type="submit"]').before(feedback);invalid?.setAttribute('aria-invalid','true');invalid?.focus();return;
    }
    const username=String(fields.get('username')||'').trim();
    if(kind==='create-user')state.createDraft={username,displayName:String(fields.get('displayName')||''),role:fields.get('role')||'member'};
    await transaction(async()=>{
      const button=form.querySelector('[type="submit"]');if(button){button.disabled=true;button.textContent=t('正在处理…');}form.setAttribute('aria-busy','true');
      if(kind==='login'){
        state.username=username;
        const result=await rawRequest('/auth/login',{method:'POST',body:{username,password:String(fields.get('password')||'')}});
        if(!result.user?.id)throw new Error('操作未完成，请稍后重试。');
        await changeIdentity(result.user,{reason:'login',forced:false});notifyTabs();pendingEntry=Boolean(result.user.mustChangePassword);if(result.user.mustChangePassword)location.hash='account';else await enterPlatform();
      }else if(kind==='password'){
        const newPassword=String(fields.get('newPassword')||'');validatePassword(newPassword);if(newPassword!==String(fields.get('confirmPassword')||''))throw new Error('两次输入的新密码不一致。');
        await request('/auth/password',{method:'POST',body:{currentPassword:String(fields.get('currentPassword')||''),newPassword}});
        const result=await rawRequest('/auth/session');if(!result.user?.id)throw new Error('登录已过期，请重新登录。');const wasForced=state.user?.mustChangePassword;state.user=result.user;state.notice=t('密码已更新。');notifyTabs();if(wasForced||pendingEntry){pendingEntry=false;await enterPlatform();}
      }else if(kind==='create-user'){
        const password=String(fields.get('password')||'');validatePassword(password);
        const created=await request('/admin/users',{method:'POST',body:{username,displayName:String(fields.get('displayName')||'').trim()||username,password,role:fields.get('role')==='admin'?'admin':'member'}});
        createdCredentials={username:created.user?.username||username,password};
        state.q='';state.page=1;state.selected=created.user||null;
        state.notice=t('账户已创建。请通过可信渠道告知对方用户名和初始密码。');state.createDraft={};await loadUsers();state.auditLoaded=false;
      }else if(kind==='edit-user'){
        const body={displayName:String(fields.get('displayName')||'').trim()||username};if(form.dataset.userId!==state.user.id)body.role=fields.get('role')==='admin'?'admin':'member';
        const result=await request('/admin/users/'+encodeURIComponent(form.dataset.userId),{method:'PATCH',body});
        if(form.dataset.userId===state.user.id)state.user=result.user||{...state.user,displayName:body.displayName};
        state.notice=t('账户已更新。');state.selected=null;await loadUsers();state.auditLoaded=false;
      }else if(kind==='reset-password'){
        const password=String(fields.get('password')||'');validatePassword(password);
        await request('/admin/users/'+encodeURIComponent(form.dataset.userId)+'/password',{method:'POST',body:{newPassword:password}});
        state.notice=t('密码已重置。');await loadUsers();state.auditLoaded=false;
      }
      // Explicitly release submitted passwords from both the detached form and FormData.
      for(const name of ['password','currentPassword','newPassword','confirmPassword']){fields.delete(name);if(form.elements[name])form.elements[name].value='';}
    },{identity:kind==='login'});
  }
  function confirmDisable(user) {
    return new Promise(resolve=>{
      const dialog=document.createElement('dialog');dialog.className='confirm-dialog account-confirm';dialog.setAttribute('aria-labelledby','account-confirm-title');
      dialog.innerHTML=`<h2 id="account-confirm-title">${text('确认停用账户')}</h2><p><strong>${escape(user.displayName||user.username)}</strong> · @${escape(user.username)}</p><p>${text('停用后，该用户的会话会失效。')}</p><form method="dialog"><button value="cancel">${text('取消')}</button><button class="primary" value="confirm">${text('确认停用')}</button></form>`;
      document.body.append(dialog);dialog.addEventListener('close',()=>{resolve(dialog.returnValue==='confirm');dialog.remove();},{once:true});dialog.showModal();
    });
  }
  async function click(event) {
    const button=event.target.closest('[data-account-action]');if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();const action=button.dataset.accountAction;
    if(action==='toggle-password'){const input=document.getElementById(button.dataset.field);if(!input)return;const show=input.type==='password';input.type=show?'text':'password';button.setAttribute('aria-pressed',String(show));button.setAttribute('aria-label',t(show?'隐藏密码':'显示密码'));return;}
    if(state.busy)return;
    if(action==='guest'&&!state.user){state.error='';state.notice='';window.TashanEntrance?.dismissAuth();window.dispatchEvent(new CustomEvent('tashan:guest-entry'));return;}
    if(action==='generate-password'&&state.user?.role==='admin'){
      const form=button.closest('form'),input=form.elements.password;
      const bytes=crypto.getRandomValues(new Uint8Array(16)),alphabet='ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
      input.value='T7'+Array.from(bytes,value=>alphabet[value%alphabet.length]).join('');
      button.textContent=t('已生成，可点眼睛查看并交给对方。');return;
    }
    if(action==='retry'){await refreshSession({initial:!state.configured});return;}
    if(action==='logout'){await transaction(async()=>{await rawRequest('/auth/logout',{method:'POST',body:{}});await changeIdentity(null,{reason:'logout',forced:false});notifyTabs();location.hash='discover';},{identity:true});return;}
    if(state.user?.role!=='admin'||state.user.mustChangePassword)return;
    if(action==='copy-created'&&createdCredentials){try{await navigator.clipboard.writeText(`${t('用户名')}: ${createdCredentials.username}\n${t('初始密码')}: ${createdCredentials.password}`);button.textContent=t('账号信息已复制。');}catch{button.textContent=t('请手动复制用户名和初始密码。');}return;}
    if(action==='dismiss-created'){createdCredentials=null;redraw(false,true);return;}
    if(action==='new-user'){state.selected=null;state.adminTab='users';state.error='';state.notice='';redraw();document.querySelector('.account-editor input')?.focus();return;}
    if(action==='edit-user'){state.selected=state.users.find(user=>user.id===button.dataset.userId)||null;state.error='';state.notice='';redraw();document.querySelector('.account-editor input[name="displayName"]')?.focus();return;}
    if(action==='users-tab'){state.adminTab='users';redraw();if(!state.loaded)loadUsers();return;}
    if(action==='audit-tab'){state.adminTab='audit';redraw();if(!state.auditLoaded)loadAudit();return;}
    if(action==='reload-audit'){loadAudit();return;}
    if(action==='previous-page'||action==='next-page'){state.page=Math.max(1,state.page+(action==='previous-page'?-1:1));loadUsers();return;}
    if(action==='toggle-user'){
      const user=state.users.find(item=>item.id===button.dataset.userId);if(!user)return;
      if(user.status!=='disabled'&&!await confirmDisable(user))return;
      await transaction(async()=>{await request('/admin/users/'+encodeURIComponent(user.id),{method:'PATCH',body:{status:user.status==='disabled'?'active':'disabled'}});state.notice=t('账户状态已更新。');await loadUsers();state.auditLoaded=false;});
    }
  }
  const bound=new WeakSet();
  function bind(root) {
    if(location.hash.split('/')[0]!=='#admin')createdCredentials=null;
    const entry=root.querySelector('[data-entry-account]');
    if(entry){window.TashanEntrance?.mountAuth(entry);if(!bound.has(entry)){entry.addEventListener('submit',submit,true);entry.addEventListener('click',click,true);bound.add(entry);}}
    else if(!state.busy)window.TashanEntrance?.dismissAuth();
    if(!bound.has(root)){root.addEventListener('submit',submit,true);root.addEventListener('click',click,true);bound.add(root);}
    if(location.hash.split('/')[0]==='#admin'&&state.user?.role==='admin'&&!state.user.mustChangePassword){if(state.adminTab==='users'&&!state.loaded&&!state.loading)queueMicrotask(loadUsers);if(state.adminTab==='audit'&&!state.auditLoaded&&!state.auditLoading)queueMicrotask(loadAudit);}
  }
  window.TashanAccounts={init,ready,request,header,render,bind,workspaceNotice,guestExportMarkup,refreshSession,get user(){return state.user;},get mode(){return state.mode;},get configured(){return state.configured;},get initialized(){return state.initialized;},get busy(){return state.busy;}};
})();
