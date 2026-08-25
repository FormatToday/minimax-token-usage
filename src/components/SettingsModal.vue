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

      <div class="actions">
        <button class="btn ghost" @click="$emit('close')">取消</button>
        <button class="btn primary" @click="save">保存</button>
      </div>
    </div>
  </div>
</template>

<script>
import { ref } from 'vue';

export default {
  emits: ['close', 'saved'],
  setup(_props, { emit }) {
    const apiKey = ref('');
    const baseUrl = ref('https://www.minimax.io');
    const alwaysOnTop = ref(true);

    async function loadInitial() {
      if (!window.electronAPI) return;
      const cfg = await window.electronAPI.getConfig();
      apiKey.value = cfg.apiKey || '';
      baseUrl.value = cfg.baseUrl || 'https://www.minimax.io';
      alwaysOnTop.value = cfg.alwaysOnTop !== false;
    }
    loadInitial();

    async function save() {
      if (!window.electronAPI) return;
      await window.electronAPI.setConfig({
        apiKey: apiKey.value,
        baseUrl: baseUrl.value,
        alwaysOnTop: alwaysOnTop.value,
      });
      emit('saved', {
        baseUrl: baseUrl.value,
        alwaysOnTop: alwaysOnTop.value,
      });
    }

    return { apiKey, baseUrl, alwaysOnTop, save };
  },
};
</script>
