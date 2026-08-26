<template>
  <div class="title-bar">
    <div class="brand">
      <span :class="['brand-dot', statusDotClass]" :title="statusTitle"></span>
      <span>MiniMax Token Plan</span>
    </div>
    <div class="actions">
      <span class="update-time" :title="footerText">{{ footerText }}</span>
      <button class="icon-btn" @click="refresh" title="立即刷新">↻</button>
      <button class="icon-btn" @click="openSettings" title="设置">⚙</button>
      <button class="icon-btn close" @click="minimize" title="隐藏到托盘">×</button>
    </div>
  </div>

  <div class="content">
    <div v-if="loading && !loaded" class="status-banner loading">
      正在加载使用量数据…
    </div>

    <div v-else-if="error" class="status-banner error">
      <span>{{ error }}</span>
      <a class="err-action" @click="openSettings">前往设置</a>
    </div>

    <div v-else-if="!hasApiKey" class="status-banner empty">
      请先在设置中填入 API Key (Subscription Key)。
      <a class="err-action" @click="openSettings">打开设置</a>
    </div>

    <template v-else>
      <div v-if="visibleQuotas.interval5h" class="quota-row">
        <div class="head">
          <div>
            <div class="label">5h 限额</div>
            <div class="sub" v-if="interval5h">{{ resetLabel(interval5h.maxRemainsTime) }}</div>
            <div class="sub" v-else>暂无数据</div>
          </div>
          <div class="right">
            <div class="used">已用 {{ usedDisplay(interval5h) }}%</div>
            <div class="percent">总额度 {{ totalDisplay(interval5h) }}%</div>
          </div>
        </div>
        <div class="bar">
          <div
            :class="['fill', fillClass(interval5h ? interval5h.usedPercent : 0)]"
            :style="{ width: (interval5h ? interval5h.usedPercent : 0) + '%' }"
          ></div>
        </div>
      </div>

      <div v-if="visibleQuotas.weekly" class="quota-row">
        <div class="head">
          <div>
            <div class="label">周限额</div>
            <div class="sub" v-if="weekly">{{ resetLabel(weekly.maxRemainsTime) }}</div>
            <div class="sub" v-else>暂无数据</div>
          </div>
          <div class="right">
            <div class="used">已用 {{ usedDisplay(weekly) }}%</div>
            <div class="percent">总额度 {{ totalDisplay(weekly) }}%</div>
          </div>
        </div>
        <div class="bar">
          <div
            :class="['fill', fillClass(weekly ? weekly.usedPercent : 0)]"
            :style="{ width: Math.min(100, weekly ? weekly.usedPercent : 0) + '%' }"
          ></div>
        </div>
      </div>

      <div v-if="visibleQuotas.video" class="quota-row">
        <div class="head">
          <div>
            <div class="label">视频赠送</div>
            <div class="sub" v-if="video">{{ resetLabel(video.remainsTime) }}</div>
            <div class="sub" v-else>暂无数据</div>
          </div>
          <div class="right">
            <div class="percent" v-if="video">{{ video.used }} / {{ video.total }} 已用</div>
            <div class="percent" v-else>—</div>
          </div>
        </div>
        <div class="bar">
          <div
            class="fill video"
            :style="{ width: (video ? video.percent : 0) + '%' }"
          ></div>
        </div>
      </div>
    </template>
  </div>

  <SettingsModal
    v-if="settingsOpen"
    @close="settingsOpen = false"
    @saved="onSaved"
  />
</template>

<script>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { fetchQuotaRemains, aggregateUsage, formatRemainTime } from './api/quota.js';
import SettingsModal from './components/SettingsModal.vue';

const DEFAULT_REFRESH_MINUTES = 3;
const TICK_MS = 1000;

