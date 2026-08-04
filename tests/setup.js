// Jest 测试环境初始化
// 为依赖浏览器环境的代码提供全局 mock

// localStorage mock
class LocalStorageMock {
    constructor() {
        this.store = {};
    }
    clear() {
        this.store = {};
    }
    getItem(key) {
        return this.store[key] || null;
    }
    setItem(key, value) {
        this.store[key] = String(value);
    }
    removeItem(key) {
        delete this.store[key];
    }
    key(index) {
        return Object.keys(this.store)[index] || null;
    }
    get length() {
        return Object.keys(this.store).length;
    }
}

global.localStorage = new LocalStorageMock();

// console mock（保留 error/warn，屏蔽普通 log 以保持测试输出整洁）
const originalError = console.error;
const originalWarn = console.warn;
global.console = {
    ...console,
    log: jest.fn(),
    error: originalError,
    warn: originalWarn
};

// 创建带 value 和 checked 属性的元素 mock
function createMockElement(options = {}) {
    const el = {
        value: options.value || '',
        checked: options.checked || false,
        textContent: options.textContent || '',
        innerHTML: options.innerHTML || '',
        className: options.className || '',
        classList: {
            _classes: new Set(options.classList || []),
            add(...names) { names.forEach(n => this._classes.add(n)); },
            remove(...names) { names.forEach(n => this._classes.delete(n)); },
            contains(name) { return this._classes.has(name); },
            toggle(name, force) {
                if (force === true) this._classes.add(name);
                else if (force === false) this._classes.delete(name);
                else if (this._classes.has(name)) this._classes.delete(name);
                else this._classes.add(name);
            }
        },
        closest: options.closest || (() => createMockElement()),
        querySelector: options.querySelector || (() => null),
        querySelectorAll: options.querySelectorAll || (() => []),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
        appendChild: jest.fn(),
        style: {},
        dataset: {},
        ...options
    };
    return el;
}

global.createMockElement = createMockElement;

// document.getElementById mock 工厂
// 用法：在测试中调用 setupDocumentMock({ 'salary-income': { value: '10000' } })
global.setupDocumentMock = function (elementMap) {
    const defaultElement = createMockElement();
    const map = elementMap || {};
    global.document = {
        getElementById: jest.fn((id) => {
            if (map[id]) {
                return createMockElement(map[id]);
            }
            return null;
        }),
        querySelector: jest.fn(() => defaultElement),
        querySelectorAll: jest.fn(() => []),
        createElement: jest.fn(() => createMockElement()),
        addEventListener: jest.fn()
    };
    return global.document;
};
