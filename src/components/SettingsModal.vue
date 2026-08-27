<template>
  <div class="modal-mask" @click.self="$emit('close')">
    <div class="modal">
      <h3>设置</h3>

      <div class="form-row">
        <label>API Key (Subscription Key)</label>
        <input
          v-model="apiKey"
          type="password"
          placeholder="eyJhbGciOi..."
          autocomplete="off"
          spellcheck="false"
        />
        <div class="hint">
          使用 Token Plan 的 <b>Subscription Key</b>，非 pay-as-you-go API Key。<br />
          获取位置：<span style="color:#5b8def">platform.minimax.io → Account → Token Plan</span>
        </div>
      </div>

      <div class="form-row">
        <label>API 域名</label>
        <select v-model="baseUrl">
          <option value="https://www.minimax.io">全球版 (api.minimax.io)</option>
          <option value="https://www.minimaxi.com">中国版 (api.minimaxi.com)</option>
        </select>
      </div>

      <div class="form-row">
        <label style="display:flex; align-items:center; gap:6px;">
          <input type="checkbox" v-model="alwaysOnTop" style="width:auto;" />
          始终置顶
        </label>
      </div>

      <div class="form-row">
        <label style="display:flex; align-items:center; gap:6px;">
          <input type="checkbox" v-model="clickThrough" style="width:auto;" />
          鼠标穿透
        </label>
        <div class="hint">开启后窗口会忽略鼠标事件，点击穿透到底层窗口。<br />需要关闭时，请右键托盘图标 → 取消勾选「鼠标穿透」。</div>
      </div>

      <div class="form-row">
        <label>
          窗口透明度
          <span class="opacity-value">{{ opacityPercent }}%</span>
        </label>
        <input
          type="range"
          min="1"
          max="100"
          step="1"
          v-model.number="opacityPercent"
        />
      </div>

      <div class="form-row">
        <label>自动刷新间隔 (分钟)</label>
        <input
          type="number"
          min="1"
          step="1"
          v-model.number="refreshIntervalMinutes"
        />
        <div class="hint">默认 3 分钟, 取值为正整数。</div>
      </div>

      <div class="form-row">
        <label>显示的限额</label>
        <div class="quota-toggles">
          <label class="toggle-row">
            <input type="checkbox" v-model="visibleQuotas.interval5h" />
            <span>5h 限额</span>
          </label>
          <label class="toggle-row">
            <input type="checkbox" v-model="visibleQuotas.weekly" />
            <span>周限额</span>
          </label>
          <label class="toggle-row">
            <input type="checkbox" v-model="visibleQuotas.video" />
            <span>视频赠送</span>
          </label>
        </div>
        <div class="hint">取消勾选后窗口会自动缩小。</div>
      </div>

      <div class="form-row">
        <label>背景颜色</label>
        <div class="color-presets">
          <button
            v-for="c in presetColors"
            :key="c"
            type="button"
            :class="['color-swatch', { active: backgroundColor === c }]"
            :style="{ background: c }"
            :title="c"
            @click="backgroundColor = c"
          ></button>
          <input
            type="color"
            v-model="backgroundColor"
            class="color-input"
            title="自定义颜色"
          />
        </div>
        <div class="hint">当前：{{ backgroundColor }}</div>
      </div>

      <div class="actions">
        <button class="btn ghost" @click="$emit('close')">取消</button>
        <button class="btn primary" :disabled="!ready" @click="save">保存</button>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, watch } from 'vue';

const PRESET_COLORS = [
  '#ffffff',
  '#f4f5f7',
  '#e8f0fe',
  '#fff7e6',
  '#e6f7f0',
  '#1f2328',
];