export default {
  components: { SettingsModal },
  setup() {
    const apiKey = ref('');
    const baseUrl = ref('https://www.minimax.io');
    const hasApiKey = ref(false);
    const alwaysOnTop = ref(true);
    const opacity = ref(0.95);
    const backgroundColor = ref('#ffffff');
    const visibleQuotas = ref({ interval5h: true, weekly: true, video: true });
    const refreshIntervalMinutes = ref(DEFAULT_REFRESH_MINUTES);

    const interval5h = ref(null);
    const weekly = ref(null);
    const video = ref(null);

    const loading = ref(false);
    const loaded = ref(false);
    const error = ref('');
    const lastUpdated = ref(null);
    const settingsOpen = ref(false);

    let refreshTimer = null;
    let tickTimer = null;
    const now = ref(Date.now());
    const SETTINGS_HEIGHT = 540;
    let preSettingsSize = null;

    watch(backgroundColor, (val) => {
      if (typeof document !== 'undefined') {
        document.documentElement.style.setProperty('--bg-color', val || '#ffffff');
      }
    }, { immediate: true });

    watch(opacity, (val) => {
      if (window.electronAPI && typeof window.electronAPI.setOpacity === 'function') {
        window.electronAPI.setOpacity(val);
      }
    });

    const maxUsage = computed(() => {
      const candidates = [
        interval5h.value?.usedPercent ?? 0,
        Math.min(100, weekly.value?.usedPercent ?? 0),
      ];
      return Math.max(...candidates);
    });

    const statusDotClass = computed(() => {
      if (error.value) return 'error';
      if (!loaded.value) return 'idle';
      if (maxUsage.value >= 80) return 'error';
      if (maxUsage.value >= 50) return 'warn';
      return '';
    });

    const statusTitle = computed(() => {
      if (error.value) return '错误';
      if (!loaded.value) return '空闲';
      return `已用 ${maxUsage.value.toFixed(0)}%`;
    });

    const footerText = computed(() => {
      if (loading.value && !loaded.value) return '正在加载…';
      if (error.value) return `更新失败: ${error.value.slice(0, 30)}`;
      if (!lastUpdated.value) return '尚未拉取';
      const diff = Math.max(0, Math.floor((now.value - lastUpdated.value) / 1000));
      const m = Math.floor(diff / 60);
      const s = diff % 60;
      return `上次更新: ${m}分${s}秒前`;
    });

    function totalDisplay(q) {
      if (!q) return 100;
      if (q.usedPercent > 100) return Math.round(q.usedPercent);
      return 100;
    }

    function usedDisplay(q) {
      if (!q) return 0;
      return Number(q.usedPercent.toFixed(q.usedPercent < 10 ? 1 : 0));
    }

    function fillClass(percent) {
      if (percent >= 80) return 'error';
      if (percent >= 50) return 'warn';
      return '';
    }

    function resetLabel(seconds) {
      if (!Number.isFinite(seconds) || seconds < 60) return '即将重置';
      return `${formatRemainTime(seconds)}后重置`;
    }

    async function loadConfig() {
      if (!window.electronAPI) return;
      const cfg = await window.electronAPI.getConfig();
      apiKey.value = cfg.apiKey || '';
      baseUrl.value = cfg.baseUrl || 'https://www.minimax.io';
      hasApiKey.value = !!cfg.hasApiKey;
      alwaysOnTop.value = cfg.alwaysOnTop !== false;
      if (typeof cfg.opacity === 'number') {
        opacity.value = cfg.opacity;
      }
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
        refreshIntervalMinutes.value = cfg.refreshIntervalMinutes;
      }
    }

    async function refresh() {
      if (loading.value) return;
      if (!apiKey.value) {
        error.value = '';
        loaded.value = false;
        return;
      }
      error.value = '';
      loading.value = true;
      try {
        const list = await fetchQuotaRemains({
          apiKey: apiKey.value,
          baseUrl: baseUrl.value,
        });
        const agg = aggregateUsage(list);
        interval5h.value = agg.interval5h;
        weekly.value = agg.weekly;
        video.value = agg.video;
        loaded.value = true;
        lastUpdated.value = Date.now();
      } catch (e) {
        error.value = e?.message || String(e);
      } finally {
        loading.value = false;
      }
    }

    function scheduleRefresh() {
      if (refreshTimer) clearInterval(refreshTimer);
      const ms = Math.max(1, refreshIntervalMinutes.value) * 60 * 1000;
      refreshTimer = setInterval(refresh, ms);
    }

    watch(refreshIntervalMinutes, scheduleRefresh);

    function startTick() {
      if (tickTimer) clearInterval(tickTimer);
      tickTimer = setInterval(() => { now.value = Date.now(); }, TICK_MS);
    }

    function openSettings() {
      settingsOpen.value = true;
    }

    async function resizeForSettings(open) {
      if (!window.electronAPI?.resizeWindow) return;
      if (open) {
        preSettingsSize = [window.innerWidth, window.innerHeight];
        await window.electronAPI.resizeWindow(preSettingsSize[0], SETTINGS_HEIGHT);
      } else {
        await resizeForContent();
      }
    }

    watch(settingsOpen, resizeForSettings);

    const visibleQuotaCount = computed(() => {
      const v = visibleQuotas.value;
      return (v.interval5h ? 1 : 0) + (v.weekly ? 1 : 0) + (v.video ? 1 : 0);
    });

    const BASE_HEIGHT = 54;
    const ROW_HEIGHT = 70;

    async function resizeForContent() {
      if (!window.electronAPI?.resizeWindow) return;
      if (settingsOpen.value) return;
      const count = visibleQuotaCount.value;
      const height = BASE_HEIGHT + ROW_HEIGHT * Math.max(count, 1);
      await window.electronAPI.resizeWindow(520, height);
    }

    watch(visibleQuotaCount, resizeForContent);

    async function onSaved() {
      settingsOpen.value = false;
      await loadConfig();
      refresh();
    }

    async function minimize() {
      if (window.electronAPI) await window.electronAPI.minimize();
    }

    onMounted(async () => {
      startTick();
      await loadConfig();
      await refresh();
      scheduleRefresh();
      await nextTick();
      resizeForContent();
    });

    onBeforeUnmount(() => {
      if (refreshTimer) clearInterval(refreshTimer);
      if (tickTimer) clearInterval(tickTimer);
    });

    return {
      hasApiKey,
      interval5h, weekly, video,
      loading, loaded, error, lastUpdated,
      settingsOpen, footerText, statusDotClass, statusTitle,
      visibleQuotas,
      now,
      refresh, openSettings, onSaved, minimize,
      resetLabel, totalDisplay, usedDisplay, fillClass,
    };
  },
};
</script>
