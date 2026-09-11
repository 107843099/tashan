(() => {
  'use strict';

  // Session identity comes from the server. Credentials and tokens never enter web storage.
  const translations = {
    '返回工作台':['返回工作台','Back to workspace'],'取消修改':['取消修改','Cancel change'],
    '查看个人信息，按需管理登录密码。':['查看個人資訊，按需管理登入密碼。','View your profile and manage your sign-in password when needed.'],
    '身份与登录，清楚地安排在这里。':['身分與登入，清楚地安排在這裡。','Your identity and sign-in settings, in one place.'],
    '所属类型':['所屬類型','Affiliation'],'个人':['個人','Personal'],'学校':['學校','School'],'机构':['機構','Organization'],
    '学校名称':['學校名稱','School name'],'机构名称':['機構名稱','Organization name'],
    '个人无需填写学校或机构名称。':['個人無需填寫學校或機構名稱。','Personal accounts do not need a school or organization name.'],
    '名称最多 100 个字符。':['名稱最多 100 個字元。','Use up to 100 characters.'],
    '请选择个人、学校或机构。':['請選擇個人、學校或機構。','Choose Personal, School or Organization.'],
    '请填写学校名称。':['請填寫學校名稱。','Enter the school name.'],'请填写机构名称。':['請填寫機構名稱。','Enter the organization name.'],
    '学校或机构名称需为 1–100 个字符。':['學校或機構名稱需為 1–100 個字元。','Use 1–100 characters for the school or organization name.'],
    '个人资料':['個人資料','Profile'],'账户安全':['帳戶安全','Account security'],'登录会话':['登入工作階段','Signed-in session'],
    '基本资料':['基本資料','Basic details'],'账户权限':['帳戶權限','Account permissions'],'账户访问':['帳戶存取','Account access'],
    '创建时间':['建立時間','Created'],'你':['你','You'],'当前登录':['目前登入','Signed in'],
    '需要修改名称？请联系管理员。':['需要修改名稱？請聯絡管理員。','Contact an administrator to update your display name.'],
    '退出不会删除已保存的项目与草稿。':['登出不會刪除已儲存的專案與草稿。','Signing out keeps your saved projects and drafts.'],
    '从列表选择账户，或创建一个新账户。':['從列表選擇帳戶，或建立新帳戶。','Choose an account from the list, or create a new one.'],
    '选择账户':['選擇帳戶','Select an account'],'管理人员与登录权限。':['管理人員與登入權限。','Manage people and their access.'],
    '成员可使用自己的工作台；管理员还可管理账户。':['成員可使用自己的工作台；管理員還可管理帳戶。','Members use their own workspace. Administrators can also manage accounts.'],
    '本页筛选':['本頁篩選','Filter this page'],'全部角色':['全部角色','All roles'],'全部状态':['全部狀態','All statuses'],
    '清除筛选':['清除篩選','Clear filters'],'本页显示':['本頁顯示','Shown on this page'],'个账户':['個帳戶','accounts'],
    '没有符合本页筛选的账户。':['沒有符合本頁篩選的帳戶。','No accounts on this page match these filters.'],
    '调整关键词，或清除筛选后重试。':['調整關鍵詞，或清除篩選後重試。','Try another search or clear the filters.'],
    '正在读取账户…':['正在讀取帳戶…','Loading accounts…'],'搜索所有账户':['搜尋所有帳戶','Search all accounts'],
    '再次输入密码':['再次輸入密碼','Confirm password'],'两次输入的密码不一致。':['兩次輸入的密碼不一致。','The passwords do not match.'],
    '停用账户':['停用帳戶','Disable account'],'重新启用':['重新啟用','Enable account'],
    '停用只限制登录，不删除项目资料。':['停用只限制登入，不刪除專案資料。','Disabling access does not delete project data.'],
    '此账户已停用，可重新启用登录。':['此帳戶已停用，可重新啟用登入。','This account is disabled. You can restore sign-in access.'],
    '返回列表':['返回列表','Back to list'],'账户已切换，请重新操作。':['帳戶已切換，請重新操作。','The account changed. Please try this action again.'],
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
    '至少 8 位，可使用纯数字；最长 72 个字符。':['至少 8 位，可使用純數字；最長 72 個字元。','Use 8–72 characters. Numbers-only passwords are allowed.'],
    '保存新密码':['儲存新密碼','Save new password'],'密码已更新。':['密碼已更新。','Your password has been updated.'],
    '用户名需为 3–32 位英文字母、数字、下划线或连字符。':['使用者名稱需為 3–32 位英文字母、數字、底線或連字號。','Use a username of 3–32 letters, digits, underscores or hyphens.'],'显示名称需为 1–60 个字符。':['顯示名稱需為 1–60 個字元。','Display names must contain 1–60 characters.'],'新密码不能与当前密码相同。':['新密碼不能與目前密碼相同。','Your new password must differ from the current password.'],'请填写当前密码。':['請填寫目前密碼。','Enter your current password.'],'请检查用户名和密码。':['請檢查使用者名稱和密碼。','Check your username and password.'],
    '两次输入的新密码不一致。':['兩次輸入的新密碼不一致。','The new passwords do not match.'],
    '密码需为 8–72 个字符，可使用纯数字。':['密碼需為 8–72 個字元，可使用純數字。','Use 8–72 characters; numbers-only passwords are allowed.'],
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
    '新账户可直接登录，之后可在“个人资料”中修改密码。':['新帳戶可直接登入，之後可在「個人資料」中修改密碼。','New accounts can sign in directly and change their password later in Profile.'],
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
  Object.assign(translations,{
  "AI 提示词": [
    "AI 提示詞",
    "AI prompts"
  ],
  "上传信息分析": [
    "上傳資訊分析",
    "Upload analysis"
  ],
  "教学建议": [
    "教學建議",
    "Teaching suggestions"
  ],
  "创作 Prompt": [
    "創作 Prompt",
    "Creative prompt"
  ],
  "分享项目时，分析上传材料并补充必填信息。": [
    "分享專案時，分析上傳材料並補充必填資訊。",
    "Analyses uploaded materials and fills required fields when sharing a project."
  ],
  "补充教学信息时，生成可审阅的教学建议。": [
    "補充教學資訊時，產生可審閱的教學建議。",
    "Generates teaching suggestions for review while adding teaching details."
  ],
  "基于项目继续创作时，优化创作 Prompt。": [
    "基於專案繼續創作時，優化創作 Prompt。",
    "Refines the creative prompt when adapting an existing project."
  ],
  "选择功能": [
    "選擇功能",
    "Choose a feature"
  ],
  "AI 功能": [
    "AI 功能",
    "AI features"
  ],
  "未保存": [
    "未保存",
    "Unsaved"
  ],
  "系统默认": [
    "系統預設",
    "System default"
  ],
  "已自定义": [
    "已自訂",
    "Custom"
  ],
  "修改只保留在当前会话；退出或切换账号后清除未保存内容。": [
    "修改只保留在目前工作階段；登出或切換帳戶後清除未保存內容。",
    "Drafts stay in this session. Signing out or switching accounts clears unsaved edits."
  ],
  "提示词配置读取失败，请重试。": [
    "提示詞設定讀取失敗，請重試。",
    "Could not load prompt settings. Please retry."
  ],
  "重新读取最新配置": [
    "重新讀取最新設定",
    "Load latest settings"
  ],
  "正在读取提示词…": [
    "正在讀取提示詞…",
    "Loading prompts…"
  ],
  "其他管理员已修改这项提示词。": [
    "其他管理員已修改這項提示詞。",
    "Another administrator changed this prompt."
  ],
  "你的草稿已保留。请先读取最新配置，再核对需要保留的内容。": [
    "你的草稿已保留。請先讀取最新設定，再核對需要保留的內容。",
    "Your draft is safe. Load the latest settings, then compare the content you want to keep."
  ],
  "最新已保存内容": [
    "最新已保存內容",
    "Latest saved content"
  ],
  "以最新版本继续编辑": [
    "以最新版本繼續編輯",
    "Continue from this revision"
  ],
  "保留你的草稿，下一次保存将基于此版本。请先核对差异。": [
    "保留你的草稿，下一次保存將基於此版本。請先核對差異。",
    "Keep your draft and base your next save on this revision. Review the differences first."
  ],
  "保存后，下次调用生效；不会立即运行 AI。": [
    "保存後，下次呼叫生效；不會立即執行 AI。",
    "Saved changes apply to the next request. Saving does not run AI."
  ],
  "最近更新": [
    "最近更新",
    "Last updated"
  ],
  "尚未自定义，当前使用系统默认内容。": [
    "尚未自訂，目前使用系統預設內容。",
    "No custom settings yet. The system default is active."
  ],
  "任务提示词": [
    "任務提示詞",
    "Task prompt"
  ],
  "1–4000 个字符，可换行。": [
    "1–4000 個字元，可換行。",
    "1–4000 characters; line breaks are allowed."
  ],
  "已与服务器同步": [
    "已與伺服器同步",
    "Up to date"
  ],
  "恢复默认": [
    "恢復預設",
    "Restore default"
  ],
  "保存提示词": [
    "保存提示詞",
    "Save prompt"
  ],
  "正在保存…": [
    "正在保存…",
    "Saving…"
  ],
  "查看系统默认提示词": [
    "查看系統預設提示詞",
    "View the system default prompt"
  ],
  "提示词需为 1–4000 个字符，可换行或使用制表符。": [
    "提示詞需為 1–4000 個字元，可換行或使用定位字元。",
    "Use 1–4000 characters. Line breaks and tabs are allowed."
  ],
  "提示词已保存，下次调用生效。": [
    "提示詞已保存，下次呼叫生效。",
    "Prompt saved. It applies to the next request."
  ],
  "本次已保存，你还有新的未保存修改。": [
    "本次已保存，你還有新的未保存修改。",
    "Saved. You also have newer unsaved edits."
  ],
  "已恢复默认，下次调用生效。": [
    "已恢復預設，下次呼叫生效。",
    "Default restored. It applies to the next request."
  ],
  "恢复默认提示词？": [
    "恢復預設提示詞？",
    "Restore the default prompt?"
  ],
  "将用系统默认内容替换当前配置与这项功能的未保存草稿。保存后，下次调用生效。": [
    "將用系統預設內容取代目前設定與這項功能的未保存草稿。保存後，下次呼叫生效。",
    "Replace this setting and its unsaved draft with the system default. It applies to the next request."
  ],
  "确认恢复默认": [
    "確認恢復預設",
    "Restore default"
  ],
  "已保留草稿，请核对后再保存。": [
    "已保留草稿，請核對後再保存。",
    "Draft kept. Review it before saving."
  ],
  "管理成员与 AI 的工作方式。": [
    "管理成員與 AI 的工作方式。",
    "Manage your people and how AI works."
  ],
  "管理员可管理账户与 AI 提示词。": [
    "管理員可管理帳戶與 AI 提示詞。",
    "Administrators manage accounts and AI prompts."
  ],
  "显示名称留空时使用用户名。": [
    "顯示名稱留空時使用使用者名稱。",
    "Leave blank to use the username."
  ],
  "AI 提示词已更新": [
    "AI 提示詞已更新",
    "AI prompt updated"
  ],
  "AI 提示词已恢复默认": [
    "AI 提示詞已恢復預設",
    "AI prompt restored to default"
  ]
});
  Object.assign(translations,{'未读取':['未讀取','Not loaded'],'正在读取':['正在讀取','Loading'],'更新 AI 提示词':['更新 AI 提示詞','Update AI prompt'],'恢复默认 AI 提示词':['恢復預設 AI 提示詞','Restore default AI prompt'],'去工作台试用':['到工作台試用','Try it in your workspace']});
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const language = () => document.documentElement.lang || 'zh-CN';
  const t = key => translations[key]?.[language() === 'en' ? 1 : language() === 'zh-Hant' ? 0 : -1] || key;
  const text = key => escape(t(key));
  const symbol = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${({user:'<circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',arrow:'<path d="M19 12H5m6-6-6 6 6 6"/>'})[name]}</svg>`;
  let pendingEntry=false;
  let createdCredentials=null, lastAppearance=null, appearanceForms=null;
  const state = {passwordOpen:false,user:null,configured:false,mode:'unavailable',initialized:false,busy:false,checking:false,error:'',notice:'',username:'',adminTab:'users',users:[],total:0,page:1,pageSize:20,q:'',roleFilter:'',statusFilter:'',editorMode:'empty',errorForm:'',loaded:false,loading:false,adminError:'',selected:null,createDraft:{},events:[],auditLoaded:false,auditLoading:false};
  let hooks = {}, started = false, sessionVersion = 0, identityEpoch = 0, channel, lastCheck = 0, startupPrefetch = null;
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });

  function errorMessage(error) {
    const byCode = {AI_PROMPT_INVALID:'提示词需为 1–4000 个字符，可换行或使用制表符。',AI_PROMPT_STORAGE_UNAVAILABLE:'提示词配置读取失败，请重试。',INVALID_AFFILIATION_TYPE:'请选择个人、学校或机构。',INVALID_ORGANIZATION_NAME:'学校或机构名称需为 1–100 个字符。',UNAUTHENTICATED:'登录已过期，请重新登录。',INVALID_USERNAME:'用户名需为 3–32 位英文字母、数字、下划线或连字符。',INVALID_DISPLAY_NAME:'显示名称需为 1–60 个字符。',PASSWORD_UNCHANGED:'新密码不能与当前密码相同。',CURRENT_PASSWORD_REQUIRED:'请填写当前密码。',ACCOUNT_SERVICE_UNAVAILABLE:'账户服务暂不可用',INVALID_CURRENT_PASSWORD:'当前密码不正确。',LAST_ACTIVE_ADMIN:'不能停用或降级最后一位管理员。',INVALID_CREDENTIALS:'请检查用户名和密码。',AUTH_REQUIRED:'登录已过期，请重新登录。',UNAUTHORIZED:'登录已过期，请重新登录。',SESSION_EXPIRED:'登录已过期，请重新登录。',PASSWORD_CHANGE_REQUIRED:'请先修改密码。',ACCOUNT_DISABLED:'账户已停用，请联系管理员。',USER_DISABLED:'账户已停用，请联系管理员。',FORBIDDEN:'你没有执行此操作的权限。',USERNAME_EXISTS:'该用户名已被使用。',USERNAME_TAKEN:'该用户名已被使用。',RATE_LIMITED:'尝试次数过多，请稍后再试。',LAST_ADMIN:'不能停用或降级最后一位管理员。',INVALID_PASSWORD:'密码需为 8–72 个字符，可使用纯数字。',WEAK_PASSWORD:'密码需为 8–72 个字符，可使用纯数字。',CURRENT_PASSWORD_INVALID:'当前密码不正确。',INCORRECT_PASSWORD:'当前密码不正确。'};
    return t(byCode[error?.code] || error?.message || '操作未完成，请稍后重试。');
  }
  function snapshotForms() {
    return [...document.querySelectorAll('[data-account-form]')].filter(form=>form.dataset.accountForm!=='ai-prompt').map(form=>({kind:form.dataset.accountForm,id:form.dataset.userId||'',fields:[...form.elements].filter(field=>field.name&&field.type!=='submit').map(field=>({name:field.name,value:field.value,focused:field===document.activeElement,start:field.selectionStart,end:field.selectionEnd}))}));
  }
  function restoreForms(snapshots) {
    for(const snapshot of snapshots){
      const form=[...document.querySelectorAll('[data-account-form]')].find(node=>node.dataset.accountForm===snapshot.kind&&(node.dataset.userId||'')===snapshot.id);if(!form)continue;
      for(const saved of snapshot.fields){const field=form.elements[saved.name];if(!field)continue;field.value=saved.value;if(saved.focused){field.focus({preventScroll:true});if(typeof saved.start==='number'&&typeof field.setSelectionRange==='function')try{field.setSelectionRange(saved.start,saved.end);}catch{}}}
      syncAffiliation(form);
    }
  }
  function redraw(focusError = false, preserveForms = false) {
    // Short-lived form snapshots stay in memory only and are scoped to this render.
    const snapshots=preserveForms&&!state.busy?snapshotForms():[];
    hooks.onRender?.();restoreForms(snapshots);
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
  function staleRequestError() {const error=new Error(t('账户已切换，请重新操作。'));error.code='ACCOUNT_CONTEXT_CHANGED';return error;}
  async function request(path, options) {
    const epoch=identityEpoch;
    try { const result=await rawRequest(path, options);if(epoch!==identityEpoch)throw staleRequestError();return result; }
    catch (error) {
      // A delayed response belongs to its original identity, including authentication failures.
      if(epoch!==identityEpoch)throw staleRequestError();
      if (error.status === 401 && !path.startsWith('/auth/login') && error.code !== 'INCORRECT_PASSWORD') {
        const expiredEpoch=identityEpoch+1;
        await changeIdentity(null, {reason:'expired',forced:true});
        if(identityEpoch===expiredEpoch){state.error=t('登录已过期，请重新登录。');location.hash='login';redraw();}
      } else if (error.code === 'PASSWORD_CHANGE_REQUIRED' && state.user) {
        resetAdminAi();state.user={...state.user,mustChangePassword:true};location.hash='account';redraw();
      }
      throw error;
    }
  }
  async function changeIdentity(user, context) {
    identityEpoch+=1;state.passwordOpen=false;createdCredentials=null;appearanceForms=null;lastAppearance=null;resetAdminAi();
    const confirmation=document.querySelector('.account-confirm');confirmation?.close('cancel');confirmation?.remove();
    const oldId=state.user?.id || null, nextId=user?.id || null;
    // Clear administrative records before publishing any new identity.
    state.users=[];state.events=[];state.selected=null;state.createDraft={};state.editorMode='empty';state.roleFilter='';state.statusFilter='';state.errorForm='';state.loaded=false;state.loading=false;state.auditLoaded=false;state.auditLoading=false;state.adminError='';
    state.user=user || null;
    if (oldId !== nextId || context.reason === 'initial') await hooks.onChange?.(state.user,context);
    if (state.user?.mustChangePassword) location.hash='account';
  }
  async function refreshSession({initial=false} = {}) {
    if (state.checking || (state.busy && !initial)) return;
    state.checking=true;lastCheck=Date.now();const version=++sessionVersion;
    const pending=initial?startupPrefetch:null;
    if(initial)startupPrefetch=null;
    try {
      // Only startup overlaps these requests with the remaining deferred
      // scripts. Identity publication still waits for init to install hooks.
      const statusResult=pending?await pending[0]:null;
      if(statusResult?.status==='rejected')throw statusResult.reason;
      const status=statusResult?statusResult.value:await rawRequest('/status');
      if(version!==sessionVersion)return;
      state.configured=status.configured===true;state.mode=status.mode || 'unavailable';
      let user=null;
      if (state.configured) {
        try {
          const sessionResult=pending?await pending[1]:null;
          if(sessionResult?.status==='rejected')throw sessionResult.reason;
          user=(sessionResult?sessionResult.value:await rawRequest('/auth/session')).user || null;
        }
        catch(error) { if(error.status!==401)throw error; }
      }
      if(version!==sessionVersion)return;
      if(initial || (user?.id || null)!==(state.user?.id || null)) {
        state.busy=true;
        await hooks.onBeforeChange?.({reason:initial?'initial':'external',forced:true});
        await changeIdentity(user,{reason:initial?'initial':'external',forced:true});
      } else {if(state.user?.role==='admin'&&(user?.role!=='admin'||user?.mustChangePassword))resetAdminAi();state.user=user;}
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
  const passwordField=(name,label,{newPassword=false,confirm=false}={})=>`<label class="account-field"><span>${text(label)}</span><span class="account-password"><input name="${name}" id="account-${name}" type="password" autocomplete="${newPassword?'new-password':'current-password'}" required ${newPassword?'minlength="8" maxlength="72"':''} ${newPassword&&!confirm?'aria-describedby="account-password-help"':''}><button type="button" class="account-password-toggle" data-account-action="toggle-password" data-field="account-${name}" aria-label="${text('显示密码')}" aria-pressed="false">${symbol('eye')}</button></span></label>`;
  const passwordHelp=()=>`<p class="account-help" id="account-password-help">${text('至少 8 位，可使用纯数字；最长 72 个字符。')}</p>`;
  const translateMessage=value=>{const key=Object.keys(translations).find(key=>key===value||translations[key].includes(value));return t(key||value);};
  const messages=(includeError=true)=>`${state.error&&includeError?`<p class="account-message account-message--error" role="alert" tabindex="-1">${escape(translateMessage(state.error))}</p>`:''}${state.notice?`<p class="account-message" role="status">${escape(translateMessage(state.notice))}</p>`:''}`;
  const submitButton=label=>`<button type="submit" class="primary account-submit" ${state.busy?'disabled':''}>${text(state.busy?'正在处理…':label)}</button>`;
  const back=(workspace=false)=>`<a class="account-back" href="#${workspace?'desk':'discover'}">${symbol('arrow')}${text(workspace?'返回工作台':'返回项目库')}</a>`;
  function header() {
    const label=state.user ? (state.user.displayName || state.user.username) : t('登录');
    return `<a class="account-header" href="#${state.user?'desk':'login'}" aria-label="${escape(state.user?t('打开工作台')+' · '+label:t('登录'))}" title="${escape(label)}">${symbol('user')}<span>${escape(label)}</span></a>`;
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
    return `<section class="account-surface account-page">${back(true)}<div class="account-page-heading"><div><span class="account-eyebrow">TASHAN / PROFILE</span><h1>${text('个人资料')}</h1><p class="account-lead">${text('查看个人信息，按需管理登录密码。')}</p></div></div>
      <div class="account-profile-grid"><section class="account-card account-profile"><div class="account-profile-identity"><span class="account-avatar account-avatar--large" aria-hidden="true">${escape(Array.from(user.displayName||user.username)[0])}</span><div><span class="account-pill">${text(user.role==='admin'?'管理员':'成员')}</span><h2>${escape(user.displayName||user.username)}</h2><p class="account-username">@${escape(user.username)}</p></div></div><div class="account-section-heading"><h3>${text('基本资料')}</h3><span class="account-live-status">${text('当前登录')}</span></div><dl class="account-facts"><div><dt>${text('用户名')}</dt><dd>@${escape(user.username)}</dd></div><div><dt>${text('显示名称')}</dt><dd>${escape(user.displayName||user.username)}</dd></div><div><dt>${text('所属类型')}</dt><dd>${affiliationMarkup(user)}</dd></div>${user.createdAt?`<div><dt>${text('创建时间')}</dt><dd>${escape(formatDate(user.createdAt))}</dd></div>`:''}<div><dt>${text('账户')}</dt><dd>${text(state.mode==='local'?'本机账户服务':'在线账户服务')}</dd></div></dl><p class="account-help">${text('需要修改名称？请联系管理员。')}</p>
      <section class="profile-password"><div class="profile-password-row"><div><h3>${symbol('shield')}${text('账户安全')}</h3><p>${text('按需修改，下次登录使用新密码。')}</p></div><button data-account-action="toggle-password-panel" aria-expanded="${state.passwordOpen}" aria-controls="account-password-panel" ${state.busy?'disabled':''}>${text(state.passwordOpen?'取消修改':'修改密码')}</button></div>${!state.passwordOpen?messages():''}<div id="account-password-panel" ${state.passwordOpen?'':'hidden'}>${state.passwordOpen?passwordForm():''}</div></section></section>
      <aside class="account-profile-column">${user.role==='admin'?`<section class="account-card"><div class="account-section-heading"><h3>${text('账户权限')}</h3></div><div class="account-profile-links"><a href="#admin">${symbol('shield')}${text('账户管理')} <span aria-hidden="true">↗</span></a></div></section>`:''}<section class="account-card account-session"><div><h2>${text('登录会话')}</h2><p>${text('退出不会删除已保存的项目与草稿。')}</p></div><button class="subtle" data-account-action="logout" ${state.busy?'disabled':''}>${text('退出登录')}</button></section></aside></div></section>`;
  }
  function workspaceNotice() {return `<div class="account-workspace-note"><span>${symbol('user')}</span><div><strong>${text(state.user?'账户工作台':'访客本地工作台')}${state.user?' · '+escape(state.user.displayName||state.user.username):''}</strong><p>${text(state.user?'草稿、收藏和任务按账户保存在此浏览器；项目版本可另行上传与发布。':'访客资料单独保存在此浏览器，不会自动转入登录账户。')}</p></div><a href="#${state.user?'account':'login'}">${text(state.user?'个人资料':'登录')} <span aria-hidden="true">↗</span></a></div>`;}
  function guestExportMarkup() {return state.user?`<button class="subtle" data-action="export-guest-backup">${text('导出旧版浏览器资料')}</button><small>${text('导出登录功能上线前的访客项目、草稿、收藏、任务与版本记录。')}</small>`:'';}
  const affiliationType=user=>['school','organization'].includes(user?.affiliationType)?user.affiliationType:'personal';
  const affiliationLabel=type=>({school:'学校',organization:'机构',personal:'个人'})[type];
  function affiliationMarkup(user) {const type=affiliationType(user);return `${text(affiliationLabel(type))}${type!=='personal'&&user.organizationName?' · '+escape(user.organizationName):''}`;}
  function affiliationFields(user) {
    const type=affiliationType(user),personal=type==='personal';
    return `<fieldset class="account-affiliation"><legend>${text('所属类型')}</legend><label class="account-field"><span class="sr-only">${text('所属类型')}</span><select name="affiliationType" data-account-affiliation aria-describedby="account-affiliation-help">${['personal','school','organization'].map(value=>`<option value="${value}" ${type===value?'selected':''}>${text(affiliationLabel(value))}</option>`).join('')}</select></label><p class="account-help" id="account-affiliation-help">${text('个人无需填写学校或机构名称。')}</p><label class="account-field account-organization-field" data-account-organization ${personal?'hidden':''}><span data-account-organization-label>${text(type==='school'?'学校名称':'机构名称')}</span><input name="organizationName" maxlength="200" autocomplete="organization" aria-describedby="account-organization-help" value="${escape(personal?'':user?.organizationName||'')}" ${personal?'disabled':'required'}><small class="account-help" id="account-organization-help">${text('名称最多 100 个字符。')}</small></label></fieldset>`;
  }
  function syncAffiliation(form) {
    const control=form.elements?.affiliationType,input=form.elements?.organizationName,field=form.querySelector('[data-account-organization]');if(!control||!input||!field)return;
    const personal=control.value==='personal';field.hidden=personal;input.disabled=personal;input.required=!personal;
    field.querySelector('[data-account-organization-label]').textContent=t(control.value==='school'?'学校名称':'机构名称');
  }
  const aiTasks={
    upload:{title:'上传信息分析',description:'分享项目时，分析上传材料并补充必填信息。'},
    teaching:{title:'教学建议',description:'补充教学信息时，生成可审阅的教学建议。'},
    prompt:{title:'创作 Prompt',description:'基于项目继续创作时，优化创作 Prompt。'}
  };
  const freshAiState=()=>({selected:'upload',configs:{},drafts:{},loaded:false,loading:false,saving:null,error:''});
  let adminAi=freshAiState();
  const normalizeAiText=value=>String(value??'').replace(/\r\n?/g,'\n');
  const invalidAiText=value=>!value.trim()||Array.from(value).length>4000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value);
  const aiDirty=task=>Boolean(adminAi.drafts[task]&&adminAi.drafts[task].text!==adminAi.configs[task]?.prompt);
  function resetAdminAi(){adminAi=freshAiState();document.querySelector('.account-ai-confirm')?.close('cancel');}
  function acceptAiConfig(config,{saved=false}={}){
    const task=config?.task;
    if(!aiTasks[task]||typeof config.prompt!=='string'||typeof config.defaultPrompt!=='string'||!Number.isInteger(config.revision)||config.revision<0)throw new Error('提示词配置读取失败，请重试。');
    const old=adminAi.configs[task],draft=adminAi.drafts[task];adminAi.configs[task]={...config};
    if(!draft||(!draft.conflict&&draft.text===old?.prompt)||saved)adminAi.drafts[task]={text:config.prompt,revision:config.revision,error:'',notice:'',conflict:false,reviewed:false};
    else if(draft.revision!==config.revision){draft.conflict=true;draft.reviewed=true;}
  }
  async function loadAiPrompts(){
    if(state.user?.role!=='admin'||state.user.mustChangePassword||adminAi.loading||adminAi.saving)return;
    const epoch=identityEpoch,scope=adminAi;adminAi.loading=true;adminAi.error='';redraw(false,true);
    try{
      const result=await request('/admin/ai-prompts');if(epoch!==identityEpoch||scope!==adminAi)return;
      if(!Array.isArray(result.prompts)||!Object.keys(aiTasks).every(task=>result.prompts.some(item=>item?.task===task)))throw new Error('提示词配置读取失败，请重试。');
      for(const config of result.prompts)acceptAiConfig(config);
      for(const draft of Object.values(adminAi.drafts))if(draft.conflict)draft.reviewed=true;
      adminAi.loaded=true;
    }catch(error){if(epoch===identityEpoch&&scope===adminAi)adminAi.error=errorMessage(error);}
    finally{if(epoch===identityEpoch&&scope===adminAi){adminAi.loading=false;redraw(false,true);}}
  }
  function aiPromptMarkup(){
    const task=adminAi.selected,config=adminAi.configs[task],draft=adminAi.drafts[task],busy=Boolean(adminAi.loading||adminAi.saving);
    const navigation=`<aside class="account-ai-functions"><p class="account-eyebrow">${text('选择功能')}</p><div role="group" aria-label="${text('AI 功能')}">${Object.entries(aiTasks).map(([key,item])=>`<button data-account-action="ai-task" data-task="${key}" aria-pressed="${key===task}"><span>${text(item.title)}</span><small>${text(!adminAi.configs[key]?(adminAi.loading?'正在读取':'未读取'):adminAi.drafts[key]&&aiDirty(key)?'未保存':adminAi.configs[key].isDefault===false?'已自定义':'系统默认')}</small><span class="account-ai-function-arrow" aria-hidden="true">↗</span></button>`).join('')}</div><p class="account-help">${text('修改只保留在当前会话；退出或切换账号后清除未保存内容。')}</p></aside>`;
    const failure=adminAi.error?`<p class="account-message account-message--error" role="alert">${escape(translateMessage(adminAi.error))}</p><button class="subtle" data-account-action="reload-ai-prompts">${text('重新读取最新配置')}</button>`:'';
    if(!adminAi.loaded||!config||!draft)return `<section class="account-ai-layout">${navigation}<section class="account-card account-ai-editor"><h2>${text(aiTasks[task].title)}</h2>${failure||`<p role="status" class="account-lead">${text('正在读取提示词…')}</p>`}</section></section>`;
    const status=config.isDefault?'系统默认':'已自定义',count=Array.from(draft.text).length;
    const conflict=draft.conflict?`<section class="account-ai-conflict" role="alert"><h3>${text('其他管理员已修改这项提示词。')}</h3><p>${text('你的草稿已保留。请先读取最新配置，再核对需要保留的内容。')}</p><button data-account-action="reload-ai-prompts" ${busy?'disabled':''}>${text('重新读取最新配置')}</button>${draft.reviewed?`<details open><summary>${text('最新已保存内容')}</summary><pre>${escape(config.prompt)}</pre></details><button data-account-action="rebase-ai-prompt" data-task="${task}" ${busy?'disabled':''}>${text('以最新版本继续编辑')}</button><p class="account-help">${text('保留你的草稿，下一次保存将基于此版本。请先核对差异。')}</p>`:''}</section>`:'';
    return `<section class="account-ai-layout">${navigation}<section class="account-card account-ai-editor" aria-labelledby="account-ai-title"><header class="account-ai-heading"><div><p class="account-eyebrow">${text('AI 提示词')}</p><h2 id="account-ai-title" tabindex="-1">${text(aiTasks[task].title)}</h2></div><span class="account-pill">${text(status)}</span></header><p class="account-ai-description">${text(aiTasks[task].description)}</p><p class="account-ai-effective">${text('保存后，下次调用生效；不会立即运行 AI。')}</p><div class="account-ai-updated">${config.updatedAt?`${text('最近更新')} · ${escape(formatDate(config.updatedAt))}${config.updatedBy?` · ${escape(config.updatedBy.displayName||config.updatedBy.username||'')}`:''}`:text('尚未自定义，当前使用系统默认内容。')}</div>${failure}${conflict}<form data-account-form="ai-prompt" data-task="${task}" novalidate aria-busy="${adminAi.saving===task}"><label for="account-ai-prompt">${text('任务提示词')}</label><textarea id="account-ai-prompt" name="prompt" data-account-ai-editor data-task="${task}" rows="16" spellcheck="true" aria-describedby="account-ai-rule account-ai-count account-ai-feedback" ${adminAi.saving===task?'aria-busy="true"':''}>${escape(draft.text)}</textarea><div class="account-ai-field-meta"><span id="account-ai-rule">${text('1–4000 个字符，可换行。')}</span><span id="account-ai-count" data-ai-count class="${count>4000?'is-invalid':''}">${count} / 4000</span></div><p id="account-ai-feedback" data-ai-feedback class="account-ai-feedback ${draft.error?'is-error':''}" role="${draft.error?'alert':'status'}">${draft.error?escape(translateMessage(draft.error)):draft.notice?escape(translateMessage(draft.notice)):''}</p><div class="account-ai-actions"><span data-ai-dirty aria-live="polite">${text(aiDirty(task)?'未保存':'已与服务器同步')}</span><button class="subtle" type="button" data-account-action="reset-ai-prompt" data-task="${task}" ${busy||draft.conflict||config.isDefault&&!aiDirty(task)?'disabled':''}>${text('恢复默认')}</button><button class="primary" type="submit" data-ai-save ${busy||draft.conflict||!aiDirty(task)?'disabled':''}>${text(adminAi.saving===task?'正在保存…':'保存提示词')}</button></div></form><details class="account-ai-default"><summary>${text('查看系统默认提示词')}</summary><pre>${escape(config.defaultPrompt)}</pre></details><a class="account-ai-try" href="#desk">${text('去工作台试用')} <span aria-hidden="true">↗</span></a></section></section>`;
  }
  function updateAiDraft(task,value){
    const draft=adminAi.drafts[task];if(!draft)return;draft.text=normalizeAiText(value);draft.notice='';draft.error='';
    const invalid=invalidAiText(draft.text),counter=document.querySelector('[data-ai-count]'),dirty=document.querySelector('[data-ai-dirty]'),save=document.querySelector('[data-ai-save]');
    if(counter){counter.textContent=Array.from(draft.text).length+' / 4000';counter.classList.toggle('is-invalid',invalid);}
    if(dirty)dirty.textContent=t(aiDirty(task)?'未保存':'已与服务器同步');
    if(save)save.disabled=Boolean(adminAi.loading||adminAi.saving||draft.conflict||!aiDirty(task));
    const feedback=document.querySelector('[data-ai-feedback]');if(feedback){feedback.textContent='';feedback.classList.remove('is-error');feedback.setAttribute('role','status');}
  }
  function aiInput(event){
    const input=event.target.closest('[data-account-ai-editor]');if(!input||state.user?.role!=='admin'||state.user.mustChangePassword)return;
    event.stopImmediatePropagation?.();if(input.dataset.task===adminAi.selected)updateAiDraft(input.dataset.task,input.value);
  }
  async function saveAiPrompt(task,{reset=false}={}){
    const draft=adminAi.drafts[task];if(state.user?.role!=='admin'||state.user.mustChangePassword||!draft||!adminAi.loaded||adminAi.saving||adminAi.loading||draft.conflict)return;
    if(!reset&&invalidAiText(draft.text)){draft.error=t('提示词需为 1–4000 个字符，可换行或使用制表符。');redraw();document.querySelector('[data-account-ai-editor]')?.focus();return;}
    const epoch=identityEpoch,scope=adminAi,submitted=draft.text,revision=draft.revision;adminAi.saving=task;draft.error='';draft.notice='';redraw(false,true);
    try{
      const result=await request('/admin/ai-prompts/'+task,{method:'PATCH',body:{prompt:reset?null:submitted,expectedRevision:revision}});if(epoch!==identityEpoch||scope!==adminAi)return;
      const latestText=adminAi.drafts[task].text;acceptAiConfig(result.prompt,{saved:true});
      if(latestText!==submitted)adminAi.drafts[task].text=latestText;
      adminAi.drafts[task].notice=t(reset?'已恢复默认，下次调用生效。':aiDirty(task)?'本次已保存，你还有新的未保存修改。':'提示词已保存，下次调用生效。');state.auditLoaded=false;
    }catch(error){if(epoch===identityEpoch&&scope===adminAi){if(error.code==='AI_PROMPT_CONFLICT'){draft.conflict=true;draft.reviewed=false;draft.error='';}else draft.error=errorMessage(error);}}
    finally{if(epoch===identityEpoch&&scope===adminAi){adminAi.saving=null;redraw(false,true);}}
  }
  function confirmAiReset(task){return new Promise(resolve=>{
    const dialog=document.createElement('dialog');dialog.className='confirm-dialog account-ai-confirm';dialog.setAttribute('aria-labelledby','account-ai-confirm-title');
    dialog.innerHTML=`<h2 id="account-ai-confirm-title">${text('恢复默认提示词？')}</h2><p><strong>${text(aiTasks[task].title)}</strong></p><p>${text('将用系统默认内容替换当前配置与这项功能的未保存草稿。保存后，下次调用生效。')}</p><form method="dialog"><button value="cancel">${text('取消')}</button><button class="primary" value="confirm">${text('确认恢复默认')}</button></form>`;
    dialog.addEventListener('close',()=>{resolve(dialog.returnValue==='confirm');dialog.remove();},{once:true});document.body.append(dialog);dialog.showModal();
  });}
  function focusEditor(field='displayName'){const editor=document.querySelector('.account-editor');if(window.matchMedia?.('(max-width: 850px)').matches)editor?.scrollIntoView({block:'start',behavior:'instant'});(editor?.querySelector('input[name="'+field+'"]')||editor?.querySelector('input'))?.focus({preventScroll:true});}

  function userFields(user) {return `<label class="account-field"><span>${text('显示名称')}</span><input name="displayName" maxlength="60" autocomplete="off" aria-describedby="account-display-help" value="${escape(user?.displayName||'')}"></label><p class="account-help" id="account-display-help">${text('显示名称留空时使用用户名。')}</p>${affiliationFields(user)}<fieldset class="account-permissions"><legend>${text('账户权限')}</legend><label class="account-field"><span>${text('角色')}</span><select name="role" aria-describedby="account-role-help" ${user?.id===state.user.id?'disabled':''}><option value="member" ${user?.role==='member'?'selected':''}>${text('成员')}</option><option value="admin" ${user?.role==='admin'?'selected':''}>${text('管理员')}</option></select></label><p class="account-help" id="account-role-help">${text('管理员可管理账户与 AI 提示词。')}</p></fieldset>`;}
  const editorError=kind=>state.error&&state.errorForm===kind?`<p class="account-message account-message--error" role="alert" tabindex="-1">${escape(translateMessage(state.error))}</p>`:'';
  function userEditor() {
    const user=state.selected,draft=user||state.createDraft;
    if(!user&&state.editorMode!=='create')return `<aside class="account-card account-editor account-editor-empty"><span class="account-emblem">${symbol('user')}</span><h2>${text('选择账户')}</h2><p>${text('从列表选择账户，或创建一个新账户。')}</p><button class="btn" data-account-action="new-user">${text('新建账户')} <span aria-hidden="true">+</span></button></aside>`;
    const kind=user?'edit-user':'create-user';
    return `<aside class="account-card account-editor" aria-labelledby="account-editor-title"><div class="account-editor-heading"><div><p class="account-eyebrow">${text(user?'基本资料':'新建账户')}</p><h2 id="account-editor-title">${user?escape(user.displayName||user.username):text('创建账户')}</h2>${user?`<p class="account-editor-username">@${escape(user.username)} <span class="account-pill ${user.status==='disabled'?'is-disabled':''}">${text(user.status==='disabled'?'已停用':'已启用')}</span></p>`:''}</div><button class="subtle" data-account-action="close-editor">${text('返回列表')}</button></div><form data-account-form="${kind}" class="account-form" novalidate aria-busy="${state.busy}" ${user?`data-user-id="${escape(user.id)}"`:''}>${editorError(kind)}<label class="account-field"><span>${text('用户名')}</span><input name="username" required ${user?'readonly':''} maxlength="32" autocomplete="off" autocapitalize="none" spellcheck="false" aria-describedby="account-username-help" value="${escape(draft?.username||'')}"></label><p class="account-help" id="account-username-help">${text(user?'用户名创建后不可修改。':'用户名以字母或数字开头，3–32 位；可含下划线和连字符。')}</p>${userFields(draft)}${!user?`<div class="account-form-divider"><span>${text('初始密码')}</span></div>`+passwordField('password','初始密码',{newPassword:true})+passwordHelp()+passwordField('confirmPassword','再次输入密码',{newPassword:true,confirm:true})+`<button type="button" class="subtle account-generate" data-account-action="generate-password">${text('生成初始密码')} ↗</button><p class="account-help">${text('新账户可直接登录，之后可在“个人资料”中修改密码。')}</p>`:''}${submitButton(user?'保存修改':'创建账户')}</form>
      ${user&&user.id!==state.user.id?`<details class="account-reset" ${state.errorForm==='reset-password'&&state.error?'open':''}><summary><span>${text('重置密码')}</span><span aria-hidden="true">+</span></summary><p class="account-help">${text('重置后，对方需要重新登录并修改密码。')}</p><form data-account-form="reset-password" data-user-id="${escape(user.id)}" class="account-form" novalidate aria-busy="${state.busy}">${editorError('reset-password')}${passwordField('password','设置重置密码',{newPassword:true})}${passwordHelp()}${passwordField('confirmPassword','再次输入密码',{newPassword:true,confirm:true})}<button type="button" class="subtle account-generate" data-account-action="generate-password">${text('生成初始密码')} ↗</button>${submitButton('重置密码')}</form></details><section class="account-access"><h3>${text('账户访问')}</h3><p>${text(user.status==='disabled'?'此账户已停用，可重新启用登录。':'停用只限制登录，不删除项目资料。')}</p><button class="${user.status==='disabled'?'account-enable':'account-danger-button'}" data-account-action="toggle-user" data-user-id="${escape(user.id)}" data-next-status="${user.status==='disabled'?'active':'disabled'}" ${state.busy?'disabled':''}>${text(user.status==='disabled'?'重新启用':'停用账户')}</button></section>`:''}${user?.id===state.user.id?`<p class="account-self-note">${symbol('shield')}${text('这是你当前登录的账户。')}</p>`:''}</aside>`;
  }
  function userList() {
    const filtered=state.users.filter(user=>(!state.roleFilter||user.role===state.roleFilter)&&(!state.statusFilter||user.status===state.statusFilter));
    const count=language()==='en'?`${state.total} accounts`:`${state.total} ${t('个账户')}`;
    const filterActive=Boolean(state.q||state.roleFilter||state.statusFilter);
    const rows=filtered.map(user=>`<tr ${state.selected?.id===user.id?'class="is-selected"':''}><td><div class="account-person"><span class="account-avatar" aria-hidden="true">${escape(Array.from(user.displayName||user.username)[0])}</span><div><strong>${escape(user.displayName||user.username)}${user.id===state.user.id?` <span class="account-you">${text('你')}</span>`:''}</strong><small>@${escape(user.username)}</small><small class="account-person-affiliation" title="${escape(user.organizationName||t(affiliationLabel(affiliationType(user))))}">${affiliationMarkup(user)}</small>${user.mustChangePassword?`<small class="account-reset-label">${text('待修改密码')}</small>`:''}</div></div></td><td data-label="${text('角色')}">${text(user.role==='admin'?'管理员':'成员')}</td><td data-label="${text('状态')}"><span class="account-pill ${user.status==='disabled'?'is-disabled':''}">${text(user.status==='disabled'?'已停用':'已启用')}</span></td><td><button class="account-edit-button" data-account-action="edit-user" data-user-id="${escape(user.id)}" aria-label="${escape(t('编辑账户')+' · '+(user.displayName||user.username))}" aria-pressed="${state.selected?.id===user.id}" ${state.busy?'disabled':''}>${text('编辑')} <span aria-hidden="true">↗</span></button></td></tr>`).join('');
    const result=state.loading?`<div class="account-list-loading"><p role="status">${text('正在读取账户…')}</p><div aria-hidden="true">${'<span></span>'.repeat(3)}</div></div>`:state.adminError?`<div class="account-empty"><p>${text('账户列表读取失败。')}</p><button data-account-action="reload-users">${text('重新加载')}</button></div>`:filtered.length?`<div class="account-table-scroll"><table class="account-table account-people-table"><thead><tr><th scope="col">${text('用户账户')}</th><th scope="col">${text('角色')}</th><th scope="col">${text('状态')}</th><th scope="col">${text('操作')}</th></tr></thead><tbody>${rows}</tbody></table></div>`:`<div class="account-empty"><span class="account-emblem">${symbol('user')}</span><p>${text(state.roleFilter||state.statusFilter?'没有符合本页筛选的账户。':'没有找到匹配的账户。')}</p><small>${text('调整关键词，或清除筛选后重试。')}</small>${filterActive?`<button class="subtle" data-account-action="clear-filters">${text('清除筛选')}</button>`:''}</div>`;
    return `<section class="account-card account-list" aria-busy="${state.loading}"><div class="account-list-heading"><h2>${text('用户账户')}</h2><span>${escape(count)}</span></div><form class="account-search" data-account-form="search-users"><label for="account-search">${text('搜索所有账户')}</label><div><input id="account-search" name="query" type="search" maxlength="60" value="${escape(state.q)}" placeholder="${text('搜索用户名或名称')}"><button type="submit" ${state.loading?'disabled':''}>${text('搜索')}</button></div></form><div class="account-filters"><span>${text('本页筛选')}</span><label class="sr-only" for="account-role-filter">${text('角色')}</label><select id="account-role-filter" data-account-filter="roleFilter"><option value="">${text('全部角色')}</option><option value="member" ${state.roleFilter==='member'?'selected':''}>${text('成员')}</option><option value="admin" ${state.roleFilter==='admin'?'selected':''}>${text('管理员')}</option></select><label class="sr-only" for="account-status-filter">${text('状态')}</label><select id="account-status-filter" data-account-filter="statusFilter"><option value="">${text('全部状态')}</option><option value="active" ${state.statusFilter==='active'?'selected':''}>${text('已启用')}</option><option value="disabled" ${state.statusFilter==='disabled'?'selected':''}>${text('已停用')}</option></select></div>${result}<div class="account-pagination"><span aria-live="polite">${text('本页显示')} ${state.loading?'—':filtered.length} · ${state.page} / ${Math.max(1,Math.ceil(state.total/state.pageSize))}</span><button data-account-action="previous-page" ${state.page<=1||state.loading?'disabled':''} aria-label="${text('上一页')}">←</button><button data-account-action="next-page" ${state.page*state.pageSize>=state.total||state.loading?'disabled':''} aria-label="${text('下一页')}">→</button></div></section>`;
  }
  const auditAction=event=>event.action==='ai_prompt.updated'?t(event.details?.reset?'恢复默认 AI 提示词':'更新 AI 提示词')+(aiTasks[event.details?.task]?' · '+t(aiTasks[event.details.task].title):'')+(Number.isInteger(event.details?.revision)?' · r'+event.details.revision:''):t(actionName(event.action));
  const actionName=action=>({ 'ai_prompt_updated':'AI 提示词已更新','ai_prompt_reset':'AI 提示词已恢复默认','initial_password_requirement_removed':'已取消首次改密要求','account.initial_password_requirement_removed':'已取消首次改密要求','system.initial_password_optional':'已取消首次改密要求', 'account.created':'账户已创建','account.updated':'账户已修改','account.password_reset':'密码已重置','auth.password_changed':'密码已修改','user.created':'账户已创建','user.create':'账户已创建','user.updated':'账户已修改','user.update':'账户已修改','user.password_reset':'密码已重置','password.reset':'密码已重置','auth.password_change':'密码已修改','auth.login':'登录成功','auth.logout':'已退出','account_created':'账户已创建','account_updated':'账户已修改','password_reset':'密码已重置','password_changed':'密码已修改','admin_bootstrapped':'管理员已初始化','account.bootstrap':'管理员已初始化','password_reset_started':'开始重置密码','password_change_started':'开始修改密码','password_operation_failed':'密码操作未完成'})[action]||action||'—';
  function auditList() {return `<section class="account-card"><div class="account-list-heading"><h2>${text('操作记录')}</h2><button class="subtle" data-account-action="reload-audit">${text('重新加载')}</button></div>${state.auditLoading?`<p class="account-empty" role="status">${text('正在处理…')}</p>`:state.events.length?`<div class="account-table-scroll"><table class="account-table"><thead><tr><th>${text('时间')}</th><th>${text('执行人')}</th><th>${text('操作')}</th><th>${text('对象')}</th></tr></thead><tbody>${state.events.map(event=>`<tr><td>${escape(formatDate(event.createdAt||event.created_at))}</td><td>${escape(event.actorUsername||event.actor?.username||event.actorId||'—')}</td><td>${escape(auditAction(event))}</td><td>${escape(event.targetUsername||event.target?.username||event.targetId||'—')}</td></tr>`).join('')}</tbody></table></div>`:`<p class="account-empty">${text('暂无操作记录。')}</p>`}</section>`;}
  function formatDate(value) {const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat(language(),{dateStyle:'medium',timeStyle:'short'}).format(date):'—';}
  function admin() {
    if(!state.user)return login();
    if(state.user.mustChangePassword)return account();
    if(state.user.role!=='admin')return `<section class="account-surface account-narrow">${back()}<div class="account-card"><h1>${text('账户管理')}</h1><p>${text('此页面仅供管理员使用。')}</p><a class="btn" href="#account">${text('个人资料')}</a></div></section>`;
    return `<section class="account-surface account-admin">${back()}<div class="account-page-heading"><div><span class="account-eyebrow">TASHAN / ADMINISTRATION</span><h1>${text('账户管理')}</h1><p class="account-lead">${text('管理成员与 AI 的工作方式。')}</p></div><button class="primary" data-account-action="new-user">${text('新建账户')} <span aria-hidden="true">+</span></button></div><div class="account-tabs" role="group" aria-label="${text('账户管理')}"><button data-account-action="users-tab" aria-pressed="${state.adminTab==='users'}">${text('账户')}</button><button data-account-action="ai-tab" aria-pressed="${state.adminTab==='ai'}">${text('AI 提示词')}</button><button data-account-action="audit-tab" aria-pressed="${state.adminTab==='audit'}">${text('操作记录')}</button></div>${state.adminTab==='ai'?'':messages(state.adminTab!=='users'||!['create-user','edit-user','reset-password'].includes(state.errorForm))}${state.adminError&&state.adminTab!=='ai'?`<p class="account-message account-message--error" role="alert" tabindex="-1">${escape(translateMessage(state.adminError))}</p>`:''}${state.adminTab==='users'?createdAccountNotice():''}${state.adminTab==='users'?`<div class="account-admin-grid">${userList()}${userEditor()}</div>`:state.adminTab==='ai'?aiPromptMarkup():auditList()}</section>`;
  }
  function createdAccountNotice(){
    if(!createdCredentials)return '';
    return `<aside class="account-created" aria-label="${text('账户已创建')}"><div><strong>${text('账户已创建')} · @${escape(createdCredentials.username)}</strong><p class="account-help">${text('初始密码仅在此显示，离开账户管理后清除。')}</p></div><label class="account-field"><span>${text('初始密码')}</span><span class="account-password"><input id="account-created-password" type="password" readonly autocomplete="off" value="${escape(createdCredentials.password)}"><button type="button" class="account-password-toggle" data-account-action="toggle-password" data-field="account-created-password" aria-label="${text('显示密码')}" aria-pressed="false">${symbol('eye')}</button></span></label><div class="account-actions"><button type="button" data-account-action="copy-created">${text('复制账号信息')}</button><button type="button" class="subtle" data-account-action="dismiss-created">${text('收起账号信息')}</button></div></aside>`;
  }
  function render(view) {
    const appearance=language()+'|'+(document.documentElement.dataset?.theme||'light');
    if(lastAppearance&&lastAppearance.epoch===identityEpoch&&lastAppearance.view===view&&lastAppearance.value!==appearance&&!state.busy)appearanceForms={epoch:identityEpoch,snapshots:snapshotForms()};
    lastAppearance={epoch:identityEpoch,view,value:appearance};
    if(!state.initialized || state.checking&&!state.initialized)return `<section class="entry-account" data-entry-account><p role="status">${text('正在确认账户…')}</p></section>`;
    if(!state.configured)return unavailable();
    return view==='admin'?admin():view==='account'?account():login();
  }
  async function loadUsers() {
    if(state.loading||state.user?.role!=='admin'||state.user.mustChangePassword)return;
    state.loading=true;state.adminError='';const epoch=identityEpoch;
    redraw(false,true);
    try {const result=await request('/admin/users?query='+encodeURIComponent(state.q)+'&page='+state.page);if(identityEpoch!==epoch)return;state.users=result.users||[];if(state.selected){const selected=state.users.find(user=>user.id===state.selected.id);if(selected)state.selected=selected;}state.total=result.total||0;state.page=result.page||state.page;state.pageSize=result.pageSize||20;state.loaded=true;}
    catch(error){if(identityEpoch===epoch)state.adminError=errorMessage(error);}finally{if(identityEpoch===epoch){state.loading=false;state.loaded=true;redraw(false,true);}}
  }
  async function loadAudit() {
    if(state.auditLoading||state.user?.role!=='admin'||state.user.mustChangePassword)return;
    state.auditLoading=true;state.adminError='';const epoch=identityEpoch;redraw();
    try{const result=await request('/admin/audit');if(identityEpoch!==epoch)return;state.events=result.events||[];state.auditLoaded=true;}catch(error){if(identityEpoch===epoch)state.adminError=errorMessage(error);}finally{if(identityEpoch===epoch){state.auditLoading=false;state.auditLoaded=true;redraw(false,true);}}
  }
  function validatePassword(password) {if(password.length<8||password.length>72)throw new Error('密码需为 8–72 个字符，可使用纯数字。');if(new TextEncoder().encode(password).length>72)throw new Error('密码最长为 72 个 UTF-8 字节，中文字符通常占 3 字节。');}
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
    const kind=form.dataset.accountForm;
    if(kind==='ai-prompt'){if(state.user?.role==='admin'&&form.dataset.task===adminAi.selected){updateAiDraft(form.dataset.task,form.elements.prompt.value);await saveAiPrompt(form.dataset.task);}return;}
    const fields=new FormData(form);
    if(kind==='search-users'){state.q=String(fields.get('query')||'').trim();state.page=1;await loadUsers();return;}
    state.errorForm=kind;
    // Validate explicitly: native popovers can hide why creation was blocked.
    form.querySelector('[data-form-feedback]')?.remove();
    form.querySelectorAll('[aria-invalid]').forEach(input=>{input.removeAttribute('aria-invalid');const help=(input.getAttribute?.('aria-describedby')||'').split(' ').filter(id=>id&&!id.startsWith('account-form-feedback-')).join(' ');if(help)input.setAttribute('aria-describedby',help);else input.removeAttribute('aria-describedby');});
    const affiliation={affiliationType:String(fields.get('affiliationType')||'personal'),organizationName:String(fields.get('organizationName')||'').trim()};
    if(affiliation.affiliationType==='personal')affiliation.organizationName='';
    let invalid;
    try {
      if(kind==='login'){
        invalid=form.elements.username;if(!String(fields.get('username')||'').trim())throw new Error('请填写用户名。');
        invalid=form.elements.password;if(!fields.get('password'))throw new Error('请填写密码。');
      }
      if(kind==='create-user'){
        invalid=form.elements.username;if(!/^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/.test(String(fields.get('username')||'').trim()))throw new Error('用户名需为 3–32 位英文字母、数字、下划线或连字符。');
      }
      if(kind==='create-user'||kind==='edit-user'){
        invalid=form.elements.affiliationType;if(!['personal','school','organization'].includes(affiliation.affiliationType))throw new Error('请选择个人、学校或机构。');
        if(affiliation.affiliationType!=='personal'){invalid=form.elements.organizationName;if(!affiliation.organizationName)throw new Error(affiliation.affiliationType==='school'?'请填写学校名称。':'请填写机构名称。');if(Array.from(affiliation.organizationName).length>100||/\p{Cc}/u.test(affiliation.organizationName))throw new Error('学校或机构名称需为 1–100 个字符。');}
      }
      if(kind==='create-user'||kind==='reset-password'){invalid=form.elements.password;validatePassword(String(fields.get('password')||''));invalid=form.elements.confirmPassword;if(fields.get('password')!==fields.get('confirmPassword'))throw new Error('两次输入的密码不一致。');}
      if(kind==='password'){
        invalid=form.elements.currentPassword;if(!fields.get('currentPassword'))throw new Error('请填写当前密码。');
        invalid=form.elements.newPassword;validatePassword(String(fields.get('newPassword')||''));
        invalid=form.elements.confirmPassword;if(fields.get('newPassword')!==fields.get('confirmPassword'))throw new Error('两次输入的新密码不一致。');
      }
    } catch(error) {
      const feedback=document.createElement('p');feedback.className='account-message account-message--error account-field-error';feedback.id='account-form-feedback-'+kind;feedback.dataset.formFeedback='true';feedback.setAttribute('role','alert');feedback.textContent=errorMessage(error);
      const field=invalid?.closest?.('.account-field');if(field)field.append(feedback);else form.querySelector('[type="submit"]').before(feedback);
      invalid?.setAttribute('aria-invalid','true');invalid?.setAttribute('aria-describedby',[(invalid.getAttribute?.('aria-describedby')||''),feedback.id].filter(Boolean).join(' '));invalid?.focus();return;
    }
    const username=String(fields.get('username')||'').trim();
    if(kind==='create-user')state.createDraft={username,...affiliation,displayName:String(fields.get('displayName')||''),role:fields.get('role')||'member'};
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
        const result=await rawRequest('/auth/session');if(!result.user?.id)throw new Error('登录已过期，请重新登录。');const wasForced=state.user?.mustChangePassword;state.user=result.user;state.passwordOpen=false;state.notice=t('密码已更新。');notifyTabs();if(wasForced||pendingEntry){pendingEntry=false;await enterPlatform();}
      }else if(kind==='create-user'){
        const password=String(fields.get('password')||'');validatePassword(password);
        const created=await request('/admin/users',{method:'POST',body:{username,...affiliation,displayName:String(fields.get('displayName')||'').trim()||username,password,role:fields.get('role')==='admin'?'admin':'member'}});
        createdCredentials={username:created.user?.username||username,password};
        state.q='';state.roleFilter='';state.statusFilter='';state.page=1;state.selected=created.user||null;state.editorMode='edit';
        state.notice=t('账户已创建。请通过可信渠道告知对方用户名和初始密码。');state.createDraft={};await loadUsers();state.auditLoaded=false;
      }else if(kind==='edit-user'){
        const body={...affiliation,displayName:String(fields.get('displayName')||'').trim()||username};if(form.dataset.userId!==state.user.id)body.role=fields.get('role')==='admin'?'admin':'member';
        const result=await request('/admin/users/'+encodeURIComponent(form.dataset.userId),{method:'PATCH',body});
        if(form.dataset.userId===state.user.id)state.user=result.user||{...state.user,...body};
        state.notice=t('账户已更新。');state.selected=result.user||{...state.selected,...body};await loadUsers();state.auditLoaded=false;
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
      dialog.innerHTML=`<h2 id="account-confirm-title">${text('确认停用账户')}</h2><p><strong>${escape(user.displayName||user.username)}</strong> · @${escape(user.username)}</p><p>${text('停用后，该用户的会话会失效。')}</p><form method="dialog"><button value="cancel">${text('取消')}</button><button class="account-danger-button" value="confirm">${text('确认停用')}</button></form>`;
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
      let generated='';
      while(generated.length<8)for(const value of crypto.getRandomValues(new Uint8Array(8))){if(value<250&&generated.length<8)generated+=String(value%10);}
      input.value=generated;if(form.elements.confirmPassword)form.elements.confirmPassword.value=generated;
      button.textContent=t('已生成，可点眼睛查看并交给对方。');return;
    }
    if(action==='toggle-password-panel'&&state.user&&!state.user.mustChangePassword){
      state.passwordOpen=!state.passwordOpen;state.error='';state.errorForm='';state.notice='';appearanceForms=null;redraw();
      document.querySelector(state.passwordOpen?'#account-currentPassword':'[data-account-action="toggle-password-panel"]')?.focus({preventScroll:true});return;
    }
    if(action==='retry'){await refreshSession({initial:!state.configured});return;}
    if(action==='logout'){await transaction(async()=>{await rawRequest('/auth/logout',{method:'POST',body:{}});await changeIdentity(null,{reason:'logout',forced:false});notifyTabs();location.hash='discover';},{identity:true});return;}
    if(state.user?.role!=='admin'||state.user.mustChangePassword)return;
    if(action==='ai-tab'){createdCredentials=null;state.adminTab='ai';redraw();if(!adminAi.loaded)loadAiPrompts();return;}
    if(action==='ai-task'&&aiTasks[button.dataset.task]){adminAi.selected=button.dataset.task;redraw();if(window.matchMedia?.('(max-width: 850px)').matches)document.querySelector('.account-ai-editor')?.scrollIntoView({block:'start',behavior:'instant'});document.getElementById('account-ai-title')?.focus({preventScroll:true});return;}
    if(action==='reload-ai-prompts'){await loadAiPrompts();return;}
    if(action==='rebase-ai-prompt'){const task=button.dataset.task,draft=adminAi.drafts[task];if(draft?.conflict&&draft.reviewed&&!adminAi.loading&&!adminAi.saving){draft.revision=adminAi.configs[task].revision;draft.conflict=false;draft.reviewed=false;draft.notice=t('已保留草稿，请核对后再保存。');redraw();}return;}
    if(action==='reset-ai-prompt'){const task=button.dataset.task,draft=adminAi.drafts[task],epoch=identityEpoch;if(!draft||draft.conflict||adminAi.loading||adminAi.saving)return;if(await confirmAiReset(task)&&epoch===identityEpoch)await saveAiPrompt(task,{reset:true});return;}
    if(action==='copy-created'&&createdCredentials){try{await navigator.clipboard.writeText(`${t('用户名')}: ${createdCredentials.username}\n${t('初始密码')}: ${createdCredentials.password}`);button.textContent=t('账号信息已复制。');}catch{button.textContent=t('请手动复制用户名和初始密码。');}return;}
    if(action==='dismiss-created'){createdCredentials=null;redraw(false,true);return;}
    if(action==='close-editor'){createdCredentials=null;state.selected=null;state.editorMode='empty';state.error='';redraw();document.querySelector('.account-list')?.scrollIntoView({block:'start',behavior:'instant'});document.querySelector('.account-list input')?.focus({preventScroll:true});return;}
    if(action==='clear-filters'){state.q='';state.roleFilter='';state.statusFilter='';state.page=1;await loadUsers();return;}
    if(action==='reload-users'){await loadUsers();return;}
    if(action==='new-user'){createdCredentials=null;state.editorMode='create';state.selected=null;state.adminTab='users';state.error='';state.notice='';redraw();focusEditor('username');return;}
    if(action==='edit-user'){createdCredentials=null;state.editorMode='edit';state.selected=state.users.find(user=>user.id===button.dataset.userId)||null;state.error='';state.notice='';redraw();focusEditor();return;}
    if(action==='users-tab'){state.adminTab='users';redraw();if(!state.loaded)loadUsers();return;}
    if(action==='audit-tab'){state.adminTab='audit';redraw();if(!state.auditLoaded)loadAudit();return;}
    if(action==='reload-audit'){loadAudit();return;}
    if(action==='previous-page'||action==='next-page'){state.page=Math.max(1,state.page+(action==='previous-page'?-1:1));loadUsers();return;}
    if(action==='toggle-user'){
      state.errorForm='access';const user=state.users.find(item=>item.id===button.dataset.userId)||state.selected,nextStatus=button.dataset.nextStatus,epoch=identityEpoch;
      if(!user||user.id!==button.dataset.userId||!['active','disabled'].includes(nextStatus))return;
      // Submit the action shown on the button, even if another administrator changed this account.
      if(nextStatus==='disabled'&&!await confirmDisable(user))return;
      if(identityEpoch!==epoch)return;
      await transaction(async()=>{const updated=await request('/admin/users/'+encodeURIComponent(user.id),{method:'PATCH',body:{status:nextStatus}});if(state.selected?.id===user.id)state.selected=updated.user||{...user,status:nextStatus};state.notice=t('账户状态已更新。');await loadUsers();state.auditLoaded=false;});
    }
  }
  function filterChange(event) {
    const affiliation=event.target.closest('[data-account-affiliation]');
    if(affiliation?.dataset.accountAffiliation!==undefined){
      if(state.busy)return;const form=affiliation.closest('[data-account-form]');if(!form)return;syncAffiliation(form);
      const field=form.querySelector('[data-account-organization]'),input=form.elements.organizationName;field?.querySelector('[data-form-feedback]')?.remove();input?.removeAttribute('aria-invalid');input?.setAttribute('aria-describedby','account-organization-help');return;
    }
    const control=event.target.closest('[data-account-filter]');if(!control||state.busy)return;
    const key=control.dataset.accountFilter;if(!['roleFilter','statusFilter'].includes(key))return;
    state[key]=control.value;const id=control.id;redraw(false,true);document.getElementById(id)?.focus({preventScroll:true});
  }
  const bound=new WeakSet();
  function bind(root) {
    if(location.hash.split('/')[0]!=='#account'){state.passwordOpen=false;}
    if(appearanceForms){const pending=appearanceForms;appearanceForms=null;if(pending.epoch===identityEpoch)restoreForms(pending.snapshots);}
    if(location.hash.split('/')[0]!=='#admin')createdCredentials=null;
    const entry=root.querySelector('[data-entry-account]');
    if(entry){window.TashanEntrance?.mountAuth(entry);if(!bound.has(entry)){entry.addEventListener('submit',submit,true);entry.addEventListener('click',click,true);bound.add(entry);}}
    else if(!state.busy)window.TashanEntrance?.dismissAuth();
    if(!bound.has(root)){root.addEventListener('submit',submit,true);root.addEventListener('click',click,true);root.addEventListener('change',filterChange,true);root.addEventListener('input',aiInput,true);bound.add(root);}
    if(location.hash.split('/')[0]==='#admin'&&state.user?.role==='admin'&&!state.user.mustChangePassword){if(state.adminTab==='users'&&!state.loaded&&!state.loading)queueMicrotask(loadUsers);if(state.adminTab==='audit'&&!state.auditLoaded&&!state.auditLoading)queueMicrotask(loadAudit);if(state.adminTab==='ai'&&!adminAi.loaded&&!adminAi.loading&&!adminAi.error)queueMicrotask(loadAiPrompts);}
  }
  window.TashanAccounts={init,ready,request,header,render,bind,workspaceNotice,guestExportMarkup,refreshSession,get user(){return state.user;},get mode(){return state.mode;},get configured(){return state.configured;},get initialized(){return state.initialized;},get busy(){return state.busy;}};
  // No UI, persisted identity, or workspace access before init. Settle each
  // failure now, including when the rest of the application cannot load.
  startupPrefetch=[rawRequest('/status'),rawRequest('/auth/session')].map(promise=>promise.then(value=>({status:'fulfilled',value}),reason=>({status:'rejected',reason})));
})();
