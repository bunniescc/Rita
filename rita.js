(function (WIN) {
    'use strict';
    const VERSION = '0.0.6';
    const NAME = 'Rita';
    const LOGO = ' |\\   /|\n  \\|_|/\n  /   \\\n  \\___/\n';

    let dataStorage = {};
    let events = {};
    let widgets = {};
    let prevPath = '';
    let appDiv, isDebug, pageVer, pageVerQ, cacheExpireTime;
    let pageDir, widgetDir, scopeDir;
    let page404;
    let widgetInstance = {};
    let widgetChildren = {};

    function bindEvent(evtName, callback) {
        if (typeof callback === 'function') events[evtName] = callback;
    }

    function data(keyOrData, value) {
        if (keyOrData === undefined) return dataStorage;
        if (typeof keyOrData === 'object') {
            Object.assign(dataStorage, keyOrData);
        } else {
            if (value === undefined) return dataStorage[keyOrData];
            if (value === null) return delete dataStorage[keyOrData];
            dataStorage[keyOrData] = value;
        }
    }

    function cookie(nameOrData, valueOrSecond, second) {
        let exp = new Date(), defaultExpire = 2592000;
        if (typeof nameOrData === 'object') {
            exp.setTime(exp.getTime() + (valueOrSecond || defaultExpire) * 1000);
            for (let k in nameOrData) if (nameOrData.hasOwnProperty(k)) document.cookie = `${k}=${escape(nameOrData[k])};expires=${exp.toUTCString()};path=/;`;
        } else if (nameOrData === undefined) {
            let allCookies = {}, cs, cArr = document.cookie.split(';');
            for (let i = 0; i < cArr.length; i++) {
                cs = cArr[i].split('=');
                allCookies[cs[0].trim()] = escape(cs[1].trim());
            }
            return allCookies;
        } else {
            if (valueOrSecond === undefined) {
                let arr = document.cookie.match(new RegExp(`(^| )${nameOrData}=([^;]*)(;|$)`));
                return (arr !== null) ? unescape(arr[2]) : null;
            } else {
                if (valueOrSecond === null) {
                    exp.setTime(exp.getTime() - 1);
                    if (cookie(nameOrData) !== null) document.cookie = `${nameOrData}=;expires=${exp.toUTCString()};path=/;`;
                } else {
                    exp.setTime(exp.getTime() + (second || defaultExpire) * 1000);
                    document.cookie = `${nameOrData}=${escape(valueOrSecond)};expires=${exp.toUTCString()};path=/;`;
                }
            }
        }
    }

    function baseStorage(storage, key, data) {
        if (!key) return;
        var realKey = `${NAME}@${scopeDir}$${key}`;
        if (data === null) return delete storage[realKey];
        if (data === undefined) {
            try {
                return JSON.parse(storage[realKey]);
            } catch (e) {
                return {};
            }
        }
        if (typeof data === 'object') storage[realKey] = JSON.stringify(data);
    }

    function storage(key, data) {
        return baseStorage(localStorage, key, data);
    }

    function session(key, data) {
        return baseStorage(sessionStorage, key, data);
    }

    function parseRouter(hash) {
        let match = hash.match(/^([\/]{0,1}[^?#]*)(\?[^#]*|)(#.*|)$/);
        let qs = match[2].substring(1);
        let vs = qs.split('&');
        let query = {};
        for (let i = 0; i < vs.length; i++) {
            let vp = vs[i].split('=');
            if (vp[0] !== '') query[vp[0]] = vp[1];
        }
        return {
            path: match[1][0] === '/' ? match[1] : ('/' + match[1]),
            search: match[2],
            hash: match[3],
            query: query,
        }
    }

    function buildQuery(param) {
        return Object.keys(param).map(k => (encodeURIComponent(k) + '=' + encodeURIComponent(param[k]))).join('&');
    }

    function formatUrl(path, search, hash) {
        let q = buildQuery(search || {});
        return (path ? path : '') + (q ? ('?' + q) : '') + (hash ? ('#' + hash) : '');
    }

    function pageCache(view, html) {
        if (isDebug) return;
        let pk = `cache#${view}@${pageDir}`;
        if (typeof html === "undefined") {
            let c = storage(pk);
            if (c.v === pageVer && c.expire > Date.now()) {
                return c.html;
            } else {
                storage(pk, null);
            }
        } else {
            storage(pk, {
                v: pageVer,
                expire: Date.now() + cacheExpireTime,
                html: html,
            });
        }
    }

    function autoWidget(el) {
        let widgets = el.querySelectorAll('[auto-widget]');
        for (let w of widgets) {
            let widgetName = w.getAttribute('auto-widget');
            let data = {};
            for (let attr of w.attributes) {
                if (attr.name.startsWith('data-')) {
                    data[attr.name.substring(5)] = attr.value;
                }
            }
            widget(w, widgetName, data);
        }
    }

    function processHtml(html) {
        let fragment = document.createDocumentFragment();
        let root = document.createElement('div');
        fragment.appendChild(root);
        root.innerHTML = html;

        let template = root.querySelector('template');
        if (template) {
            let pageData = {template: template};
            let script = root.querySelector('script');
            if (script) pageData.script = script;
            let style = root.querySelector('style');
            if (style) pageData.style = style;
            let title = root.querySelector('title');
            if (title) pageData.title = title.textContent;
            return pageData;
        }
    }

    function createScript(script) {
        let tag = document.createElement('script');
        tag.type = 'text/javascript';
        let code = document.createTextNode(script);
        tag.appendChild(code);
        return tag;
    }

    function replaceContent(el, isPage, callback, pageData) {
        if (isPage) {
            if (typeof events['unload'] === "function") {
                events['unload']();
                delete events['unload'];
            }
            if (events['load']) delete events['load'];
        }
        el.querySelectorAll('[widget]').forEach((node) => {
            disposeWidget(node);
        });
        el.innerHTML = pageData.template.innerHTML;
        if (pageData.style) el.prepend(pageData.style);
        if (pageData.title !== undefined) document.title = pageData.title;
        if (pageData.script) {
            let widgets = pageData.script.getAttribute('use-widget');
            if (widgets) {
                let widgetList = widgets.split(',');
                loadWidget(widgetList, () => {
                    el.appendChild(createScript(pageData.script.textContent));
                    autoWidget(el);
                    if (typeof callback === 'function') callback();
                })
            } else {
                el.appendChild(createScript(pageData.script.textContent));
                autoWidget(el);
                if (typeof callback === 'function') callback();
            }
        } else {
            autoWidget(el);
            if (typeof callback === 'function') callback();
        }
    }

    function replaceBlock(el, view, isPage, callback) {
        if (view[0] !== '/') view = '/' + view;
        if (view[view.length - 1] === '/') view = view + 'index';
        if (!isDebug) {
            let cacheHtml = pageCache(view);
            if (cacheHtml) {
                replaceContent(el, isPage, callback, processHtml(cacheHtml));
                return;
            }
        }
        fetch(`${pageDir}${view}.html${pageVerQ}`).catch(err => {
            if (page404 && view !== page404) {
                replaceBlock(el, page404, isPage);
            } else {
                if (isPage) document.title = '404 Not Found';
                el.innerHTML = `<h1>404 Not Found</h1><p>${view} is not found in server</p>`;
            }
        }).then(r => r.text()).then(html => {
            let pageData = processHtml(html);
            if (pageData && pageData.template) {
                pageCache(view, html);
                replaceContent(el, isPage, callback, pageData);
            } else {
                if (isPage) document.title = '404 Not Found';
                el.innerHTML = `<h1>Render Error</h1><p>${view} is not a valid template</p>`;
            }
        })
    }

    function renderPage() {
        let pageInfo = parseRouter(window.location.hash.substring(1));
        if (pageInfo.path === prevPath) {
            if (typeof events['change'] === 'function') events['change'](pageInfo);
        } else {
            prevPath = pageInfo.path;
            delete events['change'];
            replaceBlock(appDiv, pageInfo.path, true, function () {
                if (typeof events['load'] === 'function') events['load']();
            });
        }
    }

    function widgetInfo(name) {
        name = name.trim();
        if (!name) return null;
        let reg = /(.*)\s+as\s+(.*)/;
        let originName = name;
        let widgetId;
        let widgetPath;
        let c = reg.exec(name);
        if (c) {
            originName = c[1];
            widgetId = c[2];
        }
        if (originName[0] === '@') {
            let ws = originName.substring(1).split('.');
            if (!widgetId) widgetId = ws.pop();
            widgetPath = `https://rita.bunnies.cc/widget/${ws.join('/')}/${widgetId}.html`;
        } else {
            let ws = originName.split('.');
            if (!widgetId) widgetId = ws.pop();
            widgetPath = `${widgetDir}/${ws.join('/')}/${widgetId}.html`;
        }
        return {
            id: widgetId,
            origin: originName,
            key: `widget$${originName}`,
            path: widgetPath,
        }
    }

    function defineWidget(name, initializer) {
        widgets[name].initializer = initializer;
    }

    function prepareWidget(widgetInfo, widgetData) {
        if (!widgets[widgetInfo.origin]) {
            widgets[widgetInfo.origin] = {};
        }
        widgets[widgetInfo.origin].html = widgetData.template.innerHTML;
        if (widgetData.style) {
            widgetData.style.setAttribute('widget-style', widgetInfo.origin);
            document.body.prepend(widgetData.style);
        }
        if (widgetData.script) {
            let widgets = widgetData.script.getAttribute('use-widget');
            let factoryFunc = new Function('Rita', widgetData.script.textContent);
            WIN.Rita.defineWidget = (init) => defineWidget(widgetInfo.origin, init);
            if (widgets) {
                let widgetList = widgets.split(',');
                loadWidget(widgetList, () => {
                    factoryFunc(WIN.Rita);
                    delete WIN.Rita.defineWidget;
                })
            } else {
                factoryFunc(WIN.Rita);
                delete WIN.Rita.defineWidget;
            }
        }
        if (!widgets[widgetInfo.id]) {
            widgets[widgetInfo.id] = widgets[widgetInfo.origin];
        }
    }

    function loadOneWidget(name, callback) {
        let info = widgetInfo(name);
        if (!info || widgets[info.origin]) {
            if (typeof callback === 'function') callback();
            return;
        }
        let cacheHtml = pageCache(info.key);
        if (cacheHtml) {
            prepareWidget(info, processHtml(cacheHtml));
            if (typeof callback === 'function') callback();
            return;
        }
        fetch(info.path + pageVerQ).catch(err => {
            appDiv.innerHTML = `<h1>Load Widget ${name} Failed</h1>`;
        }).then(r => r.text()).then(html => {
            let pageData = processHtml(html);
            if (pageData && pageData.template) {
                pageCache(info.key, html);
                prepareWidget(info, pageData);
                if (typeof callback === 'function') callback();
            } else {
                appDiv.innerHTML = `<h1>Widget ${name} is invalid</h1>`;
            }
        });
    }

    function loadWidget(name, callback) {
        if (Array.isArray(name)) {
            let i = 0;
            let cb = function () {
                i++;
                if (i < name.length && typeof name[i] !== 'undefined') {
                    loadOneWidget(name[i], cb);
                } else {
                    if (typeof callback === 'function') callback();
                }
            };
            loadOneWidget(name[i], cb);
        } else {
            loadOneWidget(name, callback);
        }
    }

    function widget(el, name, param) {
        if (typeof name === 'undefined' && typeof param === 'undefined') {
            let ritaId = el.getAttribute('ritaId');
            if (ritaId) {
                return widgetInstance[ritaId];
            }
            return null;
        }
        if (widgets[name]) {
            let ritaId = 'rita' + Date.now();
            let Initializer = widgets[name].initializer;

            el.setAttribute('ritaId', ritaId);
            if (!el.getAttribute('widget')) {
                let children = Array.from(el.childNodes);
                if (children.length > 0) {
                    widgetChildren[ritaId] = children;
                } else {
                    widgetChildren[ritaId] = el.innerHTML;
                }
            } else {
                disposeWidget(el);
            }
            el.innerHTML = widgets[name].html;
            autoWidget(el);
            let slot = el.querySelector('slot');
            if (slot) {
                if (Array.isArray(widgetChildren[ritaId])) {
                    slot.replaceWith(...widgetChildren[ritaId]);
                } else {
                    slot.replaceWith(widgetChildren[ritaId] || '');
                }
            }
            if (typeof Initializer === 'function') {
                let handler = new Initializer(el, param);
                widgetInstance[ritaId] = handler;
                el.setAttribute('widget', name);
                if (typeof handler['created'] === "function") {
                    handler['created']();
                }
                return handler;
            }
        }
    }

    function disposeWidget(el) {
        let ritaId = el.getAttribute('ritaId');
        let oldHandler = widgetInstance[ritaId];
        if (oldHandler) {
            if (typeof oldHandler.unload === "function") {
                oldHandler.unload();
            }
            oldHandler = null;
            delete widgetInstance[ritaId];
            el.removeAttribute('widget');
            el.querySelectorAll('[widget]').forEach((node) => {
                disposeWidget(node);
            });
        }
        if (widgetChildren[ritaId]) {
            if (typeof widgetChildren[ritaId] === 'string') {
                el.innerHTML = widgetChildren[ritaId];
            } else {
                el.innerHTML.append(widgetChildren[ritaId]);
            }
            delete widgetChildren[ritaId]
        }
    }

    function configure(options = {}) {
        pageDir = options.pages || 'page';
        widgetDir = options.widgets || (pageDir + '/widget');
        scopeDir = options.scope || ('/');
        appDiv = document.querySelector(options.el) || document.body;
        isDebug = options.debug;
        pageVer = options.version;
        pageVerQ = pageVer ? ('?v=' + pageVer) : '';
        cacheExpireTime = options.expire || 604800;

        if (isDebug) Rita.logo();

        window.addEventListener('hashchange', () => {
            renderPage();
        });

        renderPage();
    }

    WIN.Rita = {
        logo(ret) {
            if (ret) return LOGO;
            console.log('\n%c%s\n%c%s\n', 'color:#1996ff;font-size:20px;', LOGO, 'color:#1996ff', `Powered By ${NAME} Ver ${VERSION}`);
        },
        configure(conf) {
            configure(conf);
            return this;
        },
        data() {
            return data.apply(this, arguments);
        },
        cookie() {
            return cookie.apply(this, arguments);
        },
        session() {
            return session.apply(this, arguments);
        },
        storage() {
            return storage.apply(this, arguments);
        },
        formatUrl(path, search, hash) {
            return formatUrl(path, search, hash);
        },
        router() {
            return parseRouter(window.location.hash.substring(1));
        },
        navigate(path, search, hash) {
            window.location.hash = '#' + formatUrl(path, search, hash);
        },
        replace(path, search, hash) {
            window.location.replace('#' + formatUrl(path, search, hash))
        },
        on(evtName, callback) {
            bindEvent(evtName, callback);
        },
        render(el, view, callback) {
            replaceBlock(el, view, false, callback);
        },
        widget(el, name, param) {
            return widget(el, name, (param || {}));
        },
    }
})(window);
