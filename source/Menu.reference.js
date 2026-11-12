      (function bootCatGodOracle() {
        'use strict';

        const VERSION = '1.4.1';

        function CatGodOracleRuntime(W, VERSION) {
          'use strict';

          const D = W.document;
          const TAG = '[CatGod Oracle]';
          const STATE_KEY = 'CatGod_Oracle_State';
          const UI_KEY = 'CatGod_Oracle_UI';
          const AVATAR_URL = 'https://files.catbox.moe/y9gi00.png';
          const FONT_URL = 'https://files.catbox.moe/0kgfu8.ttf';
          const GLOBAL_STYLE_ID = 'catgod-oracle-global-style';
          const QR_BUTTON_ID = 'catgod-oracle-qr-button';
          const QR_FALLBACK_ID = 'catgod-oracle-qrbar';
          const PROMPT_ORDER_ID = 100001;
          const MARKER_SOURCE = '<<<\\|\\s*catgodml\\s*\\|\\s*(menu|radio)\\s*[:：]\\s*([^:：>|]+?)\\s*[:：]\\s*([^>|]+?)\\s*>>>';
          const ENABLE_SOURCE = '<<<\\|\\s*catgodml\\s*\\|\\s*enableMenu\\s*>>>';
          const DIRECTIVE_SOURCE = '<<<\\|\\s*catgodml\\s*\\|[^>]*>>>';
          const FORCE_TOGGLE = new Set(['charDescription', 'charPersonality', 'scenario', 'personaDescription', 'worldInfoBefore', 'worldInfoAfter', 'main', 'chatHistory', 'dialogueExamples']);
          const ROLE_LABEL = { system: '系统', user: '用户', assistant: 'AI' };
          const DOCKS = ['float', 'message', 'qr'];
          const DOCK_INFO = {
            float: { label: '悬浮球', icon: 'orb', toast: '悬浮球就位啦，可以拖到屏幕任意一侧' },
            message: { label: '消息内', icon: 'message', toast: '菜单挂到最后一条消息底部啦' },
            qr: { label: 'QR 栏', icon: 'qr', toast: '菜单住进输入框上方的 QR 栏啦' },
          };
          const CHAT_PLACEHOLDER = '和小猫之神本体聊聊…（聊天模式）';

          const timeout = (fn, ms) => W.setTimeout(fn, ms);
          const clearTimer = id => W.clearTimeout(id);
          const frame = fn => W.requestAnimationFrame(fn);
          const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
          const cssEscape = value => (W.CSS && typeof W.CSS.escape === 'function' ? W.CSS.escape(value) : String(value).replace(/["\\]/g, '\\$&'));
          const reducedMotion = () => {
            try { return W.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (error) { return false; }
          };
          const cleanups = [];
          function listen(target, type, fn, options) {
            if (!target) return;
            target.addEventListener(type, fn, options);
            cleanups.push(() => target.removeEventListener(type, fn, options));
          }

          // ── Persistence ──────────────────────────────────────────────

          let storage = null;
          try { storage = W.localStorage; } catch (error) { console.warn(TAG, 'localStorage is unavailable', error); }

          function readJson(key) {
            try {
              const raw = storage && storage.getItem(key);
              return raw ? JSON.parse(raw) : null;
            } catch (error) {
              return null;
            }
          }

          function writeJson(key, value) {
            try {
              if (storage) storage.setItem(key, JSON.stringify(value));
            } catch (error) {
              console.warn(TAG, `Failed to save ${key}`, error);
            }
          }

          function normalizeState(raw) {
            const source = raw && typeof raw === 'object' ? raw : {};
            const chat = source.chat && typeof source.chat === 'object' ? source.chat : {};
            const note = source.note && typeof source.note === 'object' ? source.note : {};
            return {
              schema: 1,
              mode: source.mode === 'chat' ? 'chat' : 'theater',
              chat: { autoReturn: chat.autoReturn !== false },
              deepThink: source.deepThink === true,
              note: { text: typeof note.text === 'string' ? note.text : '', autoClear: note.autoClear !== false },
              rev: Number.isFinite(source.rev) ? source.rev : 0,
              updatedAt: Number.isFinite(source.updatedAt) ? source.updatedAt : 0,
            };
          }

          function sameState(a, b) {
            return a.mode === b.mode
              && a.chat.autoReturn === b.chat.autoReturn
              && a.deepThink === b.deepThink
              && a.note.text === b.note.text
              && a.note.autoClear === b.note.autoClear;
          }

          function normalizeUi(raw) {
            const source = raw && typeof raw === 'object' ? raw : {};
            const float = source.float && typeof source.float === 'object' ? source.float : {};
            return {
              dock: DOCKS.includes(source.dock) ? source.dock : 'float',
              theme: source.theme === 'dark' ? 'dark' : 'light',
              float: { side: float.side === 'left' ? 'left' : 'right', y: Number.isFinite(float.y) ? clamp(float.y, 0, 1) : 0.62 },
              tab: source.tab === 'preset' ? 'preset' : 'status',
              presetView: source.presetView === 'all' ? 'all' : 'menu',
              inlineOpen: source.inlineOpen === true,
              collapsed: Array.isArray(source.collapsed) ? source.collapsed.filter(name => typeof name === 'string').slice(0, 60) : [],
              history: Array.isArray(source.history) ? source.history.filter(text => typeof text === 'string' && text.trim()).slice(0, 6) : [],
            };
          }

          let state = normalizeState(readJson(STATE_KEY));
          let ui = normalizeUi(readJson(UI_KEY));
          const subscribers = new Set();
          const snapshot = () => JSON.parse(JSON.stringify(state));

          function setState(patch, reason) {
            const prev = state;
            const next = normalizeState({
              ...prev,
              ...patch,
              chat: { ...prev.chat, ...(patch.chat || {}) },
              note: { ...prev.note, ...(patch.note || {}) },
            });
            if (sameState(prev, next)) return false;
            next.rev = prev.rev + 1;
            next.updatedAt = Date.now();
            state = next;
            writeJson(STATE_KEY, state);
            syncStateToChatMetadata();
            publish(prev, reason);
            return true;
          }

          function syncStateToChatMetadata() {
            try {
              const ctx = getCtx();
              if (!ctx || !ctx.chatMetadata || typeof ctx.chatMetadata !== 'object') return;
              ctx.chatMetadata.catgod_oracle = ctx.chatMetadata.catgod_oracle || {};
              ctx.chatMetadata.catgod_oracle.oracleState = snapshot();
              if (typeof ctx.saveMetadataDebounced === 'function') ctx.saveMetadataDebounced();
            } catch (error) {
              /* ignore metadata write error */
            }
          }

          function restoreStateFromChatMetadata() {
            try {
              const ctx = getCtx();
              const saved = ctx && ctx.chatMetadata && ctx.chatMetadata.catgod_oracle && ctx.chatMetadata.catgod_oracle.oracleState;
              if (!saved || typeof saved !== 'object') return;
              // Restore deepThink or unconsumed note if localStorage was wiped or older
              if (Number(saved.updatedAt) > Number(state.updatedAt)) {
                const prev = state;
                state = normalizeState(saved);
                writeJson(STATE_KEY, state);
                publish(prev, 'metadata');
              }
            } catch (error) {
              /* ignore metadata read error */
            }
          }

          function syncFromStorage() {
            const stored = readJson(STATE_KEY);
            if (!stored) return;
            const next = normalizeState(stored);
            if (sameState(next, state)) return;
            const prev = state;
            state = next;
            publish(prev, 'storage');
          }

          function publish(prev, reason) {
            render();
            if (prev.mode !== state.mode) animateModeChange();
            const current = snapshot();
            const previous = JSON.parse(JSON.stringify(prev));
            for (const fn of subscribers) {
              try { fn(current, previous, reason); } catch (error) { console.error(TAG, 'Subscriber failed', error); }
            }
            try {
              W.dispatchEvent(new W.CustomEvent('catgod-oracle:change', { detail: { state: current, prev: previous, reason } }));
            } catch (error) {
              console.warn(TAG, 'Failed to dispatch change event', error);
            }
          }

          function setUi(patch) {
            ui = normalizeUi({ ...ui, ...patch });
            writeJson(UI_KEY, ui);
          }

          function rememberNote(text) {
            const value = String(text || '').trim();
            if (!value) return;
            setUi({ history: [value, ...ui.history.filter(item => item !== value)].slice(0, 6) });
          }

          // ── SillyTavern bridge ───────────────────────────────────────

          function getCtx() {
            try {
              return W.SillyTavern && typeof W.SillyTavern.getContext === 'function' ? W.SillyTavern.getContext() : null;
            } catch (error) {
              return null;
            }
          }

          function chatIdOf(ctx) {
            try {
              const id = ctx && (typeof ctx.getCurrentChatId === 'function' ? ctx.getCurrentChatId() : ctx.chatId);
              return id === undefined || id === null ? '' : String(id);
            } catch (error) {
              return '';
            }
          }

          function findOrder(settings) {
            const orders = Array.isArray(settings.prompt_order) ? settings.prompt_order : [];
            return orders.find(entry => Number(entry && entry.character_id) === PROMPT_ORDER_ID)
              || orders.find(entry => Number(entry && entry.character_id) === 100000)
              || null;
          }

          function readPreset() {
            const ctx = getCtx();
            const settings = ctx && ctx.chatCompletionSettings;
            if (!settings || !Array.isArray(settings.prompts)) return null;
            const order = findOrder(settings);
            const name = String(settings.preset_settings_openai || '');
            const mainApi = ctx.mainApi || '';
            if (!order || !Array.isArray(order.order)) return { name, mainApi, entries: [], groups: [] };

            const prompts = new Map();
            for (const prompt of settings.prompts) {
              if (prompt && typeof prompt.identifier === 'string') prompts.set(prompt.identifier, prompt);
            }
            const marker = new RegExp(MARKER_SOURCE, 'i');
            const enableFlag = new RegExp(ENABLE_SOURCE, 'i');
            const directives = new RegExp(DIRECTIVE_SOURCE, 'gi');
            const entries = [];
            for (const item of order.order) {
              const prompt = item && prompts.get(item.identifier);
              // Entries SPreset hides from SillyTavern's prompt manager stay hidden here too.
              if (!prompt || prompt.spreset_hidden) continue;
              const content = typeof prompt.content === 'string' ? prompt.content : '';
              const found = marker.exec(content) || marker.exec(String(prompt.name || ''));
              const bare = content.replace(directives, '').trim();
              // A prompt that only carries the enableMenu switch is plumbing, not something to toggle.
              if (!found && !bare && enableFlag.test(content)) continue;
              const isMarker = !!prompt.marker;
              entries.push({
                id: prompt.identifier,
                name: String(prompt.name || prompt.identifier).replace(directives, '').trim() || prompt.identifier,
                role: prompt.role || 'system',
                enabled: !!item.enabled,
                marker: isMarker,
                toggleable: !isMarker || FORCE_TOGGLE.has(prompt.identifier),
                header: !isMarker && !found && !bare,
                injected: Number(prompt.injection_position) === 1,
                depth: Number(prompt.injection_depth) || 0,
                menu: found ? { kind: found[1].toLowerCase(), group: found[2].trim(), label: found[3].trim() } : null,
              });
            }

            const groups = new Map();
            for (const entry of entries) {
              if (!entry.menu) continue;
              let group = groups.get(entry.menu.group);
              if (!group) groups.set(entry.menu.group, group = { name: entry.menu.group, kind: 'menu', items: [] });
              if (entry.menu.kind === 'radio') group.kind = 'radio';
              group.items.push(entry);
            }
            return { name, mainApi, entries, groups: [...groups.values()] };
          }

          function writePromptToggles(changes) {
            const ctx = getCtx();
            const settings = ctx && ctx.chatCompletionSettings;
            const order = settings && findOrder(settings);
            if (!order || !Array.isArray(order.order)) return false;
            let changed = false;
            for (const item of order.order) {
              if (item && changes.has(item.identifier) && !!item.enabled !== changes.get(item.identifier)) {
                item.enabled = changes.get(item.identifier);
                changed = true;
              }
            }
            if (!changed) return true;
            try {
              (ctx.saveSettingsDebounced || W.SillyTavern.saveSettingsDebounced)();
            } catch (error) {
              console.error(TAG, 'saveSettingsDebounced failed', error);
            }
            patchPromptManagerDom(changes);
            schedulePromptManagerRender();
            try {
              W.dispatchEvent(new W.CustomEvent('catgod-oracle:prompts', { detail: { changes: Object.fromEntries(changes) } }));
            } catch (error) {
              console.warn(TAG, 'Failed to dispatch prompt event', error);
            }
            return true;
          }

          // Mirrors the change into the open prompt manager right away; the real re-render follows.
          function patchPromptManagerDom(changes) {
            const list = D.getElementById('completion_prompt_manager_list');
            if (!list) return;
            for (const [id, on] of changes) {
              const row = list.querySelector(`[data-pm-identifier="${cssEscape(id)}"]`);
              if (!row) continue;
              row.classList.toggle('completion_prompt_manager_prompt_disabled', !on);
              const toggle = row.querySelector('.prompt-manager-toggle-action');
              if (toggle) {
                toggle.classList.toggle('fa-toggle-on', on);
                toggle.classList.toggle('fa-toggle-off', !on);
              }
            }
          }

          let openAiModule = null;
          let pmRenderTimer = 0;

          // Imports exactly the URL script.js resolved, so the module cache hands back the live instance.
          const stModules = new Map();
          function loadStModule(path) {
            if (!stModules.has(path)) {
              stModules.set(path, Promise.resolve().then(() => {
                const main = Array.from(D.querySelectorAll('script[type="module"][src]'))
                  .find(script => /(?:^|\/)script\.js(?:[?#]|$)/.test(script.getAttribute('src') || ''));
                if (!main) return null;
                const url = new W.URL(path, main.src).href;
                return new W.Function('url', 'return import(url)')(url);
              }).catch(error => {
                console.warn(TAG, `${path} is unavailable`, error);
                return null;
              }));
            }
            return stModules.get(path);
          }

          function loadOpenAiModule() {
            if (!openAiModule) openAiModule = loadStModule('./scripts/openai.js');
            return openAiModule;
          }

          function schedulePromptManagerRender() {
            clearTimer(pmRenderTimer);
            pmRenderTimer = timeout(() => {
              loadOpenAiModule().then(module => {
                try {
                  if (module && module.promptManager) module.promptManager.render(false);
                } catch (error) {
                  console.warn(TAG, 'Prompt manager render failed', error);
                }
              });
            }, 240);
          }

          // ── Generation hooks ─────────────────────────────────────────

          let armed = null;
          let lastChatReply = null;
          let tempChat = false;
          let endTimer = 0;

          function isLastMessage(ref, ctx) {
            if (!ref || !ctx || !Array.isArray(ctx.chat)) return false;
            return ctx.chat.length - 1 === ref.messageId && chatIdOf(ctx) === ref.chatId;
          }

          function chooseMode(mode, reason = 'menu') {
            if (mode === state.mode) return;
            lastChatReply = null;
            tempChat = false;
            setState({ mode }, reason);
          }

          function onGenerationStarted(type, _options, dryRun) {
            if (dryRun) return;
            W.__catgodLastActivatedWi = null;
            const kind = type || 'normal';
            if (kind === 'quiet' || kind === 'impersonate') return;
            syncFromStorage();
            clearTimer(endTimer);
            if (tempChat) {
              tempChat = false;
              setState({ mode: 'theater' }, 'auto');
            }
            // Re-rolling or continuing the reply that was written in chat mode keeps using chat mode.
            const ctx = getCtx();
            if (state.mode === 'theater' && (kind === 'swipe' || kind === 'regenerate' || kind === 'continue') && isLastMessage(lastChatReply, ctx)) {
              tempChat = true;
              setState({ mode: 'chat' }, 'replay');
              toast('这条是聊天回复，本喵继续用聊天模式重写');
            }
            armed = { mode: state.mode, note: state.note.text, stopped: false };
          }

          function onGenerationStopped() {
            if (armed) armed.stopped = true;
          }

          function onGenerationEnded() {
            const job = armed;
            if (!job) return;
            clearTimer(endTimer);
            // Failed requests never reach MESSAGE_RECEIVED; don't leave a temporary chat mode behind.
            endTimer = timeout(() => {
              if (armed !== job) return;
              armed = null;
              if (tempChat) {
                tempChat = false;
                setState({ mode: 'theater' }, 'auto');
              }
            }, 10000);
          }

          function onMessageReceived(messageId, type) {
            if (!armed || type === 'first_message') return;
            const job = armed;
            armed = null;
            clearTimer(endTimer);
            const patch = {};
            const notices = [];
            if (!job.stopped && job.note && state.note.autoClear && state.note.text === job.note) {
              patch.note = { text: '' };
              rememberNote(job.note);
              notices.push('小纸条已送达');
            }
            if (job.mode === 'chat' && state.mode === 'chat' && (tempChat || (!job.stopped && state.chat.autoReturn))) {
              patch.mode = 'theater';
              if (!job.stopped) lastChatReply = { chatId: chatIdOf(getCtx()), messageId: Number(messageId) };
              if (!tempChat) notices.unshift('聊完啦，本喵回幕后主持剧场了');
            }
            tempChat = false;
            if (Object.keys(patch).length) setState(patch, 'auto');
            if (notices.length) toast(notices.join(' · '));
          }

          function onChatChanged() {
            armed = null;
            lastChatReply = null;
            if (tempChat) {
              tempChat = false;
              setState({ mode: 'theater' }, 'auto');
            }
            restoreStateFromChatMetadata();
            presetChanged();
            scheduleInline();
          }

          // ── Request usage ────────────────────────────────────────────
          // SillyTavern does not surface the provider's usage numbers, so the request body is counted with
          // SillyTavern's own tokenizer right after it goes out, and the reply once it lands. While a reply
          // streams in, the output is a quick local estimate that the exact count replaces at the end.

          const USAGE_KEY = 'CatGod_Oracle_Usage';
          const USAGE_STATUSES = ['sending', 'streaming', 'done', 'stopped', 'failed'];
          let usage = loadUsage();
          let usageJob = null;
          let usageSeq = 0;
          let usageEndTimer = 0;
          let usageLiveTimer = 0;
          let usageClock = 0;

          function loadUsage() {
            const raw = readJson(USAGE_KEY);
            if (!raw || typeof raw !== 'object' || !Number.isFinite(raw.at)) return null;
            const count = value => (Number.isFinite(value) && value >= 0 ? value : null);
            const record = {
              id: 0,
              at: raw.at,
              kind: typeof raw.kind === 'string' ? raw.kind : 'normal',
              status: USAGE_STATUSES.includes(raw.status) ? raw.status : 'done',
              input: count(raw.input),
              messages: count(raw.messages),
              tools: count(raw.tools),
              output: count(raw.output),
              reasoning: count(raw.reasoning),
              live: false,
              maxContext: count(raw.maxContext),
              tokenizer: typeof raw.tokenizer === 'string' ? raw.tokenizer : '',
            };
            // A reload in the middle of a request never sees its reply.
            if (record.status === 'sending' || record.status === 'streaming') record.status = record.output ? 'stopped' : 'failed';
            return record;
          }

          function patchUsage(id, patch) {
            if (!usage || usage.id !== id) return;
            usage = { ...usage, ...patch };
            if (!usage.live) {
              writeJson(USAGE_KEY, usage);
              try {
                W.dispatchEvent(new W.CustomEvent('catgod-oracle:usage', { detail: { usage: { ...usage } } }));
              } catch (error) {
                console.warn(TAG, 'Failed to dispatch usage event', error);
              }
            }
            renderUsage();
          }

          function estimateTokens(text) {
            const value = String(text || '');
            const cjk = (value.match(/[぀-ヿ㐀-鿿가-힯豈-﫿＀-￯]/g) || []).length;
            return Math.round(cjk + (value.length - cjk) / 3.6);
          }

          async function countText(text) {
            if (!text) return 0;
            const ctx = getCtx();
            try {
              if (ctx && typeof ctx.getTokenCountAsync === 'function') return await ctx.getTokenCountAsync(text);
            } catch (error) {
              console.warn(TAG, 'Token count failed, falling back to an estimate', error);
            }
            return estimateTokens(text);
          }

          async function countMessages(messages) {
            if (!Array.isArray(messages) || messages.length === 0) return 0;
            // SillyTavern's /api/tokenizers/openai/count throws and returns 0 on messages that carry `tool_calls`
            // arrays or multimodal `content` arrays. Flatten each message's real text + tool_calls arguments first.
            let extraMediaTokens = 0;
            const flatChunks = [];
            for (const message of messages) {
              if (!message || typeof message !== 'object') continue;
              const segs = [];
              if (typeof message.content === 'string') {
                if (message.content) segs.push(message.content);
              } else if (Array.isArray(message.content)) {
                for (const part of message.content) {
                  if (typeof part === 'string') segs.push(part);
                  else if (part && typeof part.text === 'string') segs.push(part.text);
                  else if (part && part.type === 'tool_calls' && Array.isArray(part.tool_calls)) {
                    for (const tc of part.tool_calls) {
                      const fn = tc && (tc.function || tc);
                      if (fn && fn.name) segs.push(String(fn.name));
                      if (fn && fn.arguments) segs.push(typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments));
                    }
                  } else if (part && part.type && part.type !== 'text') {
                    extraMediaTokens += 258;
                  }
                }
              }
              if (Array.isArray(message.tool_calls)) {
                for (const tc of message.tool_calls) {
                  const fn = tc && (tc.function || tc);
                  if (fn && fn.name) segs.push(String(fn.name));
                  if (fn && fn.arguments) segs.push(typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments));
                }
              }
              const joined = segs.join('\n');
              if (joined) flatChunks.push(joined);
            }
            const combinedText = flatChunks.join('\n\n');
            const textTokens = combinedText ? await countText(combinedText) : 0;
            return textTokens + extraMediaTokens + messages.length * 3;
          }

          function onUsageGenerationStarted(type, _options, dryRun) {
            // Background (quiet) generations from other extensions are not "the last request" the user made.
            if (dryRun || type === 'quiet') return;
            clearTimer(usageEndTimer);
            const ctx = getCtx();
            const last = type === 'continue' && ctx && Array.isArray(ctx.chat) ? ctx.chat[ctx.chat.length - 1] : null;
            usageJob = {
              kind: type || 'normal',
              id: 0,
              stopped: false,
              liveText: '',
              // Continue appends to the last reply; only the new part counts as output.
              prefix: last ? String(last.mes || '') : '',
              prefixReasoning: last && last.extra ? String(last.extra.reasoning || '') : '',
            };
          }

          function onUsageRequest(data) {
            const job = usageJob;
            if (!job || job.id || !data || typeof data !== 'object') return;
            const ctx = getCtx();
            const settings = ctx && ctx.chatCompletionSettings;
            let tokenizer = '';
            try { tokenizer = ctx && typeof ctx.getTokenizerModel === 'function' ? String(ctx.getTokenizerModel() || '') : ''; } catch (error) { /* unknown tokenizer */ }
            usageSeq += 1;
            job.id = usageSeq;
            usage = {
              id: job.id,
              at: Date.now(),
              kind: job.kind,
              status: 'sending',
              input: null,
              messages: null,
              tools: null,
              output: null,
              reasoning: null,
              live: false,
              maxContext: Number(settings && settings.openai_max_context) || null,
              tokenizer,
            };
            writeJson(USAGE_KEY, usage);
            renderUsage();
            // Later listeners may still rewrite the body in place; by the next task it has been sent as-is.
            timeout(() => {
              countRequest(job.id, data).catch(error => console.warn(TAG, 'Failed to count the request', error));
            }, 0);
          }

          async function countRequest(id, data) {
            const messages = Array.isArray(data.messages) ? data.messages : null;
            const tools = Array.isArray(data.tools) && data.tools.length ? data.tools : null;
            let messageTokens = null;
            if (messages) messageTokens = await countMessages(messages);
            else if (typeof data.prompt === 'string') messageTokens = await countText(data.prompt);
            const toolTokens = tools ? await countText(JSON.stringify(tools)) : 0;
            patchUsage(id, {
              messages: messageTokens,
              tools: tools ? toolTokens : null,
              input: messageTokens === null ? null : messageTokens + toolTokens,
            });
          }

          function onUsageStream(text) {
            const job = usageJob;
            if (!job || !job.id) return;
            job.liveText = String(text || '');
            if (usageLiveTimer) return;
            usageLiveTimer = timeout(() => {
              usageLiveTimer = 0;
              if (usageJob === job) patchUsage(job.id, { status: 'streaming', output: estimateTokens(job.liveText), live: true });
            }, 160);
          }

          async function finishUsage(job, text, reasoning, status) {
            clearTimer(usageEndTimer);
            clearTimer(usageLiveTimer);
            usageLiveTimer = 0;
            if (usageJob === job) usageJob = null;
            const [output, thinking] = await Promise.all([countText(text), countText(reasoning)]);
            patchUsage(job.id, {
              status: status || (job.stopped ? 'stopped' : 'done'),
              output: output + thinking,
              reasoning: thinking || null,
              live: false,
            });
          }

          function onUsageReply(messageId, type) {
            const job = usageJob;
            if (!job || !job.id || type === 'first_message') return;
            const ctx = getCtx();
            const message = ctx && Array.isArray(ctx.chat) ? ctx.chat[Number(messageId)] : null;
            let text = message ? String(message.mes || '') : job.liveText;
            let reasoning = message && message.extra ? String(message.extra.reasoning || '') : '';
            if (job.kind === 'continue') {
              if (text.startsWith(job.prefix)) text = text.slice(job.prefix.length);
              reasoning = reasoning.startsWith(job.prefixReasoning) ? reasoning.slice(job.prefixReasoning.length) : reasoning;
            }
            finishUsage(job, text, reasoning).catch(error => console.warn(TAG, 'Failed to count the reply', error));
          }

          function onUsageImpersonate(text) {
            const job = usageJob;
            if (!job || !job.id) return;
            finishUsage(job, String(text || ''), '').catch(error => console.warn(TAG, 'Failed to count the reply', error));
          }

          function onUsageEnded() {
            const job = usageJob;
            if (!job) return;
            if (!job.id) {
              usageJob = null;
              return;
            }
            // Failed or aborted requests never deliver a message; settle with whatever streamed in.
            clearTimer(usageEndTimer);
            usageEndTimer = timeout(() => {
              if (usageJob !== job) return;
              if (job.liveText) {
                finishUsage(job, job.liveText, '', 'stopped').catch(error => console.warn(TAG, 'Failed to count the reply', error));
              } else {
                usageJob = null;
                patchUsage(job.id, { status: job.stopped ? 'stopped' : 'failed', live: false });
              }
            }, 4000);
          }

          function bindSt(ctx, bucket, name, fn) {
            const source = ctx.eventSource;
            const type = (ctx.eventTypes || ctx.event_types || {})[name];
            if (!source || typeof source.on !== 'function' || !type) return;
            const handler = (...args) => {
              try { fn(...args); } catch (error) { console.error(TAG, `${name} handler failed`, error); }
            };
            source.on(type, handler);
            bucket.push(() => {
              try { source.removeListener(type, handler); } catch (error) { /* emitter already gone */ }
            });
          }

          function bindStEvents(ctx) {
            const on = (name, fn) => bindSt(ctx, cleanups, name, fn);
            on('GENERATION_STARTED', onGenerationStarted);
            on('GENERATION_STOPPED', onGenerationStopped);
            on('GENERATION_ENDED', onGenerationEnded);
            on('MESSAGE_RECEIVED', onMessageReceived);
            on('MESSAGE_SENT', () => { lastChatReply = null; });
            on('GENERATION_STARTED', onUsageGenerationStarted);
            on('CHAT_COMPLETION_SETTINGS_READY', onUsageRequest);
            listen(W, 'catgod-oracle:final-request', event => {
              const payload = event && event.detail;
              if (!payload || typeof payload !== 'object') return;
              if (usageJob && usageJob.id) {
                countRequest(usageJob.id, payload).catch(error => console.warn(TAG, 'Failed to count final request', error));
              } else if (usage && usage.id) {
                countRequest(usage.id, payload).catch(error => console.warn(TAG, 'Failed to count final request', error));
              }
            });
            on('STREAM_TOKEN_RECEIVED', onUsageStream);
            on('MESSAGE_RECEIVED', onUsageReply);
            on('IMPERSONATE_READY', onUsageImpersonate);
            on('GENERATION_STOPPED', () => { if (usageJob) usageJob.stopped = true; });
            on('GENERATION_ENDED', onUsageEnded);
            on('CHAT_CHANGED', onChatChanged);
            on('SETTINGS_UPDATED', presetChanged);
            on('OAI_PRESET_CHANGED_AFTER', () => { presetSig = ''; presetChanged(); });
            on('WORLD_INFO_ACTIVATED', entries => {
              if (Array.isArray(entries)) {
                W.__catgodLastActivatedWi = {
                  updatedAt: Date.now(),
                  chatId: chatIdOf(ctx),
                  entries: entries.map(e => ({
                    uid: e && e.uid,
                    world: e && e.world,
                    comment: e && e.comment,
                    content: e && e.content,
                    constant: !!(e && e.constant),
                    position: Number(e && e.position),
                    depth: Number(e && e.depth),
                    role: Number(e && e.role),
                  })),
                };
              }
            });
            for (const name of ['CHARACTER_MESSAGE_RENDERED', 'USER_MESSAGE_RENDERED', 'MESSAGE_DELETED', 'MESSAGE_SWIPED', 'MORE_MESSAGES_LOADED']) {
              on(name, scheduleInline);
            }
          }

          // ── DOM helpers ──────────────────────────────────────────────

          function h(tag, props, ...children) {
            const el = D.createElement(tag);
            if (props) {
              for (const key of Object.keys(props)) {
                const value = props[key];
                if (value === undefined || value === null || value === false) continue;
                if (key === 'class') el.className = value;
                else if (key === 'text') el.textContent = value;
                else if (key === 'html') el.innerHTML = value;
                else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
                else el.setAttribute(key, value === true ? '' : String(value));
              }
            }
            for (const child of children.flat(Infinity)) {
              if (child === undefined || child === null || child === false) continue;
              el.append(typeof child === 'object' ? child : String(child));
            }
            return el;
          }

          const ICONS = {
            close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
            chevron: '<path d="m6 9 6 6 6-6"/>',
            search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
            refresh: '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
            mask: '<path d="M4 4.5c2.6 1.1 5.3 1.6 8 1.6s5.4-.5 8-1.6v6.8c0 4.8-3.6 8.7-8 8.7s-8-3.9-8-8.7Z"/><path d="M8.3 10.3c.6-.5 1.4-.5 2 0"/><path d="M13.7 10.3c.6-.5 1.4-.5 2 0"/><path d="M9 14.2c1.7 1.5 4.3 1.5 6 0"/>',
            chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M8.5 12h.01"/><path d="M12 12h.01"/><path d="M15.5 12h.01"/>',
            spark: '<path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8Z"/><path d="M19 15.5v4"/><path d="M21 17.5h-4"/>',
            note: '<path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5Z"/><path d="M15 3v6h6"/><path d="M7 13h7"/><path d="M7 17h4"/>',
            back: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
            sliders: '<path d="M4 6h9"/><path d="M17 6h3"/><circle cx="15" cy="6" r="2"/><path d="M4 12h3"/><path d="M11 12h9"/><circle cx="9" cy="12" r="2"/><path d="M4 18h11"/><path d="M19 18h1"/><circle cx="17" cy="18" r="2"/>',
            orb: '<circle cx="12" cy="12" r="7.5"/><path d="M8.8 9.6a4 4 0 0 1 3.2-1.9"/>',
            message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M7 8.5h10"/><path d="M7 12.5h6"/>',
            qr: '<rect x="3" y="13.5" width="18" height="7" rx="2"/><rect x="3" y="4" width="8" height="6" rx="2"/><rect x="13" y="4" width="8" height="6" rx="2"/>',
            clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
            eraser: '<path d="m7 21-4.3-4.3a2.4 2.4 0 0 1 0-3.4l9.6-9.6a2.4 2.4 0 0 1 3.4 0l5.6 5.6a2.4 2.4 0 0 1 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>',
            moon: '<path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.6 6.6 0 0 0 10.7 10.7Z"/>',
            gauge: '<path d="M4.2 17.5a8.5 8.5 0 1 1 15.6 0"/><path d="m12 13.5 3.6-3.6"/><circle cx="12" cy="13.5" r="1.3"/>',
            sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2"/><path d="M12 19.5v2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="M2.5 12h2"/><path d="M19.5 12h2"/><path d="m4.9 19.1 1.4-1.4"/><path d="m17.7 6.3 1.4-1.4"/>',
            paw: '<ellipse cx="5.6" cy="10.2" rx="2" ry="2.5"/><ellipse cx="9.6" cy="5.9" rx="2" ry="2.6"/><ellipse cx="14.4" cy="5.9" rx="2" ry="2.6"/><ellipse cx="18.4" cy="10.2" rx="2" ry="2.5"/><path d="M12 11.4c-2.8 0-5.4 3.2-5.4 5.7 0 1.6 1.2 2.5 2.7 2.5 1 0 1.7-.5 2.7-.5s1.7.5 2.7.5c1.5 0 2.7-.9 2.7-2.5 0-2.5-2.6-5.7-5.4-5.7z"/>',
          };

          function svg(name, size = 16) {
            const filled = name === 'paw';
            return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="${filled ? 'none' : 'currentColor'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
          }

          function avatarParts() {
            const img = D.createElement('img');
            img.alt = '';
            img.draggable = false;
            img.decoding = 'async';
            img.referrerPolicy = 'no-referrer';
            img.addEventListener('error', () => { img.dataset.failed = '1'; }, { once: true });
            img.src = AVATAR_URL;
            return [img, h('span', { class: 'ava-miss', 'aria-hidden': 'true', text: '喵' })];
          }

          const animTimers = new WeakMap();
          function restartAnimation(el, className, ms = 700) {
            if (!el) return;
            el.classList.remove(className);
            void el.offsetWidth;
            el.classList.add(className);
            clearTimer(animTimers.get(el));
            animTimers.set(el, timeout(() => el.classList.remove(className), ms));
          }

          function animate(el, frames, duration, easing = 'cubic-bezier(0.16, 1, 0.3, 1)') {
            if (!el || reducedMotion() || typeof el.animate !== 'function') return null;
            try { return el.animate(frames, { duration, easing }); } catch (error) { return null; }
          }

          const setChecked = (el, on) => el.setAttribute('aria-checked', String(!!on));
          const preview = text => {
            const flat = String(text).replace(/\s+/g, ' ').trim();
            return flat.length > 18 ? `${flat.slice(0, 18)}…` : flat;
          };
          const headerName = name => name.replace(/^[\s━─—–=＝~～·•*★☆✦✧◆◇■□▪▫#>_|【\[《<-]+|[\s━─—–=＝~～·•*★☆✦✧◆◇■□▪▫#<_|】\]》>-]+$/g, '') || name;

          // Keys typed into our inputs must not reach SillyTavern's document-level hotkeys.
          function shieldKeys(host) {
            const stop = event => {
              const target = event.composedPath()[0];
              if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) event.stopPropagation();
            };
            for (const type of ['keydown', 'keyup', 'keypress']) host.addEventListener(type, stop);
          }

          // ── Styles ───────────────────────────────────────────────────

          const GLOBAL_CSS = `
@font-face { font-family: 'CutieFont'; src: url('${FONT_URL}') format('truetype'); font-display: swap; }
.catgod-qr-btn { display: inline-flex !important; align-items: center; justify-content: center; gap: 5px; }
.catgod-qr-btn > img { width: 18px; height: 18px; flex: none; border-radius: 50%; object-fit: cover; background: #ffe4ed; box-shadow: 0 0 0 1.5px rgba(246, 184, 203, 0.95); }
.catgod-qr-btn > img[data-failed] { display: none; }
.catgod-qr-btn > .catgod-qr-mark { width: 6px; height: 6px; flex: none; display: none; border-radius: 50%; background: #cf7895; }
.catgod-qr-btn[data-deep="1"] > .catgod-qr-mark { display: block; }
.catgod-qr-btn.catgod-is-open { box-shadow: inset 0 0 0 1px #cf7895; }
#${QR_FALLBACK_ID} { width: 100%; order: 1; display: flex; justify-content: center; gap: 5px; padding: 4px 0 0; }
#send_form.catgod-chat-mode { box-shadow: inset 0 0 0 1px rgba(207, 120, 149, 0.6); }
`;

          const CSS_TEXT = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
.root {
  --milk: #fffafd; --petal: #ffe4ed; --blush: #f6b8cb; --rose: #cf7895; --berry: #835064; --ink: #603f4d;
  --muted: #9e7585; --faint: #c4a5b2;
  --line: rgba(184, 111, 139, 0.2); --line-2: rgba(184, 111, 139, 0.34);
  --wash: rgba(255, 255, 255, 0.62); --tint: rgba(246, 184, 203, 0.24);
  --berry-grad: linear-gradient(140deg, var(--rose), var(--berry));
  --shadow: 0 12px 32px rgba(128, 66, 88, 0.16);
  --shadow-lg: 0 28px 64px -18px rgba(104, 48, 70, 0.38), 0 10px 24px -10px rgba(128, 66, 88, 0.2);
  --ease: cubic-bezier(0.16, 1, 0.3, 1);
  --spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --font: 'Microsoft YaHei UI', 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans SC', system-ui, sans-serif;
  --cute: 'CutieFont', 'Microsoft YaHei UI', 'PingFang SC', sans-serif;
  color: var(--ink);
  font: 13px/1.45 var(--font);
  letter-spacing: 0.01em;
  text-align: left;
  -webkit-font-smoothing: antialiased;
  -webkit-tap-highlight-color: transparent;
}
button, input, textarea { margin: 0; font: inherit; color: inherit; letter-spacing: inherit; }
button { -webkit-appearance: none; appearance: none; }
:focus-visible { outline: 2px solid var(--rose); outline-offset: 2px; }
svg { display: block; flex: none; }
img[data-failed] { display: none; }
.ava-miss { display: none; }
img[data-failed] + .ava-miss { width: 100%; height: 100%; display: grid; place-items: center; color: var(--berry); font-family: var(--cute); font-size: 17px; }

/* Floating ball */
.ball {
  position: fixed; left: 0; top: 0; width: 56px; height: 56px; padding: 0; border: 0; border-radius: 50%;
  background: transparent; cursor: grab; pointer-events: auto; touch-action: none;
  user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
  transition: translate 0.5s var(--ease), opacity 0.35s ease;
  will-change: transform;
}
.ball.is-snapping { transition: transform 0.5s var(--spring), translate 0.5s var(--ease), opacity 0.35s ease; }
.ball.is-dragging { cursor: grabbing; }
.ball.is-resting { translate: 18px 0; opacity: 0.8; }
.ball[data-side="left"].is-resting { translate: -18px 0; }
.ball-face {
  position: absolute; inset: 0; overflow: hidden; border-radius: 50%;
  background: radial-gradient(circle at 50% 42%, #fff 0 32%, var(--petal) 72%, var(--blush) 100%);
  box-shadow: 0 0 0 2px #fff, 0 0 0 3.5px rgba(207, 120, 149, 0.5), 0 12px 26px -8px rgba(110, 52, 74, 0.5);
  transition: transform 0.35s var(--spring), box-shadow 0.25s ease;
}
.ball-face img { width: 100%; height: 100%; display: block; object-fit: cover; transform: scale(1.08); pointer-events: none; -webkit-user-drag: none; }
.ball:hover .ball-face { transform: scale(1.05); }
.ball:active .ball-face, .ball.is-dragging .ball-face { transform: scale(1.08); box-shadow: 0 0 0 2px #fff, 0 0 0 3.5px var(--rose), 0 18px 34px -8px rgba(110, 52, 74, 0.55); }
.ball.is-open .ball-face { box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--berry), 0 12px 26px -8px rgba(110, 52, 74, 0.5); }
.ball-badge {
  position: absolute; right: -3px; bottom: -3px; width: 22px; height: 22px; display: grid; place-items: center;
  border-radius: 50%; color: #fff; background: var(--berry-grad); box-shadow: 0 0 0 2px #fff, 0 3px 8px rgba(110, 52, 74, 0.35);
}
.ball-badge.is-flip { animation: badge-flip 0.5s var(--spring); }
@keyframes badge-flip { from { transform: scale(0.4) rotate(-90deg); } }
.ball-spark, .ball-note { position: absolute; display: grid; place-items: center; border-radius: 50%; opacity: 0; transform: scale(0.4); transition: opacity 0.2s ease, transform 0.35s var(--spring); }
.ball-spark { top: -3px; right: 0; width: 17px; height: 17px; color: var(--rose); background: #fff; box-shadow: 0 2px 6px rgba(110, 52, 74, 0.28); }
.ball-note { top: 1px; left: 2px; width: 10px; height: 10px; background: var(--rose); box-shadow: 0 0 0 2px #fff; }
.ball[data-deep="1"] .ball-spark, .ball[data-note="1"] .ball-note { opacity: 1; transform: none; }
.ball-tip {
  position: absolute; top: 50%; right: calc(100% + 12px); padding: 5px 11px;
  border: 1px solid rgba(255, 255, 255, 0.95); border-radius: 999px; background: rgba(255, 250, 253, 0.97);
  box-shadow: 0 8px 20px -8px rgba(110, 52, 74, 0.4); color: var(--berry); font-size: 11.5px; font-weight: 700; white-space: nowrap;
  opacity: 0; pointer-events: none; transform: translate(6px, -50%); transition: opacity 0.2s ease, transform 0.3s var(--ease);
}
.ball[data-side="left"] .ball-tip { right: auto; left: calc(100% + 12px); transform: translate(-6px, -50%); }
@media (hover: hover) {
  .ball:hover:not(.is-dragging):not(.is-open) .ball-tip { opacity: 1; transform: translate(0, -50%); }
}

/* Popover */
.scrim { position: fixed; inset: 0; min-height: 100vh; background: rgba(96, 63, 77, 0.24); opacity: 0; pointer-events: none; transition: opacity 0.28s ease; }
.scrim.is-on { opacity: 1; pointer-events: auto; }
.pop { position: fixed; left: 0; top: 0; width: 384px; pointer-events: auto; }
.pop:not(.is-open) { display: none; }
.pop.is-sheet { left: 0; right: 0; width: auto; max-width: 560px; margin: 0 auto; }

/* Panel */
.panel {
  position: relative; display: flex; flex-direction: column; max-height: var(--maxh, none); overflow: hidden; isolation: isolate; outline: none;
  border: 1px solid rgba(255, 255, 255, 0.92); border-radius: 22px;
  background:
    radial-gradient(circle at 12px 12px, rgba(211, 125, 155, 0.12) 1.2px, transparent 1.3px) 0 0 / 24px 24px,
    linear-gradient(150deg, #fffafd, #ffeaf2);
  box-shadow: var(--shadow-lg), inset 0 1px 0 #fff;
}
.panel::before { content: ''; position: absolute; top: 0; right: 30px; z-index: 2; width: 74px; height: 7px; border-radius: 0 0 8px 8px; background: linear-gradient(90deg, var(--blush), var(--rose)); opacity: 0.8; pointer-events: none; }
.is-sheet .panel { border-radius: 24px 24px 0 0; padding-bottom: env(safe-area-inset-bottom, 0px); }
.is-sheet .panel::after { content: ''; position: absolute; top: 7px; left: 50%; width: 38px; height: 4px; margin-left: -19px; border-radius: 999px; background: rgba(131, 80, 100, 0.22); }
.panel.is-inline { border: 0; border-radius: 0; background: none; box-shadow: none; }
.panel.is-inline::before, .panel.is-inline .ph { display: none; }

.ph { position: relative; display: grid; flex: none; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 18px 14px 12px 16px; }
.avatar {
  position: relative; width: 52px; height: 52px; overflow: hidden; isolation: isolate;
  border: 1px solid rgba(199, 116, 146, 0.35); border-radius: 48% 48% 45% 45%;
  background: radial-gradient(circle at 50% 44%, #fff 0 25%, #ffe4ed 74%, #f5b9cb 100%);
  box-shadow: 0 6px 14px rgba(165, 86, 114, 0.2), inset 0 1px 0 #fff;
}
.avatar img { width: 100%; height: 100%; display: block; object-fit: cover; transform: scale(1.1); }
.avatar.is-bounce { animation: ava-bounce 0.6s var(--spring); }
@keyframes ava-bounce { 35% { transform: scale(1.12) rotate(-6deg); } }
.eyebrow { color: var(--rose); font-size: 9px; font-weight: 800; letter-spacing: 0.16em; line-height: 1.2; text-transform: uppercase; }
.title { margin: 2px 0 3px; color: var(--berry); font-family: var(--cute); font-size: 24px; font-weight: 700; line-height: 1.05; letter-spacing: 0.03em; }
.sub { margin: 0; overflow: hidden; color: var(--muted); font-size: 11px; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
.sub-dot { display: inline-block; width: 6px; height: 6px; margin-right: 6px; border-radius: 50%; background: var(--rose); vertical-align: 1px; box-shadow: 0 0 0 3px rgba(207, 120, 149, 0.16); transition: background 0.3s ease, box-shadow 0.3s ease; }
.panel[data-mode="chat"] .sub-dot { background: #86b8a9; box-shadow: 0 0 0 3px rgba(134, 184, 169, 0.22); }

.icon-btn { width: 32px; height: 32px; display: grid; place-items: center; flex: none; padding: 0; border: 1px solid transparent; border-radius: 11px; background: transparent; color: var(--muted); cursor: pointer; transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease, transform 0.3s var(--spring); }
.icon-btn:hover { border-color: var(--line); background: rgba(255, 255, 255, 0.8); color: var(--berry); }
.icon-btn:active { transform: scale(0.92); }
.icon-btn.is-spin svg { animation: spin 0.6s var(--ease); }
@keyframes spin { to { transform: rotate(360deg); } }

.tabs { position: relative; display: grid; flex: none; grid-template-columns: 1fr 1fr; margin: 0 14px; padding: 3px; border: 1px solid var(--line); border-radius: 14px; background: var(--tint); }
.panel.is-inline .tabs { margin-top: 12px; }

.usage { position: relative; flex: none; margin: 0 14px 10px; padding: 8px 11px 10px; overflow: hidden; border: 1px solid var(--line); border-radius: 14px; background: var(--wash); }
.panel.is-inline .usage { margin-top: 12px; }
.panel.is-inline .usage + .tabs { margin-top: 0; }
.usage-head { min-width: 0; display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 10.5px; }
.usage-title { display: inline-flex; flex: none; align-items: center; gap: 5px; color: var(--rose); font-weight: 800; letter-spacing: 0.06em; }
.usage-state { display: inline-flex; flex: none; align-items: center; gap: 4px; padding: 0 7px; border-radius: 999px; background: var(--berry-grad); color: #fff; font-size: 9.5px; font-weight: 700; line-height: 16px; }
.usage[data-status="sending"] .usage-state::before, .usage[data-status="streaming"] .usage-state::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: #fff; animation: usage-pulse 1s ease-in-out infinite; }
@keyframes usage-pulse { 50% { opacity: 0.25; } }
.usage[data-status="stopped"] .usage-state, .usage[data-status="failed"] .usage-state { background: rgba(246, 184, 203, 0.32); color: var(--berry); }
.usage-when { min-width: 0; margin-left: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
.usage-nums { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 6px; }
.usage-num { min-width: 0; display: grid; align-content: start; }
.usage-num + .usage-num { padding-left: 9px; border-left: 1px dashed rgba(197, 123, 150, 0.3); }
.usage-num small { color: var(--muted); font-size: 10px; line-height: 1.3; }
.usage-num strong { overflow: hidden; color: var(--ink); font-size: 15px; font-weight: 700; line-height: 1.3; letter-spacing: 0; font-variant-numeric: tabular-nums; text-overflow: ellipsis; white-space: nowrap; }
.usage-num.is-total strong { color: var(--berry); }
.usage-num strong[data-prefix]::before { content: attr(data-prefix); margin-right: 1px; color: var(--muted); font-weight: 500; }
.usage-num em { overflow: hidden; color: var(--faint); font-size: 9.5px; font-style: normal; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
.usage[data-status="none"] .usage-num strong { color: var(--faint); }
.usage-bar { position: absolute; right: 0; bottom: 0; left: 0; height: 3px; background: rgba(246, 184, 203, 0.22); }
.usage-bar i { display: block; width: 0; height: 100%; border-radius: 0 3px 3px 0; background: linear-gradient(90deg, var(--blush), var(--rose)); transition: width 0.6s var(--ease); }
.usage-bar[data-level="high"] i { background: linear-gradient(90deg, #f3c08e, #e0925f); }
.usage-bar[data-level="full"] i { background: linear-gradient(90deg, #ec9a9a, #cc5966); }
.tab-glide { position: absolute; top: 3px; bottom: 3px; left: 3px; width: calc(50% - 3px); border-radius: 11px; background: #fff; box-shadow: 0 2px 8px rgba(128, 66, 88, 0.12), 0 0 0 1px rgba(207, 120, 149, 0.14); transition: transform 0.42s var(--spring); }
.tabs[data-tab="preset"] .tab-glide { transform: translateX(100%); }
.tab { position: relative; z-index: 1; height: 30px; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 0 8px; border: 0; border-radius: 11px; background: none; color: var(--muted); font-size: 12px; font-weight: 700; cursor: pointer; transition: color 0.2s ease; }
.tab:hover { color: var(--ink); }
.tab[aria-selected="true"] { color: var(--berry); }

.views { position: relative; flex: 1 1 auto; min-height: 0; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; padding: 12px 14px 14px; scrollbar-width: thin; scrollbar-color: rgba(207, 120, 149, 0.4) transparent; }
.views::-webkit-scrollbar { width: 6px; }
.views::-webkit-scrollbar-thumb { border-radius: 999px; background: rgba(207, 120, 149, 0.35); }
.panel.is-inline .views { max-height: 460px; }
.view { display: grid; gap: 10px; }
.view.is-entering { animation: view-in 0.34s var(--ease) both; }
@keyframes view-in { from { opacity: 0; transform: translateX(var(--dx, 10px)); } }

.label { display: flex; align-items: center; gap: 8px; margin: 2px 2px -3px; color: var(--rose); font-size: 10px; font-weight: 800; letter-spacing: 0.14em; }
.label::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, rgba(207, 120, 149, 0.3), transparent); }

.mode { position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 5px; border: 1px solid var(--line); border-radius: 18px; background: var(--wash); }
.mode-glide { position: absolute; top: 5px; bottom: 5px; left: 5px; width: calc(50% - 8px); border-radius: 14px; background: linear-gradient(145deg, #fff, var(--petal)); box-shadow: 0 8px 18px -8px rgba(131, 80, 100, 0.45), inset 0 0 0 1px rgba(207, 120, 149, 0.32); transition: transform 0.48s var(--spring); }
.mode[data-mode="chat"] .mode-glide { transform: translateX(calc(100% + 6px)); }
.mode-opt { position: relative; z-index: 1; min-width: 0; min-height: 58px; display: flex; align-items: center; gap: 9px; padding: 8px 9px; border: 0; border-radius: 14px; background: none; color: var(--muted); text-align: left; cursor: pointer; transition: transform 0.3s var(--spring); }
.mode-opt:active { transform: scale(0.97); }
.mode-ico { width: 34px; height: 34px; display: grid; flex: none; place-items: center; border-radius: 12px; color: var(--rose); background: rgba(246, 184, 203, 0.3); transition: color 0.3s ease, background 0.3s ease, box-shadow 0.3s ease, transform 0.5s var(--spring); }
.mode-opt[aria-checked="true"] .mode-ico { color: #fff; background: var(--berry-grad); box-shadow: 0 6px 12px -4px rgba(131, 80, 100, 0.55); transform: rotate(-6deg); }
.mode-txt { min-width: 0; display: grid; gap: 1px; }
.mode-txt strong { color: var(--ink); font-size: 13px; font-weight: 700; white-space: nowrap; transition: color 0.2s ease; }
.mode-txt small { overflow: hidden; color: var(--muted); font-size: 10.5px; text-overflow: ellipsis; white-space: nowrap; }
.mode-opt[aria-checked="true"] .mode-txt strong { color: var(--berry); }

.card { border: 1px solid var(--line); border-radius: 16px; background: var(--wash); }
.opt { width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 0; border-radius: 15px; background: none; color: inherit; text-align: left; }
button.opt { cursor: pointer; transition: background 0.18s ease; }
button.opt:hover { background: rgba(255, 255, 255, 0.55); }
.opt-ico { width: 30px; height: 30px; display: grid; flex: none; place-items: center; border-radius: 10px; color: var(--rose); background: rgba(246, 184, 203, 0.26); transition: color 0.25s ease, background 0.25s ease, box-shadow 0.25s ease; }
[aria-checked="true"] > .opt-ico { color: #fff; background: var(--berry-grad); box-shadow: 0 5px 10px -5px rgba(131, 80, 100, 0.6); }
.opt-txt { min-width: 0; flex: 1; display: grid; gap: 1px; }
.opt-txt strong { color: var(--ink); font-size: 12.5px; font-weight: 700; }
.opt-txt small { color: var(--muted); font-size: 10.5px; line-height: 1.35; }
.opt.is-dim .opt-ico, .opt.is-dim .opt-txt { opacity: 0.72; }

.sw-vis { position: relative; flex: none; width: 34px; height: 20px; border: 1px solid rgba(174, 124, 143, 0.3); border-radius: 999px; background: #eadde2; transition: background 0.22s ease, border-color 0.22s ease; }
.sw-vis::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 2px 5px rgba(99, 57, 72, 0.22); transition: transform 0.36s var(--spring); }
[aria-checked="true"] > .sw-vis { border-color: transparent; background: var(--berry-grad); }
[aria-checked="true"] > .sw-vis::after { transform: translateX(14px); }
.sw-vis.sm { width: 28px; height: 16px; }
.sw-vis.sm::after { width: 10px; height: 10px; }
[aria-checked="true"] > .sw-vis.sm::after { transform: translateX(12px); }

.note { padding: 11px 12px 10px; }
.note-head { display: flex; align-items: center; gap: 10px; }
.note-pill { flex: none; padding: 2px 8px; border-radius: 999px; background: rgba(246, 184, 203, 0.3); color: var(--muted); font-size: 10px; font-weight: 700; white-space: nowrap; transition: background 0.25s ease, color 0.25s ease; }
.note[data-filled="true"] .note-pill { background: var(--berry); color: #fff; }
.note-pill.is-stamp { animation: stamp 0.45s var(--spring); }
@keyframes stamp { from { opacity: 0.4; transform: scale(1.35) rotate(-8deg); } }
.note-input {
  display: block; width: 100%; min-height: 66px; max-height: 168px; margin: 9px 0 0; padding: 7px 11px;
  overflow-y: auto; resize: none; outline: none; border: 1px dashed rgba(197, 123, 150, 0.5); border-radius: 12px;
  color: var(--ink); font-size: 12.5px; line-height: 22px;
  background-color: rgba(255, 252, 254, 0.92);
  background-image: repeating-linear-gradient(to bottom, transparent 0 21px, rgba(207, 120, 149, 0.15) 21px 22px);
  background-position: 0 7px;
  background-attachment: local;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.note-input::placeholder { color: var(--faint); }
.note-input:focus { border-style: solid; border-color: var(--rose); box-shadow: 0 0 0 3px rgba(207, 120, 149, 0.16); }
.note-foot { display: flex; align-items: center; gap: 8px; margin-top: 8px; color: var(--muted); font-size: 10.5px; }
.note-auto { display: inline-flex; align-items: center; gap: 6px; padding: 2px 0; border: 0; background: none; color: var(--muted); font-size: 10.5px; cursor: pointer; }
.note-auto:hover { color: var(--berry); }
.note-count { margin-left: auto; font-variant-numeric: tabular-nums; }
.text-btn { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 8px; border: 1px solid var(--line); border-radius: 8px; background: rgba(255, 255, 255, 0.7); color: var(--muted); font-size: 10.5px; cursor: pointer; transition: color 0.18s ease, border-color 0.18s ease, background 0.18s ease; }
.text-btn:hover:not(:disabled) { border-color: var(--line-2); background: #fff; color: var(--berry); }
.text-btn:disabled { opacity: 0.45; cursor: default; }
.hist { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 9px; padding-top: 9px; border-top: 1px dashed rgba(197, 123, 150, 0.26); }
.hist-label { display: inline-flex; align-items: center; gap: 4px; color: var(--faint); font-size: 10px; font-weight: 700; }
.hist-chip { max-width: 100%; overflow: hidden; padding: 3px 9px; border: 1px dashed rgba(197, 123, 150, 0.45); border-radius: 999px; background: rgba(255, 255, 255, 0.7); color: var(--ink); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; transition: color 0.18s ease, border-color 0.18s ease, transform 0.3s var(--spring); }
.hist-chip:hover { border-style: solid; border-color: var(--rose); color: var(--berry); }
.hist-chip:active { transform: scale(0.95); }
.hist-clear { margin-left: auto; padding: 0 2px; border: 0; background: none; color: var(--faint); font-size: 10px; cursor: pointer; }
.hist-clear:hover { color: var(--berry); }

.pv-tools {
  position: sticky; top: -12px; z-index: 3; display: grid; gap: 10px; margin: -12px -14px 0; padding: 12px 14px 10px;
  background: rgba(255, 244, 248, 0.9); box-shadow: 0 1px 0 rgba(207, 120, 149, 0.12);
  -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
}
.panel.is-inline .pv-tools { background: rgba(255, 244, 248, 0.94); }
.pv-top { display: flex; align-items: center; gap: 8px; }
.pv-id { min-width: 0; flex: 1; display: grid; gap: 1px; }
.pv-name { overflow: hidden; color: var(--berry); font-size: 13px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.pv-meta { color: var(--muted); font-size: 10.5px; }
.pv-warn { margin: 0; padding: 8px 10px; border-radius: 12px; background: rgba(246, 184, 203, 0.24); color: var(--berry); font-size: 11px; line-height: 1.5; }
.seg { position: relative; display: grid; grid-auto-columns: 1fr; grid-auto-flow: column; gap: 2px; padding: 3px; border: 1px solid var(--line); border-radius: 12px; background: var(--tint); }
.seg > button { min-width: 0; height: 28px; display: flex; align-items: center; justify-content: center; gap: 5px; padding: 0 6px; border: 0; border-radius: 9px; background: none; color: var(--muted); font-size: 11.5px; font-weight: 700; white-space: nowrap; cursor: pointer; transition: background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease; }
.seg > button:hover { color: var(--ink); }
.seg > button[aria-pressed="true"] { background: #fff; color: var(--berry); box-shadow: 0 1px 4px rgba(128, 66, 88, 0.14), 0 0 0 1px rgba(207, 120, 149, 0.16); }
.seg em { color: var(--rose); font-size: 10px; font-style: normal; opacity: 0.85; }
.search { position: relative; display: block; }
.search-ico { position: absolute; top: 50%; left: 10px; color: var(--faint); transform: translateY(-50%); pointer-events: none; }
.search-input { width: 100%; height: 32px; padding: 0 10px 0 30px; border: 1px solid var(--line); border-radius: 11px; outline: none; background: rgba(255, 255, 255, 0.75); color: var(--ink); font-size: 12px; -webkit-appearance: none; appearance: none; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
.search-input::placeholder { color: var(--faint); }
.search-input::-webkit-search-cancel-button { -webkit-appearance: none; }
.search-input:focus { border-color: var(--rose); box-shadow: 0 0 0 3px rgba(207, 120, 149, 0.14); }
.pv-body { display: grid; gap: 8px; }

.pg { overflow: hidden; border: 1px solid var(--line); border-radius: 16px; background: var(--wash); }
.pg-head { width: 100%; display: flex; align-items: center; gap: 7px; padding: 9px 10px 9px 12px; border: 0; background: none; color: var(--ink); text-align: left; cursor: pointer; }
.pg-name { min-width: 0; overflow: hidden; font-size: 12.5px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.pg-kind { flex: none; padding: 0 5px; border: 1px solid rgba(207, 120, 149, 0.38); border-radius: 6px; color: var(--rose); font-size: 9.5px; line-height: 15px; }
.pg-count { flex: none; padding: 1px 7px; border-radius: 999px; background: rgba(246, 184, 203, 0.28); color: var(--muted); font-size: 10px; font-variant-numeric: tabular-nums; }
.pg-chev { margin-left: auto; color: var(--faint); transition: transform 0.35s var(--ease); }
.pg.is-collapsed .pg-chev { transform: rotate(-90deg); }
.pg-body { display: grid; grid-template-rows: 1fr; transition: grid-template-rows 0.36s var(--ease); }
.pg.is-collapsed .pg-body { grid-template-rows: 0fr; }
.pg-inner { min-height: 0; overflow: hidden; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 10px 11px 12px; }
.chip { max-width: 100%; min-height: 28px; display: inline-flex; align-items: center; gap: 5px; padding: 4px 11px; border: 1px solid var(--line-2); border-radius: 999px; background: rgba(255, 255, 255, 0.85); color: var(--ink); font-size: 12px; line-height: 1.25; cursor: pointer; transition: background 0.22s ease, color 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease, transform 0.3s var(--spring); }
.chip:hover:not(:disabled) { border-color: var(--rose); }
.chip:active:not(:disabled) { transform: scale(0.94); }
.chip:disabled { cursor: not-allowed; opacity: 0.5; }
.chip[aria-pressed="true"] { border-color: transparent; background: var(--berry-grad); color: #fff; box-shadow: 0 5px 12px -6px rgba(131, 80, 100, 0.6); }
.chip-paw { display: none; }
.chip[aria-pressed="true"] .chip-paw { display: block; }
.chip.is-pop .chip-paw { animation: paw-pop 0.45s var(--spring); }
@keyframes paw-pop { from { transform: scale(0) rotate(-30deg); } }
.chip-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.list { display: grid; gap: 2px; }
.sep { display: flex; align-items: center; gap: 8px; padding: 10px 4px 4px; color: var(--rose); font-size: 10.5px; font-weight: 800; letter-spacing: 0.06em; }
.sep:first-child { padding-top: 2px; }
.sep::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, rgba(207, 120, 149, 0.32), transparent); }
.row { width: 100%; min-height: 38px; display: flex; align-items: center; gap: 8px; padding: 6px 8px 6px 10px; border: 1px solid transparent; border-radius: 12px; background: none; color: var(--ink); text-align: left; cursor: pointer; transition: background 0.16s ease, border-color 0.16s ease; }
.row:hover:not(:disabled) { border-color: var(--line); background: rgba(255, 255, 255, 0.78); }
.row:disabled { cursor: not-allowed; opacity: 0.55; }
.row-name { min-width: 0; flex: 1; overflow: hidden; font-size: 12.5px; text-overflow: ellipsis; white-space: nowrap; transition: color 0.2s ease; }
.row[aria-checked="false"] .row-name { color: var(--muted); }
.row-tags { display: flex; flex: none; gap: 4px; }
.tag { padding: 0 6px; border-radius: 6px; background: rgba(246, 184, 203, 0.24); color: var(--muted); font-size: 9.5px; line-height: 16px; white-space: nowrap; }
.tag.is-menu { background: rgba(207, 120, 149, 0.16); color: var(--rose); }

.empty { display: grid; justify-items: center; gap: 6px; padding: 22px 14px; border: 1px dashed rgba(197, 123, 150, 0.4); border-radius: 16px; background: rgba(255, 255, 255, 0.45); text-align: center; }
.empty-ico { width: 40px; height: 40px; display: grid; place-items: center; border-radius: 50%; background: rgba(246, 184, 203, 0.3); color: var(--rose); }
.empty strong { color: var(--berry); font-size: 12.5px; }
.empty p { margin: 0; color: var(--muted); font-size: 11px; line-height: 1.55; }
.empty code { padding: 2px 6px; border-radius: 6px; background: rgba(255, 255, 255, 0.92); color: var(--berry); font: 10.5px/1.6 ui-monospace, Consolas, monospace; word-break: break-all; }
.empty .text-btn { margin-top: 4px; }

.pf { display: flex; flex: none; align-items: center; gap: 10px; padding: 10px 14px 12px; border-top: 1px dashed rgba(197, 123, 150, 0.32); background: rgba(255, 255, 255, 0.38); }
.panel.is-inline .pf { background: rgba(255, 255, 255, 0.24); }
.pf-label { color: var(--muted); font-size: 10.5px; font-weight: 700; white-space: nowrap; }
.pf .seg { flex: 1; }

/* Inline bar in the last message */
.inline {
  position: relative; max-width: 680px; overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.92); border-radius: 18px;
  background:
    radial-gradient(circle at 12px 12px, rgba(211, 125, 155, 0.11) 1.2px, transparent 1.3px) 0 0 / 24px 24px,
    linear-gradient(150deg, #fffafd, #ffeaf2);
  box-shadow: 0 10px 26px -12px rgba(128, 66, 88, 0.32), inset 0 1px 0 #fff;
}
.ib-bar { width: 100%; min-height: 44px; display: flex; align-items: center; gap: 9px; padding: 7px 12px 7px 8px; border: 0; background: none; color: var(--ink); text-align: left; cursor: pointer; }
.ib-ava { position: relative; width: 30px; height: 30px; flex: none; overflow: hidden; border: 1px solid rgba(199, 116, 146, 0.35); border-radius: 50%; background: radial-gradient(circle at 50% 44%, #fff 0 25%, #ffe4ed 74%, #f5b9cb 100%); }
.ib-ava img { width: 100%; height: 100%; display: block; object-fit: cover; transform: scale(1.1); }
.ib-title { flex: none; color: var(--berry); font-family: var(--cute); font-size: 16px; line-height: 1; }
.ib-chips { min-width: 0; flex: 1; display: flex; gap: 5px; overflow: hidden; }
.ib-chip { flex: none; display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px 2px 6px; border: 1px solid var(--line); border-radius: 999px; background: rgba(255, 255, 255, 0.78); color: var(--berry); font-size: 10.5px; font-weight: 700; line-height: 16px; white-space: nowrap; }
.ib-chip.is-mode { border-color: transparent; background: var(--berry-grad); color: #fff; }
.ib-chip.is-new { animation: chip-in 0.35s var(--spring) both; }
@keyframes chip-in { from { opacity: 0; transform: scale(0.7); } }
.ib-chev { flex: none; color: var(--muted); transition: transform 0.4s var(--ease); }
.inline.is-open .ib-chev { transform: rotate(180deg); }
.ib-body { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.42s var(--ease); }
.inline.is-open .ib-body { grid-template-rows: 1fr; }
.ib-inner { min-height: 0; overflow: hidden; }
.inline.is-open .ib-inner { border-top: 1px dashed rgba(197, 123, 150, 0.3); }

/* Toast */
.toast {
  position: fixed; top: 14px; left: 50%; max-width: calc(100vw - 32px); display: flex; align-items: center; gap: 8px; padding: 6px 14px 6px 6px;
  border: 1px solid rgba(255, 255, 255, 0.95); border-radius: 999px; background: rgba(255, 250, 253, 0.97); box-shadow: var(--shadow);
  color: var(--ink); font-size: 12.5px; opacity: 0; pointer-events: none;
  transform: translate(-50%, -14px) scale(0.96); transition: opacity 0.25s ease, transform 0.45s var(--spring);
}
.toast.is-on { opacity: 1; transform: translate(-50%, 0); }
.toast-ava { width: 26px; height: 26px; flex: none; overflow: hidden; border-radius: 50%; background: var(--petal); }
.toast-ava img { width: 100%; height: 100%; display: block; object-fit: cover; }
.toast-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.theme-btn svg { transition: transform 0.5s var(--spring); }
.theme-btn.is-flip svg { animation: theme-flip 0.5s var(--spring); }
@keyframes theme-flip { from { opacity: 0; transform: rotate(-90deg) scale(0.5); } }
.root.is-theming, .root.is-theming * {
  transition: background-color 0.4s ease, border-color 0.4s ease, color 0.4s ease, box-shadow 0.4s ease !important;
}

/* Dark theme: night berry. Light values above stay untouched; everything here only overrides. */
.root[data-theme="dark"] {
  color-scheme: dark;
  --rose: #e48eab; --berry: #f2b8cb; --ink: #f0dfe6; --muted: #b897a5; --faint: #7d6470;
  --line: rgba(240, 170, 196, 0.14); --line-2: rgba(240, 170, 196, 0.26);
  --wash: rgba(255, 255, 255, 0.035); --tint: rgba(240, 170, 196, 0.08);
  --berry-grad: linear-gradient(140deg, #d27392, #8b4964);
  --shadow: 0 12px 32px rgba(0, 0, 0, 0.42);
  --shadow-lg: 0 28px 64px -18px rgba(0, 0, 0, 0.72), 0 10px 24px -10px rgba(0, 0, 0, 0.45);
  --raised: #43303a; --field: rgba(0, 0, 0, 0.2); --hover: rgba(255, 255, 255, 0.05); --soft: rgba(240, 170, 196, 0.1);
}
.root[data-theme="dark"] .panel:not(.is-inline), .root[data-theme="dark"].inline {
  border-color: rgba(255, 255, 255, 0.07);
  background:
    radial-gradient(circle at 12px 12px, rgba(240, 170, 196, 0.07) 1.2px, transparent 1.3px) 0 0 / 24px 24px,
    linear-gradient(150deg, #2a1e25, #1f161b);
  box-shadow: var(--shadow-lg), inset 0 1px 0 rgba(255, 255, 255, 0.05);
}
.root[data-theme="dark"].inline { box-shadow: 0 10px 26px -12px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.05); }
.root[data-theme="dark"] .is-sheet .panel::after { background: rgba(255, 255, 255, 0.16); }
.root[data-theme="dark"] .avatar, .root[data-theme="dark"] .ib-ava { border-color: rgba(240, 170, 196, 0.24); box-shadow: 0 6px 14px rgba(0, 0, 0, 0.35); }
.root[data-theme="dark"] .icon-btn:hover, .root[data-theme="dark"] button.opt:hover, .root[data-theme="dark"] .row:hover:not(:disabled) { background: var(--hover); }
.root[data-theme="dark"] .tab-glide, .root[data-theme="dark"] .seg > button[aria-pressed="true"] { background: var(--raised); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(240, 170, 196, 0.12); }
.root[data-theme="dark"] .mode-glide { background: linear-gradient(145deg, #3d2b35, #32232b); box-shadow: 0 8px 18px -8px rgba(0, 0, 0, 0.6), inset 0 0 0 1px rgba(240, 170, 196, 0.22); }
.root[data-theme="dark"] .mode-ico, .root[data-theme="dark"] .opt-ico, .root[data-theme="dark"] .note-pill,
.root[data-theme="dark"] .pg-count, .root[data-theme="dark"] .tag, .root[data-theme="dark"] .empty-ico, .root[data-theme="dark"] .pv-warn { background: var(--soft); }
.root[data-theme="dark"] .mode-opt[aria-checked="true"] .mode-ico, .root[data-theme="dark"] [aria-checked="true"] > .opt-ico { background: var(--berry-grad); }
.root[data-theme="dark"] .tag.is-menu { background: rgba(228, 142, 171, 0.16); }
.root[data-theme="dark"] .sw-vis { border-color: rgba(240, 170, 196, 0.18); background: #4a3741; }
.root[data-theme="dark"] .sw-vis::after { background: #f3e4ea; }
.root[data-theme="dark"] [aria-checked="true"] > .sw-vis { background: var(--berry-grad); }
.root[data-theme="dark"] .note[data-filled="true"] .note-pill { background: #b8607f; color: #fff; }
.root[data-theme="dark"] .note-input { border-color: rgba(240, 170, 196, 0.3); background-color: var(--field); background-image: repeating-linear-gradient(to bottom, transparent 0 21px, rgba(240, 170, 196, 0.1) 21px 22px); }
.root[data-theme="dark"] .note-input:focus { border-color: var(--rose); }
.root[data-theme="dark"] .text-btn, .root[data-theme="dark"] .hist-chip, .root[data-theme="dark"] .search-input { background: var(--field); }
.root[data-theme="dark"] .hist-chip { border-color: rgba(240, 170, 196, 0.3); }
.root[data-theme="dark"] .hist-chip:hover { border-color: var(--rose); }
.root[data-theme="dark"] .text-btn:hover:not(:disabled) { background: var(--raised); }
.root[data-theme="dark"] .pv-tools { background: rgba(38, 27, 33, 0.92); box-shadow: 0 1px 0 rgba(240, 170, 196, 0.1); }
.root[data-theme="dark"] .chip, .root[data-theme="dark"] .ib-chip:not(.is-mode) { background: rgba(255, 255, 255, 0.05); }
.root[data-theme="dark"] .chip[aria-pressed="true"] { background: var(--berry-grad); box-shadow: 0 5px 12px -6px rgba(0, 0, 0, 0.6); }
.root[data-theme="dark"] .empty { border-color: rgba(240, 170, 196, 0.22); background: rgba(255, 255, 255, 0.03); }
.root[data-theme="dark"] .empty code { background: rgba(0, 0, 0, 0.3); }
.root[data-theme="dark"] .usage-num + .usage-num { border-left-color: rgba(240, 170, 196, 0.16); }
.root[data-theme="dark"] .usage-bar { background: rgba(240, 170, 196, 0.1); }
.root[data-theme="dark"] .usage[data-status="stopped"] .usage-state, .root[data-theme="dark"] .usage[data-status="failed"] .usage-state { background: var(--soft); color: var(--berry); }
.root[data-theme="dark"] .pf, .root[data-theme="dark"] .panel.is-inline .pf { border-top-color: rgba(240, 170, 196, 0.16); background: rgba(0, 0, 0, 0.14); }
.root[data-theme="dark"] .toast, .root[data-theme="dark"] .ball-tip { border-color: rgba(255, 255, 255, 0.08); background: rgba(43, 31, 38, 0.97); box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5); }
.root[data-theme="dark"] .toast-ava { background: #4a2f3c; }
.root[data-theme="dark"] .scrim { background: rgba(0, 0, 0, 0.45); }
.root[data-theme="dark"] .ball-face { box-shadow: 0 0 0 2px #2b1f26, 0 0 0 3.5px rgba(228, 142, 171, 0.6), 0 12px 26px -8px rgba(0, 0, 0, 0.6); }
.root[data-theme="dark"] .ball.is-open .ball-face { box-shadow: 0 0 0 2px #2b1f26, 0 0 0 4px var(--rose), 0 12px 26px -8px rgba(0, 0, 0, 0.6); }
.root[data-theme="dark"] .ball-badge { box-shadow: 0 0 0 2px #2b1f26, 0 3px 8px rgba(0, 0, 0, 0.45); }
.root[data-theme="dark"] .ball-spark { background: #2b1f26; }
.root[data-theme="dark"] .ball-note { box-shadow: 0 0 0 2px #2b1f26; }

@media (max-width: 600px) {
  .ball { width: 50px; height: 50px; }
  .ball-tip { display: none; }
}
@media (max-height: 540px) {
  .ph { gap: 10px; padding: 12px 12px 8px 14px; }
  .avatar { width: 34px; height: 34px; }
  .eyebrow, .sub { display: none; }
  .title { margin: 0; font-size: 19px; }
  .pf { padding: 6px 14px 8px; }
  .usage { margin-bottom: 8px; padding: 6px 10px 8px; }
  .usage-num em { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
}
`;

          let sheet = null;
          function adoptStyles(root) {
            try {
              if (!sheet) {
                sheet = new W.CSSStyleSheet();
                sheet.replaceSync(CSS_TEXT);
              }
              root.adoptedStyleSheets = [sheet];
            } catch (error) {
              root.append(h('style', { text: CSS_TEXT }));
            }
          }

          function injectGlobalStyle() {
            let el = D.getElementById(GLOBAL_STYLE_ID);
            if (!el) {
              el = D.createElement('style');
              el.id = GLOBAL_STYLE_ID;
              (D.head || D.documentElement).append(el);
            }
            el.textContent = GLOBAL_CSS;
          }

          // ── Panel ────────────────────────────────────────────────────

          let v = null;
          let presetSig = '';
          let presetQuery = '';
          let historyKey = null;

          function buildView() {
            v = {};
            v.panel = h('section', { class: 'panel', tabindex: '-1', 'aria-label': '小猫之神控制台' });
            v.avatar = h('div', { class: 'avatar' }, avatarParts());
            v.sub = h('p', { class: 'sub' });
            v.close = h('button', { class: 'icon-btn', type: 'button', title: '收起', 'aria-label': '收起控制台', html: svg('close', 16), onclick: () => closePopover() });
            const header = h('header', { class: 'ph' },
              v.avatar,
              h('div', { class: 'ph-text' },
                h('div', { class: 'eyebrow', text: 'Cat Oracle · SoliUmbra' }),
                h('h2', { class: 'title', text: '小猫之神' }),
                v.sub),
              v.close);

            v.tabBtns = {
              status: h('button', { class: 'tab', type: 'button', role: 'tab', onclick: () => switchTab('status') }, h('span', { html: svg('paw', 13) }), '猫神状态'),
              preset: h('button', { class: 'tab', type: 'button', role: 'tab', onclick: () => switchTab('preset') }, h('span', { html: svg('sliders', 14) }), '预设开关'),
            };
            v.tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': '控制台分区' },
              h('span', { class: 'tab-glide', 'aria-hidden': 'true' }), v.tabBtns.status, v.tabBtns.preset);
            v.tabs.addEventListener('keydown', event => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault();
              const next = ui.tab === 'status' ? 'preset' : 'status';
              switchTab(next);
              v.tabBtns[next].focus();
            });

            v.statusView = buildStatusView();
            v.presetView = buildPresetView();
            v.views = h('div', { class: 'views' }, v.statusView, v.presetView);

            v.dockBtns = DOCKS.map(dock => h('button', {
              type: 'button',
              'data-dock': dock,
              'aria-pressed': 'false',
              title: `把菜单放到${DOCK_INFO[dock].label}`,
              onclick: () => switchDock(dock),
            }, h('span', { html: svg(DOCK_INFO[dock].icon, 14) }), DOCK_INFO[dock].label));
            v.themeBtn = h('button', { class: 'icon-btn theme-btn', type: 'button', 'aria-pressed': 'false', onclick: () => setTheme(ui.theme === 'dark' ? 'light' : 'dark') });
            const footer = h('footer', { class: 'pf' },
              h('span', { class: 'pf-label', text: '菜单位置' }),
              h('div', { class: 'seg', role: 'group', 'aria-label': '菜单位置' }, v.dockBtns),
              v.themeBtn);

            v.usage = buildUsage();
            v.panel.append(header, v.usage.root, v.tabs, v.views, footer);
            v.panel.addEventListener('keydown', onPanelKeydown);
          }

          function buildStatusView() {
            const modeOpt = (mode, icon, title, desc) => h('button', {
              class: 'mode-opt',
              type: 'button',
              role: 'radio',
              'data-mode': mode,
              'aria-checked': 'false',
              onclick: () => chooseMode(mode),
            }, h('span', { class: 'mode-ico', html: svg(icon, 19) }), h('span', { class: 'mode-txt' }, h('strong', { text: title }), h('small', { text: desc })));
            v.modeOpts = [
              modeOpt('theater', 'mask', '剧场模式', '主持剧情与角色扮演'),
              modeOpt('chat', 'chat', '聊天模式', '暂停剧情和本喵聊'),
            ];
            v.mode = h('div', { class: 'mode', role: 'radiogroup', 'aria-label': '工作模式' }, h('span', { class: 'mode-glide', 'aria-hidden': 'true' }), v.modeOpts);
            v.mode.addEventListener('keydown', event => {
              if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
              event.preventDefault();
              const next = state.mode === 'chat' ? 'theater' : 'chat';
              chooseMode(next);
              v.modeOpts.find(button => button.dataset.mode === next).focus();
            });

            v.followHint = h('small');
            v.follow = h('button', {
              class: 'opt',
              type: 'button',
              role: 'switch',
              'aria-checked': 'false',
              onclick: () => setState({ chat: { autoReturn: !state.chat.autoReturn } }, 'menu'),
            }, h('span', { class: 'opt-ico', html: svg('back', 16) }), h('span', { class: 'opt-txt' }, h('strong', { text: '聊完一句自动回剧场' }), v.followHint), h('span', { class: 'sw-vis', 'aria-hidden': 'true' }));

            v.deepHint = h('small');
            v.deep = h('button', {
              class: 'opt',
              type: 'button',
              role: 'switch',
              'aria-checked': 'false',
              onclick: () => setState({ deepThink: !state.deepThink }, 'menu'),
            }, h('span', { class: 'opt-ico', html: svg('spark', 16) }), h('span', { class: 'opt-txt' }, h('strong', { text: '深度大思考' }), v.deepHint), h('span', { class: 'sw-vis', 'aria-hidden': 'true' }));

            v.notePill = h('span', { class: 'note-pill' });
            v.noteInput = h('textarea', {
              class: 'note-input',
              rows: '2',
              maxlength: '2000',
              placeholder: '悄悄塞给猫神的导演便签…\n例如：这一轮让雨下得再大一点',
              'aria-label': '场外小纸条',
            });
            v.noteInput.addEventListener('input', () => {
              setState({ note: { text: v.noteInput.value } }, 'note');
              autosize();
            });
            v.noteAuto = h('button', {
              class: 'note-auto',
              type: 'button',
              role: 'switch',
              'aria-checked': 'false',
              onclick: () => setState({ note: { autoClear: !state.note.autoClear } }, 'menu'),
            }, h('span', { class: 'sw-vis sm', 'aria-hidden': 'true' }), '发送后清空');
            v.noteCount = h('span', { class: 'note-count' });
            v.noteClear = h('button', { class: 'text-btn', type: 'button', onclick: clearNote }, h('span', { html: svg('eraser', 12) }), '清空');
            v.hist = h('div', { class: 'hist', hidden: true });
            v.hist.addEventListener('click', onHistoryClick);
            v.note = h('div', { class: 'card note', 'data-filled': String(!!state.note.text.trim()) },
              h('div', { class: 'note-head' },
                h('span', { class: 'opt-ico', html: svg('note', 16) }),
                h('span', { class: 'opt-txt' }, h('strong', { text: '场外小纸条' }), h('small', { text: '导演便签 · 只写给猫神看的附加要求' })),
                v.notePill),
              v.noteInput,
              h('div', { class: 'note-foot' }, v.noteAuto, v.noteCount, v.noteClear),
              v.hist);

            return h('section', { class: 'view', role: 'tabpanel', 'aria-label': '猫神状态' },
              h('div', { class: 'label', text: '工作模式' }),
              v.mode,
              h('div', { class: 'card' }, v.follow),
              h('div', { class: 'label', text: '思考与创作' }),
              h('div', { class: 'card' }, v.deep),
              v.note);
          }

          function buildPresetView() {
            v.pvName = h('strong', { class: 'pv-name' });
            v.pvMeta = h('span', { class: 'pv-meta' });
            v.pvRefresh = h('button', {
              class: 'icon-btn',
              type: 'button',
              title: '重新读取预设',
              'aria-label': '重新读取预设',
              html: svg('refresh', 15),
              onclick: () => {
                restartAnimation(v.pvRefresh, 'is-spin');
                renderPreset(true);
              },
            });
            v.pvMenuCount = h('em');
            v.pvAllCount = h('em');
            v.pvSegMenu = h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => setPresetView('menu') }, h('span', { html: svg('paw', 12) }), '猫神菜单', v.pvMenuCount);
            v.pvSegAll = h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => setPresetView('all') }, h('span', { html: svg('sliders', 13) }), '全部条目', v.pvAllCount);
            v.pvSearch = h('input', { class: 'search-input', type: 'search', placeholder: '搜索条目名称…', 'aria-label': '搜索预设条目', autocomplete: 'off' });
            v.pvSearch.addEventListener('input', () => {
              presetQuery = v.pvSearch.value;
              renderPreset();
            });
            v.pvSearchWrap = h('label', { class: 'search' }, h('span', { class: 'search-ico', html: svg('search', 14) }), v.pvSearch);
            v.pvWarn = h('p', { class: 'pv-warn', hidden: true, text: '当前不是 Chat Completion 接口，这些开关要切回 Chat Completion 才会生效。' });
            v.pvBody = h('div', { class: 'pv-body' });
            v.pvBody.addEventListener('click', onPresetClick);
            return h('section', { class: 'view', role: 'tabpanel', 'aria-label': '预设开关' },
              h('div', { class: 'pv-tools' },
                h('div', { class: 'pv-top' }, h('div', { class: 'pv-id' }, v.pvName, v.pvMeta), v.pvRefresh),
                h('div', { class: 'seg', role: 'group', 'aria-label': '条目视图' }, v.pvSegMenu, v.pvSegAll),
                v.pvSearchWrap,
                v.pvWarn),
              v.pvBody);
          }

          function render() {
            if (!v || !active) return;
            const chat = state.mode === 'chat';
            v.panel.dataset.mode = state.mode;
            v.sub.replaceChildren(
              h('span', { class: 'sub-dot' }),
              chat ? (state.chat.autoReturn ? '本喵出场中 · 聊完这句就回剧场' : '本喵亲自出场了，有话快说喵') : '神域剧场开演中，本喵在幕后掌镜');
            v.mode.dataset.mode = state.mode;
            for (const button of v.modeOpts) {
              const on = button.dataset.mode === state.mode;
              button.setAttribute('aria-checked', String(on));
              button.tabIndex = on ? 0 : -1;
            }
            setChecked(v.follow, state.chat.autoReturn);
            v.follow.classList.toggle('is-dim', !chat);
            v.followHint.textContent = state.chat.autoReturn
              ? (chat ? '猫神回完这一句，就自动回到剧场' : '切到聊天后，只聊一句就自动回来')
              : (chat ? '会一直聊下去，直到你手动切回剧场' : '切到聊天后会一直保持，需要手动切回');
            setChecked(v.deep, state.deepThink);
            v.deepHint.textContent = state.deepThink ? '已开启 · 先完整推演，再落笔' : '回复前先深度推演，更慢但更周全';
            renderNote();
            renderTabs();
            for (const button of v.dockBtns) button.setAttribute('aria-pressed', String(button.dataset.dock === ui.dock));
            renderTheme();
            renderUsageStrip();
            renderBall();
            renderQrButton();
            renderInlineBar();
            renderSendForm();
          }

          // ── Usage strip ──────────────────────────────────────────────

          const USAGE_STATE_LABEL = { sending: '请求中', streaming: '生成中', stopped: '已停止', failed: '未收到回复' };
          const groupDigits = value => Math.round(value).toLocaleString('en-US');
          const compactCount = value => {
            if (value < 1000) return String(Math.round(value));
            if (value < 100000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
            return `${Math.round(value / 1000)}k`;
          };

          function relativeTime(at) {
            const seconds = Math.max(0, (Date.now() - at) / 1000);
            if (seconds < 45) return '刚刚';
            if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} 分钟前`;
            if (seconds < 86400) return `${Math.round(seconds / 3600)} 小时前`;
            const date = new Date(at);
            return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
          }

          function buildUsage() {
            const cell = (key, label) => {
              const value = h('strong', { 'data-key': key, text: '—' });
              const note = h('em', { hidden: true });
              return { el: h('div', { class: `usage-num${key === 'total' ? ' is-total' : ''}` }, h('small', { text: label }), value, note), value, note };
            };
            const input = cell('input', '输入');
            const output = cell('output', '输出');
            const total = cell('total', '合计');
            const state = h('span', { class: 'usage-state', hidden: true });
            const when = h('span', { class: 'usage-when' });
            const fill = h('i');
            const bar = h('span', { class: 'usage-bar', 'aria-hidden': 'true' }, fill);
            const root = h('section', { class: 'usage', 'data-status': 'none', 'aria-label': '上次请求的 token 用量' },
              h('div', { class: 'usage-head' },
                h('span', { class: 'usage-title' }, h('span', { html: svg('gauge', 13) }), '上次请求'),
                state,
                when),
              h('div', { class: 'usage-nums' }, input.el, output.el, total.el),
              bar);
            return { root, input, output, total, state, when, bar, fill };
          }

          // Counts glide to their new value; live streaming updates use a shorter glide.
          function tweenCount(target, value, live) {
            const from = Number(target.dataset.value);
            target.dataset.value = String(value);
            const finalText = groupDigits(value);
            if (!Number.isFinite(from) || from === value || reducedMotion()) {
              target.textContent = finalText;
              return;
            }
            const duration = live ? 150 : 480;
            const started = W.performance.now();
            const token = (Number(target.dataset.tween) || 0) + 1;
            target.dataset.tween = String(token);
            const step = now => {
              if (target.dataset.tween !== String(token)) return;
              const progress = Math.min(1, (now - started) / duration);
              const eased = 1 - Math.pow(1 - progress, 3);
              target.textContent = groupDigits(from + (value - from) * eased);
              if (progress < 1) frame(step);
              else target.textContent = finalText;
            };
            frame(step);
          }

          function setCount(target, value, live, prefix = '') {
            if (value === null || value === undefined) {
              delete target.dataset.value;
              target.dataset.tween = String((Number(target.dataset.tween) || 0) + 1);
              target.textContent = '—';
              target.removeAttribute('data-prefix');
              return;
            }
            if (prefix) target.setAttribute('data-prefix', prefix);
            else target.removeAttribute('data-prefix');
            tweenCount(target, value, live);
          }

          const usageTotal = record => (record && record.input !== null ? record.input + (record.output || 0) : null);

          function renderUsage() {
            if (!active) return;
            renderUsageStrip();
            renderInlineBar();
            renderBall();
          }

          function renderUsageStrip() {
            if (!v || !v.usage) return;
            const u = v.usage;
            const record = usage;
            u.root.dataset.status = record ? record.status : 'none';
            if (!record) {
              u.when.textContent = '还没有请求记录';
              u.state.hidden = true;
              for (const cell of [u.input, u.output, u.total]) {
                setCount(cell.value, null);
                cell.note.hidden = true;
              }
              u.bar.hidden = true;
              u.root.title = '发送一条消息后，这里会显示请求用掉的 token 数';
              return;
            }
            u.when.textContent = relativeTime(record.at);
            const stateLabel = USAGE_STATE_LABEL[record.status];
            u.state.hidden = !stateLabel;
            u.state.textContent = stateLabel || '';
            const pendingInput = record.input === null && record.status !== 'failed';
            setCount(u.input.value, record.input, false);
            if (pendingInput) u.input.value.textContent = '计算中';
            setCount(u.output.value, record.output, record.live, record.live ? '≈' : '');
            setCount(u.total.value, usageTotal(record), record.live, record.live ? '≈' : '');
            u.input.note.hidden = !record.tools;
            u.input.note.textContent = record.tools ? `含工具 ${compactCount(record.tools)}` : '';
            u.output.note.hidden = !record.reasoning;
            u.output.note.textContent = record.reasoning ? `含思考 ${compactCount(record.reasoning)}` : '';
            const ratio = record.input !== null && record.maxContext ? record.input / record.maxContext : null;
            u.total.note.hidden = ratio === null;
            u.total.note.textContent = ratio === null ? '' : `占上下文 ${Math.round(ratio * 100)}%`;
            u.bar.hidden = ratio === null;
            if (ratio !== null) {
              u.fill.style.width = `${Math.min(100, ratio * 100).toFixed(1)}%`;
              u.bar.dataset.level = ratio >= 0.95 ? 'full' : ratio >= 0.8 ? 'high' : 'ok';
            }
            const lines = [];
            if (record.input !== null) {
              lines.push(`输入 ${groupDigits(record.input)}${record.tools ? `（消息 ${groupDigits(record.messages || 0)} + 工具定义 ${groupDigits(record.tools)}）` : ''}`);
            }
            if (record.output !== null) lines.push(`输出 ${record.live ? '约 ' : ''}${groupDigits(record.output)}${record.reasoning ? `（含思考 ${groupDigits(record.reasoning)}）` : ''}`);
            if (ratio !== null) lines.push(`上下文 ${groupDigits(record.input)} / ${groupDigits(record.maxContext)}（${Math.round(ratio * 100)}%）`);
            lines.push(`按酒馆的${record.tokenizer ? ` ${record.tokenizer} ` : ''}分词器统计，和服务商计费可能略有出入`);
            u.root.title = lines.join('\n');
          }

          function renderNote() {
            const text = state.note.text;
            if (v.noteInput.value !== text) {
              v.noteInput.value = text;
              autosize();
            }
            const filled = text.trim().length > 0;
            const wasFilled = v.note.dataset.filled === 'true';
            v.note.dataset.filled = String(filled);
            v.notePill.textContent = filled ? (state.note.autoClear ? '下一轮送达' : '每轮生效') : '未装填';
            if (filled && !wasFilled) restartAnimation(v.notePill, 'is-stamp', 500);
            setChecked(v.noteAuto, state.note.autoClear);
            v.noteCount.textContent = text.length ? `${text.length} 字` : '';
            v.noteClear.disabled = !text;
            const key = ui.history.join('\u0001');
            if (key === historyKey) return;
            historyKey = key;
            v.hist.hidden = ui.history.length === 0;
            v.hist.replaceChildren(
              h('span', { class: 'hist-label' }, h('span', { html: svg('clock', 11) }), '最近'),
              ...ui.history.map((item, index) => h('button', { class: 'hist-chip', type: 'button', 'data-index': String(index), title: item, text: preview(item) })),
              h('button', { class: 'hist-clear', type: 'button', 'data-action': 'clear-history', text: '清除' }));
          }

          function autosize() {
            const input = v && v.noteInput;
            if (!input || !input.isConnected || input.getClientRects().length === 0) return;
            input.style.height = 'auto';
            input.style.height = `${clamp(input.scrollHeight + 2, 66, 168)}px`;
          }

          function clearNote() {
            if (state.note.text.trim()) rememberNote(state.note.text);
            setState({ note: { text: '' } }, 'menu');
            v.noteInput.focus({ preventScroll: true });
          }

          function onHistoryClick(event) {
            const button = event.target.closest('button');
            if (!button) return;
            if (button.dataset.action === 'clear-history') {
              setUi({ history: [] });
              renderNote();
              return;
            }
            const text = ui.history[Number(button.dataset.index)];
            if (!text) return;
            const current = state.note.text;
            setState({ note: { text: current.trim() ? `${current.replace(/\s+$/, '')}\n${text}` : text } }, 'menu');
            v.noteInput.focus({ preventScroll: true });
            v.noteInput.setSelectionRange(v.noteInput.value.length, v.noteInput.value.length);
          }

          function renderTabs() {
            v.tabs.dataset.tab = ui.tab;
            for (const [key, button] of Object.entries(v.tabBtns)) {
              button.setAttribute('aria-selected', String(key === ui.tab));
              button.tabIndex = key === ui.tab ? 0 : -1;
            }
            v.statusView.hidden = ui.tab !== 'status';
            v.presetView.hidden = ui.tab !== 'preset';
          }

          function switchTab(tab) {
            if (tab === ui.tab) return;
            setUi({ tab });
            renderTabs();
            const view = tab === 'preset' ? v.presetView : v.statusView;
            view.style.setProperty('--dx', tab === 'preset' ? '14px' : '-14px');
            restartAnimation(view, 'is-entering', 400);
            v.views.scrollTop = 0;
            if (tab === 'preset') renderPreset();
            else autosize();
          }

          // ── Theme ────────────────────────────────────────────────────

          function renderTheme() {
            const dark = ui.theme === 'dark';
            for (const root of [layer && layer.rootEl, inline && inline.wrap]) {
              if (root && root.dataset.theme !== ui.theme) root.dataset.theme = ui.theme;
            }
            if (!v) return;
            const icon = dark ? 'sun' : 'moon';
            if (v.themeBtn.dataset.icon !== icon) {
              v.themeBtn.dataset.icon = icon;
              v.themeBtn.innerHTML = svg(icon, 16);
            }
            v.themeBtn.setAttribute('aria-pressed', String(dark));
            v.themeBtn.title = dark ? '切回浅色模式' : '切到深色模式';
            v.themeBtn.setAttribute('aria-label', '深色模式');
          }

          // Message panels (神谕面板, 折叠栏) render in their own iframes; they read the theme on load and
          // follow live changes through this message, so nothing in them has to listen on the top window.
          function broadcastTheme() {
            const message = { type: 'catgod-oracle:theme', theme: ui.theme };
            const visit = (win, depth) => {
              let count = 0;
              try { count = win.frames.length; } catch (error) { return; }
              for (let index = 0; index < count; index += 1) {
                try {
                  const child = win.frames[index];
                  child.postMessage(message, '*');
                  if (depth < 3) visit(child, depth + 1);
                } catch (error) {
                  /* the frame went away mid-walk */
                }
              }
            };
            visit(W, 0);
            try {
              W.dispatchEvent(new W.CustomEvent('catgod-oracle:theme', { detail: { theme: ui.theme } }));
            } catch (error) {
              console.warn(TAG, 'Failed to dispatch theme event', error);
            }
          }

          function setTheme(theme) {
            const next = theme === 'dark' ? 'dark' : 'light';
            if (next === ui.theme) return;
            setUi({ theme: next });
            const roots = [layer && layer.rootEl, inline && inline.wrap].filter(Boolean);
            for (const root of roots) root.classList.add('is-theming');
            renderTheme();
            if (v) restartAnimation(v.themeBtn, 'is-flip', 550);
            timeout(() => { for (const root of roots) root.classList.remove('is-theming'); }, 450);
            broadcastTheme();
          }

          function animateModeChange() {
            if (!v || !active) return;
            restartAnimation(v.avatar, 'is-bounce', 650);
            if (layer) restartAnimation(layer.badge, 'is-flip', 550);
          }

          // ── Preset view ──────────────────────────────────────────────

          function presetSignature(data) {
            if (!data) return `none#${ui.presetView}`;
            return [
              data.name,
              ui.presetView,
              presetQuery,
              data.entries.map(entry => `${entry.id}:${entry.enabled ? 1 : 0}:${entry.name}:${entry.menu ? `${entry.menu.kind}/${entry.menu.group}/${entry.menu.label}` : ''}`).join('|'),
            ].join('#');
          }

          function renderPreset(force) {
            if (!v) return;
            const data = readPreset();
            v.pvSegMenu.setAttribute('aria-pressed', String(ui.presetView === 'menu'));
            v.pvSegAll.setAttribute('aria-pressed', String(ui.presetView === 'all'));
            v.pvSearchWrap.hidden = ui.presetView !== 'all';
            const sig = presetSignature(data);
            if (force || sig !== presetSig) {
              presetSig = sig;
              const root = v.panel.getRootNode();
              const focused = root && root.activeElement && root.activeElement.dataset ? root.activeElement.dataset.pid : null;
              v.pvBody.replaceChildren(...buildPresetBody(data));
              if (focused) {
                const again = v.pvBody.querySelector(`[data-pid="${cssEscape(focused)}"]`);
                if (again) again.focus({ preventScroll: true });
              }
            }
            updatePresetMeta(data);
          }

          function updatePresetMeta(data) {
            if (!data) {
              v.pvName.textContent = '还没读到预设';
              v.pvMeta.textContent = '';
              v.pvMenuCount.textContent = '';
              v.pvAllCount.textContent = '';
              v.pvWarn.hidden = true;
              return;
            }
            const toggles = data.entries.filter(entry => !entry.header);
            const menuItems = toggles.filter(entry => entry.menu);
            v.pvName.textContent = data.name || '当前预设';
            v.pvMeta.textContent = `已启用 ${toggles.filter(entry => entry.enabled).length}/${toggles.length} 条`;
            v.pvMenuCount.textContent = menuItems.length ? `${menuItems.filter(entry => entry.enabled).length}/${menuItems.length}` : '';
            v.pvAllCount.textContent = toggles.length ? String(toggles.length) : '';
            v.pvWarn.hidden = !data.mainApi || data.mainApi === 'openai';
            for (const element of v.pvBody.querySelectorAll('.pg')) {
              const group = data.groups.find(item => item.name === element.dataset.group);
              const count = element.querySelector('.pg-count');
              if (group && count) count.textContent = `${group.items.filter(item => item.enabled).length}/${group.items.length}`;
            }
          }

          function emptyState(icon, title, desc, ...extra) {
            return h('div', { class: 'empty' },
              h('span', { class: 'empty-ico', html: svg(icon, 18) }),
              h('strong', { text: title }),
              desc ? h('p', { text: desc }) : null,
              extra);
          }

          function buildPresetBody(data) {
            if (!data) {
              return [emptyState('sliders', '没有读到 Chat Completion 预设', '等酒馆加载完成后点右上角刷新；预设开关只对 Chat Completion 接口生效。')];
            }
            if (ui.presetView === 'menu') {
              if (!data.groups.length) {
                return [emptyState('paw', '这个预设还没有猫神菜单项', '在条目内容里写上下面的标记，它就会出现在这里：',
                  h('code', { text: '<<<|catgodml|menu:分组:名称>>>' }),
                  h('p', { text: '把 menu 换成 radio，同一分组就只能开一项。' }),
                  h('button', { class: 'text-btn', type: 'button', 'data-action': 'show-all', text: '先看全部条目' }))];
              }
              return data.groups.map(groupElement);
            }
            const query = presetQuery.trim().toLowerCase();
            const items = query
              ? data.entries.filter(entry => !entry.header && (entry.name.toLowerCase().includes(query) || (entry.menu && entry.menu.label.toLowerCase().includes(query))))
              : data.entries;
            if (!items.length) {
              return [emptyState('search', query ? '没有匹配的条目' : '预设里还没有条目', query ? '换个关键词试试喵' : '')];
            }
            const list = h('div', { class: 'list' });
            for (const entry of items) list.append(entry.header ? h('div', { class: 'sep', text: headerName(entry.name) }) : rowElement(entry));
            return [list];
          }

          function groupElement(group) {
            const collapsed = ui.collapsed.includes(group.name);
            const chips = group.items.map(item => h('button', {
              class: 'chip',
              type: 'button',
              'aria-pressed': String(item.enabled),
              'data-pid': item.id,
              title: item.name,
              disabled: !item.toggleable,
            }, h('span', { class: 'chip-paw', html: svg('paw', 12) }), h('span', { class: 'chip-label', text: item.menu.label })));
            return h('div', { class: `pg${collapsed ? ' is-collapsed' : ''}`, 'data-group': group.name },
              h('button', { class: 'pg-head', type: 'button', 'aria-expanded': String(!collapsed), 'data-action': 'collapse' },
                h('span', { class: 'pg-name', text: group.name }),
                group.kind === 'radio' ? h('span', { class: 'pg-kind', text: '单选' }) : null,
                h('span', { class: 'pg-count', text: `${group.items.filter(item => item.enabled).length}/${group.items.length}` }),
                h('span', { class: 'pg-chev', html: svg('chevron', 14) })),
              h('div', { class: 'pg-body' }, h('div', { class: 'pg-inner' }, h('div', { class: 'chips' }, chips))));
          }

          function rowElement(entry) {
            const tags = [];
            if (entry.menu) tags.push(h('span', { class: 'tag is-menu', text: '菜单' }));
            if (entry.marker) tags.push(h('span', { class: 'tag', text: '占位' }));
            else if (entry.role !== 'system') tags.push(h('span', { class: 'tag', text: ROLE_LABEL[entry.role] || entry.role }));
            if (entry.injected) tags.push(h('span', { class: 'tag', text: `深度 ${entry.depth}` }));
            return h('button', {
              class: 'row',
              type: 'button',
              role: 'switch',
              'aria-checked': String(entry.enabled),
              'data-pid': entry.id,
              title: entry.name,
              disabled: !entry.toggleable,
            }, h('span', { class: 'row-name', text: entry.name }), h('span', { class: 'row-tags' }, tags), h('span', { class: 'sw-vis', 'aria-hidden': 'true' }));
          }

          function setPresetView(view) {
            if (view === ui.presetView) return;
            setUi({ presetView: view });
            renderPreset(true);
          }

          function toggleGroup(element) {
            if (!element) return;
            const name = element.dataset.group;
            const collapsed = !element.classList.contains('is-collapsed');
            element.classList.toggle('is-collapsed', collapsed);
            element.querySelector('.pg-head').setAttribute('aria-expanded', String(!collapsed));
            setUi({ collapsed: collapsed ? [...ui.collapsed.filter(item => item !== name), name] : ui.collapsed.filter(item => item !== name) });
          }

          function onPresetClick(event) {
            const target = event.target.closest('button');
            if (!target || target.disabled || !v.pvBody.contains(target)) return;
            if (target.dataset.action === 'collapse') {
              toggleGroup(target.closest('.pg'));
              return;
            }
            if (target.dataset.action === 'show-all') {
              setPresetView('all');
              return;
            }
            const id = target.dataset.pid;
            if (!id) return;
            const data = readPreset();
            const entry = data && data.entries.find(item => item.id === id);
            if (!entry || !entry.toggleable) return;
            const next = !entry.enabled;
            const changes = new Map([[id, next]]);
            if (next && entry.menu) {
              const group = data.groups.find(item => item.name === entry.menu.group);
              if (group && group.kind === 'radio') {
                for (const other of group.items) if (other.id !== id && other.enabled) changes.set(other.id, false);
              }
            }
            if (!writePromptToggles(changes)) {
              toast('没能改动这个条目，去控制台看看喵');
              return;
            }
            for (const [pid, on] of changes) {
              for (const element of v.pvBody.querySelectorAll(`[data-pid="${cssEscape(pid)}"]`)) {
                if (element.hasAttribute('aria-pressed')) element.setAttribute('aria-pressed', String(on));
                if (element.hasAttribute('aria-checked')) element.setAttribute('aria-checked', String(on));
              }
            }
            if (next && target.classList.contains('chip')) restartAnimation(target, 'is-pop', 500);
            const fresh = readPreset();
            presetSig = presetSignature(fresh);
            updatePresetMeta(fresh);
          }

          let presetTimer = 0;
          function presetChanged() {
            clearTimer(presetTimer);
            presetTimer = timeout(() => {
              if (isPanelVisible() && ui.tab === 'preset') renderPreset();
            }, 120);
          }

          let pmObserver = null;
          let pmObserved = null;
          function observePromptManager() {
            const target = D.getElementById('completion_prompt_manager');
            if (!target || pmObserved === target) return;
            if (!pmObserver) pmObserver = new W.MutationObserver(presetChanged);
            pmObserver.disconnect();
            pmObserver.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
            pmObserved = target;
          }

          // ── Floating layer: ball, popover, toast ─────────────────────

          let layer = null;
          const popState = { open: false, anchor: null, top: null, qrEdge: null };
          let ballPos = { x: 0, y: 0 };
          let drag = null;
          let suppressClickUntil = 0;
          let restTimer = 0;
          let toastTimer = 0;

          function ensureLayer() {
            if (!layer) {
              const host = D.createElement('catgod-oracle-layer');
              host.setAttribute('data-swipe-ignore', 'true');
              // Page-wide theme or extension CSS can reach this host from outside the shadow root. Inline
              // !important wins over any stylesheet, which keeps it a full-viewport box that never becomes the
              // containing block of the fixed panel (a collapsed host once sent the sheet above the screen).
              host.style.cssText = [
                'position:fixed', 'top:0', 'left:0', 'right:0', 'bottom:0', 'width:auto', 'height:auto',
                'min-width:0', 'min-height:0', 'max-width:none', 'max-height:none', 'margin:0', 'padding:0', 'border:0',
                'transform:none', 'translate:none', 'scale:none', 'rotate:none', 'perspective:none',
                'filter:none', 'backdrop-filter:none', '-webkit-backdrop-filter:none', 'contain:none',
                'container-type:normal', 'content-visibility:visible', 'will-change:auto',
                'display:block', 'overflow:visible', 'opacity:1', 'visibility:visible', 'z-index:10010', 'pointer-events:none',
              ].map(rule => `${rule}!important`).join(';');
              const root = host.attachShadow({ mode: 'open' });
              adoptStyles(root);

              const face = h('span', { class: 'ball-face' }, avatarParts());
              const badge = h('span', { class: 'ball-badge', 'aria-hidden': 'true' });
              const tip = h('span', { class: 'ball-tip', 'aria-hidden': 'true' });
              const ball = h('button', { class: 'ball', type: 'button', hidden: true },
                face,
                badge,
                h('span', { class: 'ball-spark', 'aria-hidden': 'true', html: svg('spark', 10) }),
                h('span', { class: 'ball-note', 'aria-hidden': 'true' }),
                tip);
              const scrim = h('div', { class: 'scrim', onclick: () => closePopover() });
              const pop = h('div', { class: 'pop', role: 'dialog', 'aria-label': '小猫之神控制台' });
              // Focus moving in or out of the note/search fields decides whether the sheet clears the keyboard.
              pop.addEventListener('focusin', onResize);
              pop.addEventListener('focusout', onResize);
              const toastText = h('span', { class: 'toast-text' });
              const toastEl = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' }, h('span', { class: 'toast-ava' }, avatarParts()), toastText);
              const rootEl = h('div', { class: 'root layer', 'data-theme': ui.theme }, ball, scrim, pop, toastEl);
              root.append(rootEl);
              shieldKeys(host);
              layer = { host, root, rootEl, ball, face, badge, tip, scrim, pop, toast: toastEl, toastText };
              bindBall();
            }
            if (!layer.host.isConnected) D.body.append(layer.host);
            return layer;
          }

          function bindBall() {
            const ball = layer.ball;
            ball.addEventListener('contextmenu', event => event.preventDefault());
            ball.addEventListener('pointerdown', event => {
              if (event.pointerType === 'mouse' && event.button !== 0) return;
              drag = { id: event.pointerId, sx: event.clientX, sy: event.clientY, x: ballPos.x, y: ballPos.y, moved: false };
              try { ball.setPointerCapture(event.pointerId); } catch (error) { /* pointer already released */ }
              wakeBall();
            });
            ball.addEventListener('pointermove', event => {
              if (!drag || event.pointerId !== drag.id) return;
              const dx = event.clientX - drag.sx;
              const dy = event.clientY - drag.sy;
              if (!drag.moved) {
                if (Math.hypot(dx, dy) < 6) return;
                drag.moved = true;
                ball.classList.add('is-dragging');
                ball.classList.remove('is-snapping');
                if (popState.open) closePopover(true);
              }
              const size = ball.offsetWidth || 56;
              const box = viewportBox();
              setBallPos(clamp(drag.x + dx, 4, box.width - size - 4), clamp(drag.y + dy, 4, box.height - size - 4));
            });
            const endDrag = event => {
              if (!drag || event.pointerId !== drag.id) return;
              const moved = drag.moved;
              drag = null;
              ball.classList.remove('is-dragging');
              if (!moved) return;
              suppressClickUntil = Date.now() + 400;
              const size = ball.offsetWidth || 56;
              const box = viewportBox();
              setUi({ float: { side: ballPos.x + size / 2 < box.width / 2 ? 'left' : 'right', y: clamp((ballPos.y + size / 2) / box.height, 0, 1) } });
              ball.classList.add('is-snapping');
              placeBall();
              timeout(() => ball.classList.remove('is-snapping'), 520);
              renderBall();
              scheduleRest();
            };
            ball.addEventListener('pointerup', endDrag);
            ball.addEventListener('pointercancel', endDrag);
            ball.addEventListener('click', () => {
              if (Date.now() < suppressClickUntil) return;
              togglePopover('ball');
            });
            ball.addEventListener('keydown', event => {
              if (event.key === 'Escape' && popState.open) {
                event.stopPropagation();
                closePopover();
              }
            });
            ball.addEventListener('pointerenter', wakeBall);
            ball.addEventListener('pointerleave', scheduleRest);
            ball.addEventListener('focus', wakeBall);
            ball.addEventListener('blur', scheduleRest);
          }

          function setBallPos(x, y) {
            ballPos = { x, y };
            layer.ball.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
          }

          // The fixed layer host is the containing block of everything positioned here, so its own box is
          // the ground truth; some mobile WebViews misreport innerWidth/innerHeight.
          function viewportBox() {
            const rect = layer && layer.host.isConnected ? layer.host.getBoundingClientRect() : null;
            const root = D.documentElement;
            // Of the two honest measurements, the smaller one is the part the user can actually see.
            const pick = (measured, client, fallback) => {
              const values = [measured, client].filter(value => value > 0);
              return values.length ? Math.min(...values) : fallback;
            };
            return {
              width: pick(rect && rect.width, root.clientWidth, W.innerWidth),
              height: pick(rect && rect.height, root.clientHeight, W.innerHeight),
            };
          }

          function placeBall() {
            if (!layer || layer.ball.hidden) return;
            const size = layer.ball.offsetWidth || 56;
            const margin = 12;
            const box = viewportBox();
            const x = ui.float.side === 'left' ? margin : box.width - size - margin;
            const y = clamp(ui.float.y * box.height - size / 2, 8, Math.max(8, box.height - size - 8));
            setBallPos(x, y);
          }

          function wakeBall() {
            if (!layer) return;
            clearTimer(restTimer);
            layer.ball.classList.remove('is-resting');
          }

          function scheduleRest() {
            if (!layer) return;
            wakeBall();
            restTimer = timeout(() => {
              if (!popState.open && !drag && !layer.ball.matches(':hover')) layer.ball.classList.add('is-resting');
            }, 3200);
          }

          function renderBall() {
            if (!layer) return;
            const ball = layer.ball;
            const hasNote = !!state.note.text.trim();
            ball.dataset.deep = state.deepThink ? '1' : '0';
            ball.dataset.note = hasNote ? '1' : '0';
            ball.dataset.side = ui.float.side;
            const icon = state.mode === 'chat' ? 'chat' : 'mask';
            if (layer.badge.dataset.icon !== icon) {
              layer.badge.dataset.icon = icon;
              layer.badge.innerHTML = svg(icon, 13);
            }
            const status = `${state.mode === 'chat' ? '聊天模式' : '剧场模式'}${state.deepThink ? ' · 深思' : ''}${hasNote ? ' · 有纸条' : ''}`;
            const total = usageTotal(usage);
            layer.tip.textContent = total === null ? status : `${status} · 上次 ${usage.live ? '≈' : ''}${compactCount(total)} tokens`;
            ball.setAttribute('aria-label', `小猫之神控制台：${status}`);
            ball.classList.toggle('is-open', popState.open && popState.anchor === 'ball');
          }

          function toast(text) {
            if (!active) return;
            ensureLayer();
            layer.toastText.textContent = text;
            layer.toast.classList.remove('is-on');
            void layer.toast.offsetWidth;
            layer.toast.classList.add('is-on');
            clearTimer(toastTimer);
            toastTimer = timeout(() => layer.toast.classList.remove('is-on'), 2600);
          }

          function anchorElement() {
            if (popState.anchor !== 'qr') return layer && layer.ball;
            if (qrButtonInAssistantMenu()) {
              return D.getElementById('quick-reply-rocket-button') || qr.btn;
            }
            return qr.btn;
          }

          function openPopover(anchor) {
            ensureLayer();
            if (popState.open && popState.anchor === anchor) return;
            if (popState.open) closePopover(true);
            if (v.panel.parentNode !== layer.pop) layer.pop.append(v.panel);
            v.panel.classList.remove('is-inline');
            v.close.hidden = false;
            popState.open = true;
            popState.anchor = anchor;
            popState.top = null;
            popState.qrEdge = null;
            layer.pop.classList.add('is-open');
            positionPopover();
            const sheetMode = layer.pop.classList.contains('is-sheet');
            animate(layer.pop, sheetMode
              ? [{ transform: 'translateY(100%)' }, { transform: 'none' }]
              : [{ opacity: 0, transform: 'scale(0.9) translateY(4px)' }, { opacity: 1, transform: 'none' }], sheetMode ? 380 : 300);
            wakeBall();
            render();
            onPanelShown();
            try { v.panel.focus({ preventScroll: true }); } catch (error) { /* focus is best effort */ }
          }

          function closePopover(instant) {
            if (!popState.open) return;
            const anchor = anchorElement();
            const hadFocus = !!(layer.root.activeElement && layer.pop.contains(layer.root.activeElement));
            popState.open = false;
            const pop = layer.pop;
            const sheetMode = pop.classList.contains('is-sheet');
            layer.scrim.classList.remove('is-on');
            const done = () => {
              if (!popState.open) pop.classList.remove('is-open', 'is-sheet');
            };
            const animation = instant ? null : animate(pop, sheetMode
              ? [{ transform: 'none' }, { transform: 'translateY(100%)' }]
              : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.94) translateY(4px)' }], sheetMode ? 240 : 170, 'cubic-bezier(0.4, 0, 1, 1)');
            if (animation) animation.finished.then(done, done);
            else done();
            render();
            scheduleRest();
            if (hadFocus && anchor && anchor.isConnected) {
              try { anchor.focus({ preventScroll: true }); } catch (error) { /* focus is best effort */ }
            }
          }

          function togglePopover(anchor) {
            if (popState.open && popState.anchor === anchor) closePopover();
            else openPopover(anchor);
          }

          function setSheetMode(on) {
            layer.pop.classList.toggle('is-sheet', on);
            layer.scrim.classList.toggle('is-on', on);
          }

          // Lifts the sheet over an on-screen keyboard only while the user is typing inside the panel, and only
          // when the visual viewport numbers are plausible. Browsers disagree wildly on these values while the
          // keyboard animates, so by default the sheet simply sits on the bottom edge.
          function keyboardLift(height) {
            const viewport = W.visualViewport;
            const active = layer.root.activeElement;
            if (!viewport || !active || (active.tagName !== 'TEXTAREA' && active.tagName !== 'INPUT')) return 0;
            const lift = height - viewport.height - viewport.offsetTop;
            return lift > 40 && lift < height * 0.6 ? Math.round(lift) : 0;
          }

          // Positions are always written as `top`, from the measured panel height: `bottom` depends on the
          // containing block's height, which hostile page CSS has been seen to collapse to zero.
          function placeSheet(height) {
            const pop = layer.pop;
            const lift = keyboardLift(height);
            setSheetMode(true);
            pop.style.left = '';
            pop.style.width = '';
            pop.style.bottom = 'auto';
            pop.style.setProperty('--maxh', `${Math.round((height - lift) * 0.86)}px`);
            pop.style.top = `${Math.max(0, Math.round(height - lift - pop.offsetHeight))}px`;
            pop.style.transformOrigin = '50% 100%';
          }

          // Many themes reveal the QR bar only while the send form is hovered or focused, so it collapses
          // as soon as the pointer moves into the panel. The QR anchor is therefore measured once per
          // opening and kept as a distance from the viewport edge; the input form stays glued to the bottom.
          function measureQrEdge(rect, vh) {
            const above = rect.top - 22;
            const below = vh - rect.bottom - 22;
            return above >= 280 || above >= below
              ? { side: 'above', offset: vh - rect.top + 10 }
              : { side: 'below', offset: rect.bottom + 10 };
          }

          function positionPopover(fromResize) {
            if (!popState.open || !layer) return;
            const pop = layer.pop;
            const box = viewportBox();
            const vw = box.width;
            const vh = box.height;
            const anchor = anchorElement();
            const rect = anchor && anchor.isConnected ? anchor.getBoundingClientRect() : null;
            // Phones, short viewports and SillyTavern's mobile layout (full-width input form below 1000px)
            // get the bottom sheet; a popover pinned to the QR bar there ends up under the keyboard or off screen.
            if (!rect || (!rect.width && !rect.height) || vw <= 600 || vh <= 540 || (popState.anchor === 'qr' && vw <= 1000)) {
              placeSheet(vh);
              return;
            }
            const width = Math.min(384, vw - 24);
            if (popState.anchor === 'qr') {
              if (!fromResize || !popState.qrEdge) popState.qrEdge = measureQrEdge(rect, vh);
              const edge = popState.qrEdge;
              const room = Math.min(660, vh - edge.offset - 12);
              if (room < 280) {
                placeSheet(vh);
                return;
              }
              setSheetMode(false);
              const left = clamp(rect.left + rect.width / 2 - width / 2, 12, vw - width - 12);
              pop.style.width = `${width}px`;
              pop.style.left = `${left}px`;
              pop.style.bottom = 'auto';
              pop.style.setProperty('--maxh', `${room}px`);
              pop.style.top = `${edge.side === 'above' ? Math.max(12, Math.round(vh - edge.offset - pop.offsetHeight)) : edge.offset}px`;
              pop.style.transformOrigin = `${clamp(rect.left + rect.width / 2 - left, 16, width - 16)}px ${edge.side === 'above' ? '100%' : '0'}`;
              return;
            }
            setSheetMode(false);
            pop.style.width = `${width}px`;
            const maxHeight = Math.min(660, vh - 24);
            pop.style.setProperty('--maxh', `${maxHeight}px`);
            pop.style.bottom = 'auto';
            const height = pop.offsetHeight;
            const onRight = ui.float.side === 'right';
            const left = clamp(onRight ? rect.left - width - 14 : rect.right + 14, 12, vw - width - 12);
            const preferred = fromResize && popState.top !== null ? popState.top : rect.top + rect.height / 2 - height / 2;
            const top = clamp(preferred, 12, Math.max(12, vh - height - 12));
            popState.top = top;
            pop.style.left = `${left}px`;
            pop.style.top = `${top}px`;
            pop.style.transformOrigin = `${onRight ? width : 0}px ${clamp(rect.top + rect.height / 2 - top, 16, Math.max(16, height - 16))}px`;
          }

          function onPanelKeydown(event) {
            if (event.key !== 'Escape' || event.isComposing) return;
            if (popState.open) {
              event.preventDefault();
              event.stopPropagation();
              closePopover();
            } else if (entryPoint() === 'inline' && ui.inlineOpen) {
              event.stopPropagation();
              setInlineOpen(false);
              inline.bar.focus({ preventScroll: true });
            }
          }

          function onDocPointerDown(event) {
            if (!popState.open) return;
            const path = event.composedPath();
            if (path.includes(layer.pop) || path.includes(layer.ball) || (qr.btn && path.includes(qr.btn))) return;
            closePopover();
          }

          let resizeFrame = 0;
          function onResize() {
            if (resizeFrame) return;
            resizeFrame = frame(() => {
              resizeFrame = 0;
              placeBall();
              positionPopover(true);
            });
          }

          // ── Inline bar in the last message ───────────────────────────

          let inline = null;
          let chatObserver = null;
          let observedChat = null;
          let inlineFrame = 0;

          function ensureInlineHost() {
            if (inline) return inline;
            const host = D.createElement('catgod-oracle-inline');
            host.setAttribute('data-swipe-ignore', 'true');
            host.style.cssText = 'display:block;margin:10px 0 4px;';
            const root = host.attachShadow({ mode: 'open' });
            adoptStyles(root);
            const chips = h('span', { class: 'ib-chips' });
            const bar = h('button', { class: 'ib-bar', type: 'button', 'aria-expanded': 'false', onclick: () => setInlineOpen(!ui.inlineOpen) },
              h('span', { class: 'ib-ava' }, avatarParts()),
              h('span', { class: 'ib-title', text: '小猫之神' }),
              chips,
              h('span', { class: 'ib-chev', html: svg('chevron', 16) }));
            const inner = h('div', { class: 'ib-inner' });
            const body = h('div', { class: 'ib-body' }, inner);
            const wrap = h('div', { class: 'root inline', 'data-theme': ui.theme }, bar, body);
            root.append(wrap);
            shieldKeys(host);
            inline = { host, root, wrap, bar, body, inner, chips, mounted: false };
            return inline;
          }

          function lastMessageBlock() {
            const chat = D.getElementById('chat');
            if (!chat) return null;
            const messages = chat.querySelectorAll(':scope > .mes');
            for (let index = messages.length - 1; index >= 0; index -= 1) {
              const block = messages[index].querySelector('.mes_block');
              if (block) return block;
            }
            return null;
          }

          function startInline() {
            ensureInlineHost();
            if (!chatObserver) chatObserver = new W.MutationObserver(scheduleInline);
            mountInline();
          }

          function stopInline() {
            if (chatObserver) chatObserver.disconnect();
            observedChat = null;
            if (inline) {
              inline.host.remove();
              inline.mounted = false;
            }
          }

          function scheduleInline() {
            if (!active || ui.dock !== 'message' || !inline || inlineFrame) return;
            inlineFrame = frame(() => {
              inlineFrame = 0;
              if (active && ui.dock === 'message') mountInline();
            });
          }

          function mountInline() {
            const chat = D.getElementById('chat');
            if (chat && observedChat !== chat) {
              chatObserver.disconnect();
              chatObserver.observe(chat, { childList: true });
              observedChat = chat;
            }
            const target = lastMessageBlock();
            const wasMounted = inline.mounted;
            if (target) {
              if (inline.host.parentElement !== target) target.append(inline.host);
              inline.mounted = true;
            } else {
              inline.host.remove();
              inline.mounted = false;
            }
            if (wasMounted !== inline.mounted) refreshEntry();
          }

          function setInlineOpen(open) {
            setUi({ inlineOpen: open });
            renderInlineBar();
            if (open) onPanelShown();
          }

          function renderInlineBar() {
            if (!inline) return;
            const chips = [['mode', state.mode === 'chat' ? 'chat' : 'mask', state.mode === 'chat' ? '聊天中' : '剧场中']];
            if (state.deepThink) chips.push(['deep', 'spark', '深思']);
            if (state.note.text.trim()) chips.push(['note', 'note', '纸条']);
            const total = usageTotal(usage);
            if (total !== null) chips.push(['usage', 'gauge', `${usage.live ? '≈' : ''}${compactCount(total)}`]);
            const existing = new Map(Array.from(inline.chips.children, element => [element.dataset.key, element]));
            const nodes = chips.map(([key, icon, text]) => {
              const signature = `${icon}:${text}`;
              const current = existing.get(key);
              if (current && current.dataset.sig === signature) return current;
              // The token chip ticks while a reply streams in; update it in place instead of re-popping it.
              if (current && key === 'usage') {
                current.dataset.sig = signature;
                current.lastChild.textContent = text;
                return current;
              }
              const chip = h('span', { class: `ib-chip is-new${key === 'mode' ? ' is-mode' : ''}`, 'data-key': key, 'data-sig': signature }, h('span', { html: svg(icon, 11) }), text);
              timeout(() => chip.classList.remove('is-new'), 400);
              return chip;
            });
            if (nodes.length !== inline.chips.children.length || nodes.some((node, index) => inline.chips.children[index] !== node)) inline.chips.replaceChildren(...nodes);
            inline.wrap.classList.toggle('is-open', ui.inlineOpen);
            inline.bar.setAttribute('aria-expanded', String(ui.inlineOpen));
            inline.bar.title = ui.inlineOpen ? '收起小猫之神控制台' : '展开小猫之神控制台';
            inline.body.inert = !ui.inlineOpen;
          }

          // ── QR bar button ────────────────────────────────────────────

          const qr = { btn: null, label: null };
          const qrAssistantEntry = { dom_id: QR_BUTTON_ID, group_name: '小猫之神', button_name: '打开神域控制台' };
          let qrObserver = null;
          let qrObservedForm;
          let qrFrame = 0;

          function qrButtonInAssistantMenu() {
            return D.body.classList.contains('qra-enabled') && qr.btn?.classList.contains('qrq-hidden-by-plugin');
          }

          function buildQrButton() {
            const [img] = avatarParts();
            qr.label = h('span', { class: 'catgod-qr-label' });
            qr.btn = h('div', {
              id: QR_BUTTON_ID,
              class: 'qr--button menu_button catgod-qr-btn',
              role: 'button',
              tabindex: '0',
              'data-swipe-ignore': 'true',
            }, img, qr.label, h('span', { class: 'catgod-qr-mark', 'aria-hidden': 'true' }));
            qr.btn.addEventListener('click', event => {
              event.preventDefault();
              event.stopPropagation();
              togglePopover('qr');
            });
            // Enter is already turned into a click by SillyTavern's keyboard helper for .menu_button.
            qr.btn.addEventListener('keydown', event => {
              if (event.key === ' ') {
                event.preventDefault();
                togglePopover('qr');
              }
            });
          }

          function startQr() {
            if (!qr.btn) buildQrButton();
            if (!qrObserver) qrObserver = new W.MutationObserver(scheduleQr);
            mountQr();
          }

          function stopQr() {
            if (qrObserver) qrObserver.disconnect();
            qrObservedForm = undefined;
            if (qrFrame) W.cancelAnimationFrame(qrFrame);
            qrFrame = 0;
            syncQrAssistant(false);
            if (qr.btn) qr.btn.remove();
            removeFallbackBar();
          }

          function scheduleQr() {
            if (!active || ui.dock !== 'qr' || qrFrame) return;
            qrFrame = frame(() => {
              qrFrame = 0;
              if (active && ui.dock === 'qr') mountQr();
            });
          }

          function syncQrAssistant(enabled) {
            if (enabled && W.qrAssistantExtensionApi == null) W.qrAssistantExtensionApi = [];
            const registry = W.qrAssistantExtensionApi;
            if (!Array.isArray(registry)) return;
            const index = registry.indexOf(qrAssistantEntry);
            if (enabled && index === -1) registry.push(qrAssistantEntry);
            if (!enabled && index !== -1) registry.splice(index, 1);
          }

          function mountQr() {
            const form = D.getElementById('send_form');
            if (qrObservedForm !== form) {
              qrObserver.disconnect();
              qrObserver.observe(D.body, { attributes: true, attributeFilter: ['class'] });
              qrObserver.observe(form || D.documentElement, { childList: true, subtree: true });
              qrObservedForm = form;
            }
            const bar = D.getElementById('qr--bar');
            const useAssistant = !!bar && D.body.classList.contains('qra-enabled');
            syncQrAssistant(useAssistant);
            if (!useAssistant) qr.btn.classList.remove('qrq-hidden-by-plugin', 'qrq-whitelisted-original');
            // QR Assistant hides whole reply sets. Register the standalone button so it can manage it directly.
            let container = useAssistant ? bar : bar?.querySelector(':scope > .qr--buttons') || bar;
            const wasMounted = qr.btn.isConnected;
            if (container) removeFallbackBar();
            else if (form) container = ensureFallbackBar(form);
            if (container) {
              if (qr.btn.parentElement !== container) {
                container.prepend(qr.btn);
                if (useAssistant) W.quickReplyMenu?.applyWhitelistDOMChanges?.();
              }
            } else {
              qr.btn.remove();
            }
            if (wasMounted !== qr.btn.isConnected) refreshEntry();
            else if (popState.open && popState.anchor === 'qr') positionPopover(true);
          }

          function ensureFallbackBar(form) {
            let bar = D.getElementById(QR_FALLBACK_ID);
            if (!bar) {
              bar = D.createElement('div');
              bar.id = QR_FALLBACK_ID;
              bar.setAttribute('data-swipe-ignore', 'true');
            }
            if (bar.parentElement !== form) form.prepend(bar);
            return bar;
          }

          function removeFallbackBar() {
            const bar = D.getElementById(QR_FALLBACK_ID);
            if (bar) bar.remove();
          }

          function renderQrButton() {
            if (!qr.btn) return;
            const chat = state.mode === 'chat';
            qr.label.textContent = chat ? '猫神·聊天' : '猫神·剧场';
            qr.btn.dataset.deep = state.deepThink ? '1' : '0';
            qr.btn.title = `小猫之神控制台：${chat ? '聊天模式' : '剧场模式'}${state.deepThink ? ' · 深思' : ''}`;
            qr.btn.classList.toggle('catgod-is-open', popState.open && popState.anchor === 'qr');
          }

          // ── Chat-mode cue on the send box ────────────────────────────

          function renderSendForm(force) {
            const chat = !force && state.mode === 'chat';
            const form = D.getElementById('send_form');
            if (form) form.classList.toggle('catgod-chat-mode', chat);
            const textarea = D.getElementById('send_textarea');
            if (!textarea) return;
            if (chat) {
              if (textarea.getAttribute('placeholder') !== CHAT_PLACEHOLDER) {
                textarea.dataset.catgodPlaceholder = textarea.getAttribute('placeholder') || '';
                textarea.setAttribute('placeholder', CHAT_PLACEHOLDER);
              }
            } else if (textarea.getAttribute('placeholder') === CHAT_PLACEHOLDER) {
              textarea.setAttribute('placeholder', textarea.dataset.catgodPlaceholder || '');
              delete textarea.dataset.catgodPlaceholder;
            }
          }

          // ── Docking ──────────────────────────────────────────────────

          function entryPoint() {
            if (ui.dock === 'message' && inline && inline.mounted) return 'inline';
            if (ui.dock === 'qr' && qr.btn && qr.btn.isConnected) return 'qr';
            return 'ball';
          }

          const isPanelVisible = () => popState.open || (entryPoint() === 'inline' && ui.inlineOpen);

          function syncPanelHome() {
            if (!v || !layer) return;
            const inlineHome = entryPoint() === 'inline';
            const home = inlineHome ? inline.inner : layer.pop;
            if (v.panel.parentNode !== home) home.append(v.panel);
            v.panel.classList.toggle('is-inline', inlineHome);
            v.close.hidden = inlineHome;
          }

          function refreshEntry() {
            ensureLayer();
            const entry = entryPoint();
            if (popState.open && popState.anchor !== entry) closePopover(true);
            const showBall = entry === 'ball';
            if (layer.ball.hidden === showBall) {
              layer.ball.hidden = !showBall;
              if (showBall) {
                placeBall();
                animate(layer.face, [{ opacity: 0, transform: 'scale(0.3)' }, { opacity: 1, transform: 'scale(1)' }], 520, 'cubic-bezier(0.34, 1.56, 0.64, 1)');
                scheduleRest();
              }
            }
            syncPanelHome();
            render();
            if (isPanelVisible()) onPanelShown();
          }

          function applyDock() {
            ensureLayer();
            if (ui.dock === 'message') startInline();
            else stopInline();
            if (ui.dock === 'qr') startQr();
            else stopQr();
            refreshEntry();
          }

          function switchDock(dock) {
            if (!DOCKS.includes(dock) || dock === ui.dock) return;
            if (!active) {
              setUi({ dock });
              return;
            }
            closePopover(true);
            setUi({ dock, inlineOpen: dock === 'message' ? true : ui.inlineOpen });
            applyDock();
            frame(() => {
              const entry = entryPoint();
              if (entry === 'inline') {
                inline.host.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
              } else {
                openPopover(entry);
              }
              if (dock === 'message' && entry !== 'inline') toast('还没有消息可以挂，先由悬浮球代班');
              else if (dock === 'qr' && entry !== 'qr') toast('没找到输入框，先由悬浮球代班');
              else if (dock === 'qr' && qrButtonInAssistantMenu()) toast('可从 QR 助手里的「小猫之神」打开菜单');
              else toast(DOCK_INFO[dock].toast);
            });
          }

          function onPanelShown() {
            observePromptManager();
            if (ui.tab === 'preset') renderPreset();
            frame(autosize);
          }

          function openPanel() {
            if (!active) return;
            const entry = entryPoint();
            if (entry === 'inline') {
              setInlineOpen(true);
              inline.host.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
            } else {
              openPopover(entry);
            }
          }

          function closePanel() {
            if (popState.open) closePopover();
            else if (entryPoint() === 'inline' && ui.inlineOpen) setInlineOpen(false);
          }

          // ── Lifecycle ────────────────────────────────────────────────

          let readyTimer = 0;
          function whenReady(callback) {
            let tries = 0;
            const poll = () => {
              const ctx = getCtx();
              if (ctx && ctx.eventSource && D.body) {
                callback(ctx);
                return;
              }
              tries += 1;
              if (tries > 480) {
                console.warn(TAG, 'SillyTavern context was not found; the menu stays idle.');
                return;
              }
              readyTimer = timeout(poll, 250);
            };
            poll();
          }

          // ── Preset gate ──────────────────────────────────────────────
          // Only a CatGod preset that carries <<<|catgodml|enableMenu>>> gets the console. On any other preset
          // everything below is torn down and only these few preset listeners stay, so switching back revives it.

          let active = false;
          let gateTimer = 0;
          const gateCleanups = [];

          function presetEnablesMenu() {
            const ctx = getCtx();
            const prompts = ctx && ctx.chatCompletionSettings && ctx.chatCompletionSettings.prompts;
            if (!Array.isArray(prompts)) return false;
            const flag = new RegExp(ENABLE_SOURCE, 'i');
            return prompts.some(prompt => prompt && (
              (typeof prompt.content === 'string' && flag.test(prompt.content)) || flag.test(String(prompt.name || ''))));
          }

          function activate(ctx) {
            if (active) return;
            active = true;
            injectGlobalStyle();
            if (!v) buildView();
            ensureLayer();
            writeJson(STATE_KEY, state);
            listen(W, 'resize', onResize);
            listen(W.visualViewport, 'resize', onResize);
            listen(W.visualViewport, 'scroll', onResize);
            listen(D, 'pointerdown', onDocPointerDown, true);
            listen(W, 'storage', event => {
              if (event.key === STATE_KEY) syncFromStorage();
            });
            if (typeof W.ResizeObserver === 'function') {
              if (!resizeObserver) resizeObserver = new W.ResizeObserver(() => positionPopover(true));
              resizeObserver.observe(v.panel);
            }
            bindStEvents(ctx);
            // Keeps "3 分钟前" honest while the panel stays open.
            usageClock = W.setInterval(() => { if (usage && isPanelVisible()) renderUsageStrip(); }, 30000);
            applyDock();
          }

          function deactivate() {
            if (!active) return;
            closePopover(true);
            if (tempChat) {
              tempChat = false;
              setState({ mode: 'theater' }, 'auto');
            }
            active = false;
            armed = null;
            lastChatReply = null;
            for (const cleanup of cleanups.splice(0)) {
              try { cleanup(); } catch (error) { /* already detached */ }
            }
            for (const observer of [pmObserver, resizeObserver]) {
              if (observer) observer.disconnect();
            }
            pmObserved = null;
            for (const id of [restTimer, toastTimer, presetTimer, pmRenderTimer, endTimer, usageEndTimer, usageLiveTimer]) clearTimer(id);
            W.clearInterval(usageClock);
            usageJob = null;
            usageLiveTimer = 0;
            stopInline();
            stopQr();
            if (layer) {
              layer.host.remove();
              layer.ball.hidden = true;
              layer.toast.classList.remove('is-on');
            }
            renderSendForm(true);
            const style = D.getElementById(GLOBAL_STYLE_ID);
            if (style) style.remove();
          }

          function refreshGate() {
            clearTimer(gateTimer);
            gateTimer = 0;
            const ctx = getCtx();
            if (!ctx || !ctx.eventSource) return;
            if (presetEnablesMenu()) activate(ctx);
            else deactivate();
          }

          function scheduleGate() {
            clearTimer(gateTimer);
            gateTimer = timeout(refreshGate, 120);
          }

          function bindGate(ctx) {
            // APP_READY replays immediately when it has already fired, which covers late loads.
            for (const name of ['APP_READY', 'SETTINGS_LOADED_AFTER', 'OAI_PRESET_CHANGED_AFTER', 'SETTINGS_UPDATED', 'CHAT_CHANGED']) {
              bindSt(ctx, gateCleanups, name, scheduleGate);
            }
          }

          function destroy() {
            deactivate();
            for (const cleanup of gateCleanups.splice(0)) {
              try { cleanup(); } catch (error) { /* already detached */ }
            }
            for (const id of [readyTimer, gateTimer]) clearTimer(id);
            if (layer) layer.host.remove();
            subscribers.clear();
            if (W.CatGodOracle === api) delete W.CatGodOracle;
          }

          const api = Object.freeze({
            version: VERSION,
            storageKey: STATE_KEY,
            get state() { return snapshot(); },
            get dock() { return ui.dock; },
            get theme() { return ui.theme; },
            get active() { return active; },
            get usage() { return usage ? { ...usage } : null; },
            setTheme: theme => setTheme(theme),
            getState: () => snapshot(),
            setState: patch => setState(patch && typeof patch === 'object' ? patch : {}, 'api'),
            setMode: mode => chooseMode(mode === 'chat' ? 'chat' : 'theater', 'api'),
            toggleMode: () => chooseMode(state.mode === 'chat' ? 'theater' : 'chat', 'api'),
            setDeepThink: on => setState({ deepThink: !!on }, 'api'),
            setNote: (text, options) => setState({
              note: {
                text: String(text === undefined || text === null ? '' : text),
                ...(options && typeof options.autoClear === 'boolean' ? { autoClear: options.autoClear } : {}),
              },
            }, 'api'),
            reload: () => syncFromStorage(),
            subscribe: fn => {
              if (typeof fn !== 'function') return () => {};
              subscribers.add(fn);
              return () => subscribers.delete(fn);
            },
            getPreset: () => {
              const data = readPreset();
              return data ? JSON.parse(JSON.stringify(data)) : null;
            },
            setPromptEnabled: (identifier, on) => {
              const ok = writePromptToggles(new Map([[String(identifier), !!on]]));
              presetChanged();
              return ok;
            },
            open: () => openPanel(),
            close: () => closePanel(),
            toggle: () => (isPanelVisible() ? closePanel() : openPanel()),
            setDock: dock => switchDock(dock),
            ensureMounted: () => {
              refreshGate();
              if (active) applyDock();
            },
            // Layout numbers to paste into a bug report when the menu lands in the wrong place.
            diagnose: () => {
              const viewport = W.visualViewport;
              const rect = layer && popState.open ? layer.pop.getBoundingClientRect() : null;
              return {
                version: VERSION,
                active,
                presetEnablesMenu: presetEnablesMenu(),
                dock: ui.dock,
                entry: entryPoint(),
                inner: [W.innerWidth, W.innerHeight],
                client: [D.documentElement.clientWidth, D.documentElement.clientHeight],
                layer: viewportBox(),
                host: layer ? (({ width, height }) => [width, height])(layer.host.getBoundingClientRect()) : null,
                hostStyle: layer ? (({ position, height, transform, contain, filter }) => ({ position, height, transform, contain, filter }))(W.getComputedStyle(layer.host)) : null,
                visualViewport: viewport ? { width: viewport.width, height: viewport.height, offsetTop: viewport.offsetTop, scale: viewport.scale } : null,
                popover: rect ? { sheet: layer.pop.classList.contains('is-sheet'), style: layer.pop.style.cssText, top: rect.top, bottom: rect.bottom, height: rect.height } : null,
              };
            },
            destroy,
          });

          let resizeObserver = null;

          W.CatGodOracle = api;
          whenReady(ctx => {
            bindGate(ctx);
            refreshGate();
          });
        }

        function compareVersions(a, b) {
          const left = String(a).split('.').map(Number);
          const right = String(b).split('.').map(Number);
          for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
            const diff = (left[index] || 0) - (right[index] || 0);
            if (diff) return diff;
          }
          return 0;
        }

        // The topmost same-origin window that carries SillyTavern; window.top in a normal setup.
        function resolveHostWindow() {
          let host = null;
          let cursor = window;
          for (let depth = 0; depth < 10; depth += 1) {
            let usable = false;
            try { usable = !!(cursor.document && cursor.SillyTavern); } catch (error) { break; }
            if (usable) host = cursor;
            if (cursor === cursor.parent) break;
            cursor = cursor.parent;
          }
          if (host) return host;
          try {
            if (window.top.document) return window.top;
          } catch (error) {
            /* cross-origin top */
          }
          return window;
        }

        const W = resolveHostWindow();
        try {
          if (W !== window && window.frameElement) window.frameElement.style.setProperty('display', 'none', 'important');
        } catch (error) {
          /* the hosting frame is not reachable */
        }

        const existing = W.CatGodOracle;
        if (existing && typeof existing.version === 'string' && compareVersions(existing.version, VERSION) >= 0) {
          try { if (typeof existing.ensureMounted === 'function') existing.ensureMounted(); } catch (error) { /* keep the running instance */ }
          return;
        }
        if (existing && typeof existing.destroy === 'function') {
          try { existing.destroy(); } catch (error) { console.warn('[CatGod Oracle] Failed to stop the previous version', error); }
        }

        // Run inside the host window's own realm so the menu outlives this frame.
        if (W !== window) {
          try {
            const script = W.document.createElement('script');
            script.textContent = `(${CatGodOracleRuntime.toString()})(window, ${JSON.stringify(VERSION)});\n//# sourceURL=catgod-oracle.js`;
            (W.document.head || W.document.documentElement).appendChild(script);
            script.remove();
          } catch (error) {
            console.warn('[CatGod Oracle] Failed to inject into the host window', error);
          }
        }
        if (!W.CatGodOracle || W.CatGodOracle.version !== VERSION) CatGodOracleRuntime(W, VERSION);
      })();
