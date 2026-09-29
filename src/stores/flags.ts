import { defineStore } from 'pinia';

export type FlagStatus = 'draft' | 'approved' | 'rolling' | 'scheduled' | 'stopped' | 'rolled-back';
export interface RuleSet { region: string; appVersion: string; authenticated: boolean; }
export interface FeatureFlag { id: string; name: string; key: string; enabled: boolean; rollout: number; rules: RuleSet; status: FlagStatus; }
export interface RolloutPlan { id: string; flagId: string; scheduledAt: string; approvals: string[]; version: number; }
export interface AuditRecord { id: string; at: string; actor: string; action: string; detail: string; }

interface State { flags: FeatureFlag[]; plans: RolloutPlan[]; audit: AuditRecord[]; activeId: string; }

const seed: State = {
  activeId: 'f1',
  flags: [
    { id: 'f1', name: '新版结算页', key: 'checkout-v2', enabled: false, rollout: 10, rules: { region: '上海', appVersion: '>= 8.2', authenticated: true }, status: 'draft' },
    { id: 'f2', name: '推荐模型 B', key: 'recommend-model-b', enabled: true, rollout: 35, rules: { region: '全部', appVersion: '>= 8.0', authenticated: false }, status: 'rolling' }
  ],
  plans: [{ id: 'p1', flagId: 'f1', scheduledAt: '2026-10-01T10:00', approvals: [], version: 3 }],
  audit: [
    { id: 'a1', at: '09:10', actor: '产品负责人', action: '创建草稿', detail: 'checkout-v2 规则草案 v3' },
    { id: 'a2', at: '09:22', actor: '研发负责人', action: '规则校验', detail: '依赖 payment-v3 已启用' }
  ]
};

function load(): State { const saved = localStorage.getItem('yf58-flag-state'); return saved ? JSON.parse(saved) as State : structuredClone(seed); }

export const useFlagStore = defineStore('flags', {
  state: () => load(),
  getters: { active(state): FeatureFlag | undefined { return state.flags.find((item) => item.id === state.activeId); }, activePlan(state): RolloutPlan | undefined { return state.plans.find((item) => item.flagId === state.activeId); } },
  actions: {
    persist() { localStorage.setItem('yf58-flag-state', JSON.stringify(this.$state)); },
    audit(action: string, detail: string, actor = '当前操作人') { this.audit.unshift({ id: `a-${Date.now()}`, at: new Date().toLocaleTimeString(), actor, action, detail }); this.persist(); },
    select(id: string) { this.activeId = id; this.persist(); },
    updateRule(rule: Partial<RuleSet>) { if (!this.active) return; this.active.rules = { ...this.active.rules, ...rule }; this.active.status = 'draft'; this.activePlan && (this.activePlan.approvals = []); this.audit('修改规则', JSON.stringify(this.active.rules)); },
    setRollout(value: number) { if (!this.active) return; this.active.rollout = value; this.audit('调整放量', `${this.active.key} → ${value}%`); },
    schedule(value: string) { if (!this.active || !this.activePlan) return; this.activePlan.scheduledAt = value; this.active.status = 'scheduled'; this.audit('设置定时', `${this.active.key} 于 ${value} 生效`); },
    approve(role: string) { if (!this.active || !this.activePlan || this.activePlan.approvals.includes(role)) return; this.activePlan.approvals.push(role); this.active.status = this.activePlan.approvals.length >= 2 ? 'approved' : 'draft'; this.audit('审批发布', `${role} 已确认 ${this.active.key}`, role); this.persist(); },
    startRollout() { if (!this.active || this.active.status !== 'approved') return; this.active.enabled = true; this.active.status = 'rolling'; this.audit('开始放量', `${this.active.key} 启用 ${this.active.rollout}%`); },
    emergencyStop() { if (!this.active) return; this.active.enabled = false; this.active.status = 'stopped'; this.audit('紧急停止', `${this.active.key} 已立即关闭`); },
    rollback() { if (!this.active) return; this.active.enabled = false; this.active.rollout = 0; this.active.status = 'rolled-back'; this.audit('执行回滚', `${this.active.key} 回滚至关闭状态`); },
    simulateHit(user: { region: string; appVersion: string; authenticated: boolean; id: string }) {
      if (!this.active || !this.active.enabled) return { hit: false, reason: '开关未启用' };
      const rule = this.active.rules;
      if (rule.region !== '全部' && rule.region !== user.region) return { hit: false, reason: `地区不匹配（要求${rule.region}）` };
      if (rule.authenticated && !user.authenticated) return { hit: false, reason: '要求已登录用户' };
      const hash = [...user.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 100;
      const hit = hash < this.active.rollout;
      return { hit, reason: hit ? `灰度桶 ${hash} < ${this.active.rollout}%` : `灰度桶 ${hash} ≥ ${this.active.rollout}%` };
    }
  }
});
