export const DEFAULT_BASE_URL = 'https://www.minimax.io';

export async function fetchQuotaRemains({ apiKey, baseUrl = DEFAULT_BASE_URL, signal }) {
  if (!apiKey) {
    throw new Error('API Key 未配置，请先在设置中填写');
  }
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/token_plan/remains`;
  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    signal,
  });

  const text = await resp.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`接口返回非 JSON 内容 (HTTP ${resp.status}): ${text.slice(0, 120)}`);
  }

  if (!resp.ok) {
    const msg = data?.base_resp?.status_msg || data?.message || `HTTP ${resp.status}`;
    const code = data?.base_resp?.status_code ?? resp.status;
    throw new Error(`[${code}] ${msg}`);
  }

  if (!Array.isArray(data?.model_remains)) {
    throw new Error('接口返回格式异常：缺少 model_remains 字段');
  }

  return data.model_remains;
}

function remainingPercentToUsed(p) {
  if (typeof p !== 'number') return null;
  return Math.max(0, Math.min(100, 100 - p));
}

function pickIntervalUsed(m) {
  const remPct = remainingPercentToUsed(m.current_interval_remaining_percent);
  if (remPct !== null) return remPct;
  if (m.current_interval_total_count > 0) {
    return (m.current_interval_usage_count / m.current_interval_total_count) * 100;
  }
  return 0;
}

function pickWeeklyUsed(m) {
  const remPct = remainingPercentToUsed(m.current_weekly_remaining_percent);
  const boost = (m.weekly_boost_permille ?? 1000) / 1000;
  if (remPct !== null) {
    const v = remPct * boost;
    return Math.max(0, Math.min(150, v));
  }
  if (m.current_weekly_total_count > 0) {
    return (m.current_weekly_usage_count / m.current_weekly_total_count) * 100;
  }
  return 0;
}

function maxRemainsTime(list, key) {
  return list.reduce((mx, x) => Math.max(mx, x[key] || 0), 0);
}

function findVideoBonus(modelRemains) {
  return (
    modelRemains.find((m) => /视频赠送|视频包|video[\s_-]*bonus|video[\s_-]*pack/i.test(m.model_name)) ||
    modelRemains.find((m) => /video|视频|赠送/i.test(m.model_name)) ||
    null
  );
}

export function aggregateUsage(modelRemains) {
  const videoLike = findVideoBonus(modelRemains);
  const isVideoEntry = (m) => videoLike && m.model_name === videoLike.model_name;

  const intervalEntries = modelRemains.filter((m) =>
    !isVideoEntry(m) &&
    (m.current_interval_total_count > 0 || typeof m.current_interval_remaining_percent === 'number')
  );

  const weeklyEntries = modelRemains.filter((m) =>
    !isVideoEntry(m) &&
    (m.current_weekly_total_count > 0 || typeof m.current_weekly_remaining_percent === 'number')
  );

  const interval5h = intervalEntries.length > 0
    ? {
        usedPercent: Math.max(0, Math.min(100, Math.max(...intervalEntries.map(pickIntervalUsed)))),
        maxRemainsTime: maxRemainsTime(intervalEntries, 'remains_time'),
        status: Math.max(...intervalEntries.map((m) => m.current_interval_status ?? 1)),
        models: intervalEntries.map((m) => m.model_name),
      }
    : null;

  const weekly = weeklyEntries.length > 0
    ? {
        usedPercent: Math.max(0, Math.min(150, Math.max(...weeklyEntries.map(pickWeeklyUsed)))),
        maxRemainsTime: maxRemainsTime(weeklyEntries, 'weekly_remains_time'),
        status: Math.max(...weeklyEntries.map((m) => m.current_weekly_status ?? 1)),
        models: weeklyEntries.map((m) => m.model_name),
      }
    : null;

  let video = null;
  if (videoLike) {
    const total = videoLike.current_weekly_total_count || 0;
    const used = videoLike.current_weekly_usage_count || 0;
    video = {
      model: videoLike.model_name,
      used,
      total,
      percent: total > 0 ? Math.max(0, Math.min(100, Math.round((used / total) * 100))) : 0,
      remainsTime: videoLike.weekly_remains_time || 0,
      status: videoLike.current_weekly_status,
    };
  }

  return { interval5h, weekly, video, raw: modelRemains };
}

export function formatRemainTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 60) return '即将重置';

  const totalMin = Math.floor(seconds / 60);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const min = totalMin % 60;

  const parts = [];
  if (d > 0) parts.push(`${d} 天`);
  if (h > 0) parts.push(`${h} 小时`);
  if (min > 0) parts.push(`${min} 分钟`);

  return parts.length > 0 ? parts.join(' ') : '即将重置';
}
