(function (WIN) {
    'use strict';
    const NAME = 'Rita';
    let dataStorage = {};
    let events = {};
    let widgets = {};
    let prevPath = '';
    let appDiv, isDebug, pageVer, pageVerQ, cacheExpireTime;
    let pageDir, widgetDir, scopeDir;
    let page404;
    let widgetInstance = {};
    let widgetChildren = {};

    function data() {
        if (arguments.length === 0) {
            return dataStorage;
        } else if (arguments.length === 1) {
            if (typeof arguments[0] === 'object') {
                Object.assign(dataStorage, arguments[0]);
            } else {
                return dataStorage[arguments[0]];
            }
        } else {
            dataStorage[arguments[0]] = arguments[1];
        }
    }

    function storage(key, data) {
        if (!key) return;
        let realKey = `${NAME}@${scopeDir}$${key}`;
        if (data === null) return delete localStorage[realKey];
        if (typeof data === 'undefined') {
            try {
                return JSON.parse(localStorage[realKey]);
            } catch (e) {
                return {};
            }
        }
        if (typeof data === 'object') localStorage.setItem(realKey, JSON.stringify(data));
    }

    function parseRouter(hash) {
        let match = hash.match(/^([\/]{0,1}[^?#]*)(\?[^#]*|)(#.*|)$/);
        let qs = match[2].substring(1);
        let vs = qs.split('&');
        let query = {};
        for (let i = 0; i < vs.length; i++) {
            let vp = vs[i].split('=');
            if (vp[0] !== '')
                query[vp[0]] = vp[1];
        }
        return {
            path: match[1][0] === '/' ? match[1] : ('/' + match[1]),
            search: match[2],
            hash: match[3],
            query: query,
        }
    }

    function pageCache(view, html) {
        if (isDebug) return;
        let pk = `cache#${view}@${pageDir}`;
        if (typeof html === "undefined") {
            let c = storage(pk);
            if (c.v === pageVer && c.expire > (new Date().getTime())) {
                return c.html;
            } else {
                storage(pk, null);
            }
        } else {
            storage(pk, {
                v: pageVer,
                expire: (new Date()).getTime() + cacheExpireTime,
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

    function defineWidget(name, initializer) {
        widgets[name].initializer = initializer;
    }

    function prepareWidget(name, widgetData) {
        if (!widgets[name]) {
            widgets[name] = {};
        }
        widgets[name].html = widgetData.template.innerHTML;
        if (widgetData.style) {
            widgetData.style.setAttribute('widget-style', name);
            document.body.prepend(widgetData.style);
        }
        if (widgetData.script) {
            widgetData.script.setAttribute('widget-script', name);
            let widgets = widgetData.script.getAttribute('use-widget');
            if (widgets) {
                let widgetList = widgets.split(',');
                loadWidget(widgetList, () => {
                    document.body.append(widgetData.script);
                })
            } else {
                document.body.append(widgetData.script);
            }
        }
    }

    function loadOneWidget(name, callback) {
        name = name.trim();
        if (!name || widgets[name]) {
            if (typeof callback === 'function') callback();
            return;
        }
        let widgetPath;
        if (name.startsWith('@')) {
            widgetPath = `https://rita.bunnies.cc/widget/${name.substring(1).split('.').join('/')}.html`;
        } else {
            widgetPath = `${widgetDir}/${name.split('.').join('/')}.html`;
        }
        let cacheHtml = pageCache(widgetPath);
        if (cacheHtml) {
            prepareWidget(name, processHtml(cacheHtml));
            if (typeof callback === 'function') callback();
            return;
        }
        fetch(widgetPath + pageVerQ).catch(err => {
            appDiv.innerHTML = `<h1>Load Widget ${name} Failed</h1>`;
        }).then(r => r.text()).then(html => {
            let pageData = processHtml(html);
            if (pageData && pageData.template) {
                pageCache(widgetPath, html);
                prepareWidget(name, pageData);
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
            let ritaId = 'rita' + (new Date()).getTime();
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
            oldHandler = undefined;
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

        window.addEventListener('hashchange', () => {
            renderPage();
        });

        renderPage();
    }

    WIN.Rita = {
        configure(conf) {
            configure(conf);
        },
        defineWidget: function (name, init) {
            defineWidget(name, init);
        },
        widget: function (el, name, param) {
            return widget(el, name, (param || {}));
        },
    }
})(window);