export default {
  emits: ['close', 'saved'],
  setup(_, { emit }) {
    const apiKey = ref('');
    const baseUrl = ref('https://www.minimax.io');
    const alwaysOnTop = ref(true);
    const clickThrough = ref(false);
    const opacity = ref(0.95);
    const backgroundColor = ref('#ffffff');
    const visibleQuotas = ref({ interval5h: true, weekly: true, video: true });
    const refreshIntervalMinutes = ref(3);
    const presetColors = PRESET_COLORS;
    const ready = ref(false);

    const opacityPercent = computed({
      get: () => Math.max(1, Math.min(100, Math.round(opacity.value * 100))),
      set: (val) => {
        const n = Number(val);
        if (!Number.isFinite(n)) return;
        opacity.value = Math.max(0.01, Math.min(1, n / 100));
      },
    });

    watch(opacity, (val) => {
      if (window.electronAPI?.setOpacity) {
        window.electronAPI.setOpacity(val);
      }
    });

    async function loadInitial() {
      if (!window.electronAPI) {
        ready.value = true;
        return;
      }
      try {
        const cfg = await window.electronAPI.getConfig();
        apiKey.value = cfg.apiKey || '';
        baseUrl.value = cfg.baseUrl || 'https://www.minimax.io';
        alwaysOnTop.value = cfg.alwaysOnTop !== false;
        clickThrough.value = cfg.clickThrough === true;
        if (typeof cfg.opacity === 'number') opacity.value = cfg.opacity;
        if (typeof cfg.backgroundColor === 'string' && cfg.backgroundColor) {
          backgroundColor.value = cfg.backgroundColor;
        }
        if (cfg.visibleQuotas) {
          visibleQuotas.value = {
            interval5h: cfg.visibleQuotas.interval5h !== false,
            weekly: cfg.visibleQuotas.weekly !== false,
            video: cfg.visibleQuotas.video !== false,
          };
        }
        if (typeof cfg.refreshIntervalMinutes === 'number' && cfg.refreshIntervalMinutes >= 1) {
          refreshIntervalMinutes.value = Math.floor(cfg.refreshIntervalMinutes);
        }
      } catch (e) {
        console.warn('[SettingsModal] loadInitial failed:', e);
      } finally {
        ready.value = true;
      }
    }
    loadInitial();

    async function save() {
      if (!window.electronAPI || !ready.value) return;
      const minutes = Math.max(1, Math.floor(Number(refreshIntervalMinutes.value) || 3));
      await window.electronAPI.setConfig({
        apiKey: apiKey.value,
        baseUrl: baseUrl.value,
        alwaysOnTop: alwaysOnTop.value,
        clickThrough: clickThrough.value,
        opacity: opacity.value,
        backgroundColor: backgroundColor.value,
        visibleQuotas: { ...visibleQuotas.value },
        refreshIntervalMinutes: minutes,
      });
      emit('saved', {
        baseUrl: baseUrl.value,
        alwaysOnTop: alwaysOnTop.value,
        clickThrough: clickThrough.value,
        opacity: opacity.value,
        backgroundColor: backgroundColor.value,
        visibleQuotas: { ...visibleQuotas.value },
        refreshIntervalMinutes: minutes,
      });
    }

    return {
      apiKey, baseUrl, alwaysOnTop,
      clickThrough,
      opacity, opacityPercent, backgroundColor,
      visibleQuotas, refreshIntervalMinutes, presetColors,
      ready, save,
    };
  },
};
</script>

<style scoped>
.opacity-value {
  float: right;
  color: #86909c;
  font-weight: normal;
  font-size: 11px;
}

input[type="range"] {
  width: 100%;
  margin: 4px 0 0;
  accent-color: #5b8def;
}

.color-presets {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.color-swatch {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: 1px solid #c9cdd4;
  cursor: pointer;
  padding: 0;
  transition: transform 0.1s, box-shadow 0.1s;
}

.color-swatch:hover {
  transform: scale(1.08);
}

.color-swatch.active {
  box-shadow: 0 0 0 2px #5b8def;
  border-color: #5b8def;
}

.color-input {
  width: 26px;
  height: 22px;
  padding: 0;
  border: 1px solid #c9cdd4;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
}

.quota-toggles {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #4e5969;
  cursor: pointer;
}

.toggle-row input[type="checkbox"] {
  width: auto;
  margin: 0;
  accent-color: #5b8def;
}
</style>
