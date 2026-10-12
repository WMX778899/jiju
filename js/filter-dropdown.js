/**
 * AniList 筛选下拉增强（全部类型 / 全部状态 / 默认排序）
 * ============================================================
 * 原生 <select class="filter-select"> 仍是唯一数据源：
 *   · value 的读写与 change 事件契约完全不变（js/app.js 无需改动）
 *   · 只在其上方渲染 .fd-trigger 按钮，选中后回写 select 并派发 change
 *   · 覆写实例上的 value setter，这样 app.js 里
 *     `statusFilter.value = xxx`（统计栏点击）也能同步按钮文字
 *
 * 面板挂在 document.body 上并用 position:fixed 定位：
 *   .filter-bar 带 backdrop-filter，会成为 fixed 后代的包含块，
 *   把面板放在它内部会让坐标算错，也可能被祖先 overflow 裁切。
 */
(function () {
  'use strict';

  var SELECTOR = 'select.filter-select';
  var DEFAULT_ICON = 'fa-solid fa-sliders';
  var CLOSE_MS = 190;
  var uid = 0;
  var activeInstance = null;

  function mq(query) {
    return !!(window.matchMedia && window.matchMedia(query).matches);
  }
  function reducedMotion() { return mq('(prefers-reduced-motion: reduce)'); }
  function finePointer() { return mq('(hover: hover) and (pointer: fine)'); }

  function labelOf(option) {
    return option ? (option.textContent || '').trim() : '';
  }

  // ------------------------------------------------------------
  // 构造函数
  // ------------------------------------------------------------
  function Dropdown(select) {
    this.select = select;
    this.key = 'fd-' + (++uid);
    this.isOpen = false;
    this.isClosing = false;
    this.rafId = null;
    this.timers = {};
    this.optionEls = [];
    this.rafId = null;
    this._trackX = null;
    this._trackY = null;

    this.build();
    this.patchValue();
    this.bind();
    this.sync(true);
  }

  // 构建按钮 + 面板
  Dropdown.prototype.build = function () {
    var select = this.select;
    var self = this;

    // 原生 select 退居幕后：视觉隐藏 + 移出 Tab 序列（无障碍交给自定义控件）
    select.classList.add('fd-native');
    select.setAttribute('aria-hidden', 'true');
    select.tabIndex = -1;

    var root = document.createElement('div');
    root.className = 'fd';

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'fd-trigger';
    trigger.id = this.key + '-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', this.key + '-panel');

    var icon = document.createElement('span');
    icon.className = 'fd-icon';
    icon.innerHTML = '<i class="' + (select.dataset.fdIcon || DEFAULT_ICON) + '"></i>';

    var label = document.createElement('span');
    label.className = 'fd-label';

    var dot = document.createElement('span');
    dot.className = 'fd-dot';
    dot.setAttribute('aria-hidden', 'true');

    var chevron = document.createElement('span');
    chevron.className = 'fd-chevron';
    chevron.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';

    trigger.appendChild(icon);
    trigger.appendChild(label);
    trigger.appendChild(dot);
    trigger.appendChild(chevron);
    root.appendChild(trigger);

    var panel = document.createElement('div');
    panel.className = 'fd-panel';
    panel.id = this.key + '-panel';
    panel.setAttribute('role', 'listbox');
    panel.setAttribute('aria-labelledby', trigger.id);
    panel.setAttribute('aria-hidden', 'true');

    var list = document.createElement('ul');
    list.className = 'fd-list';
    list.setAttribute('role', 'presentation');

    this.optionEls = [];
    Array.prototype.forEach.call(select.options, function (opt, i) {
      var li = document.createElement('li');
      li.className = 'fd-option';
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      li.setAttribute('tabindex', '-1');
      li.dataset.value = opt.value;
      li.style.setProperty('--fd-i', String(i));

      var check = document.createElement('span');
      check.className = 'fd-check';
      check.innerHTML = '<i class="fa-solid fa-check"></i>';

      var text = document.createElement('span');
      text.className = 'fd-option-label';
      text.textContent = labelOf(opt);

      li.appendChild(check);
      li.appendChild(text);
      list.appendChild(li);
      self.optionEls.push(li);
    });

    panel.appendChild(list);
    document.body.appendChild(panel);

    this.root = root;
    this.trigger = trigger;
    this.icon = icon;
    this.label = label;
    this.chevron = chevron;
    this.panel = panel;
    this.list = list;

    // 插到原生 select 之前，保证在 .filter-select-wrapper 内正常参与布局
    select.parentNode.insertBefore(root, select);
  };

  /**
   * 覆写实例上的 value setter：app.js 里 `select.value = 'xxx'`
   * （统计栏点击筛选）会走这里，按钮文字随之更新。
   */
  Dropdown.prototype.patchValue = function () {
    var select = this.select;
    var self = this;
    try {
      var desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
      if (!desc || !desc.get || !desc.set) return;
      Object.defineProperty(select, 'value', {
        configurable: true,
        enumerable: true,
        get: function () { return desc.get.call(select); },
        set: function (v) { desc.set.call(select, v); self.sync(false); },
      });
    } catch (error) {
      /* 环境不支持时降级：仍可通过点击选项使用，只是统计栏点击不同步文字 */
    }
  };

  // ------------------------------------------------------------
  // 事件
  // ------------------------------------------------------------
  Dropdown.prototype.bind = function () {
    var self = this;

    this.trigger.addEventListener('click', function (e) {
      e.preventDefault();
      self.toggle();
    });

    this.trigger.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        self.open(e.key === 'ArrowUp' ? -1 : 'selected');
      }
    });

    // 点按波纹
    this.trigger.addEventListener('pointerdown', function (e) {
      var r = self.trigger.getBoundingClientRect();
      var rip = document.createElement('span');
      rip.className = 'fd-ripple';
      rip.style.left = (e.clientX - r.left) + 'px';
      rip.style.top = (e.clientY - r.top) + 'px';
      self.trigger.appendChild(rip);
      setTimeout(function () { if (rip.parentNode) rip.parentNode.removeChild(rip); }, 640);
    });

    // 选项：点击选中
    this.list.addEventListener('click', function (e) {
      var li = e.target.closest ? e.target.closest('.fd-option') : null;
      if (li) self.commit(li.dataset.value);
    });

    // 选项：键盘导航
    this.panel.addEventListener('keydown', function (e) {
      var keys = ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape', 'Tab'];
      if (keys.indexOf(e.key) === -1) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        self.close(true);
        return;
      }
      if (e.key === 'Tab') { self.close(false); return; }
      e.preventDefault();
      if (e.key === 'Enter' || e.key === ' ') {
        var cur = document.activeElement;
        if (cur && cur.classList.contains('fd-option')) self.commit(cur.dataset.value);
        return;
      }
      self.moveFocus(e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0, e.key);
    });

    // 指针悬停光斑（仅桌面细指针，避免触屏无谓重绘）
    if (finePointer()) {
      var trackGlow = function (host) {
        host.addEventListener('pointermove', function (e) {
          var r = host.getBoundingClientRect();
          host.style.setProperty('--fd-mx', (e.clientX - r.left) + 'px');
          host.style.setProperty('--fd-my', (e.clientY - r.top) + 'px');
        });
      };
      trackGlow(this.trigger);
      trackGlow(this.panel);
    }

    // 点外部关闭（trigger 与 panel 内部的点击由各自处理器负责，避免"开了又关"）
    this._onDocPointerDown = function (e) {
      if (!self.isOpen) return;
      if (self.trigger.contains(e.target) || self.panel.contains(e.target)) return;
      self.close(false);
    };
    document.addEventListener('pointerdown', this._onDocPointerDown, true);

    // 焦点在触发按钮上时按 Escape 也要能关（面板内的 Escape 由面板自己处理）
    this._onDocKeydown = function (e) {
      if (!self.isOpen) return;
      if (e.key !== 'Escape') return;
      if (self.panel.contains(e.target)) return;
      self.close(true);
    };
    document.addEventListener('keydown', this._onDocKeydown);

    // 弹窗打开时收起下拉：面板层级低于整屏遮罩，留着会被遮罩盖住
    this._observer = null;
    if (typeof MutationObserver === 'function') {
      this._observer = new MutationObserver(function (records) {
        if (!self.isOpen) return;
        for (var i = 0; i < records.length; i++) {
          var el = records[i].target;
          if (el.classList && el.classList.contains('modal-overlay') && el.classList.contains('open')) {
            self.close(false);
            return;
          }
        }
      });
      this._observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
    }

    // 页面滚动时关闭（面板内部滚动不算，否则列表一滚就关）；
    // 窗口尺寸变化时重新定位
    this._onScroll = function (e) {
      if (!self.isOpen) return;
      if (e && e.target && e.target.nodeType === 1 && self.panel.contains(e.target)) return;
      self.close(false);
    };
    window.addEventListener('scroll', this._onScroll, { passive: true });
    this._onResize = function () { if (self.isOpen) self.position(); };
    window.addEventListener('resize', this._onResize);
  };

  // ------------------------------------------------------------
  // 开关
  // ------------------------------------------------------------
  Dropdown.prototype.toggle = function () {
    if (this.isOpen) this.close(true);
    else this.open('selected');
  };

  Dropdown.prototype.open = function (focusMode) {
    if (this.isOpen) return;
    if (activeInstance && activeInstance !== this) activeInstance.close(false);

    clearTimeout(this.timers.close);
    this.isClosing = false;
    this.isOpen = true;
    activeInstance = this;

    this.panel.classList.remove('fd-closing');
    this.panel.classList.add('fd-open');
    this.position();

    // 强制一次重排，保证 opacity/transform 的入场过渡真的播放
    void this.panel.offsetWidth;
    this.panel.classList.add('fd-visible');
    this.panel.setAttribute('aria-hidden', 'false');
    this.trigger.setAttribute('aria-expanded', 'true');
    this.root.classList.add('fd-active');

    // 面板内的 rAF 追踪：入场编排 / 布局变化时按钮位置会漂，实时跟住
    this.track();

    if (focusMode) {
      if (focusMode === 'selected') this.moveFocus(0, 'selected');
      else this.moveFocus(focusMode, 'ArrowDown');
    }
  };

  Dropdown.prototype.close = function (returnFocus) {
    if (!this.isOpen) return;
    this.isOpen = false;
    if (activeInstance === this) activeInstance = null;
    this.stopTrack();

    this.trigger.setAttribute('aria-expanded', 'false');
    this.root.classList.remove('fd-active');
    this.panel.setAttribute('aria-hidden', 'true');
    this.panel.classList.add('fd-closing');
    this.isClosing = true;

    var self = this;
    clearTimeout(this.timers.close);
    this.timers.close = setTimeout(function () {
      self.isClosing = false;
      self.panel.classList.remove('fd-open', 'fd-visible', 'fd-closing');
    }, reducedMotion() ? 0 : CLOSE_MS);

    if (returnFocus) this.trigger.focus();
  };

  // ------------------------------------------------------------
  // 定位：以 fixed 面板对齐触发按钮，视口内自动翻转 / 收边
  // ------------------------------------------------------------
  Dropdown.prototype.position = function () {
    var t = this.trigger.getBoundingClientRect();
    var panel = this.panel;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var margin = 12;

    var width = Math.min(Math.max(t.width, 196), vw - margin * 2);
    panel.style.width = width + 'px';

    var ph = panel.offsetHeight;
    var left = t.left + (t.width - width) / 2;
    left = Math.max(margin, Math.min(left, vw - width - margin));

    var top = t.bottom + 8;
    var above = false;
    if (top + ph > vh - margin) {
      var flipped = t.top - 8 - ph;
      if (flipped >= margin) { top = flipped; above = true; }
      else { top = Math.max(margin, vh - ph - margin); }
    }

    panel.style.left = Math.round(left) + 'px';
    panel.style.top = Math.round(top) + 'px';
    panel.style.transformOrigin = above ? '50% 100%' : '50% 0%';
    panel.classList.toggle('fd-above', above);
  };

  Dropdown.prototype.track = function () {
    var self = this;
    this._trackX = null;
    this._trackY = null;
    var tick = function () {
      if (!self.isOpen) return;
      var r = self.trigger.getBoundingClientRect();
      if (r.left !== self._trackX || r.top !== self._trackY) {
        self._trackX = r.left;
        self._trackY = r.top;
        self.position();
      }
      self.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  };

  Dropdown.prototype.stopTrack = function () {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  };

  // ------------------------------------------------------------
  // 选中 / 同步
  // ------------------------------------------------------------
  Dropdown.prototype.commit = function (value) {
    if (this.select.value === value) {
      this.close(true);
      return;
    }
    this.select.value = value;   // 走 patchValue → sync()
    this.select.dispatchEvent(new Event('change', { bubbles: true }));
    this.close(true);
  };

  Dropdown.prototype.sync = function (initial) {
    var idx = this.select.selectedIndex;
    if (idx < 0) idx = 0;
    var text = labelOf(this.select.options[idx]);
    var value = this.select.value;

    if (this.label.textContent !== text) {
      this.label.textContent = text;
      if (!initial) this.flipLabel();
    }

    // 选到非首项（即已筛选）时点亮标记圆点
    var first = this.select.options.length ? this.select.options[0].value : null;
    this.root.classList.toggle('fd-custom', value !== first);

    for (var i = 0; i < this.optionEls.length; i++) {
      var el = this.optionEls[i];
      var on = el.dataset.value === value;
      el.setAttribute('aria-selected', on ? 'true' : 'false');
      el.classList.toggle('fd-selected', on);
    }
  };

  // 文字切换时的翻转入场
  Dropdown.prototype.flipLabel = function () {
    var el = this.label;
    el.classList.remove('fd-flip');
    void el.offsetWidth;
    el.classList.add('fd-flip');
    var self = this;
    clearTimeout(this.timers.flip);
    this.timers.flip = setTimeout(function () { el.classList.remove('fd-flip'); }, 460);
  };

  // ------------------------------------------------------------
  // 焦点移动
  // ------------------------------------------------------------
  Dropdown.prototype.moveFocus = function (dir, key) {
    var els = this.optionEls;
    if (!els.length) return;
    var cur = els.indexOf(document.activeElement);
    var next;

    if (key === 'Home') next = 0;
    else if (key === 'End') next = els.length - 1;
    else if (key === 'selected') next = this.selectedIndex();
    else if (cur === -1) next = dir < 0 ? els.length - 1 : this.selectedIndex();
    else next = (cur + dir + els.length) % els.length;

    els[next].focus({ preventScroll: true });
  };

  Dropdown.prototype.selectedIndex = function () {
    for (var i = 0; i < this.optionEls.length; i++) {
      if (this.optionEls[i].classList.contains('fd-selected')) return i;
    }
    return 0;
  };

  // ------------------------------------------------------------
  // 启动
  // ------------------------------------------------------------
  function enhanceAll() {
    var selects = document.querySelectorAll(SELECTOR);
    Array.prototype.forEach.call(selects, function (select) {
      if (select.dataset.fdReady === '1') return;
      select.dataset.fdReady = '1';
      try {
        new Dropdown(select);
      } catch (error) {
        /* 增强失败时退回原生 select：去掉隐藏类，保证功能可用 */
        select.classList.remove('fd-native');
        select.removeAttribute('aria-hidden');
        select.tabIndex = 0;
        var root = select.parentNode && select.parentNode.querySelector('.fd');
        if (root && root.parentNode) root.parentNode.removeChild(root);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceAll);
  } else {
    enhanceAll();
  }

  window.FilterDropdown = { enhanceAll: enhanceAll };
})();
