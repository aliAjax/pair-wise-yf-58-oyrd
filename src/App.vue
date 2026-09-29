<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useOnline } from '@vueuse/core';
import { toTypedSchema } from '@vee-validate/zod';
import { useForm } from 'vee-validate';
import { z } from 'zod';
import { useFlagStore } from './stores/flags';

const store = useFlagStore();
const online = useOnline();
const active = computed(() => store.active);
const plan = computed(() => store.activePlan);
const createOpen = ref(false);
const simulation = ref<{ hit: boolean; reason: string } | null>(null);
const user = reactive({ id: 'user-1042', region: '上海', appVersion: '8.3.0', authenticated: true });
const schema = toTypedSchema(z.object({ name: z.string().min(3), key: z.string().regex(/^[a-z0-9-]+$/, '仅支持小写字母、数字和连字符') }));
const { defineField, errors, handleSubmit, resetForm } = useForm({ validationSchema: schema });
const [name] = defineField('name');
const [key] = defineField('key');
const create = handleSubmit((values) => {
  const id = `f-${Date.now()}`;
  store.flags.push({ id, name: values.name, key: values.key, enabled: false, rollout: 0, rules: { region: '全部', appVersion: '>= 1.0', authenticated: false }, status: 'draft' });
  store.plans.push({ id: `p-${Date.now()}`, flagId: id, scheduledAt: '2026-10-02T10:00', approvals: [], version: 1 });
  store.select(id); store.audit('创建开关', `${values.key} 草稿版本 1`); createOpen.value = false; resetForm();
});
function simulate() { if (active.value) simulation.value = store.simulateHit(user); }
function statusColor(status?: string) { return status === 'rolling' ? 'green' : status === 'approved' ? 'blue' : status === 'stopped' || status === 'rolled-back' ? 'red' : 'gold'; }
</script>

