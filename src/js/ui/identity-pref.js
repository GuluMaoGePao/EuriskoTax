/**
 * 身份视角偏好（阶段19-2 遗留清偿③ · v1.142.0 重写）
 *
 * 身份卡回答的是「我是谁」→ 于是推荐的那一屏先呈出来。三条边界先写在这里：
 *   1. **只管推荐排序，不管工具可达性**。42 个入口永远都能进 —— 身份不是筛选。
 *      卡首发那版做成 openScenario()：跳工具页后只渲染那一个推荐组，其余 36 个当场消失，
 *      那是筛选，违反 §3.9 的硬边界。
 *      v1.143.0 起工具页改成「一条分类选择器 + 一块内容区」，身份的落点随之变成
 *      **默认分类**：进工具页先落在「为你推荐」那一屏，其余 42 个入口在别的分类里一个不少
 *      （切换是会话级状态，不写 localStorage —— 下次进来停在某个分类会被当成列表坏了）。
 *      形态从「把一个组挪到最前面」变成「替他先点一下分类」，守的东西没变。
 *   2. **必须看得见**。v1.142.0 之前身份还兼着带出「简明 / 完整」视图密度 —— 那层已经砍掉了
 *      （见 toolbox-ui 的「进阶参数：折叠」注释），于是身份一度等于「选完什么都没发生」。
 *      教训写在这：一个偏好如果不落在用户看得见的地方，它就只是本地存储里的一行字符串。
 *   3. **不改计税口径**。这个偏好**绝不写进税务档案**（tax-profile 的 identity）——
 *      档案那一项是计税口径（企业员工 / 个体户 / 自由职业，三个值），身份卡有 6 张，
 *      值域对不上：选了「HR / 薪酬」往档案里写什么？写了就是拿导航选择去改计税口径，
 *      将来算错没人查得到。两条线各管一件事。
 *
 * 游客可用：推荐排序不是登录后才有的特权。
 */
(function () {
    'use strict';

    var KEY = 'euriskoPrefIdentity';

    // v1.139.0：职务名称 / 公司名**另存一个键**，不并进上面那个 ——
    // 上面那个键存的是**纯 id 字符串**（老用户 localStorage 里就是 'employee' 这种形态，
    // 现有单测也按这个形态断言）。把 JSON 混进去会让两边的读法一起改坏，
    // 收益（少一个键）远小于代价（兼容分支散在读取处）。两条线各存各的：身份 id / 身份详情。
    var PROFILE_KEY = 'euriskoIdentityProfile';

    // v1.142.0：**删掉了「默认视图密度」这层**。此前身份卡的作用是「带出简明 / 完整」，
    // 而视图切换本身已经被砍掉（见 toolbox-ui 那一段注释）—— 一个看不见的东西带不出来，
    // 于是身份在很长一段时间里等于"选完什么都没发生"。
    // 现在身份只做一件看得见的事：**决定哪个推荐组排在前面**（toolbox-ui / 结果页的下一步）。
    var subs = [];

    function read() {
        try {
            return window.localStorage.getItem(KEY) || '';
        } catch (e) {
            return '';   // 无痕 / 禁用存储：只是这次不记住，绝不让整页挂掉
        }
    }

    function write(id) {
        try {
            if (id) window.localStorage.setItem(KEY, id);
            else window.localStorage.removeItem(KEY);
        } catch (e) { /* 存不下就只是这次不记住 */ }
    }

    // 身份详情（职务 / 公司 / 是否已看过引导）。存不下或存的是坏 JSON 都退回空详情 ——
    // 详情是**锦上添花**（只影响显示），绝不能因为它坏了就让身份本身读不出来。
    function readProfile() {
        var empty = { title: '', company: '', onboarded: false };
        try {
            var raw = window.localStorage.getItem(PROFILE_KEY) || '';
            if (!raw) return empty;
            var o = JSON.parse(raw);
            if (!o || typeof o !== 'object') return empty;
            return {
                title: typeof o.title === 'string' ? o.title : '',
                company: typeof o.company === 'string' ? o.company : '',
                onboarded: !!o.onboarded
            };
        } catch (e) {
            return empty;
        }
    }

    function writeProfile(p) {
        try {
            window.localStorage.setItem(PROFILE_KEY, JSON.stringify({
                title: p.title || '',
                company: p.company || '',
                onboarded: !!p.onboarded
            }));
        } catch (e) { /* 存不下就只是这次不记住 */ }
    }

    function emit(id) {
        subs.slice().forEach(function (cb) {
            try { cb(id); } catch (e) { console.warn('[identity-pref] 订阅回调抛错', e); }
        });
    }

    var api = {
        get: function () { return read(); },
        /** 设为默认视角：工具页的推荐组跟着换到这一身份（重复点同一张 = 幂等，不再广播） */
        set: function (id) {
            id = id || '';
            var prev = read();
            write(id);
            if (id !== prev) emit(id);
            return id;
        },
        /** 取消默认：只清身份，其余入口不受影响（身份不是筛选，清掉也不是"少了一半工具"） */
        clear: function () {
            var prev = read();
            if (!prev) return '';
            write('');
            emit('');
            return '';
        },
        /** 身份详情（职务 / 公司）连 id 一起读回：{ id, title, company, onboarded } */
        profile: function () {
            var p = readProfile();
            p.id = read();
            return p;
        },
        /**
         * 一次写完身份三件套（弹窗「下一步」走这里）。
         * id 传 undefined 表示只改详情、不动当前身份 —— 个人中心里改公司名不该顺手改身份。
         */
        save: function (o) {
            o = o || {};
            var prevId = read();
            var p = readProfile();
            var nextId = typeof o.id === 'string' ? o.id : prevId;
            if (nextId !== prevId) write(nextId);
            writeProfile({
                title: typeof o.title === 'string' ? o.title : p.title,
                company: typeof o.company === 'string' ? o.company : p.company,
                onboarded: true             // 存过一次 = 走过引导，下次登录不再弹
            });
            emit(nextId);
            return api.profile();
        },
        onboarded: function () { return readProfile().onboarded; },
        /** 只标「引导看过了」，不动身份与详情（弹窗里点「暂时不填」走这里） */
        markOnboarded: function () {
            var p = readProfile();
            if (p.onboarded) return;
            writeProfile({ title: p.title, company: p.company, onboarded: true });
        },
        onChange: function (cb) {
            if (typeof cb !== 'function') return function () {};
            subs.push(cb);
            return function () {
                var i = subs.indexOf(cb);
                if (i >= 0) subs.splice(i, 1);
            };
        },
        /** 测试用：退回默认并清空订阅（用例之间不串味） */
        reset: function () {
            subs.length = 0;
            try {
                window.localStorage.removeItem(KEY);
                window.localStorage.removeItem(PROFILE_KEY);
            } catch (e) { /* ignore */ }
        }
    };

    window.EuriskoIdentityPref = api;
})();
