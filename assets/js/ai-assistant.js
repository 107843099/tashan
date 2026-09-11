(() => {
  'use strict';
  const fields = ['purpose', 'audience', 'prior', 'outcome', 'setting'];
  const uploadFields = ['title','purpose','subject','stage','audience','prior','outcome','setting'];
  const contextFields = ['title', 'kind', 'subject', 'stage', 'core', 'audience', 'purpose', 'outcome', 'prior', 'setting', 'boundary', 'reference'];
  const names = {title:'项目名称',kind:'项目类型',subject:'学科',stage:'学段',core:'项目说明或当前 Prompt',purpose:'教学用途',audience:'适用学生',prior:'前置基础',outcome:'学习目标',setting:'教学方式',boundary:'第一版范围',reference:'参考项目'};
  const words = {
    '此操作将调用 AI':['此操作將呼叫 AI','This action uses AI'],
    '正在调用 AI':['正在呼叫 AI','AI is working'],
    '开启后，上传项目将自动调用 AI 分析':['開啟後，上傳專案將自動呼叫 AI 分析','When enabled, uploading a project automatically uses AI analysis'],
    '此内容由 AI 生成，请核对':['此內容由 AI 產生，請核對','AI-generated content. Please review it.'],
    '上传后自动分析教学信息':['上傳後自動分析教學資訊','Automatically analyse teaching information after upload'],
    'AI 分析并补全':['AI 分析並補全','AI upload analysis'],'分析并补全':['分析並補全','Analyse and fill missing fields'],
    '只将从 HTML、Markdown、TXT 或 JSON 提取的教学文字发送给 DeepSeek，不发送整份文件或账号资料。AI 只补空项，不会自动保存或发布。':['只將從 HTML、Markdown、TXT 或 JSON 擷取的教學文字傳送給 DeepSeek，不傳送整份檔案或帳戶資料。AI 只補空項，不會自動儲存或發佈。','Only teaching text extracted from HTML, Markdown, TXT or JSON is sent to DeepSeek, excluding the full file and account details. AI fills empty fields; it does not save or publish.'],
    '正在提取教学文字…':['正在擷取教學文字…','Extracting teaching text…'],
    '该文件格式暂不支持文字提取。请填写至少 10 个字的项目说明，再点击分析并补全。':['此檔案格式暫不支援文字擷取。請填寫至少 10 個字的專案說明，再點擊分析並補全。','Text extraction is unavailable for this file format. Add a project description of at least 10 characters, then select Analyse and fill missing fields.'],
    '可提取的教学文字不足，请补充至少 10 个字的项目说明。':['可擷取的教學文字不足，請補充至少 10 個字的專案說明。','There is too little teaching text to analyse. Add a project description of at least 10 characters.'],
    '文件文字提取失败，可以填写项目说明后手动分析。':['檔案文字擷取失敗，可以填寫專案說明後手動分析。','Text extraction failed. Add a description and analyse it manually.'],
    'AI 预填，请核对':['AI 預填，請核對','AI prefilled — please review'],'仍需填写':['仍需填寫','Still required'],
    '教学信息已预填，可在下方直接修改。':['教學資訊已預填，可在下方直接修改。','Teaching information is prefilled. Edit it directly below.'],
    '真实预览、运行或测试情况与授权，仍需你亲自确认。':['真實預覽、運行或測試情況與授權，仍需你親自確認。','You must still confirm the real preview, running or testing status, and permissions yourself.'],
    '查看 AI 建议，按需替换':['查看 AI 建議，按需替換','Review AI suggestions and choose replacements'],
    '已有内容已保留，未自动保存。':['已有內容已保留，未自動儲存。','Existing content was preserved. Nothing was saved automatically.'],
    '取消后，本次请求仍可能计入用量。':['取消後，本次請求仍可能計入用量。','A cancelled request may still count towards usage.'],
    '每分钟最多 3 次，请稍后再试。':['每分鐘最多 3 次，請稍後再試。','Up to 3 requests per minute. Please try again shortly.'],
    '已达到 24 小时内 30 次的使用限额。':['已達到 24 小時內 30 次的使用限額。','You reached the limit of 30 requests in 24 hours.'],
    '平台已达到 24 小时内的 AI 使用限额，请稍后再试。':['平台已達到 24 小時內的 AI 使用限額，請稍後再試。','The platform has reached its AI limit for this 24-hour period. Please try again later.'],
    'AI 教学建议':['AI 教學建議','AI teaching suggestions'],'AI 优化创作 Prompt':['AI 優化創作 Prompt','Refine your prompt with AI'],
    '生成建议':['產生建議','Generate suggestions'],'优化 Prompt':['優化 Prompt','Refine prompt'],'重新生成':['重新產生','Generate again'],
    '当前教学文字将发送给 DeepSeek，不包含附件或账号资料。结果需要你核对后采用。':['目前教學文字將傳送給 DeepSeek，不包含附件或帳戶資料。結果需要你核對後採用。','The teaching text below is sent to DeepSeek. Attachments and account details are excluded. Review the result before applying it.'],
    '查看将发送的文字':['查看將傳送的文字','Review the text to be sent'],'已按长度上限截取，请先检查发送内容。':['已依長度上限截取，請先檢查傳送內容。','Some text was shortened to fit the limit. Review it before sending.'],
    '本地路径已省略':['本機路徑已省略','Local path omitted'],'项目名称':['專案名稱','Project title'],'项目类型':['專案類型','Project type'],'学科':['學科','Subject'],'学段':['學段','Student level'],
    '项目说明或当前 Prompt':['專案說明或目前 Prompt','Project description or current prompt'],'教学用途':['教學用途','Teaching purpose'],'适用学生':['適用學生','Learners'],'前置基础':['先備知識','Prior knowledge'],'学习目标':['學習目標','Learning outcomes'],'教学方式':['教學方式','Teaching approach'],'第一版范围':['第一版範圍','Initial scope'],'参考项目':['參考專案','Reference project'],
    '正在确认 AI 服务…':['正在確認 AI 服務…','Checking AI availability…'],'AI 尚未配置，可以继续手动编辑。':['AI 尚未設定，可以繼續手動編輯。','AI is not configured. You can continue editing manually.'],'重新检查':['重新檢查','Check again'],
    '正在生成，通常需要十几秒…':['正在產生，通常需要十幾秒…','Generating — this may take a little while…'],'取消生成':['取消產生','Cancel generation'],'已取消生成。':['已取消產生。','Generation cancelled.'],
    '先审核，再采用':['先審核，再採用','Review before applying'],'选择要填入表单的建议；现有文字只在采用时更新。':['選擇要填入表單的建議；現有文字只在採用時更新。','Select the suggestions to apply. Existing text changes only when you apply them.'],
    '采用选中的建议':['採用選取的建議','Apply selected suggestions'],'采用这个 Prompt':['採用這個 Prompt','Use this prompt'],'收起结果':['收起結果','Dismiss result'],
    '已填入所选教学资料，请核对后保存。':['已填入選取的教學資料，請核對後儲存。','Selected suggestions applied. Review the form before saving.'],
    '已替换创作任务，可编辑后保存到工作台或作为新项目。':['已替換創作任務，可編輯後儲存至工作台或作為新專案。','The prompt is now in your task. Edit it, then save to your workspace or continue as a new project.'],
    '文字已更改，请根据新内容重新生成。':['文字已更改，請根據新內容重新產生。','Your text changed. Generate a new result for the updated content.'],
    '请先填写项目名称与项目说明或教学目标。':['請先填寫專案名稱與專案說明或教學目標。','Add a project title and a description or teaching goal first.'],
    'AI 服务暂时不可用，请稍后重试。':['AI 服務暫時無法使用，請稍後重試。','AI is temporarily unavailable. Please try again later.'],
    'AI 服务余额不足，请联系管理员处理。':['AI 服務餘額不足，請聯絡管理員處理。','The AI service has insufficient credit. Contact your administrator.'],'AI 服务密钥不可用，请联系管理员检查配置。':['AI 服務金鑰無法使用，請聯絡管理員檢查設定。','The AI service key is unavailable. Ask your administrator to check the configuration.'],
    '生成超时，请稍后重试。':['產生逾時，請稍後重試。','Generation timed out. Please try again.'],'请求较频繁或已达到今日限额，请稍后再试。':['請求較頻繁或已達今日額度，請稍後再試。','You reached the request limit. Please try again later.'],
    '返回内容不完整，请重新生成。':['傳回內容不完整，請重新產生。','The result was incomplete. Please generate again.'],'教学文字超过服务限制，请缩短后重试。':['教學文字超過服務限制，請縮短後重試。','Shorten the teaching text and try again.'],
    '每分钟':['每分鐘','per minute'],'每日':['每日','per day'],'次':['次','requests'],'待核对':['待核對','Needs review'],'未自动保存':['未自動儲存','Not saved automatically']
  };
  const locale = () => document.documentElement.lang || 'zh-CN';
  const t = key => words[key]?.[locale() === 'en' ? 1 : locale() === 'zh-Hant' ? 0 : -1] || key;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const text = key => escape(t(key));
  const badge = (hint='此操作将调用 AI', running=false) => `<span class="ai-badge${running?' ai-badge--running':''}" role="img" aria-label="${text(hint)}" title="${text(hint)}">AI</span>`;
  const icon = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/><path d="M20 3v4m-2-2h4"/></svg>';
  let hooks = {}, view = null, active = null, sequence = 0, mountedRoot = null, boundRoot = null, started = false;
  let autoAnalyse = true, readJob = null, fileContext = null;
  const titlePlaceholders = new WeakMap(), prefilled = new WeakMap();
  let capability = { userId:null, data:null, error:'', loading:false, controller:null };
  const user = () => window.TashanAccounts?.user;
  const busy = () => !!hooks.busy?.() || !!window.TashanAccounts?.busy;
  function clean(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/(?:file:\/\/\/|[A-Za-z]:[\\/]|\/(?:Users|home|private|var|tmp|Volumes|mnt|Applications|Library)\/)[^\n\r<>"']*/g, '[' + t('本地路径已省略') + ']').trim();
  }
  function contextFor(raw) {
    const context = {}; let remaining = 10000, shortened = false;
    for (const key of contextFields) {
      const original = clean(key === 'kind' ? (raw.context?.kind === 'prompt' ? 'prompt' : 'visual') : raw.context?.[key]);
      const maximum = key === 'core' ? 6000 : key === 'title' ? 200 : ['subject','stage'].includes(key) ? 100 : 1500;
      const value = original.slice(0, Math.max(0, Math.min(maximum, remaining)));
      if (value.length < original.length) shortened = true;
      if (value) { context[key] = value; remaining -= value.length; }
    }
    return { context, shortened };
  }
  const fingerprint = raw => JSON.stringify({context:raw.context,guard:raw.guard});
  function capture(task, key) {
    const actor = user(), supplied = hooks.capture?.(task, key), raw = supplied ? {...supplied,context:{...supplied.context}} : null;
    if (!actor || actor.status !== 'active' || actor.mustChangePassword || !raw) return null;
    if (task === 'upload' && fileContext?.target === raw.target && fileContext.file === raw.file && fileContext.supported) raw.context.core = [raw.context.core,fileContext.text].filter(Boolean).filter((value,index,list)=>list.indexOf(value)===index).join('\n\n').slice(0,6000);
    return {...raw, task, key, userId:actor.id, locale:locale(), fingerprint:fingerprint(raw)};
  }
  const same = (a, b) => !!a && !!b && a.userId === b.userId && a.epoch === b.epoch && a.target === b.target && a.file === b.file && a.task === b.task && a.key === b.key && a.locale === b.locale;
  function cancel() { sequence++; active?.controller.abort(); active = null; readJob?.controller.abort(); readJob = null; }
  function reset(options={}) {
    cancel(); view = null; fileContext = null; if (options.account) autoAnalyse = true;
    capability.controller?.abort(); capability = {userId:null,data:null,error:'',loading:false,controller:null};
  }
  function sync(task, key) {
    const current = capture(task,key);
    if (!current) { cancel(); view = null; return null; }
    if (!same(view?.identity,current)) { cancel(); view = {identity:current,phase:'idle',notice:'',error:'',result:null,source:null,selected:new Set(fields)}; }
    if (view.source && current.fingerprint !== view.source.fingerprint) {
      cancel(); view.phase = 'idle'; view.result = null; view.source = null; view.error = ''; view.notice = '文字已更改，请根据新内容重新生成。';
    }
    return current;
  }
  function message(error) {
    if (error?.code === 'AI_MINUTE_LIMIT') return '每分钟最多 3 次，请稍后再试。';
    if (error?.code === 'AI_DAILY_LIMIT') return '已达到 24 小时内 30 次的使用限额。';
    if (error?.code === 'AI_GLOBAL_LIMIT') return '平台已达到 24 小时内的 AI 使用限额，请稍后再试。';
    if (error?.code === 'AI_BALANCE_REQUIRED') return 'AI 服务余额不足，请联系管理员处理。';
    if (error?.code === 'AI_KEY_REJECTED') return 'AI 服务密钥不可用，请联系管理员检查配置。';
    if (['AI_INVALID_RESPONSE','AI_INCOMPLETE','AI_OUTPUT_INVALID'].includes(error?.code)) return '返回内容不完整，请重新生成。';
    if (error?.code === 'AI_TIMEOUT') return '生成超时，请稍后重试。';
    if (error?.status === 429 || /(?:RATE|QUOTA|DAILY).*LIMIT/.test(error?.code || '')) return '请求较频繁或已达到今日限额，请稍后再试。';
    if (error?.status === 400 || error?.status === 413) return '教学文字超过服务限制，请缩短后重试。';
    return 'AI 服务暂时不可用，请稍后重试。';
  }
  async function fetchJSON(path, controller, body) {
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 70000);
    try {
      const response = await fetch('/api/v1/ai/' + path, {method:body ? 'POST' : 'GET',credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...(body ? {'Content-Type':'application/json'} : {})},...(body ? {body:JSON.stringify(body)} : {}),signal:controller.signal});
      let data; try { data = await response.json(); } catch { data = {}; }
      if (controller.signal.aborted) throw Object.assign(new Error(),{code:timedOut ? 'AI_TIMEOUT' : 'ABORTED'});
      if (!response.ok) throw Object.assign(new Error(),{status:response.status,code:data.error?.code});
      return data;
    } catch (error) {
      if (controller.signal.aborted) throw Object.assign(new Error(),{code:timedOut ? 'AI_TIMEOUT' : 'ABORTED'});
      throw error;
    } finally { clearTimeout(timer); }
  }
  async function authFailure(error, actorId) {
    if (user()?.id !== actorId) return;
    if (error.status === 401) {
      await window.TashanAccounts?.refreshSession();
      if (user() && user().id !== actorId) return;
      location.hash = 'login';
      window.dispatchEvent(new CustomEvent('tashan:login-request',{detail:{reason:'ai-session-expired'}}));
    } else if (error.code === 'PASSWORD_CHANGE_REQUIRED') {
      await window.TashanAccounts?.refreshSession();
      if (!user() || user().id === actorId) location.hash = 'account';
    }
  }
  function ensureCapabilities() {
    const actor = user(); if (!actor || actor.mustChangePassword) return Promise.resolve();
    if (capability.userId === actor.id && (capability.loading || capability.data || capability.error)) return capability.promise || Promise.resolve();
    capability.controller?.abort();
    const current = {userId:actor.id,data:null,error:'',loading:true,controller:new AbortController()}; capability = current;
    current.promise = (async () => {
      try {
        const data = await fetchJSON('capabilities',current.controller);
        if (capability !== current || user()?.id !== current.userId) return;
        current.data = data;
      } catch (error) {
        if (capability !== current || user()?.id !== current.userId || error.code === 'ABORTED') return;
        current.error = message(error); await authFailure(error,current.userId);
      } finally { if (capability === current) { current.loading = false; paint(); } }
    })();
    return current.promise;
  }
  function resultFor(task, response) {
    if (response.task !== task) throw Object.assign(new Error(),{code:'AI_OUTPUT_INVALID'});
    if (task === 'prompt') {
      if (typeof response.result?.text !== 'string' || !response.result.text.trim() || response.result.text.length > 20000) throw Object.assign(new Error(),{code:'AI_OUTPUT_INVALID'});
      return {text:response.result.text};
    }
    const values = response.result?.fields;
    const required = task === 'upload' ? uploadFields : fields;
    if (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).length !== required.length || required.some(key => typeof values[key] !== 'string' || (!values[key].trim() && !['subject','stage'].includes(key)) || values[key].length > (key === 'title' ? 200 : 1500))) throw Object.assign(new Error(),{code:'AI_OUTPUT_INVALID'});
    return {fields:Object.fromEntries(required.map(key => [key,values[key]]))};
  }
  async function generate() {
    if (!view || active || busy()) return;
    const snapshot = sync(view.identity.task,view.identity.key);
    if (!snapshot || !capability.data?.configured) return;
    const {context} = contextFor(snapshot);
    if (snapshot.task === 'upload' ? !context.core || context.core.length < 10 : !context.title || ![context.core,context.purpose,context.outcome].some(Boolean)) {view.error = snapshot.task === 'upload' ? '可提取的教学文字不足，请补充至少 10 个字的项目说明。' : '请先填写项目名称与项目说明或教学目标。';paint(true);return;}
    const token = ++sequence, controller = new AbortController(); active = {token,controller};
    view.phase = 'loading';view.error = '';view.notice = '';view.result = null;view.source = snapshot;paint();
    try {
      const data = await fetchJSON('assist',controller,{task:snapshot.task,locale:snapshot.locale,context});
      const current = capture(snapshot.task,snapshot.key);
      if (token !== sequence || !same(snapshot,current) || current.fingerprint !== snapshot.fingerprint || busy()) return;
      const result = resultFor(snapshot.task,data);
      if (snapshot.task === 'upload') {
        const values = Object.fromEntries(uploadFields.filter(key => !String(current.context[key] || '').trim() || key === 'title' && current.context.title === titlePlaceholders.get(current.target)).filter(key => result.fields[key].trim()).map(key => [key,result.fields[key]]));
        prefilled.set(snapshot.target,{fields:Object.keys(values)});titlePlaceholders.delete(snapshot.target);
        view.result = null;view.source = null;view.phase = 'applied';view.notice = 'AI 预填，请核对';
        active = null;hooks.apply?.('upload',snapshot.key,{fields:values});
        // The form is already editable; keep the full suggestions behind a
        // disclosure so replacing teacher-authored fields remains explicit.
        const applied = capture(snapshot.task,snapshot.key);
        if (same(snapshot,applied) && view) {view.result=result;view.source=applied;view.selected=new Set();paint();}
      } else {
        view.result = result;view.phase = 'review';view.selected = new Set(fields);view.model = typeof data.model === 'string' ? data.model : '';
      }
    } catch (error) {
      if (token !== sequence || !same(snapshot,capture(snapshot.task,snapshot.key))) return;
      if (error.code !== 'ABORTED') {view.phase = 'idle';view.error = message(error);await authFailure(error,snapshot.userId);}
    } finally {
      if (active?.token === token) {active = null;if(view?.phase === 'loading')view.phase = 'idle';paint(view?.phase === 'review' || !!view?.error);}
    }
  }
  function apply() {
    if (!view?.result || busy()) return;
    const snapshot = view.source, current = capture(snapshot.task,snapshot.key);
    if (!same(snapshot,current) || current.fingerprint !== snapshot.fingerprint) {sync(snapshot.task,snapshot.key);paint();return;}
    const result = snapshot.task !== 'prompt' ? {fields:Object.fromEntries((snapshot.task === 'upload' ? uploadFields : fields).filter(key => view.selected.has(key) && view.result.fields[key].trim()).map(key => [key,view.result.fields[key]]))} : {text:view.result.text};
    if (snapshot.task !== 'prompt' && !Object.keys(result.fields).length) return;
    view.result = null;view.source = null;view.phase = 'applied';view.error = '';view.notice = snapshot.task !== 'prompt' ? '已填入所选教学资料，请核对后保存。' : '已替换创作任务，可编辑后保存到工作台或作为新项目。';
    hooks.apply?.(snapshot.task,snapshot.key,result);paint();
  }
  function prefillNotice(current) {
    if (!prefilled.has(current.target)) return '';
    const missing = (current.context.kind === 'prompt' ? ['title','purpose'] : uploadFields).filter(key => !String(current.context[key] || '').trim());
    return `<div class="ai-prefill-note" role="status"><strong>${text('AI 预填，请核对')}</strong><p>${missing.length ? text('仍需填写') + '：' + missing.map(key=>text(names[key])).join(' · ') : text('教学信息已预填，可在下方直接修改。')}</p><small>${text('已有内容已保留，未自动保存。')} ${text('真实预览、运行或测试情况与授权，仍需你亲自确认。')}</small></div>`;
  }
  function reviewMarkup(task,result) {
    if (!result) return '';
    const suggestions = task === 'upload' ? uploadFields : fields;
    const content = `<div class="ai-review" tabindex="-1" data-ai-review><div class="ai-review-heading"><h4>${badge('此内容由 AI 生成，请核对')}${text('先审核，再采用')}</h4><span>${text('待核对')}</span></div>${task !== 'prompt' ? `<p>${text('选择要填入表单的建议；现有文字只在采用时更新。')}</p><div class="ai-suggestions">${suggestions.filter(name=>result.fields[name].trim()).map(name=>`<label class="ai-suggestion"><span><input type="checkbox" data-ai-field="${name}" ${view.selected.has(name)?'checked':''}>${text(names[name])}</span><span class="ai-suggestion-text">${escape(result.fields[name])}</span></label>`).join('')}</div>` : `<label class="ai-prompt-result"><span>${text('AI 优化创作 Prompt')}</span><textarea readonly rows="12" spellcheck="false">${escape(result.text)}</textarea></label>`}<div class="ai-review-actions"><button type="button" class="primary" data-ai-action="apply" ${busy()||task!=='prompt'&&!view.selected.size?'disabled':''}>${text(task!=='prompt'?'采用选中的建议':'采用这个 Prompt')}</button><button type="button" class="subtle" data-ai-action="dismiss">${text('收起结果')}</button></div><small>${text('未自动保存')}</small></div>`;
    return task === 'upload' ? `<details class="ai-context ai-upload-review"><summary>${text('查看 AI 建议，按需替换')}</summary>${content}</details>` : content;
  }
  function markup(task,key) {
    const current = sync(task,key); if (!current) return '';
    const {context,shortened} = contextFor(current), title = task === 'upload' ? 'AI 分析并补全' : task === 'teaching' ? 'AI 教学建议' : 'AI 优化创作 Prompt';
    const available = capability.userId === current.userId && capability.data?.configured;
    const extracting = view.phase === 'extracting', loading = view.phase === 'loading' || extracting, unavailable = capability.userId === current.userId && capability.data?.configured === false;
    const fileNotice = task === 'upload' && fileContext?.target === current.target && fileContext.file === current.file && !fileContext.supported ? '该文件格式暂不支持文字提取。请填写至少 10 个字的项目说明，再点击分析并补全。' : '';
    const status = extracting ? '正在提取教学文字…' : loading ? '正在生成，通常需要十几秒…' : view.error || view.notice || capability.error || (unavailable ? 'AI 尚未配置，可以继续手动编辑。' : !available ? '正在确认 AI 服务…' : '');
    const quota = capability.data?.limits;
    const result = view.result;
    const calling = view.phase === 'loading';
    const callHint = text(calling ? '正在调用 AI' : '此操作将调用 AI');
    return `<section class="ai-assistant" data-ai-slot data-ai-task="${task}" data-ai-key="${escape(key)}" aria-label="${text(title)}"><div class="ai-assistant-heading"><div>${icon}<h3>${text(title)}</h3></div><span class="ai-provider">DeepSeek</span></div>${task === 'upload' ? `<label class="ai-auto-option" title="${text('开启后，上传项目将自动调用 AI 分析')}"><input type="checkbox" data-ai-auto ${autoAnalyse?'checked':''}>${text('上传后自动分析教学信息')}${badge('开启后，上传项目将自动调用 AI 分析')}</label>` : ''}<p class="ai-disclosure">${text(task === 'upload' ? '只将从 HTML、Markdown、TXT 或 JSON 提取的教学文字发送给 DeepSeek，不发送整份文件或账号资料。AI 只补空项，不会自动保存或发布。' : '当前教学文字将发送给 DeepSeek，不包含附件或账号资料。结果需要你核对后采用。')}</p>${fileNotice ? `<p class="ai-file-note">${text(fileNotice)}</p>` : ''}${task !== 'prompt' ? prefillNotice(current) : ''}<details class="ai-context"><summary>${text('查看将发送的文字')}</summary>${shortened || fileContext?.truncated && fileContext.target === current.target ? `<p class="ai-shortened">${text('已按长度上限截取，请先检查发送内容。')}</p>` : ''}<dl>${Object.entries(context).map(([name,value])=>`<dt>${text(names[name])}</dt><dd>${escape(value)}</dd>`).join('')}</dl></details><div class="ai-actions"><button type="button" data-ai-action="generate" title="${callHint}" ${!available||loading||busy()?'disabled':''}>${loading?'<span class="ai-spinner" aria-hidden="true"></span>':''}${text(loading ? extracting ? '正在提取教学文字…' : '正在生成，通常需要十几秒…' : result ? '重新生成' : task==='upload'?'分析并补全':task==='teaching'?'生成建议':'优化 Prompt')}${badge(calling?'正在调用 AI':'此操作将调用 AI',calling)}</button>${loading?`<button type="button" class="subtle" data-ai-action="cancel">${text('取消生成')}</button>`:''}${unavailable||capability.error?`<button type="button" class="subtle" data-ai-action="retry">${text('重新检查')}</button>`:''}</div><p class="ai-status" role="${view.error||capability.error?'alert':'status'}" aria-live="polite" aria-atomic="true" tabindex="-1" data-ai-focus ${loading?'aria-busy="true"':''}>${status?text(status):''}</p>${calling ? `<small class="ai-quota">${text('取消后，本次请求仍可能计入用量。')}</small>` : ''}${available&&quota?`<small class="ai-quota">${escape(capability.data.model||'DeepSeek')} · ${text('每分钟')} ${escape(quota.perMinute)} ${text('次')} · ${text('每日')} ${escape(quota.perDay)} ${text('次')}</small>`:''}${reviewMarkup(task,result)}</section>`;
  }
  async function fileChanged(file,{generatedTitle=false,manual=false}={}) {
    cancel();fileContext=null;
    const snapshot = sync('upload','draft'); if (!snapshot || snapshot.file !== file) return;
    if (generatedTitle) titlePlaceholders.set(snapshot.target,snapshot.context.title);
    if (!autoAnalyse && !manual) {view.phase='idle';view.source=null;paint();return;}
    const controller = new AbortController(), token = ++sequence;
    readJob={token,controller};view.phase='extracting';view.source=snapshot;view.error='';view.notice='';paint();
    try {
      const extracted = await window.TashanAIExtract.extract(file,{signal:controller.signal});
      if (token !== sequence || controller.signal.aborted || !same(snapshot,capture('upload','draft'))) return;
      fileContext={...extracted,target:snapshot.target,file};readJob=null;view.source=null;view.phase='idle';
      if (!extracted.supported) {paint();return;}
      if (!capture('upload','draft').context.core || capture('upload','draft').context.core.trim().length<10) {view.notice='可提取的教学文字不足，请补充至少 10 个字的项目说明。';paint();return;}
      await ensureCapabilities();
      if (token !== sequence || !same(snapshot,capture('upload','draft')) || !autoAnalyse && !manual) return;
      await generate();
    } catch (error) {
      if (token !== sequence || controller.signal.aborted || !same(snapshot,capture('upload','draft'))) return;
      view.phase='idle';view.source=null;view.error='文件文字提取失败，可以填写项目说明后手动分析。';paint();
    } finally {if(readJob?.token===token)readJob=null;}
  }
  function fileRemoved() {cancel();fileContext=null;if(view){view.phase='idle';view.result=null;view.source=null;view.notice='';}paint();}
  function paint(focus=false) {
    if (!mountedRoot || !view) return;
    const slot = mountedRoot.querySelector('[data-ai-slot]'); if (!slot) return;
    slot.outerHTML = markup(view.identity.task,view.identity.key);
    if (focus) mountedRoot.querySelector(view?.result ? '[data-ai-review]' : '[data-ai-focus]')?.focus({preventScroll:true});
  }
  function mount(root) {
    mountedRoot = root;
    if (boundRoot !== root) {
      boundRoot = root;
      root.addEventListener('click',async event => {
        const button = event.target.closest('[data-ai-action]'); if (!button || !root.contains(button) || button.disabled) return;
        event.preventDefault();
        const action = button.dataset.aiAction;
        if (action === 'generate') {
          const current = view && capture(view.identity.task,view.identity.key);
          if (current?.task === 'upload' && current.file && !(fileContext?.target === current.target && fileContext.file === current.file)) {
            await fileChanged(current.file,{manual:true});paint();
            if (fileContext && !fileContext.supported) await generate();
          } else await generate();
        }
        if (action === 'apply') apply();
        if (action === 'cancel') {cancel();if(view){view.phase='idle';view.source=null;view.notice='已取消生成。';}paint(true);}
        if (action === 'dismiss') {if(view){view.result=null;view.source=null;view.phase='idle';}paint();}
        if (action === 'retry') {capability.controller?.abort();capability={userId:null,data:null,error:'',loading:false,controller:null};paint();await ensureCapabilities();}
      });
      root.addEventListener('input',event => {if(event.target.dataset.draft==='title'&&view)titlePlaceholders.delete(view.identity.target);if(view&&(event.target.dataset.draft||event.target.dataset.edit||event.target.dataset.brief)){sync(view.identity.task,view.identity.key);paint();}});
      root.addEventListener('change',event => {
        if ('aiAuto' in event.target.dataset) {autoAnalyse=event.target.checked;if(!autoAnalyse){cancel();if(view){view.phase='idle';view.source=null;}}paint();root.querySelector('[data-ai-auto]')?.focus({preventScroll:true});}
        else if (event.target.dataset.aiField && view?.result) {if(event.target.checked)view.selected.add(event.target.dataset.aiField);else view.selected.delete(event.target.dataset.aiField);const button=root.querySelector('[data-ai-action="apply"]');if(button)button.disabled=!view.selected.size||busy();}
        else if(view&&(event.target.dataset.draft||event.target.dataset.mechanism)){sync(view.identity.task,view.identity.key);paint();}
      });
    }
    const slot = root.querySelector('[data-ai-slot]');
    if (!slot) {cancel();view=null;return;}
    sync(slot.dataset.aiTask,slot.dataset.aiKey);ensureCapabilities();
  }
  function init(options) {
    hooks = options;
    if (!started) {started=true;window.addEventListener('pagehide',reset);}
  }
  function guide() {
    return locale()==='en' ? 'Bookmarks, tasks, drafts and versions are kept in this browser for each account and can be backed up. Upload a fixed version to the server to access it on other devices; publishing requires your confirmation. Accounts are created by an administrator. When AI is configured, uploaded teaching text can fill missing fields, and teaching suggestions or prompts can be reviewed before applying. AI does not verify classroom results or publish your work.' : locale()==='zh-Hant' ? '收藏、任務、草稿和版本按帳戶儲存在此瀏覽器，可完整匯出備份。上傳固定版本至服務端後，可在其他裝置登入讀取；公開發佈需由你確認。帳戶由管理員建立。AI 配置完成後，可分析上傳文字、預填空白資料，或提供經你審核採用的教學建議與 Prompt；不會認證課堂成效或自動發佈。' : '收藏、任务、草稿和版本按账号保存在此浏览器，可完整导出备份。上传固定版本到服务端后，可在其他设备登录读取；公开发布需由你确认。账号由管理员创建。AI 配置完成后，可分析上传文字、预填空白资料，或提供经你审核采用的教学建议与 Prompt；不会认证课堂成效或自动发布。';
  }
  window.TashanAI = {init,markup,mount,reset,fileChanged,fileRemoved,guide};
})();