<template>
  <a-config-provider><a-layout class="app-shell">
    <a-layout-header class="topbar"><div><div class="eyebrow">FEATURE FLAG / PORT 62023</div><h1>{{ $t('title') }}</h1></div><a-space><a-tag :color="online ? 'green' : 'orange'">{{ online ? '控制面在线' : '离线草稿' }}</a-tag><a-button type="primary" @click="createOpen = true">新建功能开关</a-button></a-space></a-layout-header>
    <a-layout-content class="content">
      <a-alert v-if="!online" type="warning" show-icon message="离线状态" description="规则修改保留在浏览器，恢复网络后仍需完成审批才能发布。" class="mb" />
      <a-row :gutter="[18,18]">
        <a-col :xs="24" :lg="7">
          <a-card title="功能开关" size="small"><a-list :data-source="store.flags" bordered><template #renderItem="{ item }"><a-list-item :class="{ selected: item.id === store.activeId }" @click="store.select(item.id)"><a-list-item-meta><template #title><a-space><span>{{ item.name }}</span><a-tag :color="statusColor(item.status)">{{ item.status }}</a-tag></a-space></template><template #description><code>{{ item.key }}</code> · {{ item.rollout }}%</template></a-list-item-meta></a-list-item></template></a-list></a-card>
          <a-card title="规则命中模拟" size="small" class="mt"><a-form layout="vertical"><a-form-item label="用户 ID"><a-input v-model:value="user.id" /></a-form-item><a-row :gutter="8"><a-col :span="12"><a-form-item label="地区"><a-input v-model:value="user.region" /></a-form-item></a-col><a-col :span="12"><a-form-item label="版本"><a-input v-model:value="user.appVersion" /></a-form-item></a-col></a-row><a-checkbox v-model:checked="user.authenticated">已登录</a-checkbox><a-button type="primary" block class="mt" @click="simulate">{{ $t('simulate') }}</a-button></a-form><a-alert v-if="simulation" class="mt" :type="simulation.hit ? 'success' : 'info'" show-icon :message="simulation.hit ? '命中新功能' : '未命中'" :description="simulation.reason" /></a-card>
        </a-col>
        <a-col :xs="24" :lg="17">
          <template v-if="active && plan">
            <a-card :title="active.name" class="mb"><template #extra><a-space><a-tag :color="statusColor(active.status)">{{ active.status }}</a-tag><a-button danger :disabled="!active.enabled" @click="store.emergencyStop">紧急停止</a-button><a-button danger ghost @click="store.rollback">回滚</a-button></a-space></template>
              <a-descriptions bordered :column="{ xs: 1, md: 3 }"><a-descriptions-item label="开关 Key"><code>{{ active.key }}</code></a-descriptions-item><a-descriptions-item label="当前放量">{{ active.rollout }}%</a-descriptions-item><a-descriptions-item label="审批">{{ plan.approvals.join('、') || '待审批' }}</a-descriptions-item></a-descriptions>
              <a-divider>规则组合</a-divider><a-form layout="vertical"><a-row :gutter="16"><a-col :span="8"><a-form-item label="目标地区"><a-select :value="active.rules.region" :options="['全部','上海','北京','广东'].map(value => ({ value, label: value }))" @change="(value: string) => store.updateRule({ region: value })" /></a-form-item></a-col><a-col :span="8"><a-form-item label="客户端版本"><a-input :value="active.rules.appVersion" @change="(event: Event) => store.updateRule({ appVersion: (event.target as HTMLInputElement).value })" /></a-form-item></a-col><a-col :span="8"><a-form-item label="登录要求"><a-switch :checked="active.rules.authenticated" @change="(checked: boolean) => store.updateRule({ authenticated: checked })" /></a-form-item></a-col></a-row></a-form>
              <a-divider>逐步放量</a-divider><a-slider :value="active.rollout" :min="0" :max="100" :step="5" @change="(value: number) => store.setRollout(value)" /><div class="rollout-label">{{ active.rollout }}% 用户可命中</div>
              <a-divider>定时生效</a-divider><a-space><a-input type="datetime-local" :value="plan.scheduledAt" @change="(event: Event) => store.schedule((event.target as HTMLInputElement).value)" /><a-button @click="store.schedule(plan.scheduledAt)">保存定时</a-button></a-space>
              <a-divider>审批与发布</a-divider><a-space><a-button :disabled="plan.approvals.includes('产品负责人')" @click="store.approve('产品负责人')">产品审批</a-button><a-button :disabled="plan.approvals.includes('研发负责人')" @click="store.approve('研发负责人')">研发审批</a-button><a-button type="primary" :disabled="active.status !== 'approved'" @click="store.startRollout">开始灰度发布</a-button></a-space>
            </a-card>
            <a-card title="审计记录"><a-timeline><a-timeline-item v-for="item in store.audit" :key="item.id" :color="item.action.includes('停止') || item.action.includes('回滚') ? 'red' : 'blue'"><b>{{ item.at }} · {{ item.actor }}</b><p>{{ item.action }}：{{ item.detail }}</p></a-timeline-item></a-timeline></a-card>
          </template>
        </a-col>
      </a-row>
    </a-layout-content>
    <a-modal v-model:open="createOpen" title="新建功能开关" @ok="create"><a-form layout="vertical"><a-form-item label="展示名称" :validate-status="errors.name ? 'error' : ''" :help="errors.name"><a-input v-model:value="name" /></a-form-item><a-form-item label="开关 Key" :validate-status="errors.key ? 'error' : ''" :help="errors.key"><a-input v-model:value="key" /></a-form-item></a-form></a-modal>
  </a-layout></a-config-provider>
</template>

<style>
* { box-sizing: border-box; }
body { margin: 0; background: #f4f6fb; font-family: Inter, "PingFang SC", sans-serif; }
.app-shell { min-height: 100vh; background: transparent; }
.topbar { height: auto; min-height: 88px; display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 16px 32px; color: white; background: linear-gradient(120deg, #111827, #312e81); }
.topbar h1 { color: white; margin: 3px 0; font-size: 25px; }
.eyebrow { color: #a5b4fc; font-size: 11px; letter-spacing: .13em; }
.content { max-width: 1400px; width: 100%; margin: 0 auto; padding: 24px; }.mb { margin-bottom: 18px; }.mt { margin-top: 14px; }.selected { background: #eef2ff; cursor: pointer; }.rollout-label { color: #4338ca; font-weight: 700; }.ant-list-item { cursor: pointer; }
@media (max-width: 720px) { .topbar { padding: 18px; flex-direction: column; align-items: flex-start; }.content { padding: 16px; } }
</style>